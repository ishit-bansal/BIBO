import { useMemo } from 'react';
import type { ResourceAnalytics } from '../hooks/useLiveData';

const RESOURCE_KEYS = [
  'Wakanda|Arc Reactor Cores',
  'New Asgard|Vibranium (kg)',
  'Sanctum Sanctorum|Clean Water (L)',
  'Sokovia|Pym Particles',
  'Avengers Compound|Medical Kits',
];

const SHORT: Record<string, string> = {
  'Wakanda|Arc Reactor Cores': 'ARC',
  'New Asgard|Vibranium (kg)': 'VBR',
  'Sanctum Sanctorum|Clean Water (L)': 'H2O',
  'Sokovia|Pym Particles': 'PYM',
  'Avengers Compound|Medical Kits': 'MED',
};

const COLORS: Record<string, string> = {
  'Wakanda|Arc Reactor Cores': '#10b981',
  'New Asgard|Vibranium (kg)': '#3b82f6',
  'Sanctum Sanctorum|Clean Water (L)': '#a78bfa',
  'Sokovia|Pym Particles': '#f59e0b',
  'Avengers Compound|Medical Kits': '#ef4444',
};

const SECTOR_EMOJI: Record<string, string> = {
  Wakanda: '🐾',
  'New Asgard': '⚡',
  'Sanctum Sanctorum': '✨',
  Sokovia: '🔮',
  'Avengers Compound': '🦅',
};

function trendArrow(trend: string) {
  if (trend === 'up') return { arrow: '▲', cls: 'text-emerald-400' };
  if (trend === 'down') return { arrow: '▼', cls: 'text-red-400' };
  return { arrow: '—', cls: 'text-gray-500' };
}

interface Props {
  analytics: Record<string, ResourceAnalytics> | undefined;
}

export default function SectorHeatmap({ analytics }: Props) {
  const rows = useMemo(() => {
    if (!analytics) return [];
    return RESOURCE_KEYS.map(key => {
      const a = analytics[key];
      if (!a) return null;
      const [sector, resource] = key.split('|');
      return { key, sector, resource, a };
    }).filter(Boolean) as { key: string; sector: string; resource: string; a: ResourceAnalytics }[];
  }, [analytics]);

  if (rows.length === 0) {
    return (
      <div className="basic-container-shaded rounded-lg border border-gray-800 bg-[#0d1220] p-5">
        <div className="h-8 w-48 bg-gray-800 rounded animate-pulse mb-4" />
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 bg-gray-800/50 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="basic-container-shaded rounded-lg border border-gray-800 bg-[#0d1220] p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-white tracking-wide">SECTOR RESOURCE STATUS</h2>
        <div className="flex items-center gap-3 text-[9px] text-gray-500">
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Rising</span>
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-gray-500" /> Flat</span>
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-red-500" /> Declining</span>
        </div>
      </div>

      <div className="space-y-2.5">
        {rows.map(({ key, sector, resource, a }) => {
          const color = COLORS[key];
          const { arrow, cls } = trendArrow(a.trend);
          const changePct = a.change_pct;
          const changePctStr = changePct >= 0 ? `+${changePct.toFixed(2)}%` : `${changePct.toFixed(2)}%`;

          const vs6h = a.avg_6h != null
            ? ((a.avg_stock - a.avg_6h) / a.avg_6h * 100).toFixed(1)
            : null;
          const vs24h = a.avg_24h != null
            ? ((a.avg_stock - a.avg_24h) / a.avg_24h * 100).toFixed(1)
            : null;

          const trendBorder = a.trend === 'down'
            ? 'border-red-800/40'
            : a.trend === 'up'
              ? 'border-emerald-800/40'
              : 'border-gray-800';

          return (
            <div
              key={key}
              className={`rounded-lg border bg-gray-900/40 px-4 py-3 transition-colors ${trendBorder}`}
            >
              <div className="flex items-center gap-4">
                {/* sector & resource label */}
                <div className="w-44 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{SECTOR_EMOJI[sector] || '📍'}</span>
                    <div>
                      <div className="text-xs font-bold text-gray-200">{sector}</div>
                      <div className="text-[10px] text-gray-500">{resource}</div>
                    </div>
                  </div>
                </div>

                {/* current stock */}
                <div className="w-28 shrink-0">
                  <div className="text-[9px] text-gray-500 uppercase mb-0.5">Stock</div>
                  <div className="text-lg font-bold font-mono" style={{ color }}>
                    {a.avg_stock.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </div>
                </div>

                {/* hourly change */}
                <div className="w-24 shrink-0">
                  <div className="text-[9px] text-gray-500 uppercase mb-0.5">Hourly</div>
                  <div className="flex items-center gap-1">
                    <span className={`text-sm font-bold ${cls}`}>{arrow}</span>
                    <span className={`text-sm font-bold font-mono ${cls}`}>
                      {a.hourly_change >= 0 ? '+' : ''}{a.hourly_change.toFixed(1)}
                    </span>
                  </div>
                  <div className={`text-[9px] font-mono ${changePct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {changePctStr}
                  </div>
                </div>

                {/* usage rate */}
                <div className="w-20 shrink-0">
                  <div className="text-[9px] text-gray-500 uppercase mb-0.5">Usage</div>
                  <div className="text-sm font-mono text-gray-300">
                    {a.avg_usage.toFixed(1)}<span className="text-[9px] text-gray-500">/hr</span>
                  </div>
                </div>

                {/* vs 6h avg */}
                <div className="w-20 shrink-0">
                  <div className="text-[9px] text-gray-500 uppercase mb-0.5">vs 6h</div>
                  {vs6h != null ? (
                    <div className={`text-sm font-mono font-semibold ${Number(vs6h) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {Number(vs6h) >= 0 ? '+' : ''}{vs6h}%
                    </div>
                  ) : (
                    <div className="text-sm text-gray-600">—</div>
                  )}
                </div>

                {/* vs 24h avg */}
                <div className="w-20 shrink-0">
                  <div className="text-[9px] text-gray-500 uppercase mb-0.5">vs 24h</div>
                  {vs24h != null ? (
                    <div className={`text-sm font-mono font-semibold ${Number(vs24h) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {Number(vs24h) >= 0 ? '+' : ''}{vs24h}%
                    </div>
                  ) : (
                    <div className="text-sm text-gray-600">—</div>
                  )}
                </div>

                {/* stock bar */}
                <div className="flex-1 min-w-0">
                  <div className="text-[9px] text-gray-500 uppercase mb-1">Level</div>
                  <div className="relative h-3 rounded-full bg-gray-800 overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full transition-all duration-1000"
                      style={{
                        width: `${Math.min(100, (a.avg_stock / 3000) * 100)}%`,
                        background: `linear-gradient(90deg, ${color}cc, ${color})`,
                      }}
                    />
                    {/* 6h marker */}
                    {a.avg_6h != null && (
                      <div
                        className="absolute top-0 bottom-0 w-px bg-white/30"
                        style={{ left: `${Math.min(100, (a.avg_6h / 3000) * 100)}%` }}
                        title={`6h avg: ${a.avg_6h.toFixed(0)}`}
                      />
                    )}
                    {/* 24h marker */}
                    {a.avg_24h != null && (
                      <div
                        className="absolute top-0 bottom-0 w-px bg-amber-400/50"
                        style={{ left: `${Math.min(100, (a.avg_24h / 3000) * 100)}%` }}
                        title={`24h avg: ${a.avg_24h.toFixed(0)}`}
                      />
                    )}
                  </div>
                  <div className="flex justify-between text-[8px] text-gray-600 mt-0.5">
                    <span>0</span>
                    <span>3,000</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
