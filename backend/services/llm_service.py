"""Gemini LLM integration for structured entity extraction from field reports."""
import os
import json
import logging

from google import genai

logger = logging.getLogger(__name__)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
MODEL = "gemini-2.5-flash-lite"

EXTRACTION_PROMPT = """You are an intelligence analyst for a crisis management system called Project Sentinel.

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


def extract_report_data(redacted_text: str) -> dict:
    """Send redacted report text to Gemini and get structured extraction."""
    if not GEMINI_API_KEY or GEMINI_API_KEY == "your-gemini-api-key-here":
        return _fallback_extraction(redacted_text)

    try:
        client = genai.Client(api_key=GEMINI_API_KEY)
        prompt = EXTRACTION_PROMPT.format(report_text=redacted_text)

        response = client.models.generate_content(
            model=MODEL,
            contents=prompt,
        )

        raw_response = response.text.strip()

        if raw_response.startswith("```"):
            raw_response = raw_response.split("\n", 1)[1]
            raw_response = raw_response.rsplit("```", 1)[0].strip()

        result = json.loads(raw_response)
        _validate_extraction(result)
        return result

    except json.JSONDecodeError as e:
        logger.warning(f"LLM returned invalid JSON: {e}")
        return _fallback_extraction(redacted_text)
    except Exception as e:
        logger.warning(f"LLM call failed: {e}")
        return _fallback_extraction(redacted_text)


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
