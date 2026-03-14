import React, { useState } from 'react';
import { fetchWithAuth, fetchJsonApi } from '../../../api/base';
import { useToast } from "../../../contexts/ToastContext";


interface ArchiveAdminPanelProps {
  year: number;
}

type AdminTab = 'archive' | 'roster';

export default function ArchiveAdminPanel({ year }: ArchiveAdminPanelProps) {
  const { confirm } = useToast();
  const [activeTab, setActiveTab] = useState<AdminTab>('archive');
  const [selectedYear, setSelectedYear] = useState<number>(year);
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
    setLogs(['Starting upload...']);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetchWithAuth(`/api/archive/${selectedYear}/import-excel`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      setLogs(prev => [...prev, ...data.logs, '✅ Import Complete!']);
      setFile(null); // Reset
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      setLogs(prev => [...prev, `❌ Error: ${msg}`]);
    } finally {
      setUploading(false);
    }
  };

  const handleSyncSeason = async () => {
    setUploading(true);
    setError(null);
    setLogs([`Starting full sync for ${selectedYear} (Auto-match + Stats)...`]);

    try {
      const data = await fetchJsonApi<{ logs?: string[] }>(`/api/archive/${selectedYear}/sync`, {
        method: 'POST',
      });

      setLogs(prev => [...prev, ...(data.logs || []), '✅ Season Sync Complete!']);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      setLogs(prev => [...prev, `❌ Error: ${msg}`]);
    } finally {
      setUploading(false);
    }
  };

  const handleAutoMatch = async (all: boolean) => {
    setUploading(true);
    setError(null);
    setLogs([`Starting auto-match for ${all ? 'all seasons' : selectedYear}...`]);

    try {
      const url = all ? '/api/archive/auto-match-all' : `/api/archive/${selectedYear}/auto-match`;
      const data = await fetchJsonApi<{ results?: { year: number; matched: number; unmatched: number }[]; matched?: number; unmatched?: number }>(url, {
        method: 'POST',
      });

      if (all) {
        const results = (data.results || []).map((r) => `Year [${r.year}]: Matched ${r.matched}, Unmatched ${r.unmatched}`);
        setLogs(prev => [...prev, ...results, '✅ Global Auto-Match Complete!']);
      } else {
        setLogs(prev => [...prev, `Matched ${data.matched} players, ${data.unmatched} unmatched.`, '✅ Season Auto-Match Complete!']);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      setLogs(prev => [...prev, `❌ Error: ${msg}`]);
    } finally {
      setUploading(false);
    }
  };

  const handleArchiveSeason = async () => {
    if (!await confirm("Are you sure you want to archive the current live season? This will overwrite any existing archive for that year.")) {
      return;
    }

    setUploading(true);
    setError(null);
    setLogs([`Starting live season archival...`]);

    try {
      const data = await fetchJsonApi<{ logs?: string[] }>(`/api/archive/archive-current`, {
        method: 'POST',
      });

      setLogs(prev => [...prev, ...(data.logs || []), '✅ Archiving Complete!']);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      setLogs(prev => [...prev, `❌ Error: ${msg}`]);
    } finally {
      setUploading(false);
    }
  };

  const handleRecalculateAll = async () => {
    if (!await confirm("Are you sure you want to recalculate stats and teams for ALL historical seasons? This will take several minutes.")) {
      return;
    }

    setUploading(true);
    setError(null);
    setLogs([`Starting global recalculation for all seasons...`]);

    try {
      const data = await fetchJsonApi<{ totalUpdated: number }>(`/api/archive/recalculate-all`, {
        method: 'POST',
      });

      setLogs(prev => [...prev, `Updated ${data.totalUpdated} player records across all seasons.`, '✅ Global Recalculation Complete!']);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      setLogs(prev => [...prev, `❌ Error: ${msg}`]);
    } finally {
      setUploading(false);
    }
  };

  const [showMaintenance, setShowMaintenance] = useState(false);

  return (
    <div className="bg-[var(--lg-tint)] border border-[var(--lg-border-subtle)] rounded-3xl overflow-hidden shadow-2xl liquid-glass">
      {/* Tab Navigation */}
      <div className="flex border-b border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] p-1">
        <button
          onClick={() => setActiveTab('archive')}
          className={`flex-1 px-8 py-4 text-xs font-medium uppercase transition-all rounded-2xl ${activeTab === 'archive'
            ? 'bg-[var(--lg-accent)] text-white shadow-lg' 
            : 'text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)] hover:bg-[var(--lg-tint)]'
          }`}
        >
          Archive Management
        </button>
      </div>

      {/* Archive Import Tab */}
      <div className="p-8">
          <div className="flex items-center justify-between mb-8 pb-8 border-b border-[var(--lg-border-faint)]">
            <div className="flex items-center gap-8">
              <h2 className="text-2xl font-semibold uppercase text-[var(--lg-text-heading)]">Data Management</h2>
              <div className="flex items-center gap-4 bg-[var(--lg-tint)] px-4 py-2 rounded-2xl border border-[var(--lg-border-subtle)]">
                <label className="text-xs font-medium uppercase text-[var(--lg-text-muted)]">Season</label>
                <input 
                  type="number" 
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                  className="w-20 bg-transparent text-sm font-bold text-[var(--lg-text-primary)] outline-none"
                />
              </div>
            </div>
          </div>
      
      <div className="mb-10 p-6 rounded-2xl bg-amber-500/[0.03] border border-amber-500/10">
        <p className="text-xs font-medium text-amber-200/60 leading-relaxed italic">
          Import or sync data for the selected season. This will overwrite existing records.
        </p>
      </div>

      {/* Admin Actions Table */}
      <div className="mb-10 rounded-2xl border border-[var(--lg-border-faint)] overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[var(--lg-tint)] border-b border-[var(--lg-border-faint)] text-xs font-medium uppercase text-[var(--lg-text-muted)]">
              <th className="px-6 py-4 text-left">Action</th>
              <th className="px-6 py-4 text-left">Status</th>
              <th className="px-6 py-4 text-center w-40">Run</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--lg-divide)]">
            <tr>
              <td className="px-4 py-3 font-medium">Import Excel</td>
              <td className="px-4 py-3">
                <div className="flex flex-col gap-2">
                  <span>Upload .xlsx to overwrite draft/standings/periods.</span>
                  <input 
                    type="file" 
                    accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" 
                    onChange={handleFileChange}
                    className="text-xs"
                  />
                </div>
              </td>
              <td className="px-4 py-3 text-center">
                <button onClick={handleUpload} disabled={!file || uploading} className="px-5 py-2.5 rounded-xl text-xs font-medium uppercase bg-[var(--lg-accent)] text-white hover:brightness-110 disabled:opacity-20 disabled:grayscale transition-all shadow-lg shadow-red-500/10">
                  {uploading ? 'Processing' : 'Execute'}
                </button>
              </td>
            </tr>
            <tr>
              <td className="px-4 py-3 font-medium">Sync MLB Data</td>
              <td className="px-4 py-3">Matches players to MLB IDs and fetches latest stats/teams for the entire {selectedYear} season.</td>
              <td className="px-4 py-3 text-center">
                <button onClick={handleSyncSeason} disabled={uploading} className="px-5 py-2.5 rounded-xl text-xs font-medium uppercase border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] text-[var(--lg-text-primary)] hover:bg-[var(--lg-tint-hover)] disabled:opacity-20 transition-all">
                  Sync
                </button>
              </td>
            </tr>
            <tr>
              <td className="px-4 py-3 font-medium">Archive Live Season</td>
              <td className="px-4 py-3">Snapshot current season rosters/stats into the historical archive.</td>
              <td className="px-4 py-3 text-center">
                <button onClick={handleArchiveSeason} disabled={uploading} className="px-5 py-2.5 rounded-xl text-xs font-medium uppercase border border-amber-500/20 bg-amber-500/5 text-amber-500 hover:bg-amber-500/10 disabled:opacity-20 transition-all">
                  Archive
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Maintenance Section */}
      <div className="mt-12 pt-8 border-t border-[var(--lg-border-faint)]">
        <button 
          onClick={() => setShowMaintenance(!showMaintenance)}
          className="flex items-center gap-3 text-xs font-medium uppercase text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)] transition-all"
        >
          <span className={`w-6 h-6 rounded-lg flex items-center justify-center bg-[var(--lg-tint)] border border-[var(--lg-border-subtle)] transition-transform ${showMaintenance ? 'rotate-90' : ''}`}>▶</span>
          Maintenance Operations
        </button>
        
        {showMaintenance && (
          <div className="mt-8 flex flex-wrap gap-4">
            <button onClick={() => handleAutoMatch(true)} disabled={uploading} className="px-5 py-2.5 rounded-xl text-xs font-medium uppercase border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] text-[var(--lg-text-primary)] hover:bg-[var(--lg-tint-hover)] disabled:opacity-20 transition-all">
              Global Auto-Match
            </button>
            <button onClick={handleRecalculateAll} disabled={uploading} className="px-5 py-2.5 rounded-xl text-xs font-medium uppercase border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] text-[var(--lg-text-primary)] hover:bg-[var(--lg-tint-hover)] disabled:opacity-20 transition-all">
              Global Recalculate
            </button>
          </div>
        )}
      </div>

      {/* Logs / Output */}
      {(logs.length > 0 || error) && (
        <div className="mt-10 p-6 rounded-3xl text-sm font-mono max-h-80 overflow-y-auto bg-[var(--lg-bg-secondary)] border border-[var(--lg-border-subtle)] text-emerald-400 backdrop-blur-xl">
          <div className="flex justify-between items-center mb-4 border-b border-emerald-500/20 pb-4">
            <span className="text-xs uppercase font-medium text-emerald-500">Activity Log</span>
            <button onClick={() => setLogs([])} className="text-xs font-medium hover:text-[var(--lg-text-primary)] uppercase transition-all">Clear</button>
          </div>
          <div className="space-y-1">
            {logs.map((log, i) => (
              <div key={i} className="flex gap-4">
                <span className="opacity-20 text-xs font-bold">[{i.toString().padStart(3, '0')}]</span>
                <span className="text-xs">{log}</span>
              </div>
            ))}
          </div>
          {error && <div className="text-rose-400 mt-6 font-bold p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 uppercase text-xs">Error: {error}</div>}
        </div>
      )}
      </div>
    </div>
  );
}
