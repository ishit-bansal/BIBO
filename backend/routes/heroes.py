"""Hero tracking and event endpoints — serves the Tactical Map."""
import json
import os
from fastapi import APIRouter

router = APIRouter(prefix="/api/heroes", tags=["Heroes"])

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")


def _load_json(filename: str):
    with open(os.path.join(DATA_DIR, filename)) as f:
        return json.load(f)


@router.get("")
def get_heroes():
    return _load_json("heroes.json")


@router.get("/events")
def get_events():
    return _load_json("events.json")


@router.get("/sectors")
def get_sector_summaries():
    heroes = _load_json("heroes.json")
    events = _load_json("events.json")

    sectors: dict[str, dict] = {}
    for h in heroes:
        sid = h["sector_id"]
        if sid not in sectors:
            sectors[sid] = {
                "sector_id": sid,
                "coords": h["coords"],
                "heroes": [],
                "hero_count": 0,
                "avg_health": 0,
                "weather": h["weather"],
                "threat_level": "stable",
                "active_events": [],
            }
        sectors[sid]["heroes"].append(h)
        sectors[sid]["hero_count"] += 1

    for sid, s in sectors.items():
        s["avg_health"] = round(
            sum(h["health"] for h in s["heroes"]) / len(s["heroes"])
        )
        active = [e for e in events if e["sector_id"] == sid and e["active"]]
        s["active_events"] = active
        if any(e["severity"] == "critical" for e in active):
            s["threat_level"] = "critical"
        elif any(e["severity"] == "high" for e in active):
            s["threat_level"] = "high"
        elif any(e["severity"] == "medium" for e in active):
            s["threat_level"] = "medium"
        else:
            s["threat_level"] = "stable"

    return list(sectors.values())
