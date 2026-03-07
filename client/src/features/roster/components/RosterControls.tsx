
import React, { useState, useEffect, useRef } from 'react';
import { fetchJsonApi, fetchWithAuth } from '../../../api/base';

interface Team {
  id: number;
  name: string;
}

interface RosterControlsProps {
  leagueId: number;
  teams: Team[];
  onUpdate: () => void;
}

export default function RosterControls({ leagueId, teams, onUpdate }: RosterControlsProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [bid, setBid] = useState<number>(1);
  const [position, setPosition] = useState<string>('');
  const [isKeeper, setIsKeeper] = useState(false);
  
  // Search State
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ id: string; name: string; position: string; team: string; mlbId: number }[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedMlbPlayer, setSelectedMlbPlayer] = useState<{ id: string; name: string; position: string; team: string; mlbId: number } | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importLogs, setImportLogs] = useState<string[]>([]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Search Effect
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.length < 2) {
        setResults([]);
        return;
      }
      try {
        const data = await fetchJsonApi<any>(`/api/archive/search-mlb?query=${encodeURIComponent(query)}`);
        setResults(data.players || []);
        setShowDropdown(true);
      } catch (e) {
        console.error("Search failed", e);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const handleSelectPlayer = (player: { id: string; name: string; position: string; team: string; mlbId: number }) => {
    setSelectedMlbPlayer(player);
    setQuery(player.name);
    setPosition(player.position !== 'P' ? player.position : 'P');
    setShowDropdown(false);
  };

  const handleAssign = async () => {
    if (!selectedTeamId || !selectedMlbPlayer) {
       setError("Select a team and player");
       return;
    }

    try {
      setLoading(true);
      await fetchJsonApi(`/api/commissioner/${leagueId}/roster/assign`, {
        method: 'POST',
        body: JSON.stringify({
          teamId: Number(selectedTeamId),
          mlbId: selectedMlbPlayer.mlbId,
          name: selectedMlbPlayer.name,
          posPrimary: position,
          price: Number(bid),
          source: isKeeper ? 'keeper_2025' : 'manual'
        })
      });
      
      // Reset form
      setQuery('');
      setSelectedMlbPlayer(null);
      setBid(1);
      onUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!importFile) return;
    setImporting(true);
    const formData = new FormData();
    formData.append('file', importFile);
    
    try {
        const res = await fetchWithAuth(`/api/commissioner/${leagueId}/roster/import`, {
            method: 'POST',
            body: formData,
        });
        const data = await res.json();
        if (data.success) {
            setImportLogs(data.logs);
            onUpdate();
        } else {
            setError(data.error);
        }
    } catch(e) {
        setError(e instanceof Error ? e.message : String(e));
    } finally {
        setImporting(false);
    }
  };

  return (
       <div className="grid gap-6 lg:grid-cols-2">
         {/* Manual Entry Pane */}
         <div className="rounded-2xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] p-5">
           <h3 className="mb-4 text-lg font-semibold text-white">Manual Entry</h3>
           
           <div className="space-y-4">
             {/* Player Search */}
             <div className="relative" ref={searchRef}>
               <label className="text-xs text-white/60 block mb-1">Player Search (MLB)</label>
               <input 
                 className="w-full rounded-xl border border-[var(--lg-border-subtle)] bg-slate-950/60 px-3 py-2 text-sm text-white outline-none focus:border-[var(--lg-border-subtle)]"
                 placeholder="Type player name..."
                 value={query}
                 onChange={(e) => {
                    setQuery(e.target.value);
                    if(!e.target.value) setSelectedMlbPlayer(null);
                 }}
               />
               
               {showDropdown && results.length > 0 && (
                 <div className="absolute z-10 w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                   {results.map(p => (
                     <div 
                       key={p.id}
                       className="px-4 py-2 hover:bg-slate-700 cursor-pointer text-sm text-white flex justify-between"
                       onClick={() => handleSelectPlayer(p)}
                     >
                        <span>{p.name} <span className='text-white/50'>({p.position})</span></span>
                        <span className='text-xs text-white/40'>{p.team}</span>
                     </div>
                   ))}
                 </div>
               )}
             </div>

             {/* MLB Team Display (Read Only) */}
             <div>
                <label className="text-xs text-white/60 block mb-1">MLB Team</label>
                <div className="w-full rounded-xl border border-[var(--lg-border-subtle)] bg-slate-900/40 px-3 py-2 text-sm text-white/70">
                    {selectedMlbPlayer?.team || '—'}
                </div>
             </div>
             
             <div className="grid grid-cols-2 gap-4">
               <div>
                  <label className="text-xs text-white/60 block mb-1">Fantasy Team</label>
                  <select 
                    className="w-full rounded-xl border border-[var(--lg-border-subtle)] bg-slate-950/60 px-3 py-2 text-sm text-white outline-none focus:border-[var(--lg-border-subtle)]"
                    value={selectedTeamId}
                    onChange={(e) => setSelectedTeamId(e.target.value)}
                  >
                     <option value="">Select Team...</option>
                     {teams.map(t => (
                         <option key={t.id} value={t.id}>{t.name}</option>
                     ))}
                  </select>
               </div>
               <div>
                  <label className="text-xs text-white/60 block mb-1">Position (Editable)</label>
                  <input 
                    className="w-full rounded-xl border border-[var(--lg-border-subtle)] bg-slate-950/60 px-3 py-2 text-sm text-white outline-none focus:border-[var(--lg-border-subtle)]"
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                  />
               </div>
             </div>

             <div>
                <label className="text-xs text-white/60 block mb-1">Bid Amount ($)</label>
                <input 
                   type="number"
                   className="w-full rounded-xl border border-[var(--lg-border-subtle)] bg-slate-950/60 px-3 py-2 text-sm text-white outline-none focus:border-[var(--lg-border-subtle)]"
                   value={bid}
                   onChange={(e) => setBid(Number(e.target.value))}
                />
             </div>

             <div className="flex items-center gap-2 mb-2">
                <input 
                    type="checkbox" 
                    id="isKeeper"
                    className="rounded border-[var(--lg-border-subtle)] bg-slate-950/60 text-blue-600 focus:ring-blue-500"
                    checked={isKeeper}
                    onChange={(e) => setIsKeeper(e.target.checked)}
                />
                <label htmlFor="isKeeper" className="text-sm text-white select-none cursor-pointer">
                    Assign as 2025 Keeper 
                    <span className="text-xs text-white/50 block">Source: {isKeeper ? 'keeper_2025' : 'manual'} (Protected from Auction Reset)</span>
                </label>
             </div>

             <button 
                className="w-full rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
                onClick={handleAssign}
                disabled={loading || !selectedTeamId || !selectedMlbPlayer}
             >
                {loading ? 'Assign Player' : 'Assign Player'}
             </button>
             
             {error && <div className="text-red-400 text-sm mt-2">{error}</div>}
           </div>
         </div>

         {/* Import Pane */}
         <div className="rounded-2xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] p-5">
            <h3 className="mb-4 text-lg font-semibold text-white">Bulk Data Import</h3>
            <div className="space-y-4">
                <input 
                   type="file"
                   accept=".csv"
                   className="text-sm text-white/80 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-[var(--lg-tint-hover)] file:text-white hover:file:bg-[var(--lg-tint-hover)]"
                   onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                />
                <button
                   className="block w-full rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-500 disabled:opacity-50"
                   onClick={handleImport}
                   disabled={importing || !importFile}
                >
                    {importing ? 'Importing...' : 'Upload Rosters'}
                </button>
                {importLogs.length > 0 && (
                    <div className="mt-4 p-3 bg-slate-950/50 rounded-xl text-xs text-slate-400 font-mono h-40 overflow-y-auto">
                        {importLogs.map((log, i) => <div key={i}>{log}</div>)}
                    </div>
                )}
            </div>
         </div>
       </div>
  );
}
