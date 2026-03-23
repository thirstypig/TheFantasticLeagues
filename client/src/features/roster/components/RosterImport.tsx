import React, { useState } from 'react';
import { fetchWithAuth, API_BASE } from '../../../api/base';

interface RosterImportProps {
  year: number;
  onImportComplete?: () => void;
}

export default function RosterImport({ year, onImportComplete }: RosterImportProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
      setLogs([]);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError(null);
    setLogs(['Starting CSV import...']);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('year', String(year));

    try {
      const response = await fetchWithAuth(`${API_BASE}/roster/import`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Import failed');
      }

      setLogs((prev) => [...prev, ...data.logs, '✅ Import Complete!']);
      setFile(null);
      onImportComplete?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      setLogs((prev) => [...prev, `❌ Error: ${msg}`]);
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadTemplate = () => {
    window.location.href = '/api/roster/import/template';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Import Roster from CSV</h3>
        <button
          onClick={handleDownloadTemplate}
          className="text-sm px-3 py-1 rounded bg-[var(--lg-tint)] hover:bg-[var(--lg-tint-hover)] text-[var(--lg-text-primary)]"
        >
          Download Template
        </button>
      </div>

      <p className="text-sm text-[var(--lg-text-secondary)]">
        Upload a CSV file with columns: <code>teamCode, playerName, position, mlbTeam, acquisitionCost</code>.
        Players will be added to rosters for year <strong>{year}</strong>.
      </p>

      <div
        className="border-2 border-dashed rounded-lg p-6 text-center border-[var(--lg-border-subtle)] hover:border-[var(--lg-accent)]"
      >
        <input
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />
        {file && (
          <div className="mt-3">
            <span className="font-medium">Selected: {file.name}</span>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleUpload}
          disabled={!file || uploading}
          className={`px-4 py-2 rounded font-medium ${
            !file || uploading
              ? 'bg-[var(--lg-tint)] text-[var(--lg-text-muted)] cursor-not-allowed'
              : 'bg-[var(--lg-accent)] hover:bg-[var(--lg-accent-hover)] text-white'
          }`}
        >
          {uploading ? 'Importing...' : 'Import CSV'}
        </button>
      </div>

      {/* Logs / Output */}
      {(logs.length > 0 || error) && (
        <div
          className="p-4 rounded text-sm font-mono max-h-40 overflow-y-auto bg-[var(--lg-tint)] text-[var(--lg-text-secondary)]"
        >
          {logs.map((log, i) => (
            <div key={i} className="mb-1">
              {log}
            </div>
          ))}
          {error && <div className="text-red-500 font-bold">{error}</div>}
        </div>
      )}
    </div>
  );
}
