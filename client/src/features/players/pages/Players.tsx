import React, { useEffect, useState, useMemo } from 'react';
import { getPlayerSeasonStats, getPlayerPeriodStats, type PlayerSeasonStat, type PeriodStatRow, fmtRate } from '../../../api';
import PlayerExpandedRow from '../../auction/components/PlayerExpandedRow';
import PlayerDetailModal from '../../../components/PlayerDetailModal';
import { POS_ORDER, getPrimaryPosition, getLastName } from '../../../lib/baseballUtils';
import { OGBA_TEAM_NAMES } from '../../../lib/ogbaTeams';
import PageHeader from '../../../components/ui/PageHeader';
import { ThemedTable, ThemedThead, ThemedTh, ThemedTr, ThemedTd } from '../../../components/ui/ThemedTable';
import { getMlbTeamAbbr } from '../../../lib/playerDisplay';
import { useLeague } from '../../../contexts/LeagueContext';

export default function Players() {
  const { leagueId } = useLeague();
  const [loading, setLoading] = useState(true);
  const [players, setPlayers] = useState<PlayerSeasonStat[]>([]);

  // View State
  const [viewGroup, setViewGroup] = useState<'hitters' | 'pitchers'>('hitters');
  const [viewMode, setViewMode] = useState<'all' | 'remaining'>('all');
  const [statsMode, setStatsMode] = useState<string>('season');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerSeasonStat | null>(null);

  const [periodStats, setPeriodStats] = useState<PeriodStatRow[]>([]);
  const [periods, setPeriods] = useState<number[]>([]);


  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTeam, setFilterTeam] = useState<string>('ALL'); // MLB Team
  const [filterFantasyTeam, setFilterFantasyTeam] = useState<string>('ALL'); // OGBA Team
  const [filterPos, setFilterPos] = useState<string>('ALL');

  // Sort State
  const [sortKey, setSortKey] = useState<string>('name');
  const [sortDesc, setSortDesc] = useState(false);

  useEffect(() => {
    setLoading(true);
    (async () => {
      try {
        const [p, per] = await Promise.all([
             getPlayerSeasonStats(leagueId),
             getPlayerPeriodStats(leagueId)
        ]);
        setPlayers(p);
        setPeriodStats(per);

        const pSet = new Set(per.map(x => x.periodId).filter(n => typeof n === 'number'));
        setPeriods(Array.from(pSet).sort((a,b) => b-a));

      } catch (err: unknown) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [leagueId]);

  const uniqueMLBTeams = useMemo(() => {
    const teams = new Set(players.map(p => p.mlb_team || 'FA'));
    return ['ALL', ...Array.from(teams).sort()];
  }, [players]);

  const uniqueFantasyTeams = useMemo(() => {
    const codes = new Set(players.map(p => p.ogba_team_code).filter(Boolean));
    return ['ALL', ...Array.from(codes).sort()];
  }, [players]);

  const uniquePositions = POS_ORDER;

  const filteredPlayers = useMemo(() => {
     const baseList = players;
     
     let statMap: Map<string, PeriodStatRow> | null = null;
     if (statsMode !== 'season') {
         const targetP = statsMode === 'period-current' ? Math.max(...periods, 0) : Number(statsMode.split('-')[1]);
         statMap = new Map();
         periodStats.forEach(ps => {
             if (ps.periodId === targetP) {
                 statMap!.set(String(ps.mlbId), ps);
             }
         });
     }

     const res = baseList.filter(p => {
        if (viewGroup === 'hitters' && p.is_pitcher) return false;
        if (viewGroup === 'pitchers' && !p.is_pitcher) return false;
        if (viewMode === 'remaining' && (p.ogba_team_code || p.team)) return false;
        if (searchQuery && !p.player_name?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        if (filterTeam !== 'ALL' && (p.mlb_team || 'FA') !== filterTeam) return false;
        if (filterFantasyTeam !== 'ALL' && (p.ogba_team_code || 'FA') !== filterFantasyTeam) return false;
        
        if (filterPos !== 'ALL') {
             const pPos = getPrimaryPosition(p.positions);
             if (!pPos.includes(filterPos)) return false; 
        }
        return true;
     });

     const displayList = res.map(p => {
         if (statsMode === 'season') return p;
         const s = statMap?.get(String(p.mlb_id));
         return {
             ...p,
             R: Number(s?.R ?? 0),
             HR: Number(s?.HR ?? 0),
             RBI: Number(s?.RBI ?? 0),
             SB: Number(s?.SB ?? 0),
             AVG: Number(s?.AVG ?? 0),
             W: Number(s?.W ?? 0),
             SV: Number(s?.SV ?? 0),
             K: Number(s?.K ?? 0),
             ERA: Number(s?.ERA ?? 0),
             WHIP: Number(s?.WHIP ?? 0),
         } as PlayerSeasonStat;
     });

     return displayList.sort((a, b) => {
         let valA: string | number = 0; 
         let valB: string | number = 0;

         if (sortKey === 'name') {
             valA = getLastName(a.mlb_full_name || a.player_name);
             valB = getLastName(b.mlb_full_name || b.player_name);
             return sortDesc ? valB.toString().localeCompare(valA.toString()) : valA.toString().localeCompare(valB.toString());
         } else if (sortKey === 'mlb_team') {
             valA = a.mlb_team || a.mlbTeam || 'ZZZ';
             valB = b.mlb_team || b.mlbTeam || 'ZZZ';
             return sortDesc ? valB.toString().localeCompare(valA.toString()) : valA.toString().localeCompare(valB.toString());
         } else if (sortKey === 'fantasy') {
             valA = a.ogba_team_code || 'ZZZ'; 
             valB = b.ogba_team_code || 'ZZZ';
             return sortDesc ? valB.toString().localeCompare(valA.toString()) : valA.toString().localeCompare(valB.toString());
         } else {
             // @ts-expect-error key access
             valA = Number(a[sortKey] ?? -999);
             // @ts-expect-error key access
             valB = Number(b[sortKey] ?? -999);
             return sortDesc ? (valB as number) - (valA as number) : (valA as number) - (valB as number);
         }
     });
  }, [players, periodStats, periods, statsMode, viewGroup, viewMode, searchQuery, filterTeam, filterFantasyTeam, filterPos, sortKey, sortDesc]);


  const toggleExpand = (id: string) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-[var(--lg-text-muted)]">
      <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-6"></div>
      <div className="text-sm font-medium animate-pulse">Searching players...</div>
    </div>
  );

  return (
    <div className="h-full flex flex-col scrollbar-hide">
       {/* Page Header */}
       <div className="max-w-6xl mx-auto px-4 pt-6 md:px-6 md:pt-10">
         <PageHeader 
           title="Player Search"
           subtitle="Search and explore all MLB players."
         />
       </div>

       {/* Filters Header */}
       <div className="max-w-6xl mx-auto px-4 py-4 md:px-6 sticky top-0 z-50">
          <div className="lg-card p-4 flex flex-wrap items-center gap-3 md:gap-6 bg-transparent backdrop-blur-3xl">
              
              {/* Type Toggle */}
              <div className="flex bg-[var(--lg-tint)] rounded-[var(--lg-radius-lg)] p-1 border border-[var(--lg-border-subtle)]">
                  <button 
                      onClick={() => setViewGroup('hitters')}
                      className={`px-6 py-2 text-xs font-bold uppercase tracking-wide rounded-[var(--lg-radius-md)] transition-all ${viewGroup === 'hitters' ? 'bg-[var(--lg-accent)] text-white shadow-xl shadow-blue-500/20 scale-[1.02]' : 'text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)] hover:bg-[var(--lg-tint)]'}`}
                  >
                      Hitters
                  </button>
                  <button 
                      onClick={() => setViewGroup('pitchers')}
                      className={`px-6 py-2 text-xs font-bold uppercase tracking-wide rounded-[var(--lg-radius-md)] transition-all ${viewGroup === 'pitchers' ? 'bg-[var(--lg-accent)] text-white shadow-xl shadow-blue-500/20 scale-[1.02]' : 'text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)] hover:bg-[var(--lg-tint)]'}`}
                  >
                      Pitchers
                  </button>
              </div>

              {/* Search */}
              <div className="relative group flex-1 min-w-[240px]">
                  <input 
                       type="text" 
                       placeholder="Search players..."
                       value={searchQuery}
                       onChange={(e) => setSearchQuery(e.target.value)}
                       className="lg-input pr-10"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-sm opacity-30 group-focus-within:opacity-100 transition-opacity">🔍</div>
              </div>

              {/* Filters */}
              <div className="grid grid-cols-2 md:flex gap-2 md:gap-4">
                  <select 
                      value={viewMode}
                      onChange={(e) => setViewMode(e.target.value as 'all' | 'remaining')}
                      className="lg-input w-auto min-w-[140px] font-medium text-xs py-2.5"
                  >
                      <option value="all">All Players</option>
                      <option value="remaining">Available</option>
                  </select>

                  <select 
                      value={statsMode}
                      onChange={(e) => setStatsMode(e.target.value)}
                      className="lg-input w-auto min-w-[140px] font-medium text-xs py-2.5"
                  >
                      <option value="season">Season</option>
                      {periods.map(p => (
                           <option key={p} value={`period-${p}`}>Period {p}</option>
                      ))}
                  </select>

                  <select 
                      value={filterTeam}
                      onChange={(e) => setFilterTeam(e.target.value)}
                      className="lg-input w-auto min-w-[140px] font-medium text-xs py-2.5"
                  >
                      <option value="ALL">All MLB Teams</option>
                      {uniqueMLBTeams.filter(t => t!=='ALL').map(t => <option key={t} value={t}>{t}</option>)}
                  </select>

                  <select 
                      value={filterFantasyTeam}
                      onChange={(e) => setFilterFantasyTeam(e.target.value)}
                      className="lg-input w-auto min-w-[140px] font-medium text-xs py-2.5"
                  >
                      <option value="ALL">All Fantasy Teams</option>
                      {uniqueFantasyTeams.filter(t => t!=='ALL').map(t => <option key={t} value={t as string}>{OGBA_TEAM_NAMES[t as string] || t}</option>)}
                  </select>

                  <select 
                      value={filterPos}
                      onChange={(e) => setFilterPos(e.target.value)}
                      className="lg-input w-auto min-w-[140px] font-medium text-xs py-2.5"
                  >
                      <option value="ALL">All Positions</option>
                      {uniquePositions.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
              </div>
          </div>
       </div>

       {/* Results Table */}
       <div className="flex-1 overflow-auto max-w-6xl mx-auto px-4 pb-8 md:px-6 md:pb-12 custom-scrollbar">
           <div className="lg-card p-0 overflow-hidden bg-transparent animate-in fade-in slide-in-from-bottom-6 duration-700">
               <div className="overflow-x-auto">
                   <ThemedTable bare>
                       <ThemedThead>
                            <ThemedTr>
                                <ThemedTh className="pl-8 py-3" onClick={() => {
                                    if (sortKey === 'name') setSortDesc(!sortDesc);
                                    else { setSortKey('name'); setSortDesc(false); }
                                }}>
                                    Name {sortKey === 'name' && (sortDesc ? '▼' : '▲')}
                                </ThemedTh>

                                <ThemedTh align="center" className="w-16" onClick={() => {
                                    if (sortKey === 'mlb_team') setSortDesc(!sortDesc);
                                    else { setSortKey('mlb_team'); setSortDesc(false); }
                                }}>
                                    MLB {sortKey === 'mlb_team' && (sortDesc ? '▼' : '▲')}
                                </ThemedTh>

                                {viewGroup === 'hitters' ? (
                                    <>
                                 <ThemedTh align="center" className="w-16" onClick={() => {
                                             if (sortKey === 'R') setSortDesc(!sortDesc);
                                             else { setSortKey('R'); setSortDesc(true); }
                                         }}>R {sortKey === 'R' && (sortDesc ? '▼' : '▲')}</ThemedTh>
                                         <ThemedTh align="center" className="w-16" onClick={() => {
                                             if (sortKey === 'HR') setSortDesc(!sortDesc);
                                             else { setSortKey('HR'); setSortDesc(true); }
                                         }}>HR {sortKey === 'HR' && (sortDesc ? '▼' : '▲')}</ThemedTh>
                                         <ThemedTh align="center" className="w-16" onClick={() => {
                                             if (sortKey === 'RBI') setSortDesc(!sortDesc);
                                             else { setSortKey('RBI'); setSortDesc(true); }
                                         }}>RBI {sortKey === 'RBI' && (sortDesc ? '▼' : '▲')}</ThemedTh>
                                         <ThemedTh align="center" className="w-16" onClick={() => {
                                             if (sortKey === 'SB') setSortDesc(!sortDesc);
                                             else { setSortKey('SB'); setSortDesc(true); }
                                         }}>SB {sortKey === 'SB' && (sortDesc ? '▼' : '▲')}</ThemedTh>
                                         <ThemedTh align="center" className="w-16" onClick={() => {
                                             if (sortKey === 'AVG') setSortDesc(!sortDesc);
                                             else { setSortKey('AVG'); setSortDesc(true); }
                                         }}>AVG {sortKey === 'AVG' && (sortDesc ? '▼' : '▲')}</ThemedTh>
                                    </>
                                ) : (
                                    <>
                                         <ThemedTh align="center" className="w-16" onClick={() => {
                                             if (sortKey === 'W') setSortDesc(!sortDesc);
                                             else { setSortKey('W'); setSortDesc(true); }
                                         }}>W {sortKey === 'W' && (sortDesc ? '▼' : '▲')}</ThemedTh>
                                         <ThemedTh align="center" className="w-16" onClick={() => {
                                             if (sortKey === 'SV') setSortDesc(!sortDesc);
                                             else { setSortKey('SV'); setSortDesc(true); }
                                         }}>SV {sortKey === 'SV' && (sortDesc ? '▼' : '▲')}</ThemedTh>
                                         <ThemedTh align="center" className="w-16" onClick={() => {
                                             if (sortKey === 'K') setSortDesc(!sortDesc);
                                             else { setSortKey('K'); setSortDesc(true); }
                                         }}>K {sortKey === 'K' && (sortDesc ? '▼' : '▲')}</ThemedTh>
                                         <ThemedTh align="center" className="w-20" onClick={() => {
                                             if (sortKey === 'ERA') setSortDesc(!sortDesc);
                                             else { setSortKey('ERA'); setSortDesc(true); }
                                         }}>ERA {sortKey === 'ERA' && (sortDesc ? '▼' : '▲')}</ThemedTh>
                                         <ThemedTh align="center" className="w-20" onClick={() => {
                                             if (sortKey === 'WHIP') setSortDesc(!sortDesc);
                                             else { setSortKey('WHIP'); setSortDesc(true); }
                                         }}>WHIP {sortKey === 'WHIP' && (sortDesc ? '▼' : '▲')}</ThemedTh>
                                    </>
                                )}
                                
                                <ThemedTh align="center" className="pr-8 w-48" onClick={() => {
                                    if (sortKey === 'fantasy') setSortDesc(!sortDesc);
                                    else { setSortKey('fantasy'); setSortDesc(false); }
                                }}>Fantasy Team {sortKey === 'fantasy' && (sortDesc ? '▼' : '▲')}</ThemedTh>
                            </ThemedTr>
                       </ThemedThead>
                       <tbody className="divide-y divide-[var(--lg-divide)]">
                           {filteredPlayers.map((p: PlayerSeasonStat) => {
                               const isExpanded = expandedId === p.row_id;
                               const isTaken = !!p.ogba_team_code || !!p.team;
                               const teamLabel = p.ogba_team_code ? (OGBA_TEAM_NAMES[p.ogba_team_code] || p.ogba_team_code) : (p.team ? 'Taken' : '-');
                               const mlbTeam = getMlbTeamAbbr(p);
                               const pos = getPrimaryPosition(p.positions) || (p.is_pitcher ? 'P' : 'UT');
        
                               return (
                                   <React.Fragment key={p.row_id}>
                                       <ThemedTr 
                                           className={`group cursor-pointer transition-colors duration-300 ${isExpanded ? 'bg-[var(--lg-accent)]/10' : 'hover:bg-[var(--lg-tint)]'}`}
                                           onClick={() => toggleExpand(p.row_id ?? '')}
                        >
                                            <ThemedTd className="pl-8 py-3">
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-[var(--lg-text-primary)] text-base tracking-tight group-hover:text-[var(--lg-accent)] transition-colors leading-tight">
                                                        {p.mlb_full_name || p.player_name}
                                                    </span>
                                                    <div className="flex items-center gap-3 mt-1.5">
                                                        <span className={`px-1.5 py-0.5 rounded-[var(--lg-radius-sm)] text-xs font-bold uppercase tracking-wide ${p.is_pitcher ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'}`}>
                                                            {pos}
                                                        </span>
                                                    </div>
                                                </div>
                                            </ThemedTd>

                                            <ThemedTd align="center">
                                                <span className="text-xs font-bold uppercase tracking-wide text-[var(--lg-text-muted)]">
                                                    {mlbTeam || 'FA'}
                                                </span>
                                            </ThemedTd>

                                           {viewGroup === 'hitters' ? (
                                                <>
                                                    <ThemedTd align="center">{p.R}</ThemedTd>
                                                    <ThemedTd align="center">{p.HR}</ThemedTd>
                                                    <ThemedTd align="center">{p.RBI}</ThemedTd>
                                                    <ThemedTd align="center">{p.SB}</ThemedTd>
                                                    <ThemedTd align="center">{typeof p.AVG === 'number' ? fmtRate(p.AVG) : '- '}</ThemedTd>
                                                </>
                                           ) : (
                                                <>
                                                    <ThemedTd align="center">{p.W}</ThemedTd>
                                                    <ThemedTd align="center">{p.SV}</ThemedTd>
                                                    <ThemedTd align="center">{p.K}</ThemedTd>
                                                    <ThemedTd align="center">{p.ERA ? Number(p.ERA).toFixed(2) : '- '}</ThemedTd>
                                                    <ThemedTd align="center">{p.WHIP ? Number(p.WHIP).toFixed(2) : '- '}</ThemedTd>
                                                </>
                                           )}
        
                                           <ThemedTd align="center" className="pr-8 py-5">
                                               {isTaken ? (
                                                   <div className="inline-flex items-center px-4 py-1.5 rounded-[var(--lg-radius-xl)] bg-[var(--lg-accent)]/10 border border-[var(--lg-accent)]/20 text-[var(--lg-accent)] text-xs font-bold uppercase tracking-wider shadow-lg shadow-blue-500/5">
                                                       {teamLabel}
                                                   </div>
                                               ) : (
                                                   <div className="text-xs font-medium uppercase text-[var(--lg-text-muted)] opacity-20 group-hover:opacity-40 transition-opacity">
                                                       Available
                                                   </div>
                                               )}
                                           </ThemedTd>
                                       </ThemedTr>
                                       
                                       {isExpanded && (
                                           <PlayerExpandedRow
                                               player={p}
                                               isTaken={isTaken}
                                               ownerName={teamLabel}
                                               onViewDetail={setSelectedPlayer}
                                               colSpan={10}
                                           />
                                       )}
                                   </React.Fragment>
                               );
                           })}
                       </tbody>
                   </ThemedTable>
               </div>
           </div>
           
           {filteredPlayers.length === 0 && (
                <div className="flex flex-col items-center justify-center p-32 text-center opacity-40">
                    <div className="text-4xl mb-6">📡</div>
                    <div className="text-[var(--lg-text-muted)] text-lg font-medium uppercase">No Players Found</div>
                    <p className="text-xs font-medium mt-3">Try adjusting your search or filters.</p>
                </div>
            )}

       {selectedPlayer && (
         <PlayerDetailModal
           player={selectedPlayer}
           open={!!selectedPlayer}
           onClose={() => setSelectedPlayer(null)}
         />
       )}
       </div>
    </div>
  );
}
