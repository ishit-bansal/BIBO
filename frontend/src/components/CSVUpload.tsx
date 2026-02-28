import { useState, useRef } from 'react';
import { uploadCSV } from '../services/api';

export default function CSVUpload() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ status: string; records_imported: number } | null>(null);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await uploadCSV(file);
      setResult(res);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-800 bg-[#0d1220] p-5">
      <h2 className="mb-4 text-lg font-semibold text-white">Upload Resource Data</h2>

      <p className="mb-4 text-sm text-gray-400">
        Upload a CSV file with columns: <code className="text-emerald-400">timestamp</code>,{' '}
        <code className="text-emerald-400">sector_id</code>,{' '}
        <code className="text-emerald-400">resource_type</code>,{' '}
        <code className="text-emerald-400">stock_level</code>,{' '}
        <code className="text-emerald-400">usage_rate_hourly</code>
      </p>

      <div className="space-y-3">
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 file:mr-3 file:rounded file:border-0 file:bg-emerald-600 file:px-3 file:py-1 file:text-sm file:font-medium file:text-white"
        />
        <button
          onClick={handleUpload}
          disabled={loading}
          className="w-full rounded bg-emerald-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
        >
          {loading ? 'Uploading...' : 'Upload CSV'}
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded border border-red-800 bg-red-900/30 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-4 rounded border border-emerald-800 bg-emerald-900/30 p-3 text-sm text-emerald-300">
          Successfully imported {result.records_imported} records.
        </div>
      )}
    </div>
  );
}
