import type { ResourceAnalytics } from '../hooks/useLiveData';

const RESOURCE_KEYS = [
  'Wakanda|Arc Reactor Cores',
  'New Asgard|Vibranium (kg)',
  'Sanctum Sanctorum|Clean Water (L)',
  'Sokovia|Pym Particles',
  'Avengers Compound|Medical Kits',
];

interface Props {
  analytics: Record<string, ResourceAnalytics> | undefined;
  simTime: string;
}

export default function StatCards({ analytics, simTime }: Props) {
  if (!analytics || Object.keys(analytics).length === 0) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-gray-800/50" />
        ))}
      </div>
    );
  }

  const entries = RESOURCE_KEYS.map(k => analytics[k]).filter(Boolean);

  const totalStock = entries.reduce((s, a) => s + a.avg_stock, 0);
  const avgUsage = entries.length > 0
    ? entries.reduce((s, a) => s + a.avg_usage, 0) / entries.length
    : 0;
  const declining = entries.filter(a => a.trend === 'down').length;
  const rising = entries.filter(a => a.trend === 'up').length;
  const belowAvg = entries.filter(a => a.above_avg_24h === false).length;
  const netChange = entries.reduce((s, a) => s + a.hourly_change, 0);

  const dt = simTime ? new Date(simTime) : null;
  const timeLabel = dt
    ? dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
      dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
    : '--';

  const cards = [
    {
      label: 'Sim Time',
      value: timeLabel,
      sub: null,
      color: 'text-white',
      border: 'border-gray-700',
      icon: '🕐',
    },
    {
      label: 'Total Stock',
      value: totalStock.toLocaleString(undefined, { maximumFractionDigits: 0 }),
      sub: `${netChange >= 0 ? '+' : ''}${netChange.toFixed(1)} / hr`,
      color: netChange >= 0 ? 'text-emerald-400' : 'text-red-400',
      border: netChange >= 0 ? 'border-emerald-800/50' : 'border-red-800/50',
      icon: '📦',
    },
    {
      label: 'Avg Usage Rate',
      value: avgUsage.toFixed(1) + '/hr',
      sub: 'across all sectors',
      color: 'text-sky-400',
      border: 'border-sky-800/50',
      icon: '⚡',
    },
    {
      label: 'Rising',
      value: rising,
      sub: `of ${entries.length} resources`,
      color: rising > 0 ? 'text-emerald-400' : 'text-gray-400',
      border: rising > 0 ? 'border-emerald-800/50' : 'border-gray-700',
      icon: '📈',
    },
    {
      label: 'Declining',
      value: declining,
      sub: `of ${entries.length} resources`,
      color: declining > 0 ? 'text-red-400' : 'text-emerald-400',
      border: declining > 0 ? 'border-red-800/50' : 'border-emerald-800/50',
      icon: '📉',
    },
    {
      label: 'Below 24h Avg',
      value: belowAvg,
      sub: belowAvg > 0 ? 'needs attention' : 'all healthy',
      color: belowAvg > 2 ? 'text-red-400' : belowAvg > 0 ? 'text-amber-400' : 'text-emerald-400',
      border: belowAvg > 2 ? 'border-red-800/50' : belowAvg > 0 ? 'border-amber-800/50' : 'border-emerald-800/50',
      icon: '⚠️',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      {cards.map(card => (
        <div
          key={card.label}
          className={`rounded-lg border bg-[#0d1220] px-4 py-3 ${card.border} transition-colors`}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-sm">{card.icon}</span>
            <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500">{card.label}</p>
          </div>
          <p className={`text-2xl font-bold font-mono ${card.color}`}>{card.value}</p>
          {card.sub && <p className="text-[10px] text-gray-500 mt-0.5">{card.sub}</p>}
        </div>
      ))}
    </div>
  );
}
