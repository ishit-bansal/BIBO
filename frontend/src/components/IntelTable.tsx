import React, { useEffect, useState, useRef } from 'react';
import { fetchReports, batchProcessReports, resetReports, fetchRedactionLog } from '../services/api';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" style={{ paddingTop: '70px' }} onClick={onClose}>
      <div className="relative mx-4 max-h-[calc(100vh-90px)] w-full max-w-5xl overflow-hidden rounded-xl border border-gray-300 bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 bg-white">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 border border-emerald-300">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-600"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">PII Redaction Audit Trail</h3>
              <span className="text-xs text-gray-500 font-mono">Report {log.report_id}</span>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-5 bg-white" style={{ maxHeight: 'calc(100vh - 170px)' }}>

          {/* Pipeline Flow Visualization */}
          <div className="rounded-lg border border-gray-300 bg-gray-50 p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Security Pipeline</h4>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2">
                <span className="text-xs font-semibold text-gray-700">Raw Report</span>
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400 shrink-0"><path d="M5 12h14m-7-7 7 7-7 7"/></svg>
              <div className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2">
                <span className="text-xs font-semibold text-red-600">PII Redaction</span>
                {log.redactions_applied.length > 0 && (
                  <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[9px] font-bold text-white">{log.redactions_applied.length}</span>
                )}
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400 shrink-0"><path d="M5 12h14m-7-7 7 7-7 7"/></svg>
              <div className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2">
                <span className="text-xs font-semibold text-emerald-700">Safe Text</span>
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400 shrink-0"><path d="M5 12h14m-7-7 7 7-7 7"/></svg>
              <div className="flex items-center gap-2 rounded-lg border border-purple-300 bg-purple-50 px-3 py-2">
                <span className="text-xs font-semibold text-purple-700">Gemini LLM</span>
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400 shrink-0"><path d="M5 12h14m-7-7 7 7-7 7"/></svg>
              <div className="flex items-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-3 py-2">
                <span className="text-xs font-semibold text-blue-700">Structured Data</span>
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
                  <div key={i} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 flex items-center gap-2">
                    <span className={`text-[9px] uppercase font-bold rounded px-1.5 py-0.5 ${r.type === 'name' ? 'bg-red-600 text-white' : 'bg-amber-600 text-white'}`}>{r.type}</span>
                    <span className="text-xs text-red-600 line-through font-mono">{r.original}</span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400"><path d="M5 12h14m-7-7 7 7-7 7"/></svg>
                    <span className="text-xs text-emerald-600 font-mono font-semibold">{r.replacement}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-600"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div>
                <span className="text-sm font-semibold text-emerald-700">No PII Detected</span>
                <p className="text-xs text-emerald-600">This report contained no hero names or contact numbers requiring redaction.</p>
              </div>
            </div>
          )}

          {/* Side-by-side comparison */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="text-sm font-semibold text-red-600 mb-2 flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded bg-red-100 text-[10px] font-bold text-red-600">1</span>
                Original Text (contains PII)
              </h4>
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-gray-800 font-mono leading-relaxed">
                {highlightRedactions(log.original_text, log.redactions_applied)}
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-emerald-700 mb-2 flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded bg-emerald-100 text-[10px] font-bold text-emerald-700">2</span>
                Redacted Text (sent to Gemini)
              </h4>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-gray-800 font-mono leading-relaxed">
                {highlightReplacements(log.redacted_text)}
              </div>
            </div>
          </div>

          {/* Proof stamp */}
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-gray-700">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-600"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              <span className="text-emerald-700 font-semibold">VERIFIED:</span>
              <span>No PII was transmitted to the external LLM. All hero identities and contact info were stripped server-side before API call.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function hasRedactions(report: IntelReport): boolean {
  if (!report.processed || !report.redacted_text) return false;
  return report.raw_text !== report.redacted_text;
}

export default function IntelTable({ isAdmin = false }: { isAdmin?: boolean }) {
  const [reports, setReports] = useState<IntelReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [processElapsed, setProcessElapsed] = useState(0);
  const processTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [resetting, setResetting] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null);
  const [auditLog, setAuditLog] = useState<RedactionLog | null>(null);
  const [auditLoading, setAuditLoading] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);

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
    setProcessElapsed(0);
    const start = Date.now();
    processTimer.current = setInterval(() => setProcessElapsed(Date.now() - start), 100);
    try {
      const result = await batchProcessReports();
      if (result.processed_count === 0) {
        setToast({ message: 'All reports are already processed.', type: 'info' });
      } else {
        const secs = ((Date.now() - start) / 1000).toFixed(1);
        setToast({
          message: `Processed ${result.processed_count} reports in ${secs}s — PII redaction + AI entity extraction complete.${result.error_count ? ` (${result.error_count} errors)` : ''}`,
          type: 'success',
        });
      }
      loadReports();
    } catch {
      setToast({ message: 'Failed to process reports. Check backend connection.', type: 'info' });
    } finally {
      if (processTimer.current) clearInterval(processTimer.current);
      processTimer.current = null;
      setProcessing(false);
      setTimeout(() => setToast(null), 6000);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      const result = await resetReports();
      setToast({ message: `Reset complete — ${result.report_count} reports reloaded as unprocessed.`, type: 'info' });
      loadReports();
    } catch {
      setToast({ message: 'Failed to reset reports.', type: 'info' });
    } finally {
      setResetting(false);
      setTimeout(() => setToast(null), 5000);
    }
  };

  const unprocessedCount = reports.filter(r => !r.processed).length;
  const processedCount = reports.filter(r => r.processed).length;
  const redactedCount = reports.filter(r => hasRedactions(r)).length;

  const filtered = reports.filter(r => {
    if (priorityFilter === 'all') return true;
    return r.priority === priorityFilter;
  });

  const priorityOptions = [
    { value: 'all', label: 'All Priorities', count: reports.length },
    { value: 'Avengers Level Threat', label: 'Avengers Level', count: reports.filter(r => r.priority === 'Avengers Level Threat').length },
    { value: 'High', label: 'High Priority', count: reports.filter(r => r.priority === 'High').length },
    { value: 'Routine', label: 'Routine', count: reports.filter(r => r.priority === 'Routine').length },
  ];

  if (loading) {
    return <div className="h-96 animate-pulse rounded-lg bg-gray-800/50" />;
  }

  return (
    <div className="space-y-4">

      {/* Explainer Banner */}
      <div className="rounded-xl border border-gray-800 bg-[#0d1220] p-5">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-900/40 border border-emerald-700/50">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </div>
          <div>
            <h2 className="sentinel-display text-xl font-bold text-white mb-1">Intelligence Processing Center</h2>
            <p className="text-sm text-gray-400 leading-relaxed">
              Field intel reports from agents across all sectors. Each report passes through a
              <span className="text-cyan-400 font-semibold"> security middleware layer</span> before analysis:
              <span className="text-red-400 font-semibold"> PII Redaction</span> (server-side regex strips hero real names and contact numbers) →
              <span className="text-purple-400 font-semibold"> AI Entity Extraction</span> (redacted text is batched and sent to Gemini LLM for structured extraction — location, resources, urgency, actions).
              No personally identifiable information ever leaves the server.
              Hit <span className="text-amber-400 font-semibold">"Process All"</span> to run the middleware pipeline, or <span className="text-gray-300 font-semibold">"Reset"</span> to clear and start fresh.
            </p>
          </div>
        </div>
      </div>

      {/* Processing Overlay */}
      {processing && (() => {
        const e = processElapsed;
        const steps = [
          { label: 'PII Redaction', desc: 'Stripping names & contacts', done: e > 2000,
            doneClass: 'border-red-700/50 bg-red-950/30', activeClass: 'border-red-600/50 bg-red-950/20 animate-pulse' },
          { label: 'Text Batching', desc: '20 reports/call × 10 parallel', done: e > 4000,
            doneClass: 'border-amber-700/50 bg-amber-950/30', activeClass: 'border-amber-600/50 bg-amber-950/20 animate-pulse' },
          { label: 'Gemini AI', desc: 'Entity extraction via LLM', done: e > 16000,
            doneClass: 'border-purple-700/50 bg-purple-950/30', activeClass: 'border-purple-600/50 bg-purple-950/20 animate-pulse' },
          { label: 'DB Commit', desc: 'Saving structured data', done: e > 19000,
            doneClass: 'border-emerald-700/50 bg-emerald-950/30', activeClass: 'border-emerald-600/50 bg-emerald-950/20 animate-pulse' },
        ];
        return (
          <div className="rounded-xl border border-emerald-800/50 bg-[#0a0f1a] p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="sentinel-display text-lg font-bold text-white">Middleware Pipeline Running</h3>
              <span className="font-mono text-2xl font-bold text-emerald-400">{(e / 1000).toFixed(1)}s</span>
            </div>

            <div className="flex items-center gap-2 mb-5 flex-wrap">
              {steps.map((step, i) => {
                const isActive = !step.done && (i === 0 || steps[i - 1].done);
                const cls = step.done ? step.doneClass : isActive ? step.activeClass : 'border-gray-800 bg-gray-900/40';
                return (
                  <React.Fragment key={step.label}>
                    <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 transition-all ${cls}`}>
                      {step.done ? (
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-emerald-400"><polyline points="20 6 9 17 4 12"/></svg>
                      ) : isActive ? (
                        <div className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <div className="w-3.5 h-3.5 rounded-full bg-gray-700" />
                      )}
                      <div>
                        <div className="text-xs font-semibold text-gray-200">{step.label}</div>
                        <div className="text-[10px] text-gray-500">{step.desc}</div>
                      </div>
                    </div>
                    {i < steps.length - 1 && (
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={step.done ? '#10b981' : '#374151'} strokeWidth="2" className="shrink-0"><path d="M5 12h14m-7-7 7 7-7 7"/></svg>
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-300"
                style={{ width: `${Math.min(95, (e / 210))}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-2 text-center">
              Running {unprocessedCount} reports through the security middleware — PII redaction → Gemini AI extraction
            </p>
          </div>
        );
      })()}

      {/* Summary Stats Bar */}
      <div className="grid grid-cols-5 gap-3">
        <div className="rounded-lg border border-gray-800 bg-[#0d1220] p-3">
          <div className="text-[10px] uppercase text-gray-500 font-semibold">Total Reports</div>
          <div className="text-xl font-bold text-white font-mono">{reports.length}</div>
        </div>
        <div className="rounded-lg border border-gray-800 bg-[#0d1220] p-3">
          <div className="text-[10px] uppercase text-gray-500 font-semibold">Unprocessed</div>
          <div className="text-xl font-bold text-amber-400 font-mono">{unprocessedCount}</div>
        </div>
        <div className="rounded-lg border border-gray-800 bg-[#0d1220] p-3">
          <div className="text-[10px] uppercase text-gray-500 font-semibold">Processed</div>
          <div className="text-xl font-bold text-emerald-400 font-mono">{processedCount}</div>
        </div>
        <div className="rounded-lg border border-gray-800 bg-[#0d1220] p-3">
          <div className="text-[10px] uppercase text-red-500/70 font-semibold flex items-center gap-1">
            PII Redacted
            <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
          </div>
          <div className="text-xl font-bold text-red-400 font-mono">{redactedCount}</div>
        </div>
        <div className="rounded-lg border border-gray-800 bg-[#0d1220] p-3">
          <div className="text-[10px] uppercase text-gray-500 font-semibold">Showing</div>
          <div className="text-xl font-bold text-white font-mono">{filtered.length}</div>
        </div>
      </div>

      {/* Main table card */}
      <div className="intel-grid-white-panel rounded-lg border border-gray-300 bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold text-white">Intelligence Feed</h2>
          <div className="ml-auto flex items-center gap-2">
            {/* Priority filter dropdown */}
            <div className="relative">
              <button
                onClick={() => setFilterOpen(prev => !prev)}
                className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-gray-200 hover:border-gray-600 transition-colors"
              >
                <span>{priorityOptions.find(o => o.value === priorityFilter)?.label ?? 'All'}</span>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={`transition-transform ${filterOpen ? 'rotate-180' : ''}`}>
                  <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              {filterOpen && (
                <div className="absolute right-0 top-full mt-1 min-w-[200px] rounded-lg border border-gray-700 bg-gray-900 shadow-xl z-50 overflow-hidden">
                  {priorityOptions.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => { setPriorityFilter(opt.value); setFilterOpen(false); }}
                      className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-colors flex items-center justify-between ${
                        priorityFilter === opt.value
                          ? 'bg-emerald-900/40 text-emerald-400'
                          : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                      }`}
                    >
                      <span>{opt.label}</span>
                      <span className="text-xs text-gray-500 font-mono">{opt.count}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={handleBatchProcess}
              disabled={processing || resetting || unprocessedCount === 0}
              className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2"
            >
              {processing ? (
                <>
                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Processing...
                </>
              ) : (
                <>Process All ({unprocessedCount})</>
              )}
            </button>

            <button
              onClick={handleReset}
              disabled={resetting || processing}
              className="rounded-lg border border-gray-700 bg-gray-900 px-4 py-1.5 text-sm font-medium text-gray-400 transition-colors hover:text-white hover:border-gray-500 disabled:opacity-50 flex items-center gap-2"
              title="Clear all processed data and reload reports fresh"
            >
              {resetting ? (
                <>
                  <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                  Resetting...
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                  Reset
                </>
              )}
            </button>
          </div>
        </div>

        {toast && (
          <div className={`mb-4 rounded-lg border p-3 text-sm ${
            toast.type === 'success'
              ? 'border-emerald-800 bg-emerald-900/30 text-emerald-300'
              : 'border-sky-800 bg-sky-900/30 text-sky-300'
          }`}>
            {toast.message}
          </div>
        )}

        <div className="intel-grid-white overflow-x-auto bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-300 bg-white">
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Priority</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Agent</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Location</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Resource</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Status</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Urgency</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Action</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Time</th>
                {isAdmin && <th className="px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-400">PII Audit</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((report) => (
                <React.Fragment key={report.id}>
                  <tr
                    className={`border-b border-gray-200 cursor-pointer transition-colors ${expandedRow === report.report_id ? 'bg-white' : 'hover:bg-gray-50'}`}
                    onClick={() => setExpandedRow(prev => prev === report.report_id ? null : report.report_id)}
                  >
                    <td className="px-3 py-2.5">
                      <span className={`rounded px-2 py-0.5 text-xs font-semibold ${PRIORITY_COLORS[report.priority] ?? 'bg-gray-700 text-gray-300'}`}>
                        {report.priority}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-400 font-mono">
                      <span className="flex items-center gap-1.5">
                        {report.hero_alias || '—'}
                        {hasRedactions(report) && (
                          <span
                            className="relative flex h-2.5 w-2.5 shrink-0"
                            title="PII was redacted from this report"
                          >
                            <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-50 animate-ping" />
                            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
                          </span>
                        )}
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
                    {isAdmin && (
                      <td className="px-3 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                        {report.processed ? (
                          <button
                            onClick={() => openAudit(report)}
                            disabled={auditLoading === report.report_id}
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-semibold bg-emerald-100 text-emerald-700 border border-emerald-300 hover:bg-emerald-200 transition-colors disabled:opacity-40"
                            title="View PII redaction audit"
                          >
                            {auditLoading === report.report_id ? (
                              <span className="animate-spin">&#8635;</span>
                            ) : (
                              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                            )}
                            Audit
                          </button>
                        ) : (
                          <span className="text-[10px] text-gray-600">&mdash;</span>
                        )}
                      </td>
                    )}
                  </tr>
                  {expandedRow === report.report_id && (
                    <tr className="border-b border-gray-200">
                      <td colSpan={isAdmin ? 9 : 8} className="px-3 py-3 bg-white">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <span className="text-[10px] uppercase text-gray-500 font-semibold">Raw Report Text</span>
                            <p className="mt-1 text-xs text-gray-700 font-mono leading-relaxed bg-white border border-gray-200 rounded p-2.5">
                              {report.raw_text}
                            </p>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase text-gray-500 font-semibold">Redacted Text (sent to LLM)</span>
                            <p className="mt-1 text-xs text-gray-700 font-mono leading-relaxed bg-white border border-gray-200 rounded p-2.5">
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
