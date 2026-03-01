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


class LiveSimulator:
    """Replays CSV data with pre-computed analytics via WebSocket."""

    def __init__(self):
        self.clients: set[asyncio.Queue] = set()
        self._task: asyncio.Task | None = None
        self._timestamps: list[datetime] = []
        self._data_by_ts: dict[datetime, list[dict]] = {}
        self._tick_index = 0
        self._lock = asyncio.Lock()

    async def start(self):
        if self._task is not None:
            return
        self._load_timeline()
        self._task = asyncio.create_task(self._run())

    def _load_timeline(self):
        """Load all distinct timestamps and their readings from the DB."""
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
        finally:
            db.close()

    def _compute_analytics(self, tick_idx: int) -> dict:
        """Compute per-resource analytics from actual CSV data.

        For each resource at the current tick, calculate:
        - avg_stock: average of the 5 readings at this timestamp
        - prev_avg: average at the previous timestamp
        - hourly_change: absolute change from previous hour
        - avg_1h / avg_6h / avg_24h: rolling averages over N past ticks
        - above_avg_1h: whether current is above the 1h rolling avg
        - trend: 'up', 'down', or 'flat' based on last 3 ticks
        - avg_usage: average usage rate at this timestamp
        """
        if not self._timestamps:
            return {}

        ts = self._timestamps[tick_idx % len(self._timestamps)]
        readings = self._data_by_ts.get(ts, [])

        # Aggregate readings by resource at current tick
        current: dict[str, dict] = {}
        for r in readings:
            key = f"{r['sector_id']}|{r['resource_type']}"
            if key not in current:
                current[key] = {"stocks": [], "usages": []}
            current[key]["stocks"].append(r["stock_level"])
            current[key]["usages"].append(r["usage_rate_hourly"])

        analytics: dict[str, dict] = {}
        for key, vals in current.items():
            sector, resource = key.split("|")
            avg_stock = sum(vals["stocks"]) / len(vals["stocks"])
            avg_usage = sum(vals["usages"]) / len(vals["usages"])

            # Previous tick average
            prev_avg = None
            hourly_change = 0.0
            if tick_idx > 0:
                prev_ts = self._timestamps[(tick_idx - 1) % len(self._timestamps)]
                prev_readings = self._data_by_ts.get(prev_ts, [])
                prev_stocks = [r["stock_level"] for r in prev_readings
                               if r["sector_id"] == sector and r["resource_type"] == resource]
                if prev_stocks:
                    prev_avg = sum(prev_stocks) / len(prev_stocks)
                    hourly_change = avg_stock - prev_avg

            # Rolling averages over past N ticks (1h=1 tick, 6h=6, 24h=24)
            def rolling_avg(window: int) -> float | None:
                if tick_idx < window:
                    return None
                total = 0.0
                count = 0
                for i in range(max(0, tick_idx - window), tick_idx):
                    t = self._timestamps[i % len(self._timestamps)]
                    rr = self._data_by_ts.get(t, [])
                    stocks = [r["stock_level"] for r in rr
                              if r["sector_id"] == sector and r["resource_type"] == resource]
                    if stocks:
                        total += sum(stocks) / len(stocks)
                        count += 1
                return round(total / count, 2) if count > 0 else None

            avg_6h = rolling_avg(6)
            avg_24h = rolling_avg(24)

            # Trend from last 3 ticks
            trend = "flat"
            if tick_idx >= 3:
                recent_avgs = []
                for i in range(tick_idx - 3, tick_idx):
                    t = self._timestamps[i % len(self._timestamps)]
                    rr = self._data_by_ts.get(t, [])
                    stocks = [r["stock_level"] for r in rr
                              if r["sector_id"] == sector and r["resource_type"] == resource]
                    if stocks:
                        recent_avgs.append(sum(stocks) / len(stocks))
                if len(recent_avgs) == 3:
                    if recent_avgs[2] > recent_avgs[0] + 1:
                        trend = "up"
                    elif recent_avgs[2] < recent_avgs[0] - 1:
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

            idx = self._tick_index % len(self._timestamps)
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
