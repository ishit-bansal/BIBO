import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend, Brush,
} from 'recharts';
import { fetchResources } from '../services/api';
import type { ResourceLog } from '../services/api';

const SNAP_TIMESTAMP = '2026-01-01T19:00:00';

const SECTOR_RESOURCE_PAIRS = [
  { sector: 'Wakanda', resource: 'Arc Reactor Cores', color: '#10b981', short: 'Wakanda / Arc Reactors' },
  { sector: 'New Asgard', resource: 'Vibranium (kg)', color: '#3b82f6', short: 'N. Asgard / Vibranium' },
  { sector: 'Sanctum Sanctorum', resource: 'Clean Water (L)', color: '#a78bfa', short: 'Sanctum / Water' },
  { sector: 'Sokovia', resource: 'Pym Particles', color: '#f59e0b', short: 'Sokovia / Pym Particles' },
  { sector: 'Avengers Compound', resource: 'Medical Kits', color: '#ef4444', short: 'Avengers / Med Kits' },
];

type ViewMode = 'overview' | 'single';

function formatTimestamp(ts: string) {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit',
  });
}

export default function ResourceChart() {
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [pairIndex, setPairIndex] = useState(0);
  const [allData, setAllData] = useState<ResourceLog[]>([]);
  const [singleData, setSingleData] = useState<ResourceLog[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchResources({ limit: 10000 })
      .then(setAllData)
      .finally(() => setLoading(false));
  }, []);

  const loadSinglePair = useCallback((idx: number) => {
    const pair = SECTOR_RESOURCE_PAIRS[idx];
    setLoading(true);
    fetchResources({ sector_id: pair.sector, resource_type: pair.resource, limit: 10000 })
      .then(setSingleData)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (viewMode === 'single') loadSinglePair(pairIndex);
  }, [viewMode, pairIndex, loadSinglePair]);

  const overviewData = useMemo(() => {
    if (viewMode !== 'overview') return [];

    const byTime = new Map<string, Record<string, number[]>>();

    for (const d of allData) {
      const key = `${d.sector_id}|${d.resource_type}`;
      const pairInfo = SECTOR_RESOURCE_PAIRS.find(p => p.sector === d.sector_id && p.resource === d.resource_type);
      if (!pairInfo) continue;

      if (!byTime.has(d.timestamp)) byTime.set(d.timestamp, {});
      const row = byTime.get(d.timestamp)!;
      if (!row[key]) row[key] = [];
      row[key].push(d.stock_level);
    }

    return Array.from(byTime.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ts, row]) => {
        const point: Record<string, string | number | boolean> = {
          time: formatTimestamp(ts),
          rawTime: ts,
        };
        for (const pair of SECTOR_RESOURCE_PAIRS) {
          const key = `${pair.sector}|${pair.resource}`;
          const vals = row[key];
          if (vals && vals.length > 0) {
            point[pair.short] = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
          }
        }
        return point;
      });
  }, [allData, viewMode]);

  const singleChartData = useMemo(() => {
    if (viewMode !== 'single') return [];

    const grouped = new Map<string, { stocks: number[]; usages: number[]; snap: boolean }>();

    for (const d of singleData) {
      if (!grouped.has(d.timestamp)) {
        grouped.set(d.timestamp, { stocks: [], usages: [], snap: d.snap_event_detected });
      }
      const g = grouped.get(d.timestamp)!;
      g.stocks.push(d.stock_level);
      g.usages.push(d.usage_rate_hourly);
      if (d.snap_event_detected) g.snap = true;
    }

    return Array.from(grouped.entries()).map(([ts, g]) => ({
      time: formatTimestamp(ts),
      rawTime: ts,
      stock: Math.round((g.stocks.reduce((a, b) => a + b, 0) / g.stocks.length) * 100) / 100,
      usage: Math.round((g.usages.reduce((a, b) => a + b, 0) / g.usages.length) * 100) / 100,
      snap: g.snap,
    }));
  }, [singleData, viewMode]);

  const chartData = viewMode === 'overview' ? overviewData : singleChartData;

  const snapX = chartData.find(d => d.rawTime === SNAP_TIMESTAMP)?.time as string | undefined;

  return (
    <div className="rounded-lg border border-gray-800 bg-[#0d1220] p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold text-white">Resource Stock Levels</h2>

        <div className="ml-auto flex items-center gap-2">
          <div className="flex overflow-hidden rounded border border-gray-700">
            <button
              onClick={() => setViewMode('overview')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === 'overview'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gray-900 text-gray-400 hover:text-gray-200'
              }`}
            >
              All Resources
            </button>
            <button
              onClick={() => setViewMode('single')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === 'single'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gray-900 text-gray-400 hover:text-gray-200'
              }`}
            >
              Single Resource
            </button>
          </div>

          {viewMode === 'single' && (
            <select
              value={pairIndex}
              onChange={(e) => setPairIndex(Number(e.target.value))}
              className="rounded border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-gray-200 focus:border-emerald-500 focus:outline-none"
            >
              {SECTOR_RESOURCE_PAIRS.map((p, i) => (
                <option key={i} value={i}>{p.sector} — {p.resource}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex h-96 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
        </div>
      ) : chartData.length === 0 ? (
        <div className="flex h-96 items-center justify-center text-gray-500">
          No data available
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={420}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="time"
                stroke="#64748b"
                tick={{ fontSize: 10 }}
                interval={Math.max(0, Math.floor(chartData.length / 8))}
              />
              <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  color: '#e2e8f0',
                  fontSize: '12px',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />

              {snapX && (
                <ReferenceLine
                  x={snapX}
                  stroke="#ef4444"
                  strokeDasharray="4 4"
                  label={{ value: 'SNAP EVENT', fill: '#ef4444', fontSize: 11, position: 'top' }}
                />
              )}

              {viewMode === 'overview' ? (
                SECTOR_RESOURCE_PAIRS.map((pair) => (
                  <Line
                    key={pair.short}
                    type="monotone"
                    dataKey={pair.short}
                    stroke={pair.color}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                    name={pair.short}
                  />
                ))
              ) : (
                <>
                  <Line
                    type="monotone"
                    dataKey="stock"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={false}
                    name="Stock Level"
                  />
                  <Line
                    type="monotone"
                    dataKey="usage"
                    stroke="#f59e0b"
                    strokeWidth={1}
                    dot={false}
                    name="Usage Rate/hr"
                  />
                </>
              )}

              <Brush
                dataKey="time"
                height={30}
                stroke="#10b981"
                fill="#0d1220"
                travellerWidth={10}
                tickFormatter={() => ''}
              />
            </LineChart>
          </ResponsiveContainer>
          <p className="mt-2 text-center text-xs text-gray-600">
            Drag the handles on the slider below the chart to zoom into a time range
          </p>
        </>
      )}
    </div>
  );
}
