import { useEffect, useRef, useState, useCallback } from 'react';
import { fetchTimeline, type TimelinePoint } from '../services/api';

/* ── types matching the backend simulator output ───────── */

export interface ResourceReading {
  sector_id: string;
  resource_type: string;
  stock_level: number;
  usage_rate_hourly: number;
  snap_event_detected: boolean;
}

export interface ResourceAnalytics {
  sector_id: string;
  resource_type: string;
  avg_stock: number;
  avg_usage: number;
  prev_avg: number | null;
  hourly_change: number;
  change_pct: number;
  avg_6h: number | null;
  avg_24h: number | null;
  above_avg_6h: boolean | null;
  above_avg_24h: boolean | null;
  trend: 'up' | 'down' | 'flat';
}

export interface ResourceTick {
  type: 'resource_tick';
  timestamp: string;
  tick_index: number;
  total_ticks: number;
  readings: ResourceReading[];
  analytics: Record<string, ResourceAnalytics>;
}

export type { TimelinePoint };

/* ── hook ──────────────────────────────────────────────── */

const _apiBase = import.meta.env.VITE_API_URL || (
  import.meta.env.DEV ? 'http://localhost:8000' : window.location.origin
);
const WS_URL = `${_apiBase.replace(/^http/, 'ws')}/ws/live`;

export interface SnapEvent {
  type: 'snap_event';
  deleted: number;
  remaining: number;
  message: string;
}

export function useLiveData() {
  const [connected, setConnected] = useState(false);
  const [currentTick, setCurrentTick] = useState<ResourceTick | null>(null);
  const [simTime, setSimTime] = useState<string>('');
  const [progress, setProgress] = useState(0);
  const [snapEvent, setSnapEvent] = useState<SnapEvent | null>(null);
  const [simComplete, setSimComplete] = useState(false);

  const [fullTimeline, setFullTimeline] = useState<TimelinePoint[]>([]);
  const [timelineLoaded, setTimelineLoaded] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reloadTimeline = useCallback(() => {
    fetchTimeline()
      .then(data => {
        setFullTimeline(data);
        setTimelineLoaded(true);
      })
      .catch(err => {
        console.error('Failed to load timeline:', err);
      });
  }, []);

  useEffect(() => { reloadTimeline(); }, [reloadTimeline]);

  const clearSnap = useCallback(() => setSnapEvent(null), []);

  const restartSim = useCallback(async () => {
    try {
      const apiUrl = _apiBase;
      await fetch(`${apiUrl}/api/sim/restart`, { method: 'POST' });
      setSimComplete(false);
    } catch (err) {
      console.error('Failed to restart sim:', err);
    }
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      reconnectRef.current = setTimeout(connect, 3000);
    };

    ws.onmessage = (evt) => {
      const msg = JSON.parse(evt.data);
      if (msg.type === 'resource_tick') {
        setSimComplete(false);
        setCurrentTick(msg as ResourceTick);
        setSimTime(msg.timestamp);
        setProgress(Math.round((msg.tick_index / msg.total_ticks) * 100));
      } else if (msg.type === 'snap_event') {
        setSnapEvent(msg as SnapEvent);
      } else if (msg.type === 'sim_complete') {
        setSimComplete(true);
        setProgress(100);
      }
    };
  }, [reloadTimeline]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return {
    connected,
    simTime,
    progress,
    currentTick,
    fullTimeline,
    timelineLoaded,
    snapEvent,
    clearSnap,
    simComplete,
    restartSim,
  };
}
