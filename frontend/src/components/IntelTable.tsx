import { useEffect, useState } from 'react';
import { fetchReports, batchProcessReports, fetchRedactionLog } from '../services/api';
import type { IntelReport, RedactionLog } from '../services/api';

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

function RedactionAuditModal({ log, onClose }: { log: RedactionLog; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="relative mx-4 max-h-[85vh] w-full max-w-4xl overflow-hidden rounded-xl border border-gray-700 bg-[#0d1220] shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
          <div>
            <h3 className="text-lg font-bold text-white">PII Redaction Audit</h3>
            <span className="text-xs text-gray-500 font-mono">Report {log.report_id}</span>
          </div>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-white transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="overflow-y-auto p-6" style={{ maxHeight: 'calc(85vh - 80px)' }}>
          {/* Redactions applied */}
          {log.redactions_applied.length > 0 && (
            <div className="mb-5">
              <h4 className="text-sm font-semibold text-emerald-400 mb-2">Redactions Applied ({log.redactions_applied.length})</h4>
              <div className="flex flex-wrap gap-2">
                {log.redactions_applied.map((r, i) => (
                  <div key={i} className="rounded border border-gray-700 bg-gray-900/60 px-3 py-1.5">
                    <span className="text-[10px] uppercase text-gray-500 mr-2">{r.type}</span>
                    <span className="text-xs text-red-400 line-through mr-1.5">{r.original}</span>
                    <span className="text-xs text-emerald-400">{r.replacement}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {log.redactions_applied.length === 0 && (
            <div className="mb-5 rounded border border-gray-800 bg-gray-900/40 p-3 text-sm text-gray-500">
              No PII detected in this report.
            </div>
          )}

          {/* Side-by-side comparison */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="text-sm font-semibold text-red-400 mb-2">Original Text</h4>
              <div className="rounded border border-red-900/30 bg-red-950/20 p-4 text-sm text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">
                {log.original_text}
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-emerald-400 mb-2">Redacted Text (sent to AI)</h4>
              <div className="rounded border border-emerald-900/30 bg-emerald-950/20 p-4 text-sm text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">
                {log.redacted_text}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function IntelTable() {
  const [reports, setReports] = useState<IntelReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null);
  const [auditLog, setAuditLog] = useState<RedactionLog | null>(null);
  const [auditLoading, setAuditLoading] = useState<string | null>(null);

  const openAudit = async (report: IntelReport) => {
    if (!report.processed || !report.report_id) return;
    setAuditLoading(report.report_id);
    try {
      const log = await fetchRedactionLog(report.report_id);
      setAuditLog(log);
    } catch {
      setToast({ message: 'Failed to load redaction log.', type: 'info' });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setAuditLoading(null);
    }
  };

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

  const unprocessedCount = reports.filter(r => !r.processed).length;

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

      {unprocessedCount > 0 && !processing && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-amber-800/50 bg-amber-950/30 px-4 py-3">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-amber-400">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <div className="flex-1">
            <span className="text-sm font-semibold text-amber-300">{unprocessedCount} unprocessed report{unprocessedCount > 1 ? 's' : ''}</span>
            <span className="text-xs text-amber-400/70 ml-2">PII redaction + AI extraction has not been run yet.</span>
          </div>
          <button
            onClick={handleBatchProcess}
            className="rounded bg-amber-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-amber-500 transition-colors"
          >
            Process All
          </button>
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
              <th className="px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-400">PII Audit</th>
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
                <td className="px-3 py-2.5 text-center">
                  {report.processed ? (
                    <button
                      onClick={() => openAudit(report)}
                      disabled={auditLoading === report.report_id}
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-semibold bg-emerald-900/30 text-emerald-400 border border-emerald-800/40 hover:bg-emerald-800/40 transition-colors disabled:opacity-40"
                      title="View PII redaction audit"
                    >
                      {auditLoading === report.report_id ? (
                        <span className="animate-spin">⟳</span>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                      )}
                      Audit
                    </button>
                  ) : (
                    <span className="text-[10px] text-gray-600">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {auditLog && (
        <RedactionAuditModal log={auditLog} onClose={() => setAuditLog(null)} />
      )}
    </div>
  );
}
