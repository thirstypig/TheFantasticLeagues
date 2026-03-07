
import React, { useState, useEffect, useCallback } from 'react';
import { getLeague } from '../../../api';
import { getCommissionerRosters, assignRosterKeeper, releaseRosterEntry } from '../api';
import { fetchJsonApi } from '../../../api/base';

interface KeeperManagerProps {
    leagueId: number;
}

interface Player {
    id: number | string;
    mlbId?: number;
    name: string;
    position: string;
    team: string; // MLB Team
}

interface Team {
    id: number;
    name: string;
}

interface RosterItem {
    id: number;
    teamId: number;
    player: {
        id: number;
        name: string;
        posPrimary: string;
    };
    price: number;
    source?: string;
}

export default function CommissionerKeeperManager({ leagueId }: KeeperManagerProps) {
    const [teams, setTeams] = useState<Team[]>([]);
    const [rosters, setRosters] = useState<RosterItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState('');
    const [searchResults, setSearchResults] = useState<Player[]>([]);
    const [selectedTeamId, setSelectedTeamId] = useState<string>('');
    const [bid, setBid] = useState(1);
    const [processing, setProcessing] = useState(false);

    // Load Data
    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            // 1. Get Teams
            const lRes = await getLeague(leagueId);
            setTeams(lRes.league?.teams || []);

            // 2. Get Rosters
            const rosterData = await getCommissionerRosters(leagueId);
            setRosters(rosterData);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [leagueId]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    // Search Logic
    useEffect(() => {
        if (!query || query.length < 2) {
            setSearchResults([]);
            return;
        }
        const t = setTimeout(async () => {
             const data = await fetchJsonApi<any>(`/api/archive/search-mlb?query=${encodeURIComponent(query)}`);
             setSearchResults(data.players || []);
        }, 300);
        return () => clearTimeout(t);
    }, [query]);

    const handleAddKeeper = async (player: Player) => {
        if (!selectedTeamId) return alert("Select a team first.");
        setProcessing(true);
        try {
             await assignRosterKeeper(leagueId, {
                teamId: Number(selectedTeamId),
                mlbId: player.mlbId,
                name: player.name,
                posPrimary: player.position,
                price: bid,
                source: 'keeper',
             });
             setQuery('');
             setSearchResults([]);
             refresh();
        } catch (e) {
            alert("Failed to add keeper");
        } finally {
            setProcessing(false);
        }
    };

    const handleRemove = async (rosterId: number) => {
        if(!confirm("Remove this keeper?")) return;
        setProcessing(true);
         try {
             await releaseRosterEntry(leagueId, rosterId);
             refresh();
        } catch (e) {
            alert("Failed to remove");
        } finally {
            setProcessing(false);
        }
    };

    const keeperRosters = rosters.filter(r => r.source && r.source.toLowerCase().includes('keeper'));

    if (loading && teams.length === 0) return <div className="text-white/50">Loading keepers...</div>;

    return (
        <div className={`space-y-6 ${processing ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="flex gap-4">
                 <div className="w-1/3 space-y-4">
                     <h3 className="font-bold text-lg text-white">Add Keeper</h3>
                     <select 
                        className="w-full p-2 bg-slate-950 border border-[var(--lg-border-subtle)] rounded-xl text-white outline-none"
                        value={selectedTeamId}
                        onChange={e => setSelectedTeamId(e.target.value)}
                     >
                         <option value="">Select Team...</option>
                         {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                     </select>
                     
                     <div className="relative">
                         <input 
                            className="w-full p-2 bg-slate-950 border border-[var(--lg-border-subtle)] rounded-xl text-white outline-none"
                            placeholder="Search Player (MLB)..."
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                         />
                         {searchResults.length > 0 && (
                             <div className="absolute top-full left-0 right-0 bg-slate-800 border border-[var(--lg-border-subtle)] max-h-60 overflow-auto z-10 rounded-xl mt-1 shadow-lg">
                                 {searchResults.map(p => (
                                     <div 
                                        key={p.id} 
                                        className="p-2 hover:bg-slate-700 cursor-pointer flex justify-between text-sm text-white border-b border-[var(--lg-border-faint)] last:border-0"
                                        onClick={() => handleAddKeeper(p)}
                                     >
                                         <span>{p.name} <span className="text-white/50">({p.position})</span></span>
                                         <span className="text-xs text-white/40">{p.team}</span>
                                     </div>
                                 ))}
                             </div>
                         )}
                     </div>

                     <div className="flex items-center gap-2">
                         <label className="text-white text-sm">Cost:</label>
                         <input 
                            type="number" 
                            className="p-2 bg-slate-950 border border-[var(--lg-border-subtle)] rounded-xl w-24 text-white outline-none"
                            value={bid}
                            onChange={e => setBid(Number(e.target.value))}
                         />
                     </div>
                     {processing && <div className="text-xs text-sky-400 animate-pulse">Processing...</div>}
                 </div>

                 <div className="w-2/3">
                     <h3 className="font-bold text-lg mb-4 text-white">Assigned Keepers</h3>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[500px] overflow-y-auto pr-2">
                         {teams.map(t => {
                             const teamKeepers = keeperRosters.filter(r => r.teamId === t.id);
                             if (teamKeepers.length === 0) return null;
                             return (
                                 <div key={t.id} className="bg-slate-950/50 p-3 rounded-xl border border-[var(--lg-border-subtle)]">
                                     <div className="font-bold text-sky-400 mb-2 text-sm">{t.name}</div>
                                     <div className="space-y-1">
                                         {teamKeepers.map(r => (
                                             <div key={r.id} className="flex justify-between items-center text-xs group hover:bg-[var(--lg-tint)] p-1 rounded">
                                                 <span className="text-white">{r.player.name} <span className="text-amber-400 font-mono">(${r.price})</span></span>
                                                 <button 
                                                    onClick={() => handleRemove(r.id)}
                                                    className="text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                                 >
                                                     ✕
                                                 </button>
                                             </div>
                                         ))}
                                     </div>
                                 </div>
                             )
                         })}
                     </div>
                 </div>
            </div>
        </div>
    );
}
