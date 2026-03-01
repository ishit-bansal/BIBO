"""Supply chain endpoints — factory stock, active shipments, and logistics state."""
import csv
import json
import os
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Query

router = APIRouter(prefix="/api/supply", tags=["Supply Chain"])

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
CSV_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "..", "supply_chain_shipments.csv")

def _load_factories() -> list[dict]:
    with open(os.path.join(DATA_DIR, "factories.json")) as f:
        return json.load(f)


def _load_shipments() -> list[dict]:
    path = CSV_PATH
    if not os.path.exists(path):
        path = os.path.join(os.path.dirname(__file__), "..", "..", "supply_chain_shipments.csv")
    if not os.path.exists(path):
        path = "/app/supply_chain_shipments.csv"

    rows = []
    with open(path, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            row["quantity"] = int(row["quantity"])
            row["travel_hours"] = int(row["travel_hours"])
            row["source_lat"] = float(row["source_lat"])
            row["source_lon"] = float(row["source_lon"])
            row["dest_lat"] = float(row["dest_lat"])
            row["dest_lon"] = float(row["dest_lon"])
            rows.append(row)
    return rows


def _compute_shipment_state(shipment: dict, now: datetime) -> dict:
    """Compute a shipment's real-time state at a given point in time."""
    depart = datetime.fromisoformat(shipment["depart_time"])
    arrive = datetime.fromisoformat(shipment["arrive_time"])
    total_secs = (arrive - depart).total_seconds()

    if now < depart:
        status = "pending"
        progress = 0.0
        eta_hours = (arrive - now).total_seconds() / 3600
    elif now >= arrive:
        status = "delivered"
        progress = 100.0
        eta_hours = 0
    else:
        status = "in_transit"
        elapsed = (now - depart).total_seconds()
        progress = min(99.9, (elapsed / total_secs) * 100)
        eta_hours = (arrive - now).total_seconds() / 3600

    return {
        **shipment,
        "status": status,
        "progress_pct": round(progress, 1),
        "eta_hours": round(eta_hours, 1),
    }


def _compute_factory_state(factory: dict, shipments: list[dict], now: datetime) -> dict:
    """Compute a factory's current stock level based on production and shipments dispatched."""
    start = datetime(2026, 1, 1, 0, 0, 0)
    hours_elapsed = max(0, (now - start).total_seconds() / 3600)

    resources = {}
    for res_type, info in factory["resources"].items():
        produced = info["production_rate"] * hours_elapsed
        shipped = sum(
            s["quantity"] for s in shipments
            if s["source_factory_id"] == factory["id"]
            and s["resource_type"] == res_type
            and datetime.fromisoformat(s["depart_time"]) <= now
        )
        current_stock = min(
            info["max_capacity"],
            info["initial_stock"] + produced - shipped,
        )
        fill_pct = (current_stock / info["max_capacity"]) * 100

        hours_until_empty = None
        if info["production_rate"] > 0:
            pending_demand = sum(
                s["quantity"] for s in shipments
                if s["source_factory_id"] == factory["id"]
                and s["resource_type"] == res_type
                and datetime.fromisoformat(s["depart_time"]) > now
            )
            net_rate = info["production_rate"] - (pending_demand / max(1, hours_elapsed))
            if net_rate < 0 and current_stock > 0:
                hours_until_empty = current_stock / abs(net_rate)

        resources[res_type] = {
            "current_stock": round(max(0, current_stock), 1),
            "max_capacity": info["max_capacity"],
            "fill_pct": round(max(0, min(100, fill_pct)), 1),
            "production_rate": info["production_rate"],
            "total_produced": round(produced, 1),
            "total_shipped": shipped,
            "warning": fill_pct < 20,
            "critical": fill_pct < 10,
            "hours_until_empty": round(hours_until_empty, 1) if hours_until_empty else None,
        }

    return {
        "id": factory["id"],
        "name": factory["name"],
        "sector": factory["sector"],
        "coords": factory["coords"],
        "icon": factory["icon"],
        "resources": resources,
    }


@router.get("/shipments")
def get_shipments(
    time: Optional[str] = Query(None, description="ISO timestamp — compute shipment state at this time"),
    status: Optional[str] = Query(None, description="Filter by status: pending, in_transit, delivered"),
):
    """All shipments with their real-time state computed at the given time."""
    now = datetime.fromisoformat(time) if time else datetime(2026, 1, 17, 16, 0, 0)
    shipments = _load_shipments()
    result = [_compute_shipment_state(s, now) for s in shipments]

    if status:
        result = [s for s in result if s["status"] == status]

    return result


@router.get("/factories")
def get_factories(
    time: Optional[str] = Query(None, description="ISO timestamp — compute factory stock at this time"),
):
    """Factory definitions with live stock levels computed at the given time."""
    now = datetime.fromisoformat(time) if time else datetime(2026, 1, 17, 16, 0, 0)
    factories = _load_factories()
    shipments = _load_shipments()
    return [_compute_factory_state(f, shipments, now) for f in factories]


@router.get("/overview")
def get_supply_overview(
    time: Optional[str] = Query(None, description="ISO timestamp"),
):
    """Combined overview: factories + active shipments at the given time."""
    now = datetime.fromisoformat(time) if time else datetime(2026, 1, 17, 16, 0, 0)
    factories = _load_factories()
    shipments = _load_shipments()

    factory_states = [_compute_factory_state(f, shipments, now) for f in factories]
    shipment_states = [_compute_shipment_state(s, now) for s in shipments]

    active = [s for s in shipment_states if s["status"] == "in_transit"]
    pending = [s for s in shipment_states if s["status"] == "pending"]
    delivered = [s for s in shipment_states if s["status"] == "delivered"]

    warnings = []
    for fs in factory_states:
        for res, info in fs["resources"].items():
            if info["critical"]:
                warnings.append({
                    "type": "critical",
                    "factory": fs["name"],
                    "resource": res,
                    "stock_pct": info["fill_pct"],
                })
            elif info["warning"]:
                warnings.append({
                    "type": "warning",
                    "factory": fs["name"],
                    "resource": res,
                    "stock_pct": info["fill_pct"],
                })

    return {
        "timestamp": now.isoformat(),
        "factories": factory_states,
        "active_shipments": active,
        "pending_shipments": pending,
        "delivered_count": len(delivered),
        "total_shipments": len(shipment_states),
        "warnings": warnings,
    }
