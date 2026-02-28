import { useEffect, useState } from 'react';
import { fetchPredictions, fetchReports } from '../services/api';
import type { Prediction, IntelReport } from '../services/api';

export default function StatCards() {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [reports, setReports] = useState<IntelReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchPredictions(), fetchReports({ limit: 500 })])
      .then(([preds, reps]) => {
        setPredictions(preds);
        setReports(reps);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-lg bg-gray-800/50" />
        ))}
      </div>
    );
  }

  const withData = predictions.filter(p => p.data_points_used > 0);
  const depleted = withData.filter(p => p.status === 'depleted').length;
  const critical = withData.filter(p => p.status === 'critical').length;

  const active = withData.filter(p => p.hours_until_zero != null && p.hours_until_zero > 0);
  const avgHours =
    active.length > 0
      ? Math.round(active.reduce((s, p) => s + (p.hours_until_zero ?? 0), 0) / active.length)
      : 0;

  const threatCount = reports.filter(r => r.priority === 'Avengers Level Threat').length;

  const cards = [
    {
      label: 'Depleted Resources',
      value: depleted,
      color: depleted > 0 ? 'text-red-400' : 'text-emerald-400',
      bg: depleted > 0 ? 'bg-red-900/20 border-red-800/50' : 'bg-emerald-900/20 border-emerald-800/50',
    },
    {
      label: 'Critical Status',
      value: critical,
      color: critical > 0 ? 'text-amber-400' : 'text-emerald-400',
      bg: critical > 0 ? 'bg-amber-900/20 border-amber-800/50' : 'bg-emerald-900/20 border-emerald-800/50',
    },
    {
      label: 'Avg Hours to Zero',
      value: avgHours > 0 ? `${avgHours}h` : 'N/A',
      color: avgHours < 48 ? 'text-red-400' : 'text-sky-400',
      bg: 'bg-sky-900/20 border-sky-800/50',
    },
    {
      label: 'Avenger-Level Threats',
      value: threatCount,
      color: threatCount > 10 ? 'text-red-400' : 'text-amber-400',
      bg: 'bg-amber-900/20 border-amber-800/50',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`rounded-lg border p-5 ${card.bg}`}
        >
          <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
            {card.label}
          </p>
          <p className={`mt-2 text-3xl font-bold ${card.color}`}>{card.value}</p>
        </div>
      ))}
    </div>
  );
}
