import { useEffect, useState } from 'react';
import { fetchReports, batchProcessReports } from '../services/api';
import type { IntelReport } from '../services/api';

const URGENCY_COLORS: Record<string, string> = {
  critical: 'bg-red-900/50 text-red-300',
  high: 'bg-amber-900/50 text-amber-300',
  medium: 'bg-yellow-900/40 text-yellow-300',
  low: 'bg-emerald-900/40 text-emerald-300',
};

const PRIORITY_COLORS: Record<string, string> = {
  'Avengers Level Threat': 'bg-red-900/50 text-red-300',
  'High': 'bg-amber-900/50 text-amber-300',
  'Routine': 'bg-gray-700/50 text-gray-300',
};

export default function IntelTable() {
  const [reports, setReports] = useState<IntelReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null);

  const loadReports = () => {
    setLoading(true);
    fetchReports({ limit: 500 }).then(setReports).finally(() => setLoading(false));
  };

  useEffect(loadReports, []);

  const handleBatchProcess = async () => {
    setProcessing(true);
    try {
      const result = await batchProcessReports();
      if (result.processed_count === 0) {
        setToast({ message: 'All reports are already processed.', type: 'info' });
      } else {
        setToast({
          message: `Successfully processed ${result.processed_count} reports.${result.error_count ? ` (${result.error_count} errors)` : ''}`,
          type: 'success',
        });
      }
      loadReports();
    } catch {
      setToast({ message: 'Failed to process reports. Check backend connection.', type: 'info' });
    } finally {
      setProcessing(false);
      setTimeout(() => setToast(null), 4000);
    }
  };

  const filtered = reports.filter(r => {
    if (filter === 'all') return true;
    if (filter === 'processed') return r.processed;
    if (filter === 'unprocessed') return !r.processed;
    return r.priority === filter;
  });

  if (loading) {
    return <div className="h-96 animate-pulse rounded-lg bg-gray-800/50" />;
  }

  return (
    <div className="rounded-lg border border-gray-800 bg-[#0d1220] p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold text-white">Live Intelligence Feed</h2>
        <span className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
          {filtered.length} reports
        </span>
        <div className="ml-auto flex gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-gray-200"
          >
            <option value="all">All Reports</option>
            <option value="processed">Processed</option>
            <option value="unprocessed">Unprocessed</option>
            <option value="Avengers Level Threat">Avenger-Level</option>
            <option value="High">High Priority</option>
            <option value="Routine">Routine</option>
          </select>
          <button
            onClick={handleBatchProcess}
            disabled={processing}
            className="rounded bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            {processing ? 'Processing...' : 'Process All'}
          </button>
        </div>
      </div>

      {toast && (
        <div className={`mb-4 rounded border p-3 text-sm ${
          toast.type === 'success'
            ? 'border-emerald-800 bg-emerald-900/30 text-emerald-300'
            : 'border-sky-800 bg-sky-900/30 text-sky-300'
        }`}>
          {toast.message}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Priority</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Location</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Resource</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Status</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Urgency</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Action</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Time</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((report) => (
              <tr key={report.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                <td className="px-3 py-2.5">
                  <span className={`rounded px-2 py-0.5 text-xs font-semibold ${PRIORITY_COLORS[report.priority] ?? 'bg-gray-700 text-gray-300'}`}>
                    {report.priority}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-gray-200">
                  {report.structured_data?.location ?? '---'}
                </td>
                <td className="px-3 py-2.5 text-gray-300">
                  {report.structured_data?.resource_mentioned ?? '---'}
                </td>
                <td className="px-3 py-2.5">
                  <span className="capitalize text-gray-300">
                    {report.structured_data?.status ?? (report.processed ? '---' : 'pending')}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  {report.structured_data?.urgency ? (
                    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${URGENCY_COLORS[report.structured_data.urgency] ?? 'bg-gray-700 text-gray-300'}`}>
                      {report.structured_data.urgency}
                    </span>
                  ) : '---'}
                </td>
                <td className="max-w-xs truncate px-3 py-2.5 text-gray-400">
                  {report.structured_data?.action_required ?? '---'}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-xs text-gray-500">
                  {new Date(report.timestamp).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
