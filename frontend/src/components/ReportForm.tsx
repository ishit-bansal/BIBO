import { useState } from 'react';
import { submitReport } from '../services/api';
import type { IntelReport } from '../services/api';

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
      setRawText('');
      setHeroAlias('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit report');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-800 bg-[#0d1220] p-5">
      <h2 className="mb-4 text-lg font-semibold text-white">Submit Field Report</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
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

        <div>
          <label className="mb-1 block text-sm text-gray-400">Raw Intelligence Report</label>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={5}
            placeholder="Enter field report text... (PII will be automatically redacted before AI processing)"
            className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-emerald-500 focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={loading || !rawText.trim()}
          className="w-full rounded bg-emerald-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
        >
          {loading ? 'Processing...' : 'Submit & Analyze'}
        </button>
      </form>

      {error && (
        <div className="mt-4 rounded border border-red-800 bg-red-900/30 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-4 space-y-3">
          <h3 className="text-sm font-semibold text-emerald-400">Report Processed Successfully</h3>

          <div className="rounded border border-gray-700 bg-gray-900 p-3">
            <p className="mb-1 text-xs font-medium uppercase text-gray-500">Redacted Text</p>
            <p className="text-sm text-gray-300">{result.redacted_text}</p>
          </div>

          {result.structured_data && (
            <div className="rounded border border-gray-700 bg-gray-900 p-3">
              <p className="mb-2 text-xs font-medium uppercase text-gray-500">Extracted Intelligence</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-gray-500">Location:</span> <span className="text-gray-200">{result.structured_data.location}</span></div>
                <div><span className="text-gray-500">Resource:</span> <span className="text-gray-200">{result.structured_data.resource_mentioned}</span></div>
                <div><span className="text-gray-500">Status:</span> <span className="text-gray-200">{result.structured_data.status}</span></div>
                <div><span className="text-gray-500">Urgency:</span> <span className="text-gray-200">{result.structured_data.urgency}</span></div>
                <div className="col-span-2"><span className="text-gray-500">Action:</span> <span className="text-gray-200">{result.structured_data.action_required}</span></div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
