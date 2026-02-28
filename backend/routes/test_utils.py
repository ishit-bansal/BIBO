from fastapi import APIRouter
from schemas.schemas import RedactRequest, RedactResponse
from services.pii_redaction import redact_pii
from services.llm_service import extract_report_data

router = APIRouter(prefix="/api/test", tags=["Testing Utilities"])


@router.post("/redact", response_model=RedactResponse)
def test_redaction(req: RedactRequest):
    """Test the PII redaction function with arbitrary text."""
    redacted, log = redact_pii(req.text)
    return RedactResponse(original=req.text, redacted=redacted, redaction_log=log)


@router.post("/llm")
def test_llm_pipeline(req: RedactRequest):
    """Test the full redact-then-LLM pipeline on arbitrary text."""
    redacted, redaction_log = redact_pii(req.text)
    structured = extract_report_data(redacted)
    return {
        "original": req.text,
        "redacted": redacted,
        "redaction_log": redaction_log,
        "structured_data": structured,
    }
