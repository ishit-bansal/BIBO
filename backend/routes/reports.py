import asyncio
import json
import os
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session

from db.database import get_db
from db.models import IntelReport
from schemas.schemas import ReportSubmission, IntelReportOut
from services.pii_redaction import redact_pii
from services.llm_service import extract_report_data, extract_batch_async

router = APIRouter(prefix="/api/reports", tags=["Intelligence Reports"])


@router.get("", response_model=list[IntelReportOut])
def get_reports(
    processed: Optional[bool] = Query(None),
    priority: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    query = db.query(IntelReport)
    if processed is not None:
        query = query.filter(IntelReport.processed == processed)
    if priority:
        query = query.filter(IntelReport.priority == priority)
    query = query.order_by(IntelReport.timestamp.desc())
    return query.offset(offset).limit(limit).all()


@router.get("/{report_id}", response_model=IntelReportOut)
def get_report(report_id: str, db: Session = Depends(get_db)):
    report = db.query(IntelReport).filter(IntelReport.report_id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return report


@router.get("/{report_id}/redaction-log")
def get_redaction_log(report_id: str, db: Session = Depends(get_db)):
    """Show side-by-side original vs redacted text for audit purposes."""
    report = db.query(IntelReport).filter(IntelReport.report_id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if not report.processed:
        raise HTTPException(status_code=400, detail="Report has not been processed yet")

    _, log = redact_pii(report.raw_text)
    return {
        "report_id": report.report_id,
        "original_text": report.raw_text,
        "redacted_text": report.redacted_text,
        "redactions_applied": log,
    }


@router.post("", response_model=IntelReportOut)
def submit_report(submission: ReportSubmission, db: Session = Depends(get_db)):
    """Submit a new field report -- runs through redact -> LLM -> store."""
    redacted_text, _ = redact_pii(submission.raw_text)
    structured = extract_report_data(redacted_text)

    report = IntelReport(
        report_id=str(uuid.uuid4()),
        hero_alias=submission.hero_alias,
        secure_contact=submission.secure_contact,
        raw_text=submission.raw_text,
        redacted_text=redacted_text,
        structured_data=structured,
        priority=submission.priority,
        timestamp=datetime.utcnow(),
        processed=True,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


REPORTS_PER_CALL = 20


@router.post("/batch")
async def batch_process(db: Session = Depends(get_db)):
    """Process all unprocessed reports using multi-report LLM batching.

    Packs ~20 reports per Gemini call, fires 10 calls in parallel.
    200 reports → 10 parallel API calls instead of 200 sequential ones.
    """
    unprocessed = db.query(IntelReport).filter(IntelReport.processed == False).all()

    if not unprocessed:
        return {"status": "complete", "processed_count": 0, "message": "No unprocessed reports"}

    for report in unprocessed:
        redacted_text, _ = redact_pii(report.raw_text)
        report.redacted_text = redacted_text

    chunks: list[list[IntelReport]] = [
        unprocessed[i:i + REPORTS_PER_CALL]
        for i in range(0, len(unprocessed), REPORTS_PER_CALL)
    ]

    async def process_chunk(chunk: list[IntelReport]):
        texts = [r.redacted_text for r in chunk]
        return chunk, await extract_batch_async(texts)

    results = await asyncio.gather(
        *[process_chunk(c) for c in chunks], return_exceptions=True
    )

    processed_count = 0
    errors = []

    for result in results:
        if isinstance(result, Exception):
            errors.append({"error": str(result)})
            continue
        chunk, extractions = result
        for report, structured in zip(chunk, extractions):
            try:
                report.structured_data = structured
                report.processed = True
                processed_count += 1
            except Exception as e:
                errors.append({"report_id": report.report_id, "error": str(e)})

    db.commit()

    return {
        "status": "complete",
        "processed_count": processed_count,
        "error_count": len(errors),
        "errors": errors[:10],
    }


JSON_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "field_intel_reports.json")


@router.post("/reset")
def reset_reports(db: Session = Depends(get_db)):
    """Clear all intel reports and re-seed from field_intel_reports.json as unprocessed."""
    db.query(IntelReport).delete()
    db.commit()

    with open(JSON_PATH) as f:
        reports = json.load(f)

    for report in reports:
        record = IntelReport(
            report_id=report["report_id"],
            hero_alias=report["metadata"]["hero_alias"],
            secure_contact=report["metadata"]["secure_contact"],
            raw_text=report["raw_text"],
            redacted_text=None,
            structured_data=None,
            priority=report["priority"],
            timestamp=datetime.fromisoformat(report["timestamp"]),
            processed=False,
        )
        db.add(record)

    db.commit()
    return {"status": "reset", "report_count": len(reports)}
