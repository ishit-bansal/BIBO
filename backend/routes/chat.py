"""AI chatbot endpoint — answers questions about user-uploaded CSV data.

The frontend sends a compact but rich summary of the analyzed CSV (stats,
regression model, volatility, weekly forecast) along with the user's
question.  This route builds a focused prompt, optionally filters data to
the resources the user asked about, and forwards it to Gemini.
"""

import asyncio
import os
import json
import logging
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from google import genai

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["Chat"])

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
MODEL = "gemini-2.5-flash-lite"

# ── request / response schemas ────────────────────────────

class WeeklyForecastDay(BaseModel):
    day: int
    projected_stock: float
    date: str

class DataPoint(BaseModel):
    timestamp: str
    stock: float

class ResourceSummary(BaseModel):
    sector_id: str
    resource_type: str
    current: float
    min: float
    max: float
    mean: float
    std_dev: float = 0
    depletion_rate: float
    overall_slope: float = 0
    r_squared: float = 0
    noise_std: float = 0
    trend_acceleration: float = 0
    predicted_zero: Optional[str] = None
    hours_to_zero: Optional[float] = None
    status: str
    risk_score: float
    data_points: int
    had_crash_recovery: bool = False
    min_at: Optional[DataPoint] = None
    max_at: Optional[DataPoint] = None
    sampled_points: list[DataPoint] = []
    weekly_forecast: list[WeeklyForecastDay] = []

class CSVContext(BaseModel):
    total_records: int
    time_range_start: str
    time_range_end: str
    resources: list[ResourceSummary]

class ChatRequest(BaseModel):
    message: str
    csv_context: Optional[CSVContext] = None
    history: Optional[list[dict]] = None

class ChatResponse(BaseModel):
    reply: str

# ── helpers ───────────────────────────────────────────────

RESOURCE_ALIASES: dict[str, list[str]] = {
    "Arc Reactor Cores": ["arc", "reactor", "arc reactor", "cores", "energy"],
    "Vibranium (kg)": ["vibranium", "vbr", "vibranium kg"],
    "Clean Water (L)": ["water", "h2o", "clean water"],
    "Pym Particles": ["pym", "particles", "pym particles"],
    "Medical Kits": ["medical", "med", "medkits", "kits", "medkit"],
}


def _detect_resource_focus(message: str) -> list[str]:
    """Return resource_type names the user seems to be asking about."""
    msg = message.lower()
    matches: list[str] = []
    for canonical, aliases in RESOURCE_ALIASES.items():
        if any(alias in msg for alias in aliases):
            matches.append(canonical)
    return matches


def _trend_label(accel: float, recent: float, overall: float) -> str:
    """Human-readable description of how the trend is changing."""
    if abs(accel) < 0.05:
        return "steady (no acceleration)"
    if recent < overall:
        return f"accelerating depletion (recent {recent:+.2f}/hr vs overall {overall:+.2f}/hr)"
    return f"depletion slowing (recent {recent:+.2f}/hr vs overall {overall:+.2f}/hr)"


def _fit_quality(r2: float) -> str:
    if r2 >= 0.85:
        return "strong"
    if r2 >= 0.5:
        return "moderate"
    return "weak"


def _build_csv_summary(ctx: CSVContext, focus: list[str]) -> str:
    """Build rich, structured context for the LLM from analyzed CSV data."""
    lines = [
        f"DATASET: {ctx.total_records:,} records | {ctx.time_range_start[:16]} to {ctx.time_range_end[:16]}",
        "",
    ]

    resources = ctx.resources
    if focus:
        resources = [r for r in resources if r.resource_type in focus] or ctx.resources

    for r in resources:
        lines.append(f"═══ {r.sector_id} / {r.resource_type} ═══")
        lines.append(f"  Status: {r.status.upper()} | Risk: {r.risk_score}/100")
        lines.append(f"  Current: {r.current:,.1f} | Range: [{r.min:,.1f} .. {r.max:,.1f}] | Mean: {r.mean:,.1f}")
        lines.append(f"  Std dev: {r.std_dev:,.1f} (volatility — higher = more fluctuation)")

        # Regression model (the equation that roughly matches the chart line)
        lines.append(f"  Trend model: stock ≈ {r.current:,.1f} + ({r.depletion_rate:+.2f}) × hours_from_now")
        lines.append(f"  Overall trend: {r.overall_slope:+.4f} units/hr | Recent (72h): {r.depletion_rate:+.4f} units/hr")
        lines.append(f"  Model fit (R²): {r.r_squared:.3f} ({_fit_quality(r.r_squared)} — {'predictions reliable' if r.r_squared >= 0.5 else 'high noise, predictions uncertain'})")
        lines.append(f"  Noise (residual std): ±{r.noise_std:,.1f} units around the trend line")
        lines.append(f"  Trend shift: {_trend_label(r.trend_acceleration, r.depletion_rate, r.overall_slope)}")

        if r.had_crash_recovery:
            lines.append(f"  ⚠ CRASH-RECOVERY detected: stock crashed near zero then partially recovered")

        if r.min_at:
            lines.append(f"  Historical low: {r.min_at.stock:,.1f} at {r.min_at.timestamp[:16]}")
        if r.max_at:
            lines.append(f"  Historical high: {r.max_at.stock:,.1f} at {r.max_at.timestamp[:16]}")

        if r.hours_to_zero is not None and r.hours_to_zero > 0:
            lines.append(f"  Predicted zero: {r.predicted_zero} ({r.hours_to_zero:.1f}h from last reading)")
        elif r.current <= 0:
            lines.append(f"  ⚠ DEPLETED — stock is at zero")
        else:
            lines.append(f"  Depletion: not projected (stock stable or rising)")

        if r.weekly_forecast:
            fc_parts = [f"Day {w.day}: {w.projected_stock:,.0f}" for w in r.weekly_forecast]
            lines.append(f"  7-day forecast: {' → '.join(fc_parts)}")

        if r.sampled_points:
            pts = " | ".join(f"{p.timestamp[5:16]}={p.stock:,.0f}" for p in r.sampled_points)
            lines.append(f"  Timeline samples: {pts}")

        lines.append(f"  Data points: {r.data_points}")
        lines.append("")

    return "\n".join(lines)


SYSTEM_PROMPT = """You are Bo, the AI assistant for Project Sentinel's Data Analysis Lab.
You help analysts understand their uploaded resource CSV data.

You have access to rich analytical context for each resource including:
- Current stock levels and historical range (min/max/mean)
- A linear regression model that approximates the chart line: stock ≈ current + rate × hours
- R² (model fit quality): tells you how reliable the trend line is
- Noise/volatility: how much the data fluctuates around the trend
- Trend acceleration: whether depletion is speeding up, slowing, or steady
- 7-day projections from the regression model
- Crash-recovery flags if a resource experienced a catastrophic drop then recovered

Guidelines:
- Reference specific numbers from the data. Don't generalize — be precise.
- When discussing trends, explain what the regression equation means in plain English.
- Use the R² value to qualify your confidence: "the trend is reliable (R²=0.92)" or "predictions are rough due to high volatility (R²=0.31)"
- When a resource has a crash-recovery flag, explain that the data includes a disruption event.
- For predictions, use the 7-day forecast and depletion rate, but caveat with noise level.
- Flag critical/depleted resources prominently.
- Keep responses concise (under 200 words) unless the user asks for detail.
- Friendly but professional tactical analyst tone.
"""


def _build_messages(req: ChatRequest, csv_summary: str) -> str:
    """Assemble the full prompt for Gemini (single-turn with context)."""
    parts = [SYSTEM_PROMPT]

    if csv_summary:
        parts.append(f"\n--- UPLOADED CSV DATA ---\n{csv_summary}\n--- END DATA ---\n")

    if req.history:
        for msg in req.history[-6:]:
            role = "Analyst" if msg.get("role") == "user" else "Bo"
            parts.append(f"{role}: {msg.get('content', '')}")

    parts.append(f"Analyst: {req.message}")
    parts.append("Bo:")

    return "\n".join(parts)


# ── endpoint ──────────────────────────────────────────────

@router.post("", response_model=ChatResponse)
async def chat(req: ChatRequest):
    if not req.csv_context:
        return ChatResponse(
            reply="Hey there! I'm Bo, your data analysis assistant. "
                  "Upload a CSV file first and I'll help you dig into the data — "
                  "trends, predictions, risk levels, you name it!"
        )

    focus = _detect_resource_focus(req.message)
    csv_summary = _build_csv_summary(req.csv_context, focus)
    prompt = _build_messages(req, csv_summary)

    if not GEMINI_API_KEY or GEMINI_API_KEY == "your-gemini-api-key-here":
        return ChatResponse(
            reply="I'd love to help, but my AI brain isn't connected yet. "
                  "Set the GEMINI_API_KEY environment variable to enable me!"
        )

    client = genai.Client(api_key=GEMINI_API_KEY)

    for attempt in range(2):
        try:
            response = client.models.generate_content(model=MODEL, contents=prompt)
            reply = response.text.strip()
            return ChatResponse(reply=reply)
        except Exception as e:
            error_str = str(e)
            logger.error(f"Gemini chat error (attempt {attempt + 1}): {e}")

            is_rate_limit = "429" in error_str or "RESOURCE_EXHAUSTED" in error_str
            if is_rate_limit and attempt == 0:
                await asyncio.sleep(3)
                continue

            if is_rate_limit:
                return ChatResponse(
                    reply="I'm getting rate-limited right now — too many requests in a short time. "
                          "Give me a few seconds and try again!"
                )

            return ChatResponse(
                reply="Something went wrong on my end. Try asking again in a moment."
            )

    return ChatResponse(reply="Something went wrong. Please try again.")
