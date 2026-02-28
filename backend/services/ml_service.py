"""ML Forecasting -- predicts resource depletion using linear regression on post-snap data."""
from datetime import datetime, timedelta

import numpy as np
from sklearn.linear_model import LinearRegression
from sqlalchemy.orm import Session
from sqlalchemy import func

from db.models import ResourceLog

SNAP_TIMESTAMP = datetime(2026, 1, 1, 19, 0, 0)


def predict_depletion(db: Session, sector_id: str, resource_type: str) -> dict:
    """
    Predict when a resource hits zero for a given sector.
    Uses post-snap data only to avoid the anomaly skewing results.
    """
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
        return _empty_prediction(sector_id, resource_type)

    latest = records[-1]
    current_stock = latest.stock_level

    if current_stock <= 0:
        return {
            "sector_id": sector_id,
            "resource_type": resource_type,
            "current_stock": 0.0,
            "depletion_rate": 0.0,
            "predicted_zero_date": None,
            "hours_until_zero": 0.0,
            "confidence_score": 1.0,
            "status": "depleted",
            "data_points_used": len(records),
        }

    base_time = records[0].timestamp
    X = np.array([(r.timestamp - base_time).total_seconds() / 3600.0 for r in records]).reshape(-1, 1)
    y = np.array([r.stock_level for r in records])

    model = LinearRegression()
    model.fit(X, y)

    r_squared = model.score(X, y)
    slope = model.coef_[0]
    intercept = model.intercept_

    if slope >= 0:
        return {
            "sector_id": sector_id,
            "resource_type": resource_type,
            "current_stock": float(current_stock),
            "depletion_rate": float(slope),
            "predicted_zero_date": None,
            "hours_until_zero": None,
            "confidence_score": float(max(0, r_squared)),
            "status": "stable",
            "data_points_used": len(records),
        }

    hours_to_zero = -intercept / slope
    zero_datetime = base_time + timedelta(hours=hours_to_zero)

    latest_hours = (latest.timestamp - base_time).total_seconds() / 3600.0
    hours_remaining = hours_to_zero - latest_hours

    if hours_remaining < 0:
        hours_remaining = 0
        status = "depleted"
    elif hours_remaining < 24:
        status = "critical"
    elif hours_remaining < 72:
        status = "warning"
    else:
        status = "stable"

    return {
        "sector_id": sector_id,
        "resource_type": resource_type,
        "current_stock": float(current_stock),
        "depletion_rate": float(slope),
        "predicted_zero_date": zero_datetime.isoformat(),
        "hours_until_zero": float(round(max(0, hours_remaining), 2)),
        "confidence_score": float(round(max(0, r_squared), 4)),
        "status": status,
        "data_points_used": len(records),
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
