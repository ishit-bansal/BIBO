from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text, JSON
from db.database import Base


class ResourceLog(Base):
    __tablename__ = "resource_logs"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, nullable=False, index=True)
    sector_id = Column(String, nullable=False, index=True)
    resource_type = Column(String, nullable=False, index=True)
    stock_level = Column(Float, nullable=False)
    usage_rate_hourly = Column(Float, nullable=False)
    snap_event_detected = Column(Boolean, default=False)


class IntelReport(Base):
    __tablename__ = "intel_reports"

    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(String, unique=True, nullable=False, index=True)
    hero_alias = Column(String, nullable=False)
    secure_contact = Column(String, nullable=False)
    raw_text = Column(Text, nullable=False)
    redacted_text = Column(Text, nullable=True)
    structured_data = Column(JSON, nullable=True)
    priority = Column(String, nullable=False)
    timestamp = Column(DateTime, nullable=False)
    processed = Column(Boolean, default=False)
