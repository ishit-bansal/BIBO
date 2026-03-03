"""Real-time data simulator — replays the actual CSV data at accelerated speed.

Reads ALL timestamps from the DB (seeded from historical_avengers_data.csv)
and emits one time-step every TICK_INTERVAL seconds.  Each tick contains
the real readings for that timestamp plus pre-computed analytics (rolling
averages, hourly change, trend direction) derived from the CSV data itself.

No random or fake data is generated — everything comes from the CSV.
"""

import asyncio
import json
from collections import defaultdict
from datetime import datetime

from sqlalchemy import distinct
from sqlalchemy.orm import Session

from db.database import SessionLocal
from db.models import ResourceLog

TICK_INTERVAL = 2.0  # wall-clock seconds between ticks
DEFAULT_START_TIME = "2026-01-05T00:00:00"


class LiveSimulator:
    """Replays CSV data with pre-computed analytics via WebSocket."""

    def __init__(self):
        self.clients: set[asyncio.Queue] = set()
        self._task: asyncio.Task | None = None
        self._timestamps: list[datetime] = []
        self._data_by_ts: dict[datetime, list[dict]] = {}
        self._tick_index = 0
        self._lock = asyncio.Lock()
        self._avg_by_tick: dict[str, dict[int, float]] = defaultdict(dict)
        self._resource_keys: set[str] = set()

    async def start(self):
        if self._task is not None:
            return
        self._load_timeline()
        self._seek_to_default_start()
        self._task = asyncio.create_task(self._run())

    def _seek_to_default_start(self):
        """Position the simulator at DEFAULT_START_TIME on first boot."""
        if not self._timestamps:
            return
        target = datetime.fromisoformat(DEFAULT_START_TIME)
        for i, ts in enumerate(self._timestamps):
            if ts >= target:
                self._tick_index = i
                return
        self._tick_index = len(self._timestamps) - 1

    def _load_timeline(self):
        """Load all distinct timestamps and their readings from the DB.

        Also pre-computes per-resource average stock at each tick so that
        analytics (rolling windows, deltas, trends) can be derived from
        actual stock movements instead of the CSV's noise column.
        """
        db: Session = SessionLocal()
        try:
            ts_rows = (
                db.query(distinct(ResourceLog.timestamp))
                .order_by(ResourceLog.timestamp)
                .all()
            )
            self._timestamps = [r[0] for r in ts_rows]

            all_records = (
                db.query(ResourceLog)
                .order_by(ResourceLog.timestamp)
                .all()
            )
            bucket: dict[datetime, list[dict]] = defaultdict(list)
            for r in all_records:
                bucket[r.timestamp].append({
                    "sector_id": r.sector_id,
                    "resource_type": r.resource_type,
                    "stock_level": round(r.stock_level, 2),
                    "usage_rate_hourly": round(r.usage_rate_hourly, 2),
                    "snap_event_detected": r.snap_event_detected,
                })
            self._data_by_ts = dict(bucket)

            self._resource_keys = set()
            self._avg_by_tick = defaultdict(dict)
            for i, ts in enumerate(self._timestamps):
                readings = self._data_by_ts.get(ts, [])
                by_key: dict[str, list[float]] = defaultdict(list)
                for r in readings:
                    key = f"{r['sector_id']}|{r['resource_type']}"
                    by_key[key].append(r["stock_level"])
                for key, stocks in by_key.items():
                    self._resource_keys.add(key)
                    self._avg_by_tick[key][i] = sum(stocks) / len(stocks)
        finally:
            db.close()

    def _compute_analytics(self, tick_idx: int) -> dict:
        """Compute per-resource analytics entirely from real stock movements.

        Every metric is derived from actual stock_level values in the DB:
        - avg_stock / prev_avg / hourly_change / change_pct: direct deltas
        - avg_usage: rolling mean of |Δstock| over the last 6 hours
        - avg_6h / avg_24h: rolling window averages of stock
        - trend: direction from the last 3 ticks
        """
        if not self._timestamps:
            return {}

        analytics: dict[str, dict] = {}
        for key in self._resource_keys:
            avg_stock = self._avg_by_tick[key].get(tick_idx)
            if avg_stock is None:
                continue

            sector, resource = key.split("|")

            prev_avg = self._avg_by_tick[key].get(tick_idx - 1) if tick_idx > 0 else None
            hourly_change = (avg_stock - prev_avg) if prev_avg is not None else 0.0

            # Usage rate from actual stock deltas (rolling 6h)
            usage_deltas: list[float] = []
            for i in range(max(1, tick_idx - 5), tick_idx + 1):
                cur = self._avg_by_tick[key].get(i)
                prev = self._avg_by_tick[key].get(i - 1)
                if cur is not None and prev is not None:
                    usage_deltas.append(abs(cur - prev))
            avg_usage = sum(usage_deltas) / len(usage_deltas) if usage_deltas else 0.0

            # Rolling averages from pre-computed stock values
            def rolling_avg(window: int) -> float | None:
                if tick_idx < window:
                    return None
                vals = [self._avg_by_tick[key].get(i)
                        for i in range(tick_idx - window, tick_idx)]
                valid = [v for v in vals if v is not None]
                return round(sum(valid) / len(valid), 2) if valid else None

            avg_6h = rolling_avg(6)
            avg_24h = rolling_avg(24)

            # Trend from last 3 ticks
            trend = "flat"
            if tick_idx >= 3:
                recent = [self._avg_by_tick[key].get(tick_idx - 3 + j)
                          for j in range(3)]
                if all(v is not None for v in recent):
                    if recent[2] > recent[0] + 1:
                        trend = "up"
                    elif recent[2] < recent[0] - 1:
                        trend = "down"

            analytics[key] = {
                "sector_id": sector,
                "resource_type": resource,
                "avg_stock": round(avg_stock, 2),
                "avg_usage": round(avg_usage, 2),
                "prev_avg": round(prev_avg, 2) if prev_avg is not None else None,
                "hourly_change": round(hourly_change, 2),
                "change_pct": round((hourly_change / prev_avg) * 100, 2) if prev_avg and prev_avg != 0 else 0.0,
                "avg_6h": avg_6h,
                "avg_24h": avg_24h,
                "above_avg_6h": avg_stock > avg_6h if avg_6h is not None else None,
                "above_avg_24h": avg_stock > avg_24h if avg_24h is not None else None,
                "trend": trend,
            }

        return analytics

    async def _run(self):
        """Main loop — iterate through timestamps and broadcast real CSV data."""
        while True:
            if not self._timestamps:
                await asyncio.sleep(5)
                continue

            if self._tick_index >= len(self._timestamps):
                await self._broadcast({
                    "type": "sim_complete",
                    "message": "Simulation has reached the end of available data. Auto-restarting...",
                    "total_ticks": len(self._timestamps),
                })
                await asyncio.sleep(3)
                self._seek_to_default_start()
                continue

            idx = self._tick_index
            ts = self._timestamps[idx]
            readings = self._data_by_ts.get(ts, [])
            analytics = self._compute_analytics(idx)

            msg = {
                "type": "resource_tick",
                "timestamp": ts.isoformat(),
                "tick_index": self._tick_index,
                "total_ticks": len(self._timestamps),
                "readings": readings,
                "analytics": analytics,
            }
            await self._broadcast(msg)

            self._tick_index += 1
            await asyncio.sleep(TICK_INTERVAL)

    async def restart(self):
        """Reset the simulator back to DEFAULT_START_TIME."""
        async with self._lock:
            self._seek_to_default_start()

    async def seek(self, target: int | str):
        """Jump the simulator to a specific tick index or ISO timestamp."""
        async with self._lock:
            if isinstance(target, int):
                self._tick_index = max(0, min(target, len(self._timestamps) - 1))
            else:
                target_dt = datetime.fromisoformat(target)
                for i, ts in enumerate(self._timestamps):
                    if ts >= target_dt:
                        self._tick_index = i
                        break
                else:
                    self._tick_index = len(self._timestamps) - 1

        current_ts = self._timestamps[self._tick_index % len(self._timestamps)]
        return {
            "status": "seeked",
            "tick_index": self._tick_index,
            "timestamp": current_ts.isoformat(),
            "total_ticks": len(self._timestamps),
        }

    async def _broadcast(self, msg: dict):
        data = json.dumps(msg)
        dead: list[asyncio.Queue] = []
        for q in self.clients:
            try:
                q.put_nowait(data)
            except asyncio.QueueFull:
                dead.append(q)
        for q in dead:
            self.clients.discard(q)

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=50)
        self.clients.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue):
        self.clients.discard(q)

    def get_current_tick(self) -> dict | None:
        """Return the current tick's full data for immediate delivery to new clients."""
        if not self._timestamps or self._tick_index >= len(self._timestamps):
            return None
        idx = self._tick_index
        ts = self._timestamps[idx]
        readings = self._data_by_ts.get(ts, [])
        analytics = self._compute_analytics(idx)
        return {
            "type": "resource_tick",
            "timestamp": ts.isoformat(),
            "tick_index": idx,
            "total_ticks": len(self._timestamps),
            "readings": readings,
            "analytics": analytics,
        }

    @property
    def timeline_info(self) -> dict:
        return {
            "current_tick": self._tick_index,
            "total_ticks": len(self._timestamps),
            "current_timestamp": self._timestamps[self._tick_index % len(self._timestamps)].isoformat() if self._timestamps else None,
            "first_timestamp": self._timestamps[0].isoformat() if self._timestamps else None,
            "last_timestamp": self._timestamps[-1].isoformat() if self._timestamps else None,
            "tick_interval_seconds": TICK_INTERVAL,
        }


simulator = LiveSimulator()
