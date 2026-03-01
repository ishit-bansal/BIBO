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

const WS_URL = `${(import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/^http/, 'ws')}/ws/live`;

export function useLiveData() {
  const [connected, setConnected] = useState(false);
  const [currentTick, setCurrentTick] = useState<ResourceTick | null>(null);
  const [simTime, setSimTime] = useState<string>('');
  const [progress, setProgress] = useState(0);

  // Full timeline from the DB (all 400 timestamps, fetched once)
  const [fullTimeline, setFullTimeline] = useState<TimelinePoint[]>([]);
  const [timelineLoaded, setTimelineLoaded] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load entire CSV-derived timeline on mount
  useEffect(() => {
    fetchTimeline()
      .then(data => {
        setFullTimeline(data);
        setTimelineLoaded(true);
      })
      .catch(err => {
        console.error('Failed to load timeline:', err);
      });
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
      const msg: ResourceTick = JSON.parse(evt.data);
      if (msg.type === 'resource_tick') {
        setCurrentTick(msg);
        setSimTime(msg.timestamp);
        setProgress(Math.round((msg.tick_index / msg.total_ticks) * 100));
      }
    };
  }, []);

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
  };
}
