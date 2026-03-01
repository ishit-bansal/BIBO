import { useState } from 'react';
import { submitReport } from '../services/api';
import type { IntelReport } from '../services/api';

const SAMPLE_REPORTS = [
  'Urgent: Avengers Compound is critically low on Arc Reactor Cores. This is Tony Stark, call me at 555-0101 (Iron Line). The civilians are worried.',
  'Heavy combat in Sanctum Sanctorum. Pym Particles supply chain is compromised. Need backup. - Natasha Romanoff, 555-0199 (Black Widow Comms)',
  'Just a heads up, Sokovia is out of Vibranium (kg). This is Thor Odinson, call me back at 555-GOD-OF-THUNDER.',
];

function PipelineStep({ step, label, status, children }: {
  step: number;
  label: string;
  status: 'pending' | 'active' | 'done';
  children?: React.ReactNode;
}) {
  const borderColor = status === 'done' ? 'border-emerald-700/50' : status === 'active' ? 'border-blue-700/50 animate-pulse' : 'border-gray-800';
  const bgColor = status === 'done' ? 'bg-emerald-950/20' : status === 'active' ? 'bg-blue-950/20' : 'bg-gray-900/30';
  const numBg = status === 'done' ? 'bg-emerald-600' : status === 'active' ? 'bg-blue-600' : 'bg-gray-700';

  return (
    <div className={`rounded-lg border ${borderColor} ${bgColor} p-3`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold text-white ${numBg}`}>{step}</span>
        <span className="text-xs font-semibold text-gray-300">{label}</span>
        {status === 'done' && (
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400 ml-auto"><polyline points="20 6 9 17 4 12"/></svg>
        )}
        {status === 'active' && (
          <span className="ml-auto text-[10px] text-blue-400 font-semibold animate-pulse">PROCESSING...</span>
        )}
      </div>
      {children}
    </div>
  );
}

export default function ReportForm() {
  const [rawText, setRawText] = useState('');
  const [heroAlias, setHeroAlias] = useState('');
  const [priority, setPriority] = useState('Routine');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IntelReport | null>(null);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawText.trim()) return;

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const report = await submitReport({
        raw_text: rawText,
        hero_alias: heroAlias || 'Unknown',
        priority,
      });
      setResult(report);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit report');
    } finally {
      setLoading(false);
    }
  };

  const loadSample = () => {
    const sample = SAMPLE_REPORTS[Math.floor(Math.random() * SAMPLE_REPORTS.length)];
    setRawText(sample);
  };

  const piiDetected = rawText && (
    /Tony Stark|Natasha Romanoff|Thor Odinson|Peter Parker|Steve Rogers|Bruce Banner|Wanda Maximoff|Clint Barton|Scott Lang|Carol Danvers|T'Challa|Stephen Strange|Nick Fury|Bucky Barnes|Sam Wilson/i.test(rawText) ||
    /555-[\w-]+/.test(rawText)
  );

  return (
    <div className="field-report-light space-y-4">
      <div className="rounded-lg border border-gray-800 bg-[#0d1220] p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Submit Field Report</h2>
          <button
            type="button"
            onClick={loadSample}
            className="text-[10px] font-semibold rounded px-2.5 py-1 bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200 transition-colors border border-gray-700"
          >
            LOAD SAMPLE REPORT
          </button>
        </div>

        <form onSubmit={handleSubmit} className="field-report-light space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm text-gray-400">Agent Alias</label>
              <input
                type="text"
                value={heroAlias}
                onChange={(e) => setHeroAlias(e.target.value)}
                placeholder="e.g. Tony Stark"
                className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-400">Priority Level</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-emerald-500 focus:outline-none"
              >
                <option value="Routine">Routine</option>
                <option value="High">High</option>
                <option value="Avengers Level Threat">Avengers Level Threat</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm text-gray-400">Raw Intelligence Report</label>
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              rows={4}
              placeholder="Enter field report text... Include hero names and contact numbers to see PII redaction in action."
              className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-emerald-500 focus:outline-none font-mono"
            />
          </div>

          {/* Live PII detection preview */}
          {piiDetected && !result && (
            <div className="rounded-lg border border-amber-800/50 bg-amber-950/20 px-3 py-2 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-400 shrink-0"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              <span className="text-xs text-amber-300">
                PII detected in report text — hero names and contact numbers will be automatically redacted before AI processing.
              </span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !rawText.trim()}
            className="w-full rounded bg-emerald-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            {loading ? 'Running Security Pipeline...' : 'Submit & Analyze'}
          </button>
        </form>
      </div>

      {/* Pipeline Result Visualization */}
      {(loading || result) && (
        <div className="rounded-lg border border-gray-800 bg-[#0d1220] p-5">
          <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase tracking-wider">Processing Pipeline</h3>
          <div className="space-y-3">
            <PipelineStep step={1} label="Raw Report Received" status={loading ? 'active' : 'done'}>
              <p className="text-xs text-gray-400 font-mono bg-gray-800/40 rounded p-2 leading-relaxed">
                {result?.raw_text || rawText}
              </p>
            </PipelineStep>

            <PipelineStep step={2} label="PII Redaction (Server-side)" status={loading ? 'pending' : result ? 'done' : 'pending'}>
              {result?.redacted_text && (
                <p className="text-xs text-gray-300 font-mono bg-gray-800/40 rounded p-2 leading-relaxed">
                  {result.redacted_text.split(/(\[REDACTED_(?:NAME|CONTACT)\])/).map((part, i) =>
                    part.match(/\[REDACTED_/) ? (
                      <span key={i} className="inline-block rounded px-1 py-0.5 bg-emerald-500/30 border border-emerald-500/50 text-emerald-300 font-semibold">{part}</span>
                    ) : (
                      <span key={i}>{part}</span>
                    )
                  )}
                </p>
              )}
            </PipelineStep>

            <PipelineStep step={3} label="Gemini LLM Entity Extraction" status={loading ? 'pending' : result?.structured_data ? 'done' : 'pending'}>
              {result?.structured_data && (
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded bg-gray-800/40 p-2">
                    <span className="text-gray-500 block">Location</span>
                    <span className="text-gray-200 font-semibold">{result.structured_data.location}</span>
                  </div>
                  <div className="rounded bg-gray-800/40 p-2">
                    <span className="text-gray-500 block">Resource</span>
                    <span className="text-gray-200 font-semibold">{result.structured_data.resource_mentioned}</span>
                  </div>
                  <div className="rounded bg-gray-800/40 p-2">
                    <span className="text-gray-500 block">Status</span>
                    <span className="capitalize text-gray-200 font-semibold">{result.structured_data.status}</span>
                  </div>
                  <div className="rounded bg-gray-800/40 p-2">
                    <span className="text-gray-500 block">Urgency</span>
                    <span className="capitalize text-gray-200 font-semibold">{result.structured_data.urgency}</span>
                  </div>
                  <div className="col-span-2 rounded bg-gray-800/40 p-2">
                    <span className="text-gray-500 block">Action Required</span>
                    <span className="text-gray-200 font-semibold">{result.structured_data.action_required}</span>
                  </div>
                </div>
              )}
            </PipelineStep>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-900/30 p-3 text-sm text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}
