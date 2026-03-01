"""Hero tracking and event endpoints — serves the Tactical Map."""
import json
import os
from datetime import datetime
from typing import Optional
from copy import deepcopy

from fastapi import APIRouter, Query

router = APIRouter(prefix="/api/heroes", tags=["Heroes"])

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")


def _load_json(filename: str):
    with open(os.path.join(DATA_DIR, filename)) as f:
        return json.load(f)


def _filter_heroes_by_time(heroes: list[dict], time_str: str) -> list[dict]:
    """Filter mission_history to only include missions completed by the given time.

    Also derives hero health/status from mission history at that point in time.
    """
    cutoff = datetime.fromisoformat(time_str)
    result = []
    for h in heroes:
        hero = deepcopy(h)
        missions = hero.get("mission_history", [])

        completed = []
        active_mission = None
        for m in missions:
            m_start = datetime.fromisoformat(m["timestamp"])
            from datetime import timedelta
            m_end = m_start + timedelta(hours=m["duration_hours"])

            if m_end <= cutoff:
                completed.append(m)
            elif m_start <= cutoff < m_end:
                active_mission = m

        hero["mission_history"] = completed

        # Derive status from timeline position
        if active_mission:
            threat = active_mission.get("threat", "medium")
            hero["status"] = "critical" if threat == "critical" else "engaged" if threat in ("high", "critical") else "active"
            hero["mission"] = f"{active_mission['mission_type']} — {active_mission['name']}"
        elif completed:
            last = completed[-1]
            last_end = datetime.fromisoformat(last["timestamp"]) + timedelta(hours=last["duration_hours"])
            hours_since = (cutoff - last_end).total_seconds() / 3600
            if hours_since < 4:
                hero["status"] = "active"
                hero["mission"] = f"Post-mission debrief — {last['name']}"
            else:
                hero["status"] = "standby"
                hero["mission"] = "Standby — awaiting deployment"
        else:
            hero["status"] = "standby"
            hero["mission"] = "Standby — pre-deployment"

        # Derive health from mission outcomes
        base_health = 100
        for m in completed:
            threat = m.get("threat", "medium")
            dmg = {"critical": 15, "high": 8, "medium": 3, "low": 1}.get(threat, 3)
            if m["outcome"] == "fail":
                dmg = int(dmg * 1.5)
            base_health -= dmg
            base_health = max(10, min(100, base_health + 2))  # slight recovery between missions
        hero["health"] = max(10, base_health)

        result.append(hero)
    return result


@router.get("")
def get_heroes(
    time: Optional[str] = Query(None, description="ISO timestamp — filter missions and derive hero state at this point"),
):
    heroes = _load_json("heroes.json")
    if time:
        heroes = _filter_heroes_by_time(heroes, time)
    return heroes


@router.get("/events")
def get_events():
    return _load_json("events.json")


@router.get("/sectors")
def get_sector_summaries(
    time: Optional[str] = Query(None, description="ISO timestamp — derive hero/sector state at this point"),
):
    heroes = _load_json("heroes.json")
    if time:
        heroes = _filter_heroes_by_time(heroes, time)
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
