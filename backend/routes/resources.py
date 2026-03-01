from datetime import datetime, timedelta
from typing import Optional
from io import StringIO
from collections import defaultdict

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, Query, UploadFile, File, HTTPException
from sklearn.linear_model import LinearRegression
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


MA_WINDOW = 24


@router.post("/analyze")
def analyze_csv(file: UploadFile = File(...)):
    """Analyze an uploaded CSV in-memory: MA, regression, forecast per pair."""
    if not file.filename or not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are accepted")

    content = file.file.read().decode("utf-8")
    df = pd.read_csv(StringIO(content))

    required_cols = {"timestamp", "sector_id", "resource_type", "stock_level"}
    if not required_cols.issubset(set(df.columns)):
        raise HTTPException(
            status_code=400,
            detail=f"CSV must contain columns: {required_cols}",
        )

    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df = df.sort_values("timestamp")

    time_start = df["timestamp"].min().isoformat()
    time_end = df["timestamp"].max().isoformat()
    total_records = len(df)

    pairs = []
    for (sector, resource), group in df.groupby(["sector_id", "resource_type"]):
        avg_df = group.groupby("timestamp")["stock_level"].mean().sort_index()
        if avg_df.empty:
            continue

        timestamps = avg_df.index.tolist()
        stocks = avg_df.values

        # Downsample raw data if too many points (keep ~500 max per pair)
        max_raw = 500
        if len(timestamps) > max_raw:
            step = len(timestamps) / max_raw
            indices = [int(i * step) for i in range(max_raw)]
            if indices[-1] != len(timestamps) - 1:
                indices.append(len(timestamps) - 1)
            raw = [
                {"timestamp": timestamps[i].isoformat(), "stock": round(float(stocks[i]), 2)}
                for i in indices
            ]
        else:
            raw = [
                {"timestamp": ts.isoformat(), "stock": round(float(s), 2)}
                for ts, s in zip(timestamps, stocks)
            ]

        # Moving average via pandas rolling
        ma_vals = pd.Series(stocks).rolling(window=MA_WINDOW, min_periods=MA_WINDOW).mean()
        ma_full = [(i, v) for i, v in enumerate(ma_vals) if not np.isnan(v)]
        if len(ma_full) > max_raw:
            step = len(ma_full) / max_raw
            ma_indices = [int(j * step) for j in range(max_raw)]
            if ma_indices[-1] != len(ma_full) - 1:
                ma_indices.append(len(ma_full) - 1)
            ma_series = [
                {"timestamp": timestamps[ma_full[j][0]].isoformat(), "ma_stock": round(float(ma_full[j][1]), 2)}
                for j in ma_indices
            ]
        else:
            ma_series = [
                {"timestamp": timestamps[i].isoformat(), "ma_stock": round(float(v), 2)}
                for i, v in ma_full
            ]

        # Regression
        base_time = timestamps[0]
        hours = np.array([(t - base_time).total_seconds() / 3600.0 for t in timestamps]).reshape(-1, 1)
        y = stocks.astype(float)

        model = LinearRegression()
        model.fit(hours, y)
        slope = float(model.coef_[0])
        intercept = float(model.intercept_)
        r_squared = float(model.score(hours, y))

        # Recent-window regression for accurate near-term forecasting
        RECENT_WINDOW_H = 72.0
        last_stock = float(stocks[-1])
        last_ts = timestamps[-1]
        last_hour = float(hours[-1][0])

        recent_mask = hours.flatten() >= (last_hour - RECENT_WINDOW_H)
        if recent_mask.sum() >= 10:
            recent_hours = hours[recent_mask]
            recent_y = y[recent_mask]
            recent_model = LinearRegression()
            recent_model.fit(recent_hours, recent_y)
            forecast_slope = float(recent_model.coef_[0])
            recent_residuals = recent_y - recent_model.predict(recent_hours)
        else:
            forecast_slope = slope
            recent_residuals = y - model.predict(hours)

        # Measure noise characteristics from recent data for realistic simulation
        noise_std = float(np.std(recent_residuals))
        noise_autocorr = 0.85

        # Wavy forecast: simulate realistic fluctuations using AR(1) noise
        FORECAST_HORIZON_H = 168.0
        n_forecast = 200
        forecast_h = np.linspace(0, FORECAST_HORIZON_H, n_forecast)
        rng = np.random.default_rng(42)
        noise = np.zeros(n_forecast)
        noise[0] = 0.0
        for ni in range(1, n_forecast):
            noise[ni] = noise_autocorr * noise[ni - 1] + rng.normal(0, noise_std * (1 - noise_autocorr ** 2) ** 0.5)

        forecast = []
        for fi in range(n_forecast):
            h = float(forecast_h[fi])
            s = last_stock + forecast_slope * h + noise[fi]
            ts = last_ts + timedelta(hours=h)
            forecast.append({
                "timestamp": ts.isoformat(),
                "predicted_stock": round(max(s, 0.0), 2),
            })

        # Stats (use forecast_slope for predictions -- more accurate near-term)
        current = round(last_stock, 2)
        max_stock = round(float(y.max()), 2)
        hours_to_zero_val = None
        predicted_zero = None
        if forecast_slope < 0 and last_stock > 0:
            htz = -last_stock / forecast_slope
            hours_to_zero_val = round(htz, 2)
            predicted_zero = (last_ts + timedelta(hours=htz)).isoformat()

        if last_stock <= 0:
            status = "depleted"
        elif hours_to_zero_val is not None and hours_to_zero_val < 24:
            status = "critical"
        elif hours_to_zero_val is not None and hours_to_zero_val < 72:
            status = "warning"
        else:
            status = "stable"

        # Risk score 0-100: 100 = safe, 0 = depleted
        stock_pct = (current / max_stock * 100) if max_stock > 0 else 0
        if status == "depleted":
            risk_score = 0
        elif hours_to_zero_val is not None:
            risk_score = min(100, max(0, round(hours_to_zero_val / FORECAST_HORIZON_H * 80 + stock_pct * 0.2)))
        else:
            risk_score = 100

        # Weekly forecast summary: stock at each day for 7 days
        weekly_forecast = []
        for d in range(1, 8):
            h = float(d * 24)
            projected = last_stock + forecast_slope * h
            weekly_forecast.append({
                "day": d,
                "hours": h,
                "projected_stock": round(max(projected, 0.0), 2),
                "date": (last_ts + timedelta(hours=h)).isoformat(),
            })

        pairs.append({
            "sector_id": str(sector),
            "resource_type": str(resource),
            "stats": {
                "current": current,
                "min": round(float(y.min()), 2),
                "max": max_stock,
                "mean": round(float(y.mean()), 2),
                "depletion_rate": round(forecast_slope, 4),
                "predicted_zero": predicted_zero,
                "hours_to_zero": hours_to_zero_val,
                "status": status,
                "data_points": len(timestamps),
                "risk_score": risk_score,
                "stock_pct": round(stock_pct, 1),
            },
            "raw": raw,
            "ma": ma_series,
            "forecast": forecast,
            "weekly_forecast": weekly_forecast,
        })

    return {
        "pairs": pairs,
        "total_records": total_records,
        "time_range": {"start": time_start, "end": time_end},
    }
