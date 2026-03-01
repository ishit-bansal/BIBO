from datetime import datetime
from typing import Optional
from io import StringIO

import pandas as pd
from fastapi import APIRouter, Depends, Query, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, distinct

from db.database import get_db
from db.models import ResourceLog
from schemas.schemas import ResourceLogOut, LatestStock

router = APIRouter(prefix="/api/resources", tags=["Resources"])


@router.get("/sectors", response_model=list[str])
def get_sectors(db: Session = Depends(get_db)):
    rows = db.query(distinct(ResourceLog.sector_id)).all()
    return sorted([r[0] for r in rows])


@router.get("/types", response_model=list[str])
def get_resource_types(db: Session = Depends(get_db)):
    rows = db.query(distinct(ResourceLog.resource_type)).all()
    return sorted([r[0] for r in rows])


@router.get("/latest", response_model=list[LatestStock])
def get_latest_stocks(db: Session = Depends(get_db)):
    """Most recent stock level for each sector + resource combination."""
    subq = (
        db.query(
            ResourceLog.sector_id,
            ResourceLog.resource_type,
            func.max(ResourceLog.timestamp).label("max_ts"),
        )
        .group_by(ResourceLog.sector_id, ResourceLog.resource_type)
        .subquery()
    )

    rows = (
        db.query(ResourceLog)
        .join(
            subq,
            (ResourceLog.sector_id == subq.c.sector_id)
            & (ResourceLog.resource_type == subq.c.resource_type)
            & (ResourceLog.timestamp == subq.c.max_ts),
        )
        .all()
    )

    seen = set()
    results = []
    for r in rows:
        key = (r.sector_id, r.resource_type)
        if key not in seen:
            seen.add(key)
            results.append(r)
    return results


@router.get("", response_model=list[ResourceLogOut])
def get_resources(
    sector_id: Optional[str] = Query(None),
    resource_type: Optional[str] = Query(None),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    snap_only: Optional[bool] = Query(None),
    limit: int = Query(100, ge=1, le=10000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    query = db.query(ResourceLog)

    if sector_id:
        query = query.filter(ResourceLog.sector_id == sector_id)
    if resource_type:
        query = query.filter(ResourceLog.resource_type == resource_type)
    if start_date:
        query = query.filter(ResourceLog.timestamp >= start_date)
    if end_date:
        query = query.filter(ResourceLog.timestamp <= end_date)
    if snap_only is not None:
        query = query.filter(ResourceLog.snap_event_detected == snap_only)

    query = query.order_by(ResourceLog.timestamp)
    return query.offset(offset).limit(limit).all()


@router.get("/timeline")
def get_timeline(db: Session = Depends(get_db)):
    """Full averaged timeline for every timestamp in the CSV.

    Returns one entry per timestamp with avg stock/usage per sector|resource.
    Used by the Live Feed chart to display the complete dataset from tick 0.
    """
    rows = (
        db.query(
            ResourceLog.timestamp,
            ResourceLog.sector_id,
            ResourceLog.resource_type,
            func.avg(ResourceLog.stock_level).label("avg_stock"),
            func.avg(ResourceLog.usage_rate_hourly).label("avg_usage"),
        )
        .group_by(ResourceLog.timestamp, ResourceLog.sector_id, ResourceLog.resource_type)
        .order_by(ResourceLog.timestamp)
        .all()
    )

    from collections import defaultdict
    by_ts: dict[datetime, dict[str, dict]] = defaultdict(dict)
    ordered_ts: list[datetime] = []
    seen: set[datetime] = set()

    for ts, sector, resource, avg_stock, avg_usage in rows:
        key = f"{sector}|{resource}"
        by_ts[ts][key] = {
            "avg_stock": round(float(avg_stock), 2),
            "avg_usage": round(float(avg_usage), 2),
        }
        if ts not in seen:
            seen.add(ts)
            ordered_ts.append(ts)

    total = len(ordered_ts)
    return [
        {
            "timestamp": ts.isoformat(),
            "tick_index": i,
            "total_ticks": total,
            "analytics": by_ts[ts],
        }
        for i, ts in enumerate(ordered_ts)
    ]


@router.post("/upload")
def upload_csv(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Upload new resource data via CSV file."""
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are accepted")

    content = file.file.read().decode("utf-8")
    df = pd.read_csv(StringIO(content))

    required_cols = {"timestamp", "sector_id", "resource_type", "stock_level", "usage_rate_hourly"}
    if not required_cols.issubset(set(df.columns)):
        raise HTTPException(
            status_code=400,
            detail=f"CSV must contain columns: {required_cols}",
        )

    df["timestamp"] = pd.to_datetime(df["timestamp"])
    if "snap_event_detected" not in df.columns:
        df["snap_event_detected"] = False
    else:
        df["snap_event_detected"] = df["snap_event_detected"].map(
            {"True": True, "False": False, True: True, False: False}
        )

    records = df.to_dict(orient="records")
    db.bulk_insert_mappings(ResourceLog, records)
    db.commit()

    return {"status": "success", "records_imported": len(records)}
