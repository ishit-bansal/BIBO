from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class ResourceLogOut(BaseModel):
    id: int
    timestamp: datetime
    sector_id: str
    resource_type: str
    stock_level: float
    usage_rate_hourly: float
    snap_event_detected: bool

    model_config = {"from_attributes": True}


class LatestStock(BaseModel):
    sector_id: str
    resource_type: str
    stock_level: float
    usage_rate_hourly: float
    timestamp: datetime

    model_config = {"from_attributes": True}


class IntelReportOut(BaseModel):
    id: int
    report_id: str
    hero_alias: str
    secure_contact: str
    raw_text: str
    redacted_text: Optional[str] = None
    structured_data: Optional[dict] = None
    priority: str
    timestamp: datetime
    processed: bool

    model_config = {"from_attributes": True}


class ReportSubmission(BaseModel):
    raw_text: str
    hero_alias: Optional[str] = "Unknown"
    secure_contact: Optional[str] = "Unknown"
    priority: Optional[str] = "Routine"


class RedactRequest(BaseModel):
    text: str


class RedactResponse(BaseModel):
    original: str
    redacted: str
    redaction_log: list[dict]


class PredictionOut(BaseModel):
    sector_id: str
    resource_type: str
    current_stock: float
    depletion_rate: float
    predicted_zero_date: Optional[str] = None
    hours_until_zero: Optional[float] = None
    confidence_score: float
    status: str
    data_points_used: int
