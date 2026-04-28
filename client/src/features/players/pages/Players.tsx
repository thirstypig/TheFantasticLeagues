/*
 * Players — Aurora port (PR #141 — Aurora screen #4 of 8).
 *
 * Aurora bento layout for the league-wide player search/index. Mirrors
 * the existing Players page's behavior 1:1 — same filters, same URL
 * persistence, same watchlist + expanded-row + detail-modal interactions
 * — but reskinned to live under <AmbientBg /> in a `.aurora-theme`
 * wrapper with Glass cards for the filter bar and the results table.
 *
 * What the Aurora chrome adds visually:
 *   - AmbientBg + iridescent gradient on the result count
 *   - Glass card around the filter bar (delegated to PlayerFilterBar
 *     unchanged — it already has a `card` prop)
 *   - Glass card around the table; rows highlighted when expanded
 *   - My-team's-rostered-players accent-tinted (when canWatch)
 *   - "Available" / fantasy-team-code column unchanged
 *
 * What the Aurora chrome does NOT change:
 *   - Sort, filter, search, stats-mode (season vs per-period), URL
 *     persistence, watchlist toggle behavior, expanded row contents,
 *     detail modal — all delegated to the same shared components and
 *     hooks the legacy used.
 *
 * The legacy 467-line page is preserved at /players-classic via
 * `PlayersLegacy.tsx`. Per the Aurora rollout pattern, point users
 * there from the footer escape link if they hit a feature gap here.
 */
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Star, Loader2 } from "lucide-react";
import {
  AmbientBg, Glass, IridText, SectionLabel,
} from '../../../components/aurora/atoms';
import '../../../components/aurora/aurora.css';
import { getPlayerSeasonStats, getPlayerPeriodStats, type PlayerSeasonStat, type PeriodStatRow } from '../../../api';
import { EmptyState } from '../../../components/ui/EmptyState';
import PlayerExpandedRow from '../../auction/components/PlayerExpandedRow';
import { PlayerFilterBar } from '../../../components/shared/PlayerFilterBar';
import { POS_ORDER, getPrimaryPosition, getLastName, isCMEligible, isMIEligible } from '../../../lib/baseballUtils';
import { NL_TEAMS, AL_TEAMS, mapPosition } from '../../../lib/sportConfig';
import { OGBA_TEAM_NAMES } from '../../../lib/ogbaTeams';
import { HitterStatHeaders, PitcherStatHeaders, HitterStatCells, PitcherStatCells } from '../../../components/shared/PlayerStatsColumns';
import { PageSkeleton } from '../../../components/ui/Skeleton';
import { ThemedTable, ThemedThead, ThemedTr, ThemedTd } from '../../../components/ui/ThemedTable';
import { SortableHeader } from '../../../components/ui/SortableHeader';
import { getMlbTeamAbbr } from '../../../lib/playerDisplay';
import { PlayerNameCell } from '../../../components/shared/PlayerNameCell';
import { useLeague } from '../../../contexts/LeagueContext';
import { StatsUpdated } from '../../../components/shared/StatsTables';
import { getWatchlist, addToWatchlist, removeFromWatchlist } from '../../watchlist/api';
import { reportError } from '../../../lib/errorBus';

export default function Players() {
  const { leagueId, outfieldMode, myTeamId, seasonStatus, myTeamCode } = useLeague();
  const [loading, setLoading] = useState(true);
  const [players, setPlayers] = useState<PlayerSeasonStat[]>([]);

  const [watchedIds, setWatchedIds] = useState<Set<number>>(new Set());
  const [watchPending, setWatchPending] = useState<Set<number>>(new Set());
  const canWatch = myTeamId != null && seasonStatus === "IN_SEASON";

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

  const navigate = useNavigate();
  const [statsMode, setStatsMode] = useState<string>('season');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Aurora "Full Profile" navigates to /players/:mlbId (the dedicated
  // detail page) instead of opening the modal that the legacy Players
  // page used. The modal is still alive elsewhere (Auction, Team, etc.)
  // for inline lookup contexts; this page is its own surface now.
  const openDetail = useCallback((p: PlayerSeasonStat) => {
    const mlbId = String(p.mlb_id ?? '').trim();
    if (!mlbId) return;
    navigate(`/players/${mlbId}`, { state: { player: p } });
  }, [navigate]);

  const [periodStats, setPeriodStats] = useState<PeriodStatRow[]>([]);
  const [periods, setPeriods] = useState<number[]>([]);
  const [periodNameMap, setPeriodNameMap] = useState<Record<number, string>>({});

  const [filterTeam, setFilterTeam] = useState<string>('ALL_NL');
  const [filterFantasyTeam, setFilterFantasyTeam] = useState<string>('ALL');
  const [filterPos, setFilterPos] = useState<string>('ALL');
  const [filterLeague, setFilterLeague] = useState<'ALL' | 'AL' | 'NL'>('NL');

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
          getPlayerPeriodStats(leagueId),
        ]);
        setPlayers(p);
        setPeriodStats(per);
        const pSet = new Set(per.map(x => x.periodId).filter(n => typeof n === 'number'));
        setPeriods(Array.from(pSet).sort((a, b) => a - b));
        const nameMap: Record<number, string> = {};
        for (const stat of per) {
          if (stat.periodId && stat.periodName) nameMap[Number(stat.periodId)] = String(stat.periodName);
        }
        setPeriodNameMap(nameMap);
      } catch (err: unknown) {
        console.error(err);
        reportError(err, { source: 'aurora-players-load' });
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
        if (ps.periodId === targetP) statMap!.set(String(ps.mlbId), ps);
      });
    }

    const hasSearch = searchQuery.trim().length > 0;
    const res = baseList.filter(p => {
      if (viewGroup === 'hitters' && p.is_pitcher) return false;
      if (viewGroup === 'pitchers' && !p.is_pitcher) return false;
      if (viewMode === 'remaining' && (p.ogba_team_code || p.team)) return false;
      if (hasSearch && !p.player_name?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (!hasSearch) {
        const rostered = !!p.ogba_team_code || !!p.team;
        const games = Number(p.G ?? 0);
        if (!rostered && games === 0) return false;
      }
      if (filterTeam === 'ALL_NL') { if (!NL_TEAMS.has(p.mlb_team || '')) return false; }
      else if (filterTeam === 'ALL_AL') { if (!AL_TEAMS.has(p.mlb_team || '')) return false; }
      else if (filterTeam !== 'ALL' && (p.mlb_team || 'FA') !== filterTeam) return false;
      if (filterFantasyTeam !== 'ALL' && (p.ogba_team_code || 'FA') !== filterFantasyTeam) return false;

      if (filterPos !== 'ALL') {
        if (filterPos === 'CM') {
          if (!isCMEligible(p.positions)) return false;
        } else if (filterPos === 'MI') {
          if (!isMIEligible(p.positions)) return false;
        } else {
          const posList = (p.positions || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
          const normalized = posList.map(pos => (pos === 'SP' || pos === 'RP') ? 'P' : pos);
          if (!normalized.includes(filterPos.toUpperCase())) return false;
        }
      }
      if (filterLeague !== 'ALL') {
        const team = (p.mlb_team || p.mlbTeam || '').toString().trim();
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
  }, [players, periodStats, periods, statsMode, viewGroup, viewMode, searchQuery, filterTeam, filterFantasyTeam, filterPos, filterLeague, sortKey, sortDesc, outfieldMode]);

  const toggleExpand = (id: string) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

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
        reportError(err, { source: "watchlist-load" });
      }
    })();
    return () => { alive = false; };
  }, [myTeamId]);

  const toggleWatch = useCallback(
    async (playerId: number, isCurrentlyWatched: boolean) => {
      if (myTeamId == null) return;
      setWatchPending((prev) => new Set(prev).add(playerId));
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

  const resultCount = filteredPlayers.length;

  return (
    <div className="aurora-theme" style={{ position: 'relative', minHeight: '100svh' }}>
      <AmbientBg />
      <div style={{ position: 'relative', zIndex: 1, padding: '24px 16px 48px', maxWidth: 1280, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
          <div>
            <SectionLabel>✦ Player Search</SectionLabel>
            <h1 style={{ fontFamily: 'var(--am-display)', fontSize: 32, fontWeight: 300, color: 'var(--am-text)', margin: 0, lineHeight: 1.1 }}>
              Search every player.
            </h1>
            <div style={{ marginTop: 6, fontSize: 13, color: 'var(--am-text-muted)' }}>
              Filter, sort, and explore the full MLB pool — and add anyone to your watchlist.
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <SectionLabel style={{ marginBottom: 2 }}>Results</SectionLabel>
            <IridText size={28} weight={300}>{resultCount.toLocaleString()}</IridText>
          </div>
        </div>

        {/* Filter Bar — wrapped in a strong Glass card */}
        <Glass strong padded={false} style={{ marginBottom: 16 }}>
          <div style={{ padding: 16 }}>
            <PlayerFilterBar
              card={false}
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
        </Glass>

        {/* Results table */}
        <Glass padded={false}>
          <div style={{ padding: '12px 16px 0', display: 'flex', justifyContent: 'flex-end' }}>
            <StatsUpdated source="synced" className="text-xs" />
          </div>
          <div style={{ overflowX: 'auto', padding: '4px 4px 12px' }}>
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
                    <th scope="col" className="text-center w-10 text-xs font-medium" style={{ color: 'var(--am-text-faint)' }} title="Watchlist">
                      <Star className="w-3.5 h-3.5 inline" aria-label="Watchlist" />
                    </th>
                  )}
                  <SortableHeader sortKey="fantasy" activeSortKey={sortKey} sortDesc={sortDesc} onSort={handleSort} align="center" className="pr-6 w-44">Fantasy Team</SortableHeader>
                </ThemedTr>
              </ThemedThead>
              <tbody>
                {filteredPlayers.map((p: PlayerSeasonStat) => {
                  const isExpanded = expandedId === p.row_id;
                  const isTaken = !!p.ogba_team_code || !!p.team;
                  const isMine = !!myTeamCode && p.ogba_team_code === myTeamCode;
                  const teamLabel = p.ogba_team_code ? (OGBA_TEAM_NAMES[p.ogba_team_code] || p.ogba_team_code) : (p.team ? 'Taken' : '-');
                  const mlbTeam = getMlbTeamAbbr(p);
                  const pos = getPrimaryPosition(p.positions) || (p.is_pitcher ? 'P' : 'UT');

                  const rowBgClass = isExpanded
                    ? 'bg-[var(--am-chip-strong)]'
                    : isMine
                      ? 'bg-[var(--am-chip)]'
                      : 'hover:bg-[var(--am-surface-faint)]';

                  return (
                    <React.Fragment key={p.row_id}>
                      <ThemedTr
                        className={`group cursor-pointer transition-colors duration-200 ${rowBgClass}`}
                        onClick={() => toggleExpand(p.row_id ?? '')}
                      >
                        <ThemedTd frozen className="pl-2 w-[220px]">
                          <PlayerNameCell position={pos} name={p.mlb_full_name || p.player_name} isPitcher={p.is_pitcher} />
                        </ThemedTd>
                        <ThemedTd align="center">
                          <span className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--am-text-muted)' }}>
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
                                      : "opacity-60 hover:opacity-100 hover:text-amber-400"
                                  } ${isPending ? "cursor-wait" : "cursor-pointer"}`}
                                  style={!isWatched ? { color: 'var(--am-text-faint)' } : undefined}
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
                            <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: isMine ? 'var(--am-cardinal)' : 'var(--am-accent)' }}>
                              {teamLabel}
                            </span>
                          ) : (
                            <span className="text-[10px] font-medium uppercase opacity-30 group-hover:opacity-60 transition-opacity" style={{ color: 'var(--am-text-faint)' }}>
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
                          onViewDetail={openDetail}
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
            <div style={{ padding: '24px 16px' }}>
              <EmptyState icon={Search} title="No players found" description="Try adjusting your search or filters." />
            </div>
          )}
        </Glass>

        {/* Footer escape link to legacy */}
        <div style={{ marginTop: 16, textAlign: 'center', fontSize: 11, color: 'var(--am-text-faint)' }}>
          Need a feature you can't find? <Link to="/players-classic" style={{ color: 'var(--am-text-muted)', textDecoration: 'underline' }}>View classic Players →</Link>
        </div>
      </div>

    </div>
  );
}
