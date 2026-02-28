"""Seed the database with historical CSV data and JSON intel reports."""
import os
import sys
import json
from datetime import datetime

import pandas as pd
from dotenv import load_dotenv

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from db.database import engine, SessionLocal
from db.models import Base, ResourceLog, IntelReport

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "..")
CSV_PATH = os.path.join(DATA_DIR, "historical_avengers_data.csv")
JSON_PATH = os.path.join(DATA_DIR, "field_intel_reports.json")


def seed_resource_logs(session):
    existing = session.query(ResourceLog).count()
    if existing > 0:
        print(f"resource_logs already has {existing} rows, skipping.")
        return

    print(f"Reading {CSV_PATH}...")
    df = pd.read_csv(CSV_PATH)
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df["snap_event_detected"] = df["snap_event_detected"].map({"True": True, "False": False, True: True, False: False})

    records = df.to_dict(orient="records")
    session.bulk_insert_mappings(ResourceLog, records)
    session.commit()
    print(f"Inserted {len(records)} resource log records.")


def seed_intel_reports(session):
    existing = session.query(IntelReport).count()
    if existing > 0:
        print(f"intel_reports already has {existing} rows, skipping.")
        return

    print(f"Reading {JSON_PATH}...")
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
        session.add(record)

    session.commit()
    print(f"Inserted {len(reports)} intel report records.")


def main():
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    try:
        seed_resource_logs(session)
        seed_intel_reports(session)
        print("Seeding complete.")
    finally:
        session.close()


if __name__ == "__main__":
    main()
