"""WebSocket + simulation control endpoints."""

import asyncio
import random
from typing import Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

from db.database import SessionLocal
from db.models import ResourceLog
from services.simulator import simulator

router = APIRouter(tags=["WebSocket"])


@router.websocket("/ws/live")
async def live_feed(websocket: WebSocket):
    await websocket.accept()
    queue = simulator.subscribe()
    try:
        while True:
            data = await queue.get()
            await websocket.send_text(data)
    except (WebSocketDisconnect, Exception):
        pass
    finally:
        simulator.unsubscribe(queue)


@router.get("/api/sim/status")
def sim_status():
    """Current simulation state — which tick we're on, time range, etc."""
    return simulator.timeline_info


@router.post("/api/sim/seek")
async def sim_seek(
    tick: Optional[int] = Query(None, description="Jump to this tick index (0-based)"),
    time: Optional[str] = Query(None, description="Jump to this ISO timestamp (e.g. 2026-01-05T12:00:00)"),
):
    """Jump the live simulation to a specific point in the dataset.

    Examples:
      curl -X POST 'http://localhost:8000/api/sim/seek?tick=100'
      curl -X POST 'http://localhost:8000/api/sim/seek?time=2026-01-05T12:00:00'
    """
    if tick is not None:
        return await simulator.seek(tick)
    elif time is not None:
        return await simulator.seek(time)
    return {"error": "Provide either ?tick=N or ?time=ISO_TIMESTAMP"}


@router.post("/api/sim/snap")
async def execute_snap():
    """THE SNAP: randomly delete ~50% of resource_logs, reload timeline, broadcast event.

    Usage:
      curl -X POST http://localhost:8000/api/sim/snap
    """
    db = SessionLocal()
    try:
        all_ids = [r[0] for r in db.query(ResourceLog.id).all()]
        before_count = len(all_ids)

        random.shuffle(all_ids)
        to_delete = all_ids[: len(all_ids) // 2]

        if to_delete:
            db.query(ResourceLog).filter(ResourceLog.id.in_(to_delete)).delete(
                synchronize_session=False
            )
            db.commit()

        after_count = before_count - len(to_delete)
    finally:
        db.close()

    simulator._load_timeline()

    await simulator._broadcast({
        "type": "snap_event",
        "deleted": len(to_delete),
        "remaining": after_count,
        "message": "The Snap has been executed. Half the data has been erased.",
    })

    return {
        "status": "snapped",
        "before": before_count,
        "deleted": len(to_delete),
        "remaining": after_count,
    }
