import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend, Brush,
} from 'recharts';
import { fetchResources, fetchTrendLine, fetchPredictions } from '../services/api';
import type { ResourceLog, TrendLine, Prediction } from '../services/api';

const SNAP_TIMESTAMP = '2026-01-01T19:00:00';

const SECTOR_RESOURCE_PAIRS = [
  { sector: 'Wakanda', resource: 'Arc Reactor Cores', color: '#10b981', short: 'Wakanda / Arc Reactors' },
  { sector: 'New Asgard', resource: 'Vibranium (kg)', color: '#3b82f6', short: 'N. Asgard / Vibranium' },
  { sector: 'Sanctum Sanctorum', resource: 'Clean Water (L)', color: '#a78bfa', short: 'Sanctum / Water' },
  { sector: 'Sokovia', resource: 'Pym Particles', color: '#f59e0b', short: 'Sokovia / Pym Particles' },
  { sector: 'Avengers Compound', resource: 'Medical Kits', color: '#ef4444', short: 'Avengers / Med Kits' },
];

type ViewMode = 'overview' | 'single';

function fmtTs(ts: string) {
  return new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit' });
}

export default function ResourceChart() {
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [pairIndex, setPairIndex] = useState(0);
  const [allData, setAllData] = useState<ResourceLog[]>([]);
  const [singleData, setSingleData] = useState<ResourceLog[]>([]);
  const [trendData, setTrendData] = useState<TrendLine | null>(null);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [allPredictions, setAllPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchResources({ limit: 10000 }), fetchPredictions()])
      .then(([res, preds]) => { setAllData(res); setAllPredictions(preds); })
      .finally(() => setLoading(false));
  }, []);

  const loadSingle = useCallback((idx: number) => {
    const p = SECTOR_RESOURCE_PAIRS[idx];
    setLoading(true);
    setTrendData(null);
    setPrediction(null);
    Promise.all([
      fetchResources({ sector_id: p.sector, resource_type: p.resource, limit: 10000 }),
      fetchTrendLine(p.sector, p.resource),
      fetchPredictions().then(ps => ps.find(x => x.sector_id === p.sector && x.resource_type === p.resource) ?? null),
    ])
      .then(([res, trend, pred]) => { setSingleData(res); setTrendData(trend); setPrediction(pred); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (viewMode === 'single') loadSingle(pairIndex); }, [viewMode, pairIndex, loadSingle]);

  // --- Overview: all resources on one chart ---
  const overviewData = useMemo(() => {
    if (viewMode !== 'overview') return [];
    const byTime = new Map<string, Record<string, number[]>>();
    for (const d of allData) {
      const pair = SECTOR_RESOURCE_PAIRS.find(p => p.sector === d.sector_id && p.resource === d.resource_type);
      if (!pair) continue;
      const key = pair.short;
      if (!byTime.has(d.timestamp)) byTime.set(d.timestamp, {});
      const row = byTime.get(d.timestamp)!;
      if (!row[key]) row[key] = [];
      row[key].push(d.stock_level);
    }
    return Array.from(byTime.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ts, row]) => {
        const point: Record<string, string | number | boolean> = { time: fmtTs(ts), rawTime: ts };
        for (const pair of SECTOR_RESOURCE_PAIRS) {
          const vals = row[pair.short];
          if (vals?.length) point[pair.short] = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
        }
        return point;
      });
  }, [allData, viewMode]);

  // --- Single resource: actual data + MA trend + forecast ---
  const singleChartData = useMemo(() => {
    if (viewMode !== 'single') return [];

    // 1) Average raw readings by timestamp
    const grouped = new Map<string, { stocks: number[]; usages: number[] }>();
    for (const d of singleData) {
      if (!grouped.has(d.timestamp)) grouped.set(d.timestamp, { stocks: [], usages: [] });
      const g = grouped.get(d.timestamp)!;
      g.stocks.push(d.stock_level);
      g.usages.push(d.usage_rate_hourly);
    }

    const avgEntries = Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ts, g]) => ({
        time: fmtTs(ts),
        rawTime: ts,
        stock: Math.round((g.stocks.reduce((a, b) => a + b, 0) / g.stocks.length) * 100) / 100,
        usage: Math.round((g.usages.reduce((a, b) => a + b, 0) / g.usages.length) * 100) / 100,
        trend: undefined as number | undefined,
        forecast: undefined as number | undefined,
      }));

    // 2) Merge the MA series from the backend onto matching timestamps
    if (trendData?.ma_series?.length) {
      const maLookup = new Map<string, number>();
      for (const m of trendData.ma_series) {
        maLookup.set(fmtTs(m.timestamp), m.ma_stock);
      }
      for (const entry of avgEntries) {
        const ma = maLookup.get(entry.time);
        if (ma !== undefined) entry.trend = ma;
      }
    }

    // 3) Append forecast-only points (beyond the data range)
    if (trendData?.forecast?.length && avgEntries.length > 0) {
      const lastDataTime = new Date(avgEntries[avgEntries.length - 1].rawTime).getTime();

      // Set the forecast start on the last actual data point so the dashed line connects
      const lastEntry = avgEntries[avgEntries.length - 1];
      lastEntry.forecast = lastEntry.trend ?? lastEntry.stock;

      for (const fp of trendData.forecast) {
        if (new Date(fp.timestamp).getTime() > lastDataTime) {
          avgEntries.push({
            time: fmtTs(fp.timestamp),
            rawTime: fp.timestamp,
            stock: undefined as unknown as number,
            usage: undefined as unknown as number,
            trend: undefined,
            forecast: fp.predicted_stock,
          });
        }
      }
    }

    return avgEntries;
  }, [singleData, trendData, viewMode]);

  const chartData = viewMode === 'overview' ? overviewData : singleChartData;
  const snapX = chartData.find(d => d.rawTime === SNAP_TIMESTAMP)?.time as string | undefined;

  const overviewPreds = useMemo(() => {
    if (viewMode !== 'overview') return [];
    return allPredictions.filter(p =>
      SECTOR_RESOURCE_PAIRS.some(sp => sp.sector === p.sector_id && sp.resource === p.resource_type) && p.data_points_used > 0
    );
  }, [allPredictions, viewMode]);

  return (
    <div className="rounded-lg border border-gray-800 bg-[#0d1220] p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold text-white">Resource Stock Levels</h2>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex overflow-hidden rounded border border-gray-700">
            <button onClick={() => setViewMode('overview')} className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === 'overview' ? 'bg-emerald-600 text-white' : 'bg-gray-900 text-gray-400 hover:text-gray-200'}`}>
              All Resources
            </button>
            <button onClick={() => setViewMode('single')} className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === 'single' ? 'bg-emerald-600 text-white' : 'bg-gray-900 text-gray-400 hover:text-gray-200'}`}>
              Single Resource
            </button>
          </div>
          {viewMode === 'single' && (
            <select value={pairIndex} onChange={(e) => setPairIndex(Number(e.target.value))} className="rounded border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-gray-200 focus:border-emerald-500 focus:outline-none">
              {SECTOR_RESOURCE_PAIRS.map((p, i) => <option key={i} value={i}>{p.sector} — {p.resource}</option>)}
            </select>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex h-96 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
        </div>
      ) : chartData.length === 0 ? (
        <div className="flex h-96 items-center justify-center text-gray-500">No data available</div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={420}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 10 }} interval={Math.max(0, Math.floor(chartData.length / 8))} />
              <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#e2e8f0', fontSize: '12px' }} />
              <Legend wrapperStyle={{ fontSize: '12px' }} />

              {snapX && (
                <ReferenceLine x={snapX} stroke="#ef4444" strokeDasharray="4 4" label={{ value: 'SNAP EVENT', fill: '#ef4444', fontSize: 11, position: 'top' }} />
              )}

              {viewMode === 'overview' ? (
                SECTOR_RESOURCE_PAIRS.map(p => (
                  <Line key={p.short} type="monotone" dataKey={p.short} stroke={p.color} strokeWidth={2} dot={false} connectNulls name={p.short} />
                ))
              ) : (
                <>
                  <Line type="monotone" dataKey="stock" stroke="#10b981" strokeWidth={1.5} dot={false} name="Actual Stock" opacity={0.6} />
                  <Line type="monotone" dataKey="trend" stroke="#22d3ee" strokeWidth={2.5} dot={false} connectNulls name="24hr Moving Avg" />
                  <Line type="monotone" dataKey="forecast" stroke="#f472b6" strokeWidth={2.5} strokeDasharray="8 4" dot={false} connectNulls name="ML Forecast" />
                  <Line type="monotone" dataKey="usage" stroke="#f59e0b" strokeWidth={1} dot={false} name="Usage Rate/hr" opacity={0.5} />
                </>
              )}

              <Brush dataKey="time" height={30} stroke="#10b981" fill="#0d1220" travellerWidth={10} tickFormatter={() => ''} />
            </LineChart>
          </ResponsiveContainer>
          <p className="mt-1 text-center text-xs text-gray-600">
            Drag the handles on the slider below the chart to zoom into a time range
          </p>
        </>
      )}

      {viewMode === 'single' && prediction && prediction.data_points_used > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded border border-gray-800 bg-gray-900/50 p-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Status</p>
            <p className={`mt-1 text-sm font-bold ${prediction.status === 'depleted' ? 'text-red-400' : prediction.status === 'critical' ? 'text-amber-400' : prediction.status === 'warning' ? 'text-yellow-400' : 'text-emerald-400'}`}>
              {prediction.status.toUpperCase()}
            </p>
          </div>
          <div className="rounded border border-gray-800 bg-gray-900/50 p-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Smoothed Stock</p>
            <p className="mt-1 text-sm font-bold text-gray-200">{prediction.current_stock.toLocaleString()}</p>
          </div>
          <div className="rounded border border-gray-800 bg-gray-900/50 p-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Predicted Exhaustion</p>
            <p className="mt-1 text-sm font-bold text-gray-200">
              {prediction.predicted_zero_date
                ? new Date(prediction.predicted_zero_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit' })
                : prediction.status === 'depleted' ? 'Already depleted' : 'N/A'}
            </p>
          </div>
          <div className="rounded border border-gray-800 bg-gray-900/50 p-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Depletion Rate</p>
            <p className="mt-1 text-sm font-bold text-gray-200">
              {prediction.depletion_rate !== 0 ? `${prediction.depletion_rate.toFixed(1)} /hr` : 'N/A'}
            </p>
          </div>
        </div>
      )}

      {viewMode === 'overview' && overviewPreds.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-3">
          {overviewPreds.map(pred => {
            const sp = SECTOR_RESOURCE_PAIRS.find(p => p.sector === pred.sector_id && p.resource === pred.resource_type);
            if (!sp) return null;
            return (
              <div key={sp.short} className="flex items-center gap-2 rounded border border-gray-800 bg-gray-900/50 px-3 py-2">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: sp.color }} />
                <span className="text-xs text-gray-400">{sp.short}:</span>
                <span className={`text-xs font-semibold ${pred.status === 'depleted' ? 'text-red-400' : pred.status === 'critical' ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {pred.status === 'depleted' ? 'DEPLETED' : pred.hours_until_zero != null ? `${Math.round(pred.hours_until_zero)}h left` : pred.status.toUpperCase()}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
