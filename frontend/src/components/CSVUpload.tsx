import { useState, useRef, useMemo, useCallback, useEffect, DragEvent } from 'react';
import {
  ComposedChart, Area, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts';
import { analyzeCSV } from '../services/api';
import type { AnalysisResult, AnalysisPair } from '../services/api';

const PALETTE = ['#10b981', '#3b82f6', '#a78bfa', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];

const STATUS_CFG: Record<string, { bg: string; border: string; text: string; label: string; glow: string }> = {
  stable:   { bg: 'bg-emerald-950/30', border: 'border-emerald-600/40', text: 'text-emerald-400', label: 'STABLE',   glow: 'shadow-[0_0_12px_rgba(16,185,129,0.15)]' },
  warning:  { bg: 'bg-yellow-950/30',  border: 'border-yellow-600/40',  text: 'text-yellow-400',  label: 'WARNING',  glow: 'shadow-[0_0_12px_rgba(234,179,8,0.15)]' },
  critical: { bg: 'bg-amber-950/30',   border: 'border-amber-500/50',   text: 'text-amber-400',   label: 'CRITICAL', glow: 'shadow-[0_0_12px_rgba(245,158,11,0.2)]' },
  depleted: { bg: 'bg-red-950/30',     border: 'border-red-500/50',     text: 'text-red-400',     label: 'DEPLETED', glow: 'shadow-[0_0_16px_rgba(239,68,68,0.25)]' },
};

type TimeRange = '1d' | '3d' | '1w' | '2w' | 'all';
const RANGE_HOURS: Record<TimeRange, number | null> = { '1d': 24, '3d': 72, '1w': 168, '2w': 336, 'all': null };

const PIPELINE_STEPS = ['Parsing CSV', 'Computing Moving Averages', 'Modeling Trends', 'Generating Forecasts'];

function shortName(pair: AnalysisPair): string {
  const r = pair.resource_type;
  if (r.includes('Arc'))      return 'ARC';
  if (r.includes('Vibranium')) return 'VBR';
  if (r.includes('Water'))    return 'H2O';
  if (r.includes('Pym'))      return 'PYM';
  if (r.includes('Medical'))  return 'MED';
  return r.slice(0, 4).toUpperCase();
}

function formatTs(iso: string): string {
  const d = new Date(iso);
  return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:00`;
}

function PipelineAnimation({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-3 py-6 justify-center flex-wrap">
      {PIPELINE_STEPS.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
            i < step ? 'bg-emerald-900/40 text-emerald-400 border border-emerald-700/50' :
            i === step ? 'bg-blue-900/40 text-blue-400 border border-blue-600/50 animate-pulse' :
            'bg-gray-900/40 text-gray-600 border border-gray-800'
          }`}>
            {i < step ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
            ) : i === step ? (
              <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            ) : (
              <div className="w-3 h-3 rounded-full bg-gray-700" />
            )}
            {label}
          </div>
          {i < PIPELINE_STEPS.length - 1 && (
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={i < step ? '#10b981' : '#374151'} strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
          )}
        </div>
      ))}
    </div>
  );
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}

function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-gray-700 bg-[#0d1220]/95 px-3 py-2 shadow-xl text-xs backdrop-blur-sm">
      <p className="text-gray-400 font-mono mb-1">{label}</p>
      {payload.filter(p => p.value != null).map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
          <span className="text-gray-400">{p.name}:</span>
          <span className="text-white font-semibold">{typeof p.value === 'number' ? p.value.toLocaleString(undefined, { maximumFractionDigits: 1 }) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

function RiskGauge({ score, size = 48, label }: { score: number; size?: number; label?: string }) {
  const strokeW = size >= 100 ? 10 : size >= 60 ? 7 : 4;
  const r = size / 2 - strokeW;
  const circumference = Math.PI * r;
  const filled = (score / 100) * circumference;
  const color = score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : score >= 20 ? '#f97316' : '#ef4444';
  const fontSize = size >= 100 ? 32 : size >= 60 ? 20 : 11;
  const labelSize = size >= 100 ? 13 : size >= 60 ? 10 : 8;
  const totalH = size / 2 + (label ? labelSize + 10 : 6);
  return (
    <svg width={size} height={totalH} viewBox={`0 0 ${size} ${totalH}`}>
      <path d={`M ${strokeW} ${size / 2 + 2} A ${r} ${r} 0 0 1 ${size - strokeW} ${size / 2 + 2}`}
        fill="none" stroke="#1e293b" strokeWidth={strokeW} strokeLinecap="round" />
      <path d={`M ${strokeW} ${size / 2 + 2} A ${r} ${r} 0 0 1 ${size - strokeW} ${size / 2 + 2}`}
        fill="none" stroke={color} strokeWidth={strokeW} strokeLinecap="round"
        strokeDasharray={`${filled} ${circumference}`} />
      <text x={size / 2} y={size / 2 - 2} textAnchor="middle" fill={color}
        fontSize={fontSize} fontWeight="700" fontFamily="monospace">{score}</text>
      {label && (
        <text x={size / 2} y={size / 2 + labelSize + 6} textAnchor="middle" fill="#9ca3af"
          fontSize={labelSize} fontWeight="700" letterSpacing="0.05em">{label}</text>
      )}
    </svg>
  );
}

interface CSVUploadProps {
  snapCount?: number;
  onAnalysisChange?: (result: AnalysisResult | null) => void;
}

export default function CSVUpload({ snapCount = 0, onAnalysisChange }: CSVUploadProps) {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [pipelineStep, setPipelineStep] = useState(0);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('all');
  const fileRef = useRef<HTMLInputElement>(null);
  const prevSnapCount = useRef(snapCount);

  useEffect(() => {
    if (snapCount === prevSnapCount.current) return;
    prevSnapCount.current = snapCount;
    if (!result) return;

    setResult(prev => {
      if (!prev) return prev;

      try {
        const halvePairs = prev.pairs.map(pair => {
          const rawArr = pair.raw || [];
          const maArr = pair.ma || [];
          const fcstArr = pair.forecast || [];
          const regArr = pair.regression || [];
          const weeklyArr = pair.weekly_forecast || [];

          const halfRaw = rawArr
            .filter(() => Math.random() > 0.5)
            .map(d => ({ ...d, stock: +(d.stock * 0.5).toFixed(2) }));
          const halfMa = maArr
            .filter(() => Math.random() > 0.5)
            .map(d => ({ ...d, ma_stock: +(d.ma_stock * 0.5).toFixed(2) }));
          const halfForecast = fcstArr.map(d => ({
            ...d,
            predicted_stock: +Math.max(0, d.predicted_stock * 0.5).toFixed(2),
          }));
          const halfReg = regArr.map(d => ({
            ...d,
            reg_stock: +(d.reg_stock * 0.5).toFixed(2),
          }));
          const halfWeekly = weeklyArr.map(d => ({
            ...d,
            projected_stock: +Math.max(0, d.projected_stock * 0.5).toFixed(2),
          }));

          const s = pair.stats;
          const newCurrent = +(s.current * 0.5).toFixed(2);
          const newMax = +(s.max * 0.5).toFixed(2);
          const newMean = +(s.mean * 0.5).toFixed(2);
          const newMin = +(s.min * 0.5).toFixed(2);
          const stockPct = newMax > 0 ? +((newCurrent / newMax) * 100).toFixed(1) : 0;
          const htz = s.hours_to_zero != null ? +(s.hours_to_zero * 0.5).toFixed(1) : null;
          const newRisk = Math.max(0, Math.round(s.risk_score * 0.5));
          const newStatus: typeof s.status =
            newRisk < 20 ? 'critical' : newRisk < 50 ? 'warning' : s.status;

          return {
            ...pair,
            raw: halfRaw.length > 0 ? halfRaw : rawArr.slice(0, 1).map(d => ({ ...d, stock: +(d.stock * 0.5).toFixed(2) })),
            ma: halfMa,
            forecast: halfForecast,
            regression: halfReg,
            weekly_forecast: halfWeekly,
            stats: {
              ...s,
              current: newCurrent,
              max: newMax,
              mean: newMean,
              min: newMin,
              stock_pct: stockPct,
              hours_to_zero: htz,
              risk_score: newRisk,
              status: newStatus,
              data_points: Math.max(1, Math.ceil(s.data_points / 2)),
            },
          };
        });

        return {
          ...prev,
          pairs: halvePairs,
          total_records: Math.max(1, Math.ceil(prev.total_records / 2)),
        };
      } catch {
        return prev;
      }
    });
  }, [snapCount, result]);

  useEffect(() => {
    onAnalysisChange?.(result);
  }, [result, onAnalysisChange]);

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.csv')) {
      setError('Please upload a .csv file');
      return;
    }
    setFileName(file.name);
    setError('');
    setResult(null);
    setLoading(true);
    setFocusedIdx(null);

    const stepDuration = 400;
    for (let i = 0; i < PIPELINE_STEPS.length; i++) {
      setPipelineStep(i);
      await new Promise(r => setTimeout(r, stepDuration));
    }

    try {
      const res = await analyzeCSV(file);
      setResult(res);
      if (res.pairs.length > 0) {
        const waterIdx = res.pairs.findIndex(p => p.resource_type.toLowerCase().includes('water'));
        setFocusedIdx(waterIdx >= 0 ? waterIdx : 0);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setLoading(false);
      setPipelineStep(0);
    }
  }, []);

  const onDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onInputChange = useCallback(() => {
    const file = fileRef.current?.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const pairsToShow = useMemo(() => {
    if (!result) return [];
    if (focusedIdx !== null) return [result.pairs[focusedIdx]];
    return result.pairs;
  }, [result, focusedIdx]);

  const chartData = useMemo(() => {
    if (!pairsToShow.length) return [];

    const tsMap = new Map<string, Record<string, number | null>>();

    pairsToShow.forEach((pair, pi) => {
      pair.raw.forEach(d => {
        if (!tsMap.has(d.timestamp)) tsMap.set(d.timestamp, {});
        tsMap.get(d.timestamp)![`raw_${pi}`] = d.stock;
      });
      pair.ma.forEach(d => {
        if (!tsMap.has(d.timestamp)) tsMap.set(d.timestamp, {});
        tsMap.get(d.timestamp)![`ma_${pi}`] = d.ma_stock;
      });
      pair.forecast.forEach(d => {
        if (!tsMap.has(d.timestamp)) tsMap.set(d.timestamp, {});
        tsMap.get(d.timestamp)![`fcst_${pi}`] = d.predicted_stock;
      });
    });

    let entries = Array.from(tsMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ts, vals]) => ({ ts, label: formatTs(ts), ...vals }));

    const rangeHours = RANGE_HOURS[timeRange];
    if (rangeHours !== null && entries.length > 0) {
      const lastTs = new Date(entries[entries.length - 1].ts).getTime();
      const cutoff = lastTs - rangeHours * 3600_000;
      entries = entries.filter(e => new Date(e.ts).getTime() >= cutoff);
    }

    return entries;
  }, [pairsToShow, timeRange]);

  const overview = useMemo(() => {
    if (!result) return null;
    const depleted = result.pairs.filter(p => p.stats.status === 'depleted').length;
    const critical = result.pairs.filter(p => p.stats.status === 'critical').length;
    const warning = result.pairs.filter(p => p.stats.status === 'warning').length;
    const stable = result.pairs.filter(p => p.stats.status === 'stable').length;
    const avgRisk = result.pairs.length > 0
      ? Math.round(result.pairs.reduce((s, p) => s + p.stats.risk_score, 0) / result.pairs.length)
      : 0;
    const level = depleted > 0 || critical > 0 ? 'CRITICAL' : warning > 0 ? 'ELEVATED' : 'NOMINAL';
    return { depleted, critical, warning, stable, avgRisk, level };
  }, [result]);

  const loadDemoData = useCallback(async () => {
    setError('');
    setResult(null);
    setLoading(true);
    setFileName('historical_avengers_data.csv (Demo)');
    setFocusedIdx(null);

    const stepDuration = 400;
    for (let i = 0; i < PIPELINE_STEPS.length; i++) {
      setPipelineStep(i);
      await new Promise(r => setTimeout(r, stepDuration));
    }

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const resp = await fetch(`${apiUrl}/api/resources/analyze-demo`);
      if (!resp.ok) throw new Error(`Analysis failed (${resp.status})`);
      const res: AnalysisResult = await resp.json();
      setResult(res);
      if (res.pairs.length > 0) {
        const waterIdx = res.pairs.findIndex(p => p.resource_type.toLowerCase().includes('water'));
        setFocusedIdx(waterIdx >= 0 ? waterIdx : 0);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load demo data');
    } finally {
      setLoading(false);
      setPipelineStep(0);
    }
  }, []);

  const reset = () => {
    setResult(null);
    setFileName('');
    setError('');
    setFocusedIdx(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-800 bg-[#0d1220] p-6">
        <h2 className="sentinel-display text-2xl font-bold text-white mb-2">Data Analysis Lab</h2>
        <p className="text-sm text-gray-500 mb-4">Analyzing {fileName}...</p>
        <PipelineAnimation step={pipelineStep} />
      </div>
    );
  }

  if (!result || !overview) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-gray-800 bg-[#0d1220] p-6">
          <h2 className="sentinel-display text-2xl font-bold text-white mb-1">Data Analysis Lab</h2>
          <p className="text-sm text-gray-500 mb-6">
            Upload any time-series CSV with <code className="text-emerald-400 text-xs">timestamp, sector_id, resource_type, stock_level</code> columns.
            Predictive forecasting with risk analysis.
          </p>
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            className={`cursor-pointer rounded-lg border-2 border-dashed p-12 text-center transition-all ${
              dragOver ? 'border-emerald-500 bg-emerald-950/20' : 'border-gray-700 bg-gray-900/30 hover:border-gray-600 hover:bg-gray-900/50'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={`mx-auto mb-3 ${dragOver ? 'text-emerald-400' : 'text-gray-600'}`}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <p className={`text-sm font-semibold ${dragOver ? 'text-emerald-400' : 'text-gray-400'}`}>
              {dragOver ? 'Drop CSV file here' : 'Drag & drop a CSV file here, or click to browse'}
            </p>
            <p className="text-xs text-gray-600 mt-1">Supports historical_avengers_data.csv format</p>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={onInputChange} />
          </div>

          <div className="mt-4 flex items-center justify-center">
            <div className="flex items-center gap-3">
              <div className="h-px w-12 bg-gray-800" />
              <span className="text-xs text-gray-600 uppercase tracking-wider">or</span>
              <div className="h-px w-12 bg-gray-800" />
            </div>
          </div>

          <button
            onClick={loadDemoData}
            className="mt-4 w-full rounded-lg border border-emerald-700/50 bg-emerald-950/30 px-6 py-3.5 text-sm font-semibold text-emerald-400 hover:bg-emerald-900/40 hover:border-emerald-600 transition-all flex items-center justify-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
            </svg>
            Load Demo Data — Avengers Historical Resource Data (10,000 records)
          </button>

          {error && (
            <div className="mt-4 rounded-lg border border-red-800/50 bg-red-950/30 px-4 py-3 text-sm text-red-400">{error}</div>
          )}
        </div>
      </div>
    );
  }

  const focusedPair = focusedIdx !== null ? result.pairs[focusedIdx] : null;

  // Invert: avgRisk is 0-100 where 100=safe. We want danger score where 100=critical.
  const danger = 100 - overview.avgRisk;
  const barColor = danger >= 70 ? '#ef4444' : danger >= 40 ? '#f59e0b' : '#10b981';
  const barLabel = danger >= 70 ? 'CRITICAL' : danger >= 40 ? 'ELEVATED' : 'GUARDED';
  const barTextColor = danger >= 70 ? 'text-red-400' : danger >= 40 ? 'text-amber-400' : 'text-emerald-400';

  return (
    <div className="field-report-light space-y-4">
      {/* ── Risk Score Bar ── */}
      <div className="rounded-xl border border-gray-800 bg-[#0d1220] p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-baseline gap-3">
            <span className={`sentinel-display text-4xl font-black ${barTextColor}`}>RISK SCORE: {danger}/100</span>
            <span className={`sentinel-display text-lg font-bold ${barTextColor}`}>{barLabel}</span>
          </div>
          <button onClick={reset} className="rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-sm font-semibold text-gray-400 hover:text-white hover:border-gray-600 transition-colors">
            Upload New File
          </button>
        </div>

        <div className="h-6 bg-gray-800 rounded-full overflow-hidden mb-3">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${danger}%`, backgroundColor: barColor }}
          />
        </div>

        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>{result.pairs.length} resources &middot; {result.total_records.toLocaleString()} records</span>
          <span>{result.time_range.start.slice(0, 10)} to {result.time_range.end.slice(0, 10)}</span>
        </div>
      </div>

      {/* ── Resource Risk Cards — gauge only ── */}
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(result.pairs.length, 5)}, 1fr)` }}>
        {result.pairs.map((pair, i) => {
          const cfg = STATUS_CFG[pair.stats.status] || STATUS_CFG.stable;
          const isFocused = focusedIdx === i;
          return (
            <button
              key={`${pair.sector_id}-${pair.resource_type}`}
              onClick={() => setFocusedIdx(isFocused ? null : i)}
              className={`rounded-xl border p-5 transition-all flex flex-col items-center ${cfg.glow} ${
                isFocused ? `${cfg.border} ${cfg.bg} ring-2 ring-emerald-600/40` : `border-gray-800 bg-[#0d1220] hover:${cfg.border}`
              }`}
            >
              <span className="sentinel-display text-xl font-bold text-white mb-1">{shortName(pair)}</span>
              <span className="text-xs text-gray-500 mb-3 truncate max-w-full">{pair.resource_type}</span>
              <RiskGauge score={pair.stats.risk_score} size={120} label={cfg.label} />
            </button>
          );
        })}
      </div>

      {/* ── Chart area ── */}
      <div className="rounded-xl border border-gray-800 bg-[#0d1220] p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {focusedPair && (
              <button onClick={() => setFocusedIdx(null)} className="text-xs text-gray-500 hover:text-white rounded border border-gray-700 px-2 py-1 transition-colors">
                Show All
              </button>
            )}
            <span className="text-sm font-semibold text-white">
              {focusedPair ? `${focusedPair.sector_id} / ${focusedPair.resource_type}` : 'All Resources'}
            </span>
          </div>
          <div className="flex gap-1">
            {(Object.keys(RANGE_HOURS) as TimeRange[]).map(r => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
                  timeRange === r ? 'bg-emerald-600 text-white' : 'text-gray-500 hover:text-white hover:bg-gray-800'
                }`}
              >
                {r.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <ResponsiveContainer width="100%" height={520}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} interval="preserveStartEnd" minTickGap={50} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} />
            <Tooltip content={<ChartTooltip />} />
            <ReferenceLine y={0} stroke="#374151" strokeDasharray="2 2" />

            {pairsToShow.map((pair, pi) => {
              const color = PALETTE[(focusedIdx !== null ? focusedIdx : pi) % PALETTE.length];
              const label = pairsToShow.length === 1 ? pair.resource_type : shortName(pair);
              return [
                <Area
                  key={`raw_${pi}`}
                  type="monotone"
                  dataKey={`raw_${pi}`}
                  stroke={color}
                  fill={color}
                  fillOpacity={0.06}
                  strokeWidth={1}
                  dot={false}
                  name={`${label} (Raw)`}
                  isAnimationActive={false}
                  connectNulls
                />,
                <Line
                  key={`ma_${pi}`}
                  type="monotone"
                  dataKey={`ma_${pi}`}
                  stroke={color}
                  strokeWidth={2.5}
                  dot={false}
                  name={`${label} (24h MA)`}
                  isAnimationActive={false}
                  connectNulls
                />,
                <Line
                  key={`fcst_${pi}`}
                  type="monotone"
                  dataKey={`fcst_${pi}`}
                  stroke="#ef4444"
                  strokeWidth={2.5}
                  strokeDasharray="6 3"
                  dot={false}
                  name={`${label} (Forecast)`}
                  isAnimationActive={false}
                  connectNulls
                />,
              ];
            })}
          </ComposedChart>
        </ResponsiveContainer>

        <div className="flex items-center justify-center gap-6 mt-2 pt-3 border-t border-gray-800">
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <div className="w-6 h-[2px] bg-emerald-500 opacity-40" />Raw Data
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <div className="w-6 h-[3px] bg-emerald-500" />24h Moving Avg
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <div className="w-6 h-[2px]" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #ef4444 0, #ef4444 5px, transparent 5px, transparent 8px)', height: 2 }} />Forecast
          </div>
        </div>
      </div>
    </div>
  );
}
