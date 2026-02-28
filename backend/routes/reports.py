import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session

from db.database import get_db
from db.models import IntelReport
from schemas.schemas import ReportSubmission, IntelReportOut
from services.pii_redaction import redact_pii
from services.llm_service import extract_report_data

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


@router.post("/batch")
def batch_process(db: Session = Depends(get_db)):
    """Process all unprocessed reports in the database."""
    unprocessed = db.query(IntelReport).filter(IntelReport.processed == False).all()

    if not unprocessed:
        return {"status": "complete", "processed_count": 0, "message": "No unprocessed reports"}

    processed_count = 0
    errors = []

    for report in unprocessed:
        try:
            redacted_text, _ = redact_pii(report.raw_text)
            structured = extract_report_data(redacted_text)

            report.redacted_text = redacted_text
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
