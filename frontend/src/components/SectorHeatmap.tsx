import { useEffect, useState } from 'react';
import { fetchPredictions } from '../services/api';
import type { Prediction } from '../services/api';

function statusColor(prediction: Prediction): string {
  if (prediction.data_points_used === 0) return 'bg-gray-800 text-gray-500';
  switch (prediction.status) {
    case 'depleted': return 'bg-red-900/60 text-red-300 border-red-700';
    case 'critical': return 'bg-amber-900/60 text-amber-300 border-amber-700';
    case 'warning': return 'bg-yellow-900/40 text-yellow-300 border-yellow-700';
    case 'stable': return 'bg-emerald-900/40 text-emerald-300 border-emerald-700';
    default: return 'bg-gray-800 text-gray-400';
  }
}

function statusLabel(prediction: Prediction): string {
  if (prediction.data_points_used === 0) return 'NO DATA';
  if (prediction.status === 'depleted') return 'DEPLETED';
  if (prediction.hours_until_zero != null && prediction.hours_until_zero > 0) {
    return `${Math.round(prediction.hours_until_zero)}h left`;
  }
  return prediction.status.toUpperCase();
}

export default function SectorHeatmap() {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPredictions().then(setPredictions).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="h-64 animate-pulse rounded-lg bg-gray-800/50" />;
  }

  const sectors = [...new Set(predictions.map(p => p.sector_id))].sort();
  const resources = [...new Set(predictions.map(p => p.resource_type))].sort();

  const lookup = new Map<string, Prediction>();
  predictions.forEach(p => lookup.set(`${p.sector_id}|${p.resource_type}`, p));

  return (
    <div className="rounded-lg border border-gray-800 bg-[#0d1220] p-5">
      <h2 className="mb-4 text-lg font-semibold text-white">Sector Status Matrix</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                Sector
              </th>
              {resources.map(r => (
                <th key={r} className="px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-400">
                  {r}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sectors.map(sector => (
              <tr key={sector} className="border-t border-gray-800/50">
                <td className="px-3 py-3 font-medium text-gray-200">{sector}</td>
                {resources.map(resource => {
                  const pred = lookup.get(`${sector}|${resource}`);
                  const fallback: Prediction = {
                    sector_id: sector, resource_type: resource, current_stock: 0,
                    depletion_rate: 0, predicted_zero_date: null, hours_until_zero: null,
                    confidence_score: 0, status: 'no_data', data_points_used: 0,
                  };
                  const p = pred ?? fallback;
                  return (
                    <td key={resource} className="px-2 py-2 text-center">
                      <span className={`inline-block rounded border px-2 py-1 text-xs font-semibold ${statusColor(p)}`}>
                        {statusLabel(p)}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
