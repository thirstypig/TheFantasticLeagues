import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Star, Loader2 } from "lucide-react";
import { getPlayerSeasonStats, getPlayerPeriodStats, type PlayerSeasonStat, type PeriodStatRow, fmtRate } from '../../../api';
import { EmptyState } from '../../../components/ui/EmptyState';
import PlayerExpandedRow from '../../auction/components/PlayerExpandedRow';
import PlayerDetailModal from '../../../components/shared/PlayerDetailModal';
import { PlayerFilterBar } from '../../../components/shared/PlayerFilterBar';
import { POS_ORDER, getPrimaryPosition, getLastName } from '../../../lib/baseballUtils';
import { NL_TEAMS, AL_TEAMS, mapPosition } from '../../../lib/sportConfig';
import { OGBA_TEAM_NAMES } from '../../../lib/ogbaTeams';
import { HitterStatHeaders, PitcherStatHeaders, HitterStatCells, PitcherStatCells } from '../../../components/shared/PlayerStatsColumns';
import { PageSkeleton } from '../../../components/ui/Skeleton';
import PageHeader from '../../../components/ui/PageHeader';
import { ThemedTable, ThemedThead, ThemedTr, ThemedTd } from '../../../components/ui/ThemedTable';
import { SortableHeader } from '../../../components/ui/SortableHeader';
import { getMlbTeamAbbr } from '../../../lib/playerDisplay';
import { PlayerNameCell } from '../../../components/shared/PlayerNameCell';
import { useLeague } from '../../../contexts/LeagueContext';
import { StatsUpdated } from '../../../components/shared/StatsTables';
import { getWatchlist, addToWatchlist, removeFromWatchlist } from '../../watchlist/api';
import { reportError } from '../../../lib/errorBus';

export default function Players() {
  const { leagueId, outfieldMode, myTeamId, seasonStatus } = useLeague();
  const [loading, setLoading] = useState(true);
  const [players, setPlayers] = useState<PlayerSeasonStat[]>([]);

  // Watchlist state — set of Player.id values currently on the user's watchlist.
  // Only populated if the user owns a team in the active league.
  const [watchedIds, setWatchedIds] = useState<Set<number>>(new Set());
  const [watchPending, setWatchPending] = useState<Set<number>>(new Set());
  const canWatch = myTeamId != null && seasonStatus === "IN_SEASON";

  // URL-persisted state — survives back/forward and page refresh
  const [searchParams, setSearchParams] = useSearchParams();
  const viewGroup = (searchParams.get('group') === 'pitchers' ? 'pitchers' : 'hitters') as 'hitters' | 'pitchers';
  const viewMode = (searchParams.get('mode') === 'remaining' ? 'remaining' : 'all') as 'all' | 'remaining';
  const searchQuery = searchParams.get('q') || '';
  const sortKey = searchParams.get('sort') || 'name';
  const sortDesc = searchParams.get('desc') === '1';

  const setUrlParam = useCallback((key: string, value: string, defaults: Record<string, string> = {}) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value === (defaults[key] ?? '')) next.delete(key);
      else next.set(key, value);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const setViewGroup = (v: 'hitters' | 'pitchers') => setUrlParam('group', v, { group: 'hitters' });
  const setViewMode = (v: 'all' | 'remaining') => setUrlParam('mode', v, { mode: 'all' });
  const setSearchQuery = (v: string) => setUrlParam('q', v);

  // Component-local state (not worth persisting in URL)
  const [statsMode, setStatsMode] = useState<string>('season');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerSeasonStat | null>(null);

  const [periodStats, setPeriodStats] = useState<PeriodStatRow[]>([]);
  const [periods, setPeriods] = useState<number[]>([]);
  const [periodNameMap, setPeriodNameMap] = useState<Record<number, string>>({});

  // Filters (component-local — too many to clutter the URL)
  const [filterTeam, setFilterTeam] = useState<string>('ALL_NL');
  const [filterFantasyTeam, setFilterFantasyTeam] = useState<string>('ALL');
  const [filterPos, setFilterPos] = useState<string>('ALL');
  const [filterLeague, setFilterLeague] = useState<'ALL' | 'AL' | 'NL'>('NL');

  // Sort — desc derived from URL
  const setSortDesc = (_v: boolean) => {}; // no-op, managed via URL

  const handleSort = (key: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (sortKey === key) {
        next.set('desc', sortDesc ? '0' : '1');
      } else {
        next.set('sort', key);
        next.set('desc', !['name', 'mlb_team', 'fantasy', 'pos'].includes(key) ? '1' : '0');
      }
      return next;
    }, { replace: true });
  };

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
        setPeriods(Array.from(pSet).sort((a,b) => a-b)); // ascending order

        // Build period name map from the period stats response
        const nameMap: Record<number, string> = {};
        for (const stat of per) {
          if (stat.periodId && stat.periodName) nameMap[Number(stat.periodId)] = String(stat.periodName);
        }
        setPeriodNameMap(nameMap);

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
    const codes = new Set(players.map(p => p.ogba_team_code).filter((c): c is string => !!c));
    return ['ALL', ...Array.from(codes).sort()];
  }, [players]);


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
        if (filterTeam === 'ALL_NL') { if (!NL_TEAMS.has(p.mlb_team || '')) return false; }
        else if (filterTeam === 'ALL_AL') { if (!AL_TEAMS.has(p.mlb_team || '')) return false; }
        else if (filterTeam !== 'ALL' && (p.mlb_team || 'FA') !== filterTeam) return false;
        if (filterFantasyTeam !== 'ALL' && (p.ogba_team_code || 'FA') !== filterFantasyTeam) return false;
        
        if (filterPos !== 'ALL') {
             const pPos = getPrimaryPosition(p.positions);
             if (!pPos.includes(filterPos)) return false;
        }
        if (filterLeague !== 'ALL') {
             const team = (p.mlb_team || p.mlbTeam || '').toString().trim();
             // Players with no team (FA) or already rostered always pass
             if (team && !p.ogba_team_code && !p.team) {
                 const leagueSet = filterLeague === 'NL' ? NL_TEAMS : AL_TEAMS;
                 if (!leagueSet.has(team)) return false;
             }
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

         if (sortKey === 'pos') {
             const posA = mapPosition(getPrimaryPosition(a.positions || (a as any).pos), outfieldMode);
             const posB = mapPosition(getPrimaryPosition(b.positions || (b as any).pos), outfieldMode);
             const idxA = POS_ORDER.indexOf(posA.split('/')[0]) === -1 ? 99 : POS_ORDER.indexOf(posA.split('/')[0]);
             const idxB = POS_ORDER.indexOf(posB.split('/')[0]) === -1 ? 99 : POS_ORDER.indexOf(posB.split('/')[0]);
             return sortDesc ? idxB - idxA : idxA - idxB;
         } else if (sortKey === 'name') {
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
  }, [players, periodStats, periods, statsMode, viewGroup, viewMode, searchQuery, filterTeam, filterFantasyTeam, filterPos, filterLeague, sortKey, sortDesc]);


  const toggleExpand = (id: string) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  // Load the user's watchlist once we know which team they own.
  useEffect(() => {
    if (myTeamId == null) {
      setWatchedIds(new Set());
      return;
    }
    let alive = true;
    (async () => {
      try {
        const res = await getWatchlist(myTeamId);
        if (!alive) return;
        setWatchedIds(new Set(res.items.map((w) => w.player.id)));
      } catch (err) {
        // Silent fail — row-level "add" will still work; just no pre-marked state.
        reportError(err, { source: "watchlist-load" });
      }
    })();
    return () => { alive = false; };
  }, [myTeamId]);

  const toggleWatch = useCallback(
    async (playerId: number, isCurrentlyWatched: boolean) => {
      if (myTeamId == null) return;
      setWatchPending((prev) => new Set(prev).add(playerId));
      // Optimistic update
      setWatchedIds((prev) => {
        const next = new Set(prev);
        if (isCurrentlyWatched) next.delete(playerId);
        else next.add(playerId);
        return next;
      });
      try {
        if (isCurrentlyWatched) {
          await removeFromWatchlist(playerId, myTeamId);
        } else {
          await addToWatchlist({ teamId: myTeamId, playerId });
        }
      } catch (err) {
        // Rollback on failure
        setWatchedIds((prev) => {
          const next = new Set(prev);
          if (isCurrentlyWatched) next.add(playerId);
          else next.delete(playerId);
          return next;
        });
        reportError(err, { source: isCurrentlyWatched ? "watchlist-remove" : "watchlist-add" });
      } finally {
        setWatchPending((prev) => {
          const next = new Set(prev);
          next.delete(playerId);
          return next;
        });
      }
    },
    [myTeamId],
  );

  if (loading) return <PageSkeleton />;

  return (
    <div className="flex flex-col min-h-0 w-full max-w-[100vw] overflow-x-hidden scrollbar-hide" style={{ height: '100svh' }}>
       {/* Page Header */}
       <div className="max-w-6xl mx-auto px-4 pt-6 md:px-6 md:pt-10">
         <PageHeader 
           title="Player Search"
           subtitle="Search and explore all MLB players."
         />
       </div>

       {/* Filters Header */}
       <div className="max-w-6xl mx-auto px-4 py-4 md:px-6">
          <PlayerFilterBar
            card
            viewGroup={viewGroup}
            onViewGroupChange={setViewGroup}
            filterLeague={filterLeague}
            onFilterLeagueChange={setFilterLeague}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            statsMode={statsMode}
            onStatsModeChange={setStatsMode}
            periods={periods.map(p => ({ id: p, label: periodNameMap[p] || `Period ${p}` }))}
            filterTeam={filterTeam}
            onFilterTeamChange={setFilterTeam}
            uniqueMLBTeams={uniqueMLBTeams}
            filterFantasyTeam={filterFantasyTeam}
            onFilterFantasyTeamChange={setFilterFantasyTeam}
            uniqueFantasyTeams={uniqueFantasyTeams}
            filterPos={filterPos}
            onFilterPosChange={setFilterPos}
          />
       </div>

       {/* Results Table */}
       <div className="flex-1 overflow-auto max-w-6xl w-full mx-auto px-4 pb-8 md:px-6 md:pb-12 custom-scrollbar">
           <StatsUpdated source="synced" className="text-right mb-1 px-1" />
           <div className="lg-card p-0 bg-transparent animate-in fade-in slide-in-from-bottom-6 duration-700 overflow-x-auto">
                   <ThemedTable bare density="compact" zebra aria-label="Player statistics">
                       <ThemedThead sticky>
                            <ThemedTr>
                                <SortableHeader sortKey="name" activeSortKey={sortKey} sortDesc={sortDesc} onSort={handleSort} frozen className="pl-2 w-[220px]">Name</SortableHeader>
                                <SortableHeader sortKey="mlb_team" activeSortKey={sortKey} sortDesc={sortDesc} onSort={handleSort} align="center" className="w-16">MLB</SortableHeader>

                                {viewGroup === 'hitters' ? (
                                    <HitterStatHeaders sortKey={sortKey} sortDesc={sortDesc} onSort={handleSort} />
                                ) : (
                                    <PitcherStatHeaders sortKey={sortKey} sortDesc={sortDesc} onSort={handleSort} />
                                )}

                                {canWatch && (
                                  <th scope="col" className="text-center w-10 text-xs font-medium text-[var(--lg-text-muted)]" title="Watchlist">
                                    <Star className="w-3.5 h-3.5 inline" aria-label="Watchlist" />
                                  </th>
                                )}
                                <SortableHeader sortKey="fantasy" activeSortKey={sortKey} sortDesc={sortDesc} onSort={handleSort} align="center" className="pr-8 w-48">Fantasy Team</SortableHeader>
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
                                            <ThemedTd frozen className="pl-2 w-[220px]">
                                                <PlayerNameCell position={pos} name={p.mlb_full_name || p.player_name} isPitcher={p.is_pitcher} />
                                            </ThemedTd>

                                            <ThemedTd align="center">
                                                <span className="text-xs font-bold uppercase tracking-wide text-[var(--lg-text-muted)]">
                                                    {mlbTeam || 'FA'}
                                                </span>
                                            </ThemedTd>

                                           {viewGroup === 'hitters' ? (
                                                <HitterStatCells row={p} />
                                           ) : (
                                                <PitcherStatCells row={p} />
                                           )}
        
                                           {canWatch && (
                                             <ThemedTd align="center">
                                               {(() => {
                                                 const pid = p.id;
                                                 if (pid == null) return null;
                                                 const isWatched = watchedIds.has(pid);
                                                 const isPending = watchPending.has(pid);
                                                 return (
                                                   <button
                                                     type="button"
                                                     disabled={isPending}
                                                     aria-label={isWatched ? "Remove from watchlist" : "Add to watchlist"}
                                                     aria-pressed={isWatched}
                                                     title={isWatched ? "Remove from watchlist" : "Add to watchlist"}
                                                     onClick={(e) => {
                                                       e.stopPropagation();
                                                       toggleWatch(pid, isWatched);
                                                     }}
                                                     className={`p-1 rounded transition-colors ${
                                                       isWatched
                                                         ? "text-amber-400 hover:text-amber-300"
                                                         : "text-[var(--lg-text-muted)] opacity-30 group-hover:opacity-80 hover:text-amber-400"
                                                     } ${isPending ? "cursor-wait" : "cursor-pointer"}`}
                                                   >
                                                     {isPending ? (
                                                       <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                     ) : (
                                                       <Star className={`w-3.5 h-3.5 ${isWatched ? "fill-current" : ""}`} />
                                                     )}
                                                   </button>
                                                 );
                                               })()}
                                             </ThemedTd>
                                           )}
                                           <ThemedTd align="center">
                                               {isTaken ? (
                                                   <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--lg-accent)]">
                                                       {teamLabel}
                                                   </span>
                                               ) : (
                                                   <span className="text-[10px] font-medium uppercase text-[var(--lg-text-muted)] opacity-20 group-hover:opacity-40 transition-opacity">
                                                       Available
                                                   </span>
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
           
           {filteredPlayers.length === 0 && (
                <EmptyState icon={Search} title="No players found" description="Try adjusting your search or filters." />
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
