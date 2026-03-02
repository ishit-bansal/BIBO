"""Gemini LLM integration for structured entity extraction from field reports."""
import asyncio
import os
import json
import logging
from concurrent.futures import ThreadPoolExecutor

from google import genai

logger = logging.getLogger(__name__)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
MODEL = "gemini-2.5-flash"

SINGLE_PROMPT = """You are an intelligence analyst for a crisis management system called Project Sentinel.

Analyze the following field report and extract structured information. The report text has been redacted for security -- [REDACTED_NAME] and [REDACTED_CONTACT] are placeholders for sensitive data. Do NOT try to guess or fill in redacted values.

Field Report:
\"\"\"
{report_text}
\"\"\"

Return a JSON object with exactly these fields:
- "location": The sector/location mentioned (e.g. "Wakanda", "New Asgard", "Sokovia", "Sanctum Sanctorum", "Avengers Compound"). Use "Unknown" if not clear.
- "resource_mentioned": The specific resource mentioned (e.g. "Vibranium (kg)", "Arc Reactor Cores", "Pym Particles", "Clean Water (L)", "Medical Kits"). Use "Unknown" if not clear.
- "status": One of "critical", "compromised", "secured", "depleted", "unknown"
- "action_required": A brief description of what action is needed (1 sentence max)
- "urgency": One of "low", "medium", "high", "critical"

Return ONLY the JSON object, no markdown formatting, no code blocks, no extra text."""

BATCH_PROMPT = """You are an intelligence analyst for Project Sentinel. Below are {count} field reports, each labeled [REPORT_1] through [REPORT_{count}]. Reports have been redacted: [REDACTED_NAME] and [REDACTED_CONTACT] are placeholders.

For EACH report, extract:
- "location": sector mentioned (Wakanda, New Asgard, Sokovia, Sanctum Sanctorum, Avengers Compound, or "Unknown")
- "resource_mentioned": resource mentioned (Vibranium (kg), Arc Reactor Cores, Pym Particles, Clean Water (L), Medical Kits, or "Unknown")
- "status": one of "critical", "compromised", "secured", "depleted", "unknown"
- "action_required": one sentence max
- "urgency": one of "low", "medium", "high", "critical"

{reports_block}

Return a JSON array of {count} objects in the SAME order as the reports. No markdown, no code blocks, ONLY the JSON array."""

_client = None
_executor = ThreadPoolExecutor(max_workers=15)


def _get_client():
    global _client
    if _client is None and GEMINI_API_KEY and GEMINI_API_KEY != "your-gemini-api-key-here":
        _client = genai.Client(api_key=GEMINI_API_KEY)
    return _client


def extract_report_data(redacted_text: str) -> dict:
    """Send a single redacted report text to Gemini and get structured extraction."""
    client = _get_client()
    if not client:
        return _fallback_extraction(redacted_text)

    try:
        prompt = SINGLE_PROMPT.format(report_text=redacted_text)
        response = client.models.generate_content(model=MODEL, contents=prompt)
        raw = _strip_codeblock(response.text.strip())
        result = json.loads(raw)
        _validate_extraction(result)
        return result
    except json.JSONDecodeError as e:
        logger.warning(f"LLM returned invalid JSON: {e}")
        return _fallback_extraction(redacted_text)
    except Exception as e:
        logger.warning(f"LLM call failed: {e}")
        return _fallback_extraction(redacted_text)


def extract_batch(texts: list[str]) -> list[dict]:
    """Send up to ~25 reports in one Gemini call, get back a list of extractions."""
    client = _get_client()
    if not client:
        return [_fallback_extraction(t) for t in texts]

    reports_block = "\n\n".join(
        f"[REPORT_{i+1}]\n{text}" for i, text in enumerate(texts)
    )
    prompt = BATCH_PROMPT.format(
        count=len(texts), reports_block=reports_block
    )

    try:
        response = client.models.generate_content(model=MODEL, contents=prompt)
        raw = _strip_codeblock(response.text.strip())
        results = json.loads(raw)

        if not isinstance(results, list) or len(results) != len(texts):
            logger.warning(f"Batch LLM returned {type(results).__name__} length {len(results) if isinstance(results, list) else '?'}, expected list of {len(texts)}")
            return [_fallback_extraction(t) for t in texts]

        for r in results:
            _validate_extraction(r)
        return results

    except json.JSONDecodeError as e:
        logger.warning(f"Batch LLM returned invalid JSON: {e}")
        return [_fallback_extraction(t) for t in texts]
    except Exception as e:
        logger.warning(f"Batch LLM call failed: {e}")
        return [_fallback_extraction(t) for t in texts]


async def extract_batch_async(texts: list[str]) -> list[dict]:
    """Async wrapper for batch extraction."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_executor, extract_batch, texts)


def _strip_codeblock(text: str) -> str:
    if text.startswith("```"):
        text = text.split("\n", 1)[1]
        text = text.rsplit("```", 1)[0].strip()
    return text


def _validate_extraction(data: dict) -> None:
    """Ensure all required fields are present, fill defaults if missing."""
    defaults = {
        "location": "Unknown",
        "resource_mentioned": "Unknown",
        "status": "unknown",
        "action_required": "Review required",
        "urgency": "medium",
    }
    for key, default in defaults.items():
        if key not in data or not data[key]:
            data[key] = default


LOCATIONS = ["Wakanda", "New Asgard", "Sokovia", "Sanctum Sanctorum", "Avengers Compound"]
RESOURCES = ["Vibranium (kg)", "Arc Reactor Cores", "Pym Particles", "Clean Water (L)", "Medical Kits"]


def _fallback_extraction(text: str) -> dict:
    """Rule-based fallback when LLM is unavailable or returns bad data."""
    text_lower = text.lower()

    location = "Unknown"
    for loc in LOCATIONS:
        if loc.lower() in text_lower:
            location = loc
            break

    resource = "Unknown"
    for res in RESOURCES:
        if res.lower() in text_lower:
            resource = res
            break

    if "critical" in text_lower or "critically low" in text_lower:
        status, urgency = "critical", "critical"
    elif "compromised" in text_lower:
        status, urgency = "compromised", "high"
    elif "secured" in text_lower or "cache" in text_lower:
        status, urgency = "secured", "low"
    elif "out of" in text_lower or "depleted" in text_lower:
        status, urgency = "depleted", "critical"
    elif "dire" in text_lower:
        status, urgency = "critical", "high"
    else:
        status, urgency = "unknown", "medium"

    if "backup" in text_lower:
        action = "Send backup and supplies immediately"
    elif "critically low" in text_lower:
        action = f"Urgent resupply of {resource} needed"
    elif "secured" in text_lower:
        action = "Coordinate pickup of secured resources"
    elif "out of" in text_lower:
        action = f"Emergency resupply of {resource} required"
    elif "dire" in text_lower:
        action = f"Critical resupply of {resource} needed"
    else:
        action = "Monitor situation and assess"

    return {
        "location": location,
        "resource_mentioned": resource,
        "status": status,
        "action_required": action,
        "urgency": urgency,
    }
