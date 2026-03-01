"""WebSocket + simulation control endpoints."""

import asyncio
from typing import Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

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
    """THE SNAP: broadcast a snap event to all connected clients.

    Does NOT modify any database — the frontend handles halving
    the user-uploaded CSV data in-memory.

    Usage:
      curl -X POST http://localhost:8000/api/sim/snap
    """
    await simulator._broadcast({
        "type": "snap_event",
        "deleted": 0,
        "remaining": 0,
        "message": "The Snap has been executed. Half the uploaded data has been erased.",
    })

    return {"status": "snapped"}
