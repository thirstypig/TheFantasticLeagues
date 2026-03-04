import React, { useState } from 'react';
import { supabase } from '../../../lib/supabase';


interface ArchiveAdminPanelProps {
  year: number;
}

type AdminTab = 'archive' | 'roster';

export default function ArchiveAdminPanel({ year }: ArchiveAdminPanelProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('archive');
  const [selectedYear, setSelectedYear] = useState<number>(year);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  };

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
      const token = await getToken(); // Simplistic auth
      // In real app, use axios instance or fetch wrapper from api.ts
      // But for file upload, fetch is easy.
      
      const response = await fetch(`/api/archive/${selectedYear}/import-excel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
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
      const token = await getToken();
      const response = await fetch(`/api/archive/${selectedYear}/sync`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Sync failed');
      }

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
      const token = await getToken();
      const url = all ? '/api/archive/auto-match-all' : `/api/archive/${selectedYear}/auto-match`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Auto-match failed');
      }

      if (all) {
        const results = data.results.map((r: { year: number; matched: number; unmatched: number }) => `Year [${r.year}]: Matched ${r.matched}, Unmatched ${r.unmatched}`);
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
    if (!window.confirm("Are you sure you want to archive the current live season? This will overwrite any existing archive for that year.")) {
      return;
    }

    setUploading(true);
    setError(null);
    setLogs([`Starting live season archival...`]);

    try {
      const token = await getToken();
      const response = await fetch(`/api/archive/archive-current`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Archiving failed');
      }

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
    if (!window.confirm("Are you sure you want to recalculate stats and teams for ALL historical seasons? This will take several minutes.")) {
      return;
    }

    setUploading(true);
    setError(null);
    setLogs([`Starting global recalculation for all seasons...`]);

    try {
      const token = await getToken();
      const response = await fetch(`/api/archive/recalculate-all`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Global recalculation failed');
      }

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
    <div className="bg-white/[0.02] border border-white/10 rounded-3xl overflow-hidden shadow-2xl liquid-glass">
      {/* Tab Navigation */}
      <div className="flex border-b border-white/10 bg-white/5 p-1">
        <button
          onClick={() => setActiveTab('archive')}
          className={`flex-1 px-8 py-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all rounded-2xl ${activeTab === 'archive' 
            ? 'bg-[var(--fbst-accent)] text-white shadow-lg' 
            : 'text-[var(--fbst-text-muted)] hover:text-white hover:bg-white/5'
          }`}
        >
          Archive Management System
        </button>
      </div>

      {/* Archive Import Tab */}
      <div className="p-8">
          <div className="flex items-center justify-between mb-8 pb-8 border-b border-white/5">
            <div className="flex items-center gap-8">
              <h2 className="text-2xl font-black uppercase tracking-tighter text-[var(--fbst-text-heading)]">Registry Control</h2>
              <div className="flex items-center gap-4 bg-white/5 px-4 py-2 rounded-2xl border border-white/10">
                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--fbst-text-muted)]">Target Cycle</label>
                <input 
                  type="number" 
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                  className="w-20 bg-transparent text-sm font-black text-white outline-none"
                />
              </div>
            </div>
          </div>
      
      <div className="mb-10 p-6 rounded-2xl bg-amber-500/[0.03] border border-amber-500/10">
        <p className="text-xs font-medium text-amber-200/60 leading-relaxed italic">
          Strategic data reconciliation for the selected cycle. Operation overrides existing ledger entries.
        </p>
      </div>

      {/* Admin Actions Table */}
      <div className="mb-10 rounded-2xl border border-white/5 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-white/5 border-b border-white/5 text-[10px] font-black uppercase tracking-widest text-[var(--fbst-text-muted)]">
              <th className="px-6 py-4 text-left">Protocol</th>
              <th className="px-6 py-4 text-left">Manifest</th>
              <th className="px-6 py-4 text-center w-40">Execution</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
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
                <button onClick={handleUpload} disabled={!file || uploading} className="px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest bg-[var(--fbst-accent)] text-white hover:brightness-110 disabled:opacity-20 disabled:grayscale transition-all shadow-lg shadow-red-500/10">
                  {uploading ? 'Processing' : 'Execute'}
                </button>
              </td>
            </tr>
            <tr>
              <td className="px-4 py-3 font-medium">Sync MLB Data</td>
              <td className="px-4 py-3">Matches players to MLB IDs and fetches latest stats/teams for the entire {selectedYear} season.</td>
              <td className="px-4 py-3 text-center">
                <button onClick={handleSyncSeason} disabled={uploading} className="px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border border-white/10 bg-white/5 text-white hover:bg-white/10 disabled:opacity-20 transition-all">
                  Sync Chain
                </button>
              </td>
            </tr>
            <tr>
              <td className="px-4 py-3 font-medium">Archive Live Season</td>
              <td className="px-4 py-3">Snapshot current season rosters/stats into the historical archive.</td>
              <td className="px-4 py-3 text-center">
                <button onClick={handleArchiveSeason} disabled={uploading} className="px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border border-amber-500/20 bg-amber-500/5 text-amber-500 hover:bg-amber-500/10 disabled:opacity-20 transition-all">
                  Commit State
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Maintenance Section */}
      <div className="mt-12 pt-8 border-t border-white/5">
        <button 
          onClick={() => setShowMaintenance(!showMaintenance)}
          className="flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--fbst-text-muted)] hover:text-white transition-all"
        >
          <span className={`w-6 h-6 rounded-lg flex items-center justify-center bg-white/5 border border-white/10 transition-transform ${showMaintenance ? 'rotate-90' : ''}`}>▶</span>
          Maintenance Operations
        </button>
        
        {showMaintenance && (
          <div className="mt-8 flex flex-wrap gap-4">
            <button onClick={() => handleAutoMatch(true)} disabled={uploading} className="px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border border-white/10 bg-white/5 text-white hover:bg-white/10 disabled:opacity-20 transition-all">
              Global Auto-Match
            </button>
            <button onClick={handleRecalculateAll} disabled={uploading} className="px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border border-white/10 bg-white/5 text-white hover:bg-white/10 disabled:opacity-20 transition-all">
              Global Recalculate
            </button>
          </div>
        )}
      </div>

      {/* Logs / Output */}
      {(logs.length > 0 || error) && (
        <div className="mt-10 p-6 rounded-3xl text-sm font-mono max-h-80 overflow-y-auto bg-black/40 border border-white/10 text-emerald-400 backdrop-blur-xl">
          <div className="flex justify-between items-center mb-4 border-b border-emerald-500/20 pb-4">
            <span className="text-[10px] uppercase font-black tracking-widest text-emerald-500">Kernel: Mission Logs</span>
            <button onClick={() => setLogs([])} className="text-[10px] font-black hover:text-white uppercase tracking-widest transition-all">Flush Buffer</button>
          </div>
          <div className="space-y-1">
            {logs.map((log, i) => (
              <div key={i} className="flex gap-4">
                <span className="opacity-20 text-[10px] font-black">[{i.toString().padStart(3, '0')}]</span>
                <span className="text-xs">{log}</span>
              </div>
            ))}
          </div>
          {error && <div className="text-rose-400 mt-6 font-black p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 uppercase text-xs">Error Vector: {error}</div>}
        </div>
      )}
      </div>
    </div>
  );
}
