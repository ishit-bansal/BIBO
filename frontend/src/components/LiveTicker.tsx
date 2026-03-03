import { useEffect, useMemo, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine, Line,
} from 'recharts';
import type { ResourceTick, ResourceAnalytics, TimelinePoint } from '../hooks/useLiveData';
import { fetchTrendLine, fetchPredictions } from '../services/api';
import type { TrendLine, Prediction } from '../services/api';

const RESOURCE_KEYS = [
  'Wakanda|Arc Reactor Cores',
  'New Asgard|Vibranium (kg)',
  'Sanctum Sanctorum|Clean Water (L)',
  'Sokovia|Pym Particles',
  'Avengers Compound|Medical Kits',
];

const PAIR_COLORS: Record<string, string> = {
  'Wakanda|Arc Reactor Cores': '#10b981',
  'New Asgard|Vibranium (kg)': '#3b82f6',
  'Sanctum Sanctorum|Clean Water (L)': '#a78bfa',
  'Sokovia|Pym Particles': '#f59e0b',
  'Avengers Compound|Medical Kits': '#ef4444',
};

const SHORT_NAMES: Record<string, string> = {
  'Wakanda|Arc Reactor Cores': 'ARC',
  'New Asgard|Vibranium (kg)': 'VBR',
  'Sanctum Sanctorum|Clean Water (L)': 'H2O',
  'Sokovia|Pym Particles': 'PYM',
  'Avengers Compound|Medical Kits': 'MED',
};

const FULL_NAMES: Record<string, string> = {
  'Wakanda|Arc Reactor Cores': 'Wakanda / Arc Reactor Cores',
  'New Asgard|Vibranium (kg)': 'New Asgard / Vibranium',
  'Sanctum Sanctorum|Clean Water (L)': 'Sanctum / Clean Water',
  'Sokovia|Pym Particles': 'Sokovia / Pym Particles',
  'Avengers Compound|Medical Kits': 'Avengers / Medical Kits',
};

type TimeRange = '6h' | '1d' | '3d' | '1w' | '2w' | 'all';

const RANGE_TICKS: Record<TimeRange, number | null> = {
  '6h': 6,
  '1d': 24,
  '3d': 72,
  '1w': 168,
  '2w': 336,
  'all': null,
};

const RANGE_LABELS: Record<TimeRange, string> = {
  '6h': '6H',
  '1d': '1D',
  '3d': '3D',
  '1w': '1W',
  '2w': '2W',
  'all': 'ALL',
};

function fmtFull(ts: string) {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function fmtAxisLabel(ts: string, range: TimeRange) {
  const d = new Date(ts);
  if (range === '6h')
    return d.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit' });
  if (range === '1d')
    return d.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit' });
  if (range === '3d')
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit' });
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric' });
}

const SNAP_TIME = '2026-01-01T19:00:00';

/* ── custom tooltip showing hour-level detail ─────────── */

function ChartTooltip({ active, payload, focusedKey }: {
  active?: boolean;
  payload?: { dataKey: string; value: number; color: string; payload: Record<string, string | number> }[];
  focusedKey: string | null;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const raw = payload[0]?.payload;
  const ts = raw?.rawTime as string;
  if (!ts) return null;

  const entries = focusedKey
    ? payload.filter(p => p.dataKey === SHORT_NAMES[focusedKey])
    : payload;

  const maEntry = payload.find(p => p.dataKey === 'MA');

  return (
    <div className="rounded-lg border border-gray-700 bg-[#0f1729] px-3 py-2 shadow-xl">
      <div className="text-[10px] font-semibold text-gray-400 mb-1.5 border-b border-gray-700 pb-1">
        {fmtFull(ts)}
      </div>
      {entries.map(e => {
        const key = RESOURCE_KEYS.find(k => SHORT_NAMES[k] === e.dataKey);
        return (
          <div key={e.dataKey} className="flex items-center gap-2 py-0.5">
            <span className="h-2 w-2 rounded-full" style={{ background: e.color }} />
            <span className="text-[10px] text-gray-400 w-28">{key ? FULL_NAMES[key] : e.dataKey}</span>
            <span className="text-[11px] font-bold font-mono text-gray-100 ml-auto">
              {e.value.toLocaleString(undefined, { maximumFractionDigits: 1 })}
            </span>
          </div>
        );
      })}
      {maEntry && (
        <div className="flex items-center gap-2 py-0.5 border-t border-gray-800 mt-1 pt-1">
          <span className="h-2 w-0.5 border-t border-dashed border-orange-400" />
          <span className="text-[10px] text-gray-500 w-28">24h Moving Avg</span>
          <span className="text-[10px] font-mono text-orange-300 ml-auto">
            {maEntry.value.toLocaleString(undefined, { maximumFractionDigits: 1 })}
          </span>
        </div>
      )}
    </div>
  );
}

/* ── clickable resource card with sparkline ───────────── */

function ResourceCard({ analyticsKey, analytics, sparkData, color, short, isFocused, onClick }: {
  analyticsKey: string;
  analytics: ResourceAnalytics | null;
  sparkData: { time: string; value: number }[];
  color: string;
  short: string;
  isFocused: boolean;
  onClick: () => void;
}) {
  const a = analytics;
  const isUp = (a?.hourly_change ?? 0) >= 0;
  const isDepleted = (a?.avg_stock ?? 0) <= 0;

  return (
    <div
      onClick={onClick}
      className={`resource-spark-card rounded border bg-gray-900/40 p-2.5 cursor-pointer transition-all hover:border-gray-600 ${
        isDepleted ? 'border-red-900/50' : isFocused ? 'border-emerald-500 ring-1 ring-emerald-500/30' : 'border-gray-800'
      }`}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        <span className="text-[10px] font-bold text-gray-400">{short}</span>
        {a && (
          <span className={`ml-auto text-[9px] font-bold font-mono ${isUp ? 'text-emerald-400' : a.hourly_change === 0 ? 'text-gray-600' : 'text-red-400'}`}>
            {isUp ? '▲' : a.hourly_change === 0 ? '—' : '▼'}{Math.abs(a.change_pct).toFixed(1)}%
          </span>
        )}
      </div>

      <div className={`text-lg font-bold font-mono ${isDepleted ? 'text-red-400' : 'text-gray-100'}`}>
        {a ? a.avg_stock.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}
      </div>

      {sparkData.length > 2 && (
        <div className="my-1">
          <ResponsiveContainer width="100%" height={40}>
            <AreaChart data={sparkData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`grad-${analyticsKey}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} fill={`url(#grad-${analyticsKey})`} dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {a && !isDepleted && (
        <div className="space-y-0.5 text-[9px]">
          <div className="flex justify-between">
            <span className="text-gray-500">Usage/hr</span>
            <span className="text-gray-300 font-mono">{a.avg_usage.toFixed(1)}</span>
          </div>
          {a.avg_6h != null && (
            <div className="flex justify-between">
              <span className="text-gray-500">6h Avg</span>
              <span className="font-mono" style={{ color: a.above_avg_6h ? '#10b981' : '#ef4444' }}>
                {a.avg_6h.toLocaleString(undefined, { maximumFractionDigits: 0 })} {a.above_avg_6h ? '↑' : '↓'}
              </span>
            </div>
          )}
          {a.avg_24h != null && (
            <div className="flex justify-between">
              <span className="text-gray-500">24h Avg</span>
              <span className="font-mono" style={{ color: a.above_avg_24h ? '#10b981' : '#ef4444' }}>
                {a.avg_24h.toLocaleString(undefined, { maximumFractionDigits: 0 })} {a.above_avg_24h ? '↑' : '↓'}
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-500">Trend</span>
            <span className={`font-semibold ${a.trend === 'up' ? 'text-emerald-400' : a.trend === 'down' ? 'text-red-400' : 'text-gray-500'}`}>
              {a.trend === 'up' ? '↗ Rising' : a.trend === 'down' ? '↘ Falling' : '→ Flat'}
            </span>
          </div>
        </div>
      )}
      {isDepleted && <div className="text-[9px] text-red-400 font-semibold mt-1">DEPLETED</div>}
    </div>
  );
}

/* ── main component ───────────────────────────────────── */

interface Props {
  connected: boolean;
  simTime: string;
  progress: number;
  currentTick: ResourceTick | null;
  fullTimeline: TimelinePoint[];
  timelineLoaded: boolean;
  simComplete?: boolean;
  onRestart?: () => void;
}

// Map focused keys to their sector/resource for the predictions API
const KEY_TO_PARTS: Record<string, { sector: string; resource: string }> = {
  'Wakanda|Arc Reactor Cores': { sector: 'Wakanda', resource: 'Arc Reactor Cores' },
  'New Asgard|Vibranium (kg)': { sector: 'New Asgard', resource: 'Vibranium (kg)' },
  'Sanctum Sanctorum|Clean Water (L)': { sector: 'Sanctum Sanctorum', resource: 'Clean Water (L)' },
  'Sokovia|Pym Particles': { sector: 'Sokovia', resource: 'Pym Particles' },
  'Avengers Compound|Medical Kits': { sector: 'Avengers Compound', resource: 'Medical Kits' },
};

export default function LiveTicker({ connected, simTime, progress, currentTick, fullTimeline, timelineLoaded, simComplete, onRestart }: Props) {
  const [range, setRange] = useState<TimeRange>('all');
  const [focusedKey, setFocusedKey] = useState<string | null>('Sanctum Sanctorum|Clean Water (L)');
  const [_trendData, setTrendData] = useState<TrendLine | null>(null);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const analytics = currentTick?.analytics ?? {};

  // Fetch ML trend line + prediction when a resource is focused
  useEffect(() => {
    if (!focusedKey) {
      setTrendData(null);
      setPrediction(null);
      return;
    }
    const parts = KEY_TO_PARTS[focusedKey];
    if (!parts) return;

    fetchTrendLine(parts.sector, parts.resource)
      .then(setTrendData)
      .catch(() => setTrendData(null));
    fetchPredictions()
      .then(preds => {
        const match = preds.find(p => p.sector_id === parts.sector && p.resource_type === parts.resource);
        setPrediction(match ?? null);
      })
      .catch(() => setPrediction(null));
  }, [focusedKey]);

  const currentTickIndex = currentTick?.tick_index ?? fullTimeline.length - 1;

  const filteredTimeline = useMemo(() => {
    if (!fullTimeline.length) return [];
    const upToCurrent = fullTimeline.slice(0, Math.min(currentTickIndex + 1, fullTimeline.length));
    const maxTicks = RANGE_TICKS[range];
    if (maxTicks === null || upToCurrent.length <= maxTicks) return upToCurrent;
    return upToCurrent.slice(-maxTicks);
  }, [fullTimeline, range, currentTickIndex]);

  const sparklines = useMemo(() => {
    const result = new Map<string, { time: string; value: number }[]>();
    for (const key of RESOURCE_KEYS) result.set(key, []);
    for (const pt of filteredTimeline) {
      for (const key of RESOURCE_KEYS) {
        const a = pt.analytics[key];
        if (a) result.get(key)?.push({ time: pt.timestamp, value: a.avg_stock });
      }
    }
    return result;
  }, [filteredTimeline]);

  const chartData = useMemo(() => {
    const MA_WINDOW = 24;
    const baseData = filteredTimeline.map((pt, idx) => {
      const point: Record<string, string | number> = {
        time: String(idx),
        axisLabel: fmtAxisLabel(pt.timestamp, range),
        rawTime: pt.timestamp,
      };
      for (const key of RESOURCE_KEYS) {
        const a = pt.analytics[key];
        if (a) point[SHORT_NAMES[key]] = a.avg_stock;
      }
      return point;
    });

    if (focusedKey) {
      const short = SHORT_NAMES[focusedKey];
      for (let i = 0; i < baseData.length; i++) {
        if (i < MA_WINDOW - 1) continue;
        let sum = 0;
        let count = 0;
        for (let j = i - MA_WINDOW + 1; j <= i; j++) {
          const v = baseData[j][short];
          if (typeof v === 'number') { sum += v; count++; }
        }
        if (count > 0) baseData[i]['MA'] = Math.round((sum / count) * 100) / 100;
      }
    }

    return baseData;
  }, [filteredTimeline, range, focusedKey]);

  const snapLabel = useMemo(() => {
    const snapMs = new Date(SNAP_TIME).getTime();
    let best: string | undefined;
    let bestDist = Infinity;
    for (const d of chartData) {
      const ts = d.rawTime as string;
      if (!ts) continue;
      const dist = Math.abs(new Date(ts).getTime() - snapMs);
      if (dist < bestDist) {
        bestDist = dist;
        best = d.time as string;
      }
    }
    return bestDist <= 3_600_000 ? best : undefined;
  }, [chartData]);

  const rangeChanges = useMemo(() => {
    if (filteredTimeline.length < 2) return new Map<string, { abs: number; pct: number }>();
    const first = filteredTimeline[0];
    const last = filteredTimeline[filteredTimeline.length - 1];
    const result = new Map<string, { abs: number; pct: number }>();
    for (const key of RESOURCE_KEYS) {
      const fa = first.analytics[key];
      const la = last.analytics[key];
      if (fa && la) {
        const abs = la.avg_stock - fa.avg_stock;
        const pct = fa.avg_stock !== 0 ? (abs / fa.avg_stock) * 100 : 0;
        result.set(key, { abs: Math.round(abs * 10) / 10, pct: Math.round(pct * 10) / 10 });
      }
    }
    return result;
  }, [filteredTimeline]);

  const tickInterval = Math.max(0, Math.floor(chartData.length / 8));

  // Which resources appear in the big chart vs the small cards
  const bigChartKeys = focusedKey ? [focusedKey] : RESOURCE_KEYS;
  const bigChartLabel = focusedKey ? FULL_NAMES[focusedKey] : 'All Resources';
  const bigChartHeight = focusedKey ? 300 : 220;

  function handleCardClick(key: string) {
    setFocusedKey(key);
  }

  return (
    <div className="rounded-lg border border-gray-700 bg-[#0d1220] overflow-hidden">
      {/* header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-0">
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
          <h2 className="font-bold text-white text-sm tracking-wide">LIVE FEED</h2>
          <span className="text-[10px] text-gray-500">{connected ? 'STREAMING' : 'CONNECTING…'}</span>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-gray-500">
          <span>SIM: <span className="text-gray-300 font-mono">{simTime ? fmtFull(simTime) : '—'}</span></span>
          <div className="w-20 h-1.5 rounded-full bg-gray-800 overflow-hidden">
            <div className="h-full rounded-full bg-emerald-600 transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
          <span className="font-mono w-8 text-right">{progress}%</span>
          {simComplete && onRestart && (
            <button
              onClick={onRestart}
              className="ml-1 px-2.5 py-1 text-[10px] font-bold rounded bg-emerald-600 text-white hover:bg-emerald-500 transition-colors animate-pulse"
            >
              ↻ RESTART
            </button>
          )}
        </div>
      </div>

      {/* spacer (ticker tape removed) */}
      {Object.keys(analytics).length === 0 && (
        <div className="px-4 py-2 text-[10px] text-gray-600 bg-[#080c16]">Waiting for first data tick…</div>
      )}

      <div className="p-4">
        {/* time range selector + chart label */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              {(Object.keys(RANGE_LABELS) as TimeRange[]).map(r => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`px-2.5 py-1 text-[10px] font-bold rounded transition-colors ${
                    range === r
                      ? 'bg-emerald-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                  }`}
                >
                  {RANGE_LABELS[r]}
                </button>
              ))}
            </div>
            {focusedKey && (
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: PAIR_COLORS[focusedKey] }} />
                <span className="text-xs font-semibold text-gray-200">{bigChartLabel}</span>
                <button
                  onClick={() => setFocusedKey(null)}
                  className="ml-1 px-1.5 py-0.5 text-[9px] font-bold rounded bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200 transition-colors"
                >
                  SHOW ALL
                </button>
              </div>
            )}
          </div>
          <div className="text-[10px] text-gray-500">
            {filteredTimeline.length > 0 && (
              <span className="font-mono">
                {fmtFull(filteredTimeline[0].timestamp)} → {fmtFull(filteredTimeline[filteredTimeline.length - 1].timestamp)}
                <span className="text-gray-600 ml-2">({filteredTimeline.length} hrs)</span>
              </span>
            )}
          </div>
        </div>

        {/* loading state */}
        {!timelineLoaded && (
          <div className="flex items-center justify-center h-[220px] text-gray-500 text-sm">
            Loading full dataset from CSV…
          </div>
        )}

        {/* main chart */}
        {chartData.length > 1 && (
          <div className="mb-3">
            <ResponsiveContainer width="100%" height={bigChartHeight}>
              <AreaChart data={chartData} margin={{ top: 5, right: 10, bottom: 0, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis
                  dataKey="time"
                  stroke="#475569"
                  tick={{ fontSize: 9 }}
                  interval={tickInterval}
                  tickFormatter={(val) => {
                    const pt = chartData[Number(val)];
                    return pt ? (pt.axisLabel as string) : val;
                  }}
                />
                <YAxis stroke="#475569" tick={{ fontSize: 9 }} />
                <Tooltip
                  content={<ChartTooltip focusedKey={focusedKey} />}
                  cursor={{ stroke: '#475569', strokeDasharray: '4 4' }}
                />
                {snapLabel && (
                  <ReferenceLine x={snapLabel} stroke="#ef4444" strokeDasharray="4 4" strokeWidth={1.5}
                    label={{ value: '⚡ SNAP EVENT', fill: '#ef4444', fontSize: 9, fontWeight: 700, position: 'top' }} />
                )}
                {bigChartKeys.map(k => (
                  <Area
                    key={k}
                    type="monotone"
                    dataKey={SHORT_NAMES[k]}
                    stroke={PAIR_COLORS[k]}
                    strokeWidth={focusedKey ? 2.5 : 1.5}
                    fill={focusedKey ? `url(#focus-grad)` : 'none'}
                    dot={false}
                    isAnimationActive={false}
                  />
                ))}
                {/* ML trend: moving average line */}
                {focusedKey && (
                  <Line
                    type="monotone"
                    dataKey="MA"
                    stroke="#f97316"
                    strokeWidth={2}
                    strokeDasharray="6 3"
                    dot={false}
                    isAnimationActive={false}
                    connectNulls
                    name="24h Moving Avg"
                  />
                )}
                {focusedKey && (
                  <defs>
                    <linearGradient id="focus-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={PAIR_COLORS[focusedKey]} stopOpacity={0.2} />
                      <stop offset="100%" stopColor={PAIR_COLORS[focusedKey]} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ML prediction summary — only when focused */}
        {focusedKey && prediction && prediction.data_points_used > 0 && (
          <div className="mb-3 flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-gray-900/60 border border-gray-800">
              <span className="text-[9px] text-gray-500 uppercase">ML Status</span>
              <span className={`text-[10px] font-bold ${
                prediction.status === 'depleted' ? 'text-red-400' :
                prediction.status === 'critical' ? 'text-amber-400' :
                prediction.status === 'warning' ? 'text-yellow-400' : 'text-emerald-400'
              }`}>
                {prediction.status.toUpperCase()}
              </span>
            </div>
            {prediction.hours_until_zero != null && prediction.hours_until_zero > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-gray-900/60 border border-gray-800">
                <span className="text-[9px] text-gray-500 uppercase">Predicted Zero</span>
                <span className="text-[10px] font-bold text-red-400 font-mono">
                  {Math.round(prediction.hours_until_zero)}h
                  {prediction.predicted_zero_date && (
                    <span className="text-gray-500 ml-1">
                      ({new Date(prediction.predicted_zero_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit' })})
                    </span>
                  )}
                </span>
              </div>
            )}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-gray-900/60 border border-gray-800">
              <span className="text-[9px] text-gray-500 uppercase">Depletion Rate</span>
              <span className="text-[10px] font-bold text-gray-300 font-mono">{prediction.depletion_rate.toFixed(2)}/hr</span>
            </div>
            <div className="flex items-center gap-3 text-[9px] text-gray-600">
              <span className="flex items-center gap-1"><span className="w-4 border-t-2 border-dashed border-orange-400" /> 24h MA</span>
            </div>
          </div>
        )}

        {/* range change summary badges */}
        {rangeChanges.size > 0 && (
          <div className="flex gap-2 mb-3 flex-wrap">
            {RESOURCE_KEYS.map(k => {
              const rc = rangeChanges.get(k);
              if (!rc) return null;
              const isUp = rc.abs >= 0;
              return (
                <div key={k} className="flex items-center gap-1.5 px-2 py-1 rounded bg-gray-900/60 border border-gray-800">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: PAIR_COLORS[k] }} />
                  <span className="text-[9px] font-semibold text-gray-400">{SHORT_NAMES[k]}</span>
                  <span className={`text-[9px] font-bold font-mono ${isUp ? 'text-emerald-400' : rc.abs === 0 ? 'text-gray-500' : 'text-red-400'}`}>
                    {isUp ? '+' : ''}{rc.abs.toFixed(0)} ({isUp ? '+' : ''}{rc.pct.toFixed(1)}%)
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* resource cards — click to focus */}
        <div className="grid grid-cols-5 gap-2">
          {RESOURCE_KEYS.map(k => (
            <ResourceCard
              key={k}
              analyticsKey={k.replace(/[^a-zA-Z]/g, '')}
              analytics={analytics[k] ?? null}
              sparkData={sparklines.get(k) || []}
              color={PAIR_COLORS[k]}
              short={SHORT_NAMES[k]}
              isFocused={focusedKey === k}
              onClick={() => handleCardClick(k)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
