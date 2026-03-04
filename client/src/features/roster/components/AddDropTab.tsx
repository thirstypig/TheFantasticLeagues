import React, { useState, useMemo } from 'react';
import { getPrimaryPosition } from '../../../lib/baseballUtils';
import { PlayerSeasonStat, fmtRate } from '../../../api';
import { ThemedTable, ThemedThead, ThemedTh, ThemedTr, ThemedTd } from "../../../components/ui/ThemedTable";

interface AddDropTabProps {
    players: PlayerSeasonStat[];
    onClaim: (player: PlayerSeasonStat) => void;
}

type SortKey = 'name' | 'mlb_team' | 'pos' | 'R' | 'HR' | 'RBI' | 'SB' | 'AVG' | 'W' | 'SV' | 'K' | 'ERA' | 'WHIP';

export default function AddDropTab({ players, onClaim }: AddDropTabProps) {
    const [search, setSearch] = useState('');
    const [posFilter, setPosFilter] = useState('ALL');
    const [viewGroup, setViewGroup] = useState<'hitters' | 'pitchers'>('hitters');
    const [sortKey, setSortKey] = useState<SortKey>('name');
    const [sortDesc, setSortDesc] = useState(false);

    const availablePlayers = useMemo(() => {
        return players.filter((p: PlayerSeasonStat) => !p.ogba_team_code && !p.team);
    }, [players]);

    const filtered = useMemo(() => {
        let res = availablePlayers;
        
        // Group Filter
        if (viewGroup === 'hitters') res = res.filter((p: PlayerSeasonStat) => !p.is_pitcher);
        else res = res.filter((p: PlayerSeasonStat) => p.is_pitcher);

        if (search) {
            const q = search.toLowerCase();
            res = res.filter((p: PlayerSeasonStat) => (p.player_name || '').toLowerCase().includes(q) || (p.mlb_team || '').toLowerCase().includes(q));
        }
        if (posFilter !== 'ALL') {
             res = res.filter((p: PlayerSeasonStat) => (p.positions || '').includes(posFilter));
        }
        
        // Sort
        return [...res].sort((a: PlayerSeasonStat, b: PlayerSeasonStat) => {
             let valA: string | number = '';
             let valB: string | number = '';

             switch(sortKey) {
                 case 'name': 
                     valA = a.player_name || ''; 
                     valB = b.player_name || ''; 
                     break;
                 case 'mlb_team':
                     valA = a.mlb_team || '';
                     valB = b.mlb_team || '';
                     break;
                 case 'pos':
                     valA = getPrimaryPosition(a.positions);
                     valB = getPrimaryPosition(b.positions);
                     break;
                 default:
                     // Stats
                     valA = Number(a[sortKey as keyof PlayerSeasonStat] || 0);
                     valB = Number(b[sortKey as keyof PlayerSeasonStat] || 0);
             }

             if (typeof valA === 'string' && typeof valB === 'string') {
                 return sortDesc ? valB.localeCompare(valA) : valA.localeCompare(valB);
             }
             return sortDesc ? (Number(valB) - Number(valA)) : (Number(valA) - Number(valB));
        }).slice(0, 50); // Limit display
    }, [availablePlayers, search, posFilter, viewGroup, sortKey, sortDesc]);

    const uniquePositions = useMemo(() => {
        const s = new Set<string>();
        players.forEach((p: PlayerSeasonStat) => {
            if(p.positions) p.positions.split(',').forEach((pos: string) => s.add(pos.trim()));
        });
        return Array.from(s).sort();
    }, [players]);

    const handleSort = (key: SortKey) => {
        if (sortKey === key) setSortDesc(!sortDesc);
        else {
            setSortKey(key);
            setSortDesc(true); // Default desc for stats
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap gap-4 mb-2 items-center">
                {/* Toggle */}
                <div className="flex bg-[var(--lg-tint)] rounded-2xl p-1 border border-[var(--lg-border-subtle)] backdrop-blur-md">
                    <button
                        onClick={() => { setViewGroup('hitters'); setSortKey('name'); }}
                        className={`px-5 py-2 rounded-xl text-xs font-medium uppercase transition-all ${viewGroup === 'hitters' ? 'bg-[var(--lg-accent)] text-white shadow-lg' : 'text-[var(--lg-text-muted)] hover:text-white hover:bg-[var(--lg-tint)]'}`}
                    >
                        Hitters
                    </button>
                    <button
                         onClick={() => { setViewGroup('pitchers'); setSortKey('name'); }}
                         className={`px-5 py-2 rounded-xl text-xs font-medium uppercase transition-all ${viewGroup === 'pitchers' ? 'bg-[var(--lg-accent)] text-white shadow-lg' : 'text-[var(--lg-text-muted)] hover:text-white hover:bg-[var(--lg-tint)]'}`}
                    >
                        Pitchers
                    </button>
                </div>

                <div className="relative flex-1 min-w-[240px]">
                    <input 
                        className="w-full rounded-2xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] px-5 py-3 text-sm text-white outline-none focus:border-[var(--lg-accent)] transition-all font-bold placeholder:opacity-30"
                        placeholder="Search free agents..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
                
                <select 
                     className="rounded-2xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] px-5 py-3 text-sm text-white outline-none focus:border-[var(--lg-accent)] transition-all font-bold cursor-pointer"
                     value={posFilter}
                     onChange={e => setPosFilter(e.target.value)}
                >
                    <option value="ALL" className="text-black">All Positions</option>
                    {uniquePositions.map(p => <option key={p} value={p} className="text-black">{p}</option>)}
                </select>
            </div>

            <ThemedTable>
                <ThemedThead>
                    <ThemedTr>
                        <ThemedTh onClick={() => handleSort('name')}>
                           <div className="flex items-center gap-1">Player {sortKey === 'name' && (sortDesc ? '▼' : '▲')}</div>
                        </ThemedTh>
                        <ThemedTh onClick={() => handleSort('mlb_team')}>
                           <div className="flex items-center gap-1">Team {sortKey === 'mlb_team' && (sortDesc ? '▼' : '▲')}</div>
                        </ThemedTh>
                        <ThemedTh onClick={() => handleSort('pos')}>
                           <div className="flex items-center gap-1">Pos {sortKey === 'pos' && (sortDesc ? '▼' : '▲')}</div>
                        </ThemedTh>

                        {viewGroup === 'hitters' ? (
                            <>
                                <ThemedTh align="center" onClick={() => handleSort('R')}>R</ThemedTh>
                                <ThemedTh align="center" onClick={() => handleSort('HR')}>HR</ThemedTh>
                                <ThemedTh align="center" onClick={() => handleSort('RBI')}>RBI</ThemedTh>
                                <ThemedTh align="center" onClick={() => handleSort('SB')}>SB</ThemedTh>
                                <ThemedTh align="center" onClick={() => handleSort('AVG')}>AVG</ThemedTh>
                            </>
                        ) : (
                            <>
                                <ThemedTh align="center" onClick={() => handleSort('W')}>W</ThemedTh>
                                <ThemedTh align="center" onClick={() => handleSort('SV')}>SV</ThemedTh>
                                <ThemedTh align="center" onClick={() => handleSort('K')}>K</ThemedTh>
                                <ThemedTh align="center" onClick={() => handleSort('ERA')}>ERA</ThemedTh>
                                <ThemedTh align="center" onClick={() => handleSort('WHIP')}>WHIP</ThemedTh>
                            </>
                        )}
                        
                        <ThemedTh align="center">Action</ThemedTh>
                    </ThemedTr>
                </ThemedThead>
                <tbody className="divide-y divide-[var(--lg-divide)]">
                     {filtered.map(p => (
                         <ThemedTr key={`${p.mlb_id}-${viewGroup}`}>
                             <ThemedTd>{p.player_name}</ThemedTd>
                             <ThemedTd>{p.mlb_team}</ThemedTd>
                             <ThemedTd><span className="font-mono text-xs uppercase bg-[var(--lg-tint)] py-1 px-2 rounded-lg inline-block">{getPrimaryPosition?.(p.positions) || p.positions}</span></ThemedTd>
                             
                             {viewGroup === 'hitters' ? (
                                 <>
                                     <ThemedTd align="center">{p.R}</ThemedTd>
                                     <ThemedTd align="center">{p.HR}</ThemedTd>
                                     <ThemedTd align="center">{p.RBI}</ThemedTd>
                                     <ThemedTd align="center">{p.SB}</ThemedTd>
                                     <ThemedTd align="center">{fmtRate(Number(p.AVG || 0))}</ThemedTd>
                                 </>
                             ) : (
                                 <>
                                     <ThemedTd align="center">{p.W}</ThemedTd>
                                     <ThemedTd align="center">{p.SV}</ThemedTd>
                                     <ThemedTd align="center">{p.K}</ThemedTd>
                                     <ThemedTd align="center">{Number(p.ERA || 0).toFixed(2)}</ThemedTd>
                                     <ThemedTd align="center">{Number(p.WHIP || 0).toFixed(2)}</ThemedTd>
                                 </>
                             )}

                             <ThemedTd align="center">
                                 <button 
                                     onClick={() => onClaim(p)}
                                     className="px-4 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-medium uppercase transition-all"
                                 >
                                     Claim
                                 </button>
                             </ThemedTd>
                         </ThemedTr>
                     ))}
                     {filtered.length === 0 && (
                         <ThemedTr><ThemedTd colSpan={9} align="center" className="py-20"><span className="text-xs font-medium uppercase text-[var(--lg-text-muted)]">No players found</span></ThemedTd></ThemedTr>
                     )}
                </tbody>
            </ThemedTable>
        </div>
    );
}
