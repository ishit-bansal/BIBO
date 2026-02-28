"""PII Redaction middleware -- strips names and contact info before LLM processing."""
import re

KNOWN_HERO_NAMES = [
    "Tony Stark",
    "Natasha Romanoff",
    "Thor Odinson",
    "Peter Parker",
    "Steve Rogers",
    "Bruce Banner",
    "Wanda Maximoff",
    "Clint Barton",
    "Scott Lang",
    "Carol Danvers",
    "T'Challa",
    "Stephen Strange",
    "Nick Fury",
    "Bucky Barnes",
    "Sam Wilson",
]

KNOWN_FIRST_NAMES = [name.split()[0] for name in KNOWN_HERO_NAMES]
KNOWN_LAST_NAMES = [name.split()[-1] for name in KNOWN_HERO_NAMES if len(name.split()) > 1]

PHONE_PATTERN = re.compile(r"555-[\w-]+(?:\s*\([^)]*\))?")


def redact_pii(text: str) -> tuple[str, list[dict]]:
    """
    Remove PII from text. Returns (redacted_text, redaction_log).
    The log records each substitution for audit purposes.
    """
    redacted = text
    log: list[dict] = []

    for name in sorted(KNOWN_HERO_NAMES, key=len, reverse=True):
        if name in redacted:
            log.append({"type": "name", "original": name, "replacement": "[REDACTED_NAME]"})
            redacted = redacted.replace(name, "[REDACTED_NAME]")

    for match in PHONE_PATTERN.finditer(redacted):
        found = match.group()
        log.append({"type": "contact", "original": found, "replacement": "[REDACTED_CONTACT]"})
    redacted = PHONE_PATTERN.sub("[REDACTED_CONTACT]", redacted)

    return redacted, log
