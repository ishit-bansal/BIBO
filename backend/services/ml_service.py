"""ML Forecasting -- predicts resource depletion using moving-average trend analysis.

Approach:
1. Average the 5 raw readings per timestamp into one clean data point
2. Apply a 24-point moving average to smooth out noise
3. Calculate slope from the smoothed data over the last 48 points (~2 days)
4. Project from the current smoothed value to zero using that slope
"""
from datetime import datetime, timedelta
from collections import defaultdict

import numpy as np
from sklearn.linear_model import LinearRegression
from sqlalchemy.orm import Session
from sqlalchemy import func

from db.models import ResourceLog

SNAP_TIMESTAMP = datetime(2026, 1, 1, 19, 0, 0)
MA_WINDOW = 24
SLOPE_WINDOW = 48


def _get_post_snap_averaged(db: Session, sector_id: str, resource_type: str):
    """Query post-snap data and return timestamp-averaged readings."""
    records = (
        db.query(ResourceLog)
        .filter(
            ResourceLog.sector_id == sector_id,
            ResourceLog.resource_type == resource_type,
            ResourceLog.timestamp > SNAP_TIMESTAMP,
            ResourceLog.snap_event_detected == False,
        )
        .order_by(ResourceLog.timestamp)
        .all()
    )
    if not records:
        return [], 0

    raw_count = len(records)
    buckets: dict[datetime, list[float]] = defaultdict(list)
    for r in records:
        buckets[r.timestamp].append(r.stock_level)

    averaged = sorted(
        [{"timestamp": ts, "stock": sum(vals) / len(vals)} for ts, vals in buckets.items()],
        key=lambda x: x["timestamp"],
    )
    return averaged, raw_count


def _apply_moving_average(averaged: list[dict], window: int = MA_WINDOW) -> list[dict]:
    """Apply a simple moving average to the averaged data."""
    if len(averaged) < window:
        return averaged

    stocks = [d["stock"] for d in averaged]
    ma_vals = []
    for i in range(len(stocks)):
        if i < window - 1:
            ma_vals.append(None)
        else:
            ma_vals.append(sum(stocks[i - window + 1 : i + 1]) / window)

    result = []
    for d, ma in zip(averaged, ma_vals):
        entry = {"timestamp": d["timestamp"], "stock": d["stock"]}
        if ma is not None:
            entry["ma"] = ma
        result.append(entry)
    return result


def _calc_slope(averaged: list[dict], window_days: int = 7):
    """Calculate the depletion slope from the raw averaged data.

    Uses linear regression on the last N days of per-timestamp averages.
    The slope comes from raw data (not MA) to avoid the MA lag bias.
    """
    if len(averaged) < 5:
        return 0.0, 0.0, 0

    cutoff = averaged[-1]["timestamp"] - timedelta(days=window_days)
    window = [d for d in averaged if d["timestamp"] >= cutoff]
    if len(window) < 5:
        window = averaged[-20:]

    base_time = window[0]["timestamp"]
    X = np.array(
        [(d["timestamp"] - base_time).total_seconds() / 3600.0 for d in window]
    ).reshape(-1, 1)
    y = np.array([d["stock"] for d in window])

    model = LinearRegression()
    model.fit(X, y)
    return float(model.coef_[0]), float(model.score(X, y)), len(window)


def predict_depletion(db: Session, sector_id: str, resource_type: str) -> dict:
    """Predict when a resource hits zero for a given sector."""
    averaged, raw_count = _get_post_snap_averaged(db, sector_id, resource_type)

    if not averaged:
        return _empty_prediction(sector_id, resource_type)

    last_raw = averaged[-1]["stock"]

    if last_raw <= 0:
        return {
            "sector_id": sector_id,
            "resource_type": resource_type,
            "current_stock": 0.0,
            "depletion_rate": 0.0,
            "predicted_zero_date": None,
            "hours_until_zero": 0.0,
            "confidence_score": 1.0,
            "status": "depleted",
            "data_points_used": raw_count,
        }

    slope, r_squared, pts_used = _calc_slope(averaged)

    ma_data = _apply_moving_average(averaged)
    with_ma = [d for d in ma_data if "ma" in d]
    current_ma = with_ma[-1]["ma"] if with_ma else last_raw
    latest_ts = averaged[-1]["timestamp"]

    if slope >= 0:
        return {
            "sector_id": sector_id,
            "resource_type": resource_type,
            "current_stock": round(float(current_ma), 2),
            "depletion_rate": round(float(slope), 4),
            "predicted_zero_date": None,
            "hours_until_zero": None,
            "confidence_score": round(float(max(0, r_squared)), 4),
            "status": "stable",
            "data_points_used": raw_count,
        }

    hours_to_zero = -current_ma / slope
    zero_datetime = latest_ts + timedelta(hours=hours_to_zero)

    if hours_to_zero <= 0:
        status = "depleted"
    elif hours_to_zero < 24:
        status = "critical"
    elif hours_to_zero < 72:
        status = "warning"
    else:
        status = "stable"

    return {
        "sector_id": sector_id,
        "resource_type": resource_type,
        "current_stock": round(float(current_ma), 2),
        "depletion_rate": round(float(slope), 4),
        "predicted_zero_date": zero_datetime.isoformat(),
        "hours_until_zero": round(float(max(0, hours_to_zero)), 2),
        "confidence_score": round(float(max(0, r_squared)), 4),
        "status": status,
        "data_points_used": raw_count,
    }


def get_trend_line(db: Session, sector_id: str, resource_type: str) -> dict:
    """Return moving-average series + forecast extension for chart overlay.

    The MA series lets the frontend draw a smooth trend through noisy
    data, and the forecast is a clean extension from the end of the MA
    to the predicted zero crossing.
    """
    averaged, raw_count = _get_post_snap_averaged(db, sector_id, resource_type)

    if not averaged or averaged[-1]["stock"] <= 0:
        return {"sector_id": sector_id, "resource_type": resource_type, "ma_series": [], "forecast": []}

    slope, r_squared, pts_used = _calc_slope(averaged)

    ma_data = _apply_moving_average(averaged)
    with_ma = [d for d in ma_data if "ma" in d]

    ma_series = [
        {"timestamp": d["timestamp"].isoformat(), "ma_stock": round(d["ma"], 2)}
        for d in with_ma
    ]

    forecast = []
    if with_ma and slope < 0:
        last_ma = with_ma[-1]["ma"]
        last_ts = with_ma[-1]["timestamp"]
        hours_to_zero = -last_ma / slope

        num_points = 15
        for i in range(num_points + 1):
            frac = i / num_points
            h = frac * hours_to_zero
            stock = last_ma + slope * h
            ts = last_ts + timedelta(hours=h)
            forecast.append({
                "timestamp": ts.isoformat(),
                "predicted_stock": round(max(float(stock), 0.0), 2),
            })

    return {
        "sector_id": sector_id,
        "resource_type": resource_type,
        "slope": round(slope, 4),
        "r_squared": round(r_squared, 4),
        "ma_window": MA_WINDOW,
        "data_points_used": raw_count,
        "ma_series": ma_series,
        "forecast": forecast,
    }


def predict_all(db: Session) -> list[dict]:
    """Run predictions for every sector + resource combination."""
    sectors = db.query(func.distinct(ResourceLog.sector_id)).all()
    types = db.query(func.distinct(ResourceLog.resource_type)).all()

    results = []
    for (sector,) in sectors:
        for (rtype,) in types:
            results.append(predict_depletion(db, sector, rtype))
    return results


def _empty_prediction(sector_id: str, resource_type: str) -> dict:
    return {
        "sector_id": sector_id,
        "resource_type": resource_type,
        "current_stock": 0.0,
        "depletion_rate": 0.0,
        "predicted_zero_date": None,
        "hours_until_zero": None,
        "confidence_score": 0.0,
        "status": "no_data",
        "data_points_used": 0,
    }
