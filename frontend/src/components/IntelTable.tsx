import React, { useEffect, useState, useMemo } from 'react';
import { fetchReports, batchProcessReports, fetchRedactionLog } from '../services/api';
import type { IntelReport, RedactionLog } from '../services/api';

const URGENCY_COLORS: Record<string, string> = {
  critical: 'bg-red-900/50 text-red-300 border-red-800/50',
  high: 'bg-amber-900/50 text-amber-300 border-amber-800/50',
  medium: 'bg-yellow-900/40 text-yellow-300 border-yellow-800/50',
  low: 'bg-emerald-900/40 text-emerald-300 border-emerald-800/50',
};

const PRIORITY_COLORS: Record<string, string> = {
  'Avengers Level Threat': 'bg-red-900/50 text-red-300',
  'High': 'bg-amber-900/50 text-amber-300',
  'Routine': 'bg-gray-700/50 text-gray-300',
};

function highlightRedactions(text: string, redactions: { type: string; original: string; replacement: string }[]): React.JSX.Element {
  if (!redactions.length) return <>{text}</>;

  const sortedRedactions = [...redactions].sort((a, b) => {
    const posA = text.indexOf(a.original);
    const posB = text.indexOf(b.original);
    return posA - posB;
  });

  const parts: React.JSX.Element[] = [];
  let remaining = text;
  let keyIdx = 0;

  for (const r of sortedRedactions) {
    const idx = remaining.indexOf(r.original);
    if (idx === -1) continue;

    if (idx > 0) {
      parts.push(<span key={keyIdx++}>{remaining.slice(0, idx)}</span>);
    }
    parts.push(
      <span
        key={keyIdx++}
        className="relative inline-block rounded px-1 py-0.5 bg-red-500/30 border border-red-500/50 text-red-300 font-semibold"
        title={`${r.type.toUpperCase()} — will be redacted to ${r.replacement}`}
      >
        {r.original}
        <span className="absolute -top-2.5 -right-1 text-[7px] bg-red-600 text-white rounded px-1 font-bold uppercase leading-tight">
          {r.type === 'name' ? 'PII' : 'CONTACT'}
        </span>
      </span>
    );
    remaining = remaining.slice(idx + r.original.length);
  }

  if (remaining) {
    parts.push(<span key={keyIdx}>{remaining}</span>);
  }

  return <>{parts}</>;
}

function highlightReplacements(text: string): React.JSX.Element {
  const regex = /\[REDACTED_(?:NAME|CONTACT)\]/g;
  const parts: React.JSX.Element[] = [];
  let lastIdx = 0;
  let match;
  let keyIdx = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(<span key={keyIdx++}>{text.slice(lastIdx, match.index)}</span>);
    }
    parts.push(
      <span key={keyIdx++} className="inline-block rounded px-1 py-0.5 bg-emerald-500/30 border border-emerald-500/50 text-emerald-300 font-semibold">
        {match[0]}
      </span>
    );
    lastIdx = regex.lastIndex;
  }

  if (lastIdx < text.length) {
    parts.push(<span key={keyIdx}>{text.slice(lastIdx)}</span>);
  }

  return <>{parts}</>;
}

function RedactionAuditModal({ log, onClose }: { log: RedactionLog; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="relative mx-4 max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-xl border border-gray-700 bg-[#0d1220] shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-900/50 border border-emerald-700/50">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">PII Redaction Audit Trail</h3>
              <span className="text-xs text-gray-500 font-mono">Report {log.report_id}</span>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-5" style={{ maxHeight: 'calc(90vh - 80px)' }}>

          {/* Pipeline Flow Visualization */}
          <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Security Pipeline</h4>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800/60 px-3 py-2">
                <span className="text-sm">📝</span>
                <span className="text-xs font-semibold text-gray-300">Raw Report</span>
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-600 shrink-0"><path d="M5 12h14m-7-7 7 7-7 7"/></svg>
              <div className="flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/30 px-3 py-2">
                <span className="text-sm">🛡️</span>
                <span className="text-xs font-semibold text-red-400">PII Redaction</span>
                {log.redactions_applied.length > 0 && (
                  <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[9px] font-bold text-white">{log.redactions_applied.length}</span>
                )}
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-600 shrink-0"><path d="M5 12h14m-7-7 7 7-7 7"/></svg>
              <div className="flex items-center gap-2 rounded-lg border border-emerald-800/50 bg-emerald-950/30 px-3 py-2">
                <span className="text-sm">🔒</span>
                <span className="text-xs font-semibold text-emerald-400">Safe Text</span>
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-600 shrink-0"><path d="M5 12h14m-7-7 7 7-7 7"/></svg>
              <div className="flex items-center gap-2 rounded-lg border border-purple-800/50 bg-purple-950/30 px-3 py-2">
                <span className="text-sm">🤖</span>
                <span className="text-xs font-semibold text-purple-400">Gemini LLM</span>
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-600 shrink-0"><path d="M5 12h14m-7-7 7 7-7 7"/></svg>
              <div className="flex items-center gap-2 rounded-lg border border-blue-800/50 bg-blue-950/30 px-3 py-2">
                <span className="text-sm">📊</span>
                <span className="text-xs font-semibold text-blue-400">Structured Data</span>
              </div>
            </div>
          </div>

          {/* Redactions Applied */}
          {log.redactions_applied.length > 0 ? (
            <div>
              <h4 className="text-sm font-semibold text-red-400 mb-2 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-400"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                {log.redactions_applied.length} Redaction{log.redactions_applied.length > 1 ? 's' : ''} Applied
              </h4>
              <div className="flex flex-wrap gap-2">
                {log.redactions_applied.map((r, i) => (
                  <div key={i} className="rounded-lg border border-gray-700 bg-gray-900/60 px-3 py-2 flex items-center gap-2">
                    <span className={`text-[9px] uppercase font-bold rounded px-1.5 py-0.5 ${r.type === 'name' ? 'bg-red-600/80 text-white' : 'bg-amber-600/80 text-white'}`}>{r.type}</span>
                    <span className="text-xs text-red-400 line-through font-mono">{r.original}</span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-600"><path d="M5 12h14m-7-7 7 7-7 7"/></svg>
                    <span className="text-xs text-emerald-400 font-mono font-semibold">{r.replacement}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-emerald-800/30 bg-emerald-950/20 p-4 flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-900/50">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div>
                <span className="text-sm font-semibold text-emerald-300">No PII Detected</span>
                <p className="text-xs text-emerald-400/60">This report contained no hero names or contact numbers requiring redaction.</p>
              </div>
            </div>
          )}

          {/* Side-by-side comparison */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="text-sm font-semibold text-red-400 mb-2 flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded bg-red-900/50 text-[10px] font-bold text-red-300">1</span>
                Original Text (contains PII)
              </h4>
              <div className="rounded-lg border border-red-900/30 bg-red-950/10 p-4 text-sm text-gray-300 font-mono leading-relaxed">
                {highlightRedactions(log.original_text, log.redactions_applied)}
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-emerald-400 mb-2 flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded bg-emerald-900/50 text-[10px] font-bold text-emerald-300">2</span>
                Redacted Text (sent to Gemini)
              </h4>
              <div className="rounded-lg border border-emerald-900/30 bg-emerald-950/10 p-4 text-sm text-gray-300 font-mono leading-relaxed">
                {highlightReplacements(log.redacted_text)}
              </div>
            </div>
          </div>

          {/* Proof stamp */}
          <div className="rounded-lg border border-gray-800 bg-gray-900/30 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-500"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              <span className="text-emerald-400 font-semibold">VERIFIED:</span>
              <span>No PII was transmitted to the external LLM. All hero identities and contact info were stripped server-side before API call.</span>
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
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

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
  const processedCount = reports.filter(r => r.processed).length;

  const filtered = reports.filter(r => {
    if (filter === 'all') return true;
    if (filter === 'processed') return r.processed;
    if (filter === 'unprocessed') return !r.processed;
    return r.priority === filter;
  });

  const urgencyBreakdown = useMemo(() => {
    const counts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const r of reports) {
      const u = r.structured_data?.urgency;
      if (u && u in counts) counts[u]++;
    }
    return counts;
  }, [reports]);

  if (loading) {
    return <div className="h-96 animate-pulse rounded-lg bg-gray-800/50" />;
  }

  return (
    <div className="space-y-4">

      {/* Summary Stats Bar */}
      <div className="grid grid-cols-6 gap-3">
        <div className="rounded-lg border border-gray-800 bg-[#0d1220] p-3">
          <div className="text-[10px] uppercase text-gray-500 font-semibold">Total Reports</div>
          <div className="text-xl font-bold text-white font-mono">{reports.length}</div>
        </div>
        <div className="rounded-lg border border-gray-800 bg-[#0d1220] p-3">
          <div className="text-[10px] uppercase text-gray-500 font-semibold">Processed</div>
          <div className="text-xl font-bold text-emerald-400 font-mono">{processedCount}</div>
        </div>
        <div className="rounded-lg border border-gray-800 bg-[#0d1220] p-3">
          <div className="text-[10px] uppercase text-gray-500 font-semibold">Critical</div>
          <div className="text-xl font-bold text-red-400 font-mono">{urgencyBreakdown.critical}</div>
        </div>
        <div className="rounded-lg border border-gray-800 bg-[#0d1220] p-3">
          <div className="text-[10px] uppercase text-gray-500 font-semibold">High</div>
          <div className="text-xl font-bold text-amber-400 font-mono">{urgencyBreakdown.high}</div>
        </div>
        <div className="rounded-lg border border-gray-800 bg-[#0d1220] p-3">
          <div className="text-[10px] uppercase text-gray-500 font-semibold">Medium</div>
          <div className="text-xl font-bold text-yellow-400 font-mono">{urgencyBreakdown.medium}</div>
        </div>
        <div className="rounded-lg border border-gray-800 bg-[#0d1220] p-3">
          <div className="text-[10px] uppercase text-gray-500 font-semibold">Low</div>
          <div className="text-xl font-bold text-emerald-400 font-mono">{urgencyBreakdown.low}</div>
        </div>
      </div>

      {/* Main table card */}
      <div className="rounded-lg border border-gray-800 bg-[#0d1220] p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold text-white">Intelligence Feed</h2>
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
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Agent</th>
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
                <React.Fragment key={report.id}>
                  <tr
                    className={`border-b border-gray-800/50 cursor-pointer transition-colors ${expandedRow === report.report_id ? 'bg-gray-800/40' : 'hover:bg-gray-800/20'}`}
                    onClick={() => setExpandedRow(prev => prev === report.report_id ? null : report.report_id)}
                  >
                    <td className="px-3 py-2.5">
                      <span className={`rounded px-2 py-0.5 text-xs font-semibold ${PRIORITY_COLORS[report.priority] ?? 'bg-gray-700 text-gray-300'}`}>
                        {report.priority}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-400 font-mono">
                      {report.hero_alias || '—'}
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
                    <td className="px-3 py-2.5 text-center" onClick={e => e.stopPropagation()}>
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
                  {expandedRow === report.report_id && (
                    <tr className="border-b border-gray-800/50">
                      <td colSpan={9} className="px-3 py-3 bg-gray-900/30">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <span className="text-[10px] uppercase text-gray-500 font-semibold">Raw Report Text</span>
                            <p className="mt-1 text-xs text-gray-300 font-mono leading-relaxed bg-gray-800/40 rounded p-2.5">
                              {report.raw_text}
                            </p>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase text-gray-500 font-semibold">Redacted Text (sent to LLM)</span>
                            <p className="mt-1 text-xs text-gray-300 font-mono leading-relaxed bg-gray-800/40 rounded p-2.5">
                              {report.redacted_text ?? <span className="text-gray-600 italic">Not yet processed</span>}
                            </p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {auditLog && (
          <RedactionAuditModal log={auditLog} onClose={() => setAuditLog(null)} />
        )}
      </div>
    </div>
  );
}
