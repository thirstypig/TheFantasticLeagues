import React, { useState, useMemo, useEffect } from 'react';
import { Star } from 'lucide-react';
import { getPrimaryPosition, getLastName, POS_ORDER } from '../../../lib/baseballUtils';
import { getPlayerPeriodStats, PlayerSeasonStat, PeriodStatRow, fmtRate } from '../../../api';
import { NL_TEAMS, AL_TEAMS } from '../../../lib/sportConfig';
import { OGBA_TEAM_NAMES } from '../../../lib/ogbaTeams';
import { getMlbTeamAbbr } from '../../../lib/playerDisplay';
import { PlayerNameCell } from '../../../components/shared/PlayerNameCell';
import { ThemedTable, ThemedThead, ThemedTh, ThemedTr, ThemedTd } from "../../../components/ui/ThemedTable";
import { SortableHeader } from '../../../components/ui/SortableHeader';
import { HitterStatHeaders, PitcherStatHeaders, HitterStatCells, PitcherStatCells } from '../../../components/shared/PlayerStatsColumns';
import { PlayerFilterBar } from '../../../components/shared/PlayerFilterBar';
import PlayerDetailModal from '../../../components/shared/PlayerDetailModal';
import PlayerExpandedRow from '../../auction/components/PlayerExpandedRow';
import { useLeague } from '../../../contexts/LeagueContext';
import { useMyWatchlist } from '../../watchlist/hooks/useMyWatchlist';

interface AddDropTabProps {
    players: PlayerSeasonStat[];
    myTeamRoster?: PlayerSeasonStat[];
    onClaim: (player: PlayerSeasonStat, dropPlayerId?: number) => void;
    onDrop?: (player: PlayerSeasonStat) => void;
    disabled?: boolean;
}

export default function AddDropTab({ players, myTeamRoster, onClaim, onDrop, disabled }: AddDropTabProps) {
    const { leagueId, myTeamId } = useLeague();
    const { watchedIds, pendingIds, toggle: toggleWatch, canWatch } = useMyWatchlist(myTeamId);

    // View state
    const [viewGroup, setViewGroup] = useState<'hitters' | 'pitchers'>('hitters');
    const [viewMode, setViewMode] = useState<'all' | 'remaining'>('remaining');
    const [statsMode, setStatsMode] = useState<string>('season');

    // Filters
    const [search, setSearch] = useState('');
    const [filterTeam, setFilterTeam] = useState<string>('ALL');
    const [filterFantasyTeam, setFilterFantasyTeam] = useState<string>('ALL');
    const [filterPos, setFilterPos] = useState<string>('ALL');
    const [filterLeague, setFilterLeague] = useState<'ALL' | 'AL' | 'NL'>('ALL');

    // Sort
    const [sortKey, setSortKey] = useState<string>('name');
    const [sortDesc, setSortDesc] = useState(false);

    // Expand / Detail
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [selectedPlayer, setSelectedPlayer] = useState<PlayerSeasonStat | null>(null);

    // Period stats (fetched independently)
    const [periodStats, setPeriodStats] = useState<PeriodStatRow[]>([]);
    const [periods, setPeriods] = useState<number[]>([]);

    useEffect(() => {
        (async () => {
            try {
                const per = await getPlayerPeriodStats(leagueId);
                setPeriodStats(per);
                const pSet = new Set(per.map((x: PeriodStatRow) => x.periodId as number).filter((n: number) => typeof n === 'number'));
                setPeriods(Array.from(pSet).sort((a: number, b: number) => b - a));
            } catch (err: unknown) {
                console.error(err);
            }
        })();
    }, [leagueId]);

    // Derived filter lists
    const uniqueMLBTeams = useMemo(() => {
        const teams = new Set(players.map(p => p.mlb_team || 'FA'));
        return ['ALL', ...Array.from(teams).sort()];
    }, [players]);

    const uniqueFantasyTeams = useMemo(() => {
        const codes = new Set(players.map(p => p.ogba_team_code).filter((c): c is string => !!c));
        return ['ALL', ...Array.from(codes).sort()];
    }, [players]);

    // POS_ORDER used by filter bar internally

    // Filtered + sorted players
    const filteredPlayers = useMemo(() => {
        let statMap: Map<string, PeriodStatRow> | null = null;
        if (statsMode !== 'season') {
            const targetP = statsMode === 'period-current' ? Math.max(...periods, 0) : Number(statsMode.split('-')[1]);
            statMap = new Map();
            periodStats.forEach((ps: PeriodStatRow) => {
                if ((ps.periodId as number) === targetP) {
                    statMap!.set(String(ps.mlbId), ps);
                }
            });
        }

        const res = players.filter(p => {
            if (viewGroup === 'hitters' && p.is_pitcher) return false;
            if (viewGroup === 'pitchers' && !p.is_pitcher) return false;
            if (viewMode === 'remaining' && (p.ogba_team_code || p.team)) return false;
            if (search && !p.player_name?.toLowerCase().includes(search.toLowerCase())) return false;
            if (filterTeam !== 'ALL' && (p.mlb_team || 'FA') !== filterTeam) return false;
            if (filterFantasyTeam !== 'ALL' && (p.ogba_team_code || 'FA') !== filterFantasyTeam) return false;

            if (filterPos !== 'ALL') {
                const pPos = getPrimaryPosition(p.positions);
                if (!pPos.includes(filterPos)) return false;
            }
            if (filterLeague !== 'ALL') {
                const team = (p.mlb_team || (p as any).mlbTeam || '').toString().trim();
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

            if (sortKey === 'name') {
                valA = getLastName(a.mlb_full_name || a.player_name);
                valB = getLastName(b.mlb_full_name || b.player_name);
                return sortDesc ? valB.toString().localeCompare(valA.toString()) : valA.toString().localeCompare(valB.toString());
            } else if (sortKey === 'pos') {
                const posA = getPrimaryPosition(a.positions);
                const posB = getPrimaryPosition(b.positions);
                const ia = POS_ORDER.indexOf(posA); const ib = POS_ORDER.indexOf(posB);
                const cmp = (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
                return sortDesc ? -cmp : cmp;
            } else if (sortKey === 'mlb_team') {
                valA = a.mlb_team || (a as any).mlbTeam || 'ZZZ';
                valB = b.mlb_team || (b as any).mlbTeam || 'ZZZ';
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
    }, [players, periodStats, periods, statsMode, viewGroup, viewMode, search, filterTeam, filterFantasyTeam, filterPos, filterLeague, sortKey, sortDesc]);

    const toggleExpand = (id: string) => {
        setExpandedId(prev => (prev === id ? null : id));
    };

    const handleSort = (key: string) => {
        if (sortKey === key) setSortDesc(!sortDesc);
        else {
            setSortKey(key);
            setSortDesc(key !== 'name' && key !== 'mlb_team' && key !== 'fantasy');
        }
    };

    return (
        <div className="space-y-0">
            {/* Filters Header */}
            <div className="p-4">
                <PlayerFilterBar
                  viewGroup={viewGroup}
                  onViewGroupChange={setViewGroup}
                  filterLeague={filterLeague}
                  onFilterLeagueChange={setFilterLeague}
                  searchQuery={search}
                  onSearchChange={setSearch}
                  viewMode={viewMode}
                  onViewModeChange={setViewMode}
                  statsMode={statsMode}
                  onStatsModeChange={setStatsMode}
                  periods={periods.map(p => ({ id: p, label: `Period ${p}` }))}
                  filterTeam={filterTeam}
                  onFilterTeamChange={setFilterTeam}
                  uniqueMLBTeams={uniqueMLBTeams}
                  filterFantasyTeam={filterFantasyTeam}
                  onFilterFantasyTeamChange={setFilterFantasyTeam}
                  uniqueFantasyTeams={uniqueFantasyTeams}
                  filterPos={filterPos}
                  onFilterPosChange={setFilterPos}
                  showLeagueGroups={false}
                />
            </div>

            {/* Results Table */}
                <ThemedTable bare aria-label="Add/Drop player list">
                    <ThemedThead sticky>
                        <ThemedTr>
                            <SortableHeader sortKey="name" activeSortKey={sortKey} sortDesc={sortDesc} onSort={handleSort} frozen className="pl-2 w-[220px]">Name</SortableHeader>
                            <SortableHeader sortKey="pos" activeSortKey={sortKey} sortDesc={sortDesc} onSort={handleSort} align="center" className="w-14">Pos</SortableHeader>
                            <SortableHeader sortKey="mlb_team" activeSortKey={sortKey} sortDesc={sortDesc} onSort={handleSort} align="center" className="w-16">MLB</SortableHeader>

                            {viewGroup === 'hitters' ? (
                                <HitterStatHeaders sortKey={sortKey} sortDesc={sortDesc} onSort={handleSort} />
                            ) : (
                                <PitcherStatHeaders sortKey={sortKey} sortDesc={sortDesc} onSort={handleSort} />
                            )}

                            <ThemedTh align="center" className="pr-8 w-48">
                                Action
                            </ThemedTh>
                        </ThemedTr>
                    </ThemedThead>
                    <tbody className="divide-y divide-[var(--lg-divide)]">
                        {filteredPlayers.map((p: PlayerSeasonStat) => {
                            const isExpanded = expandedId === p.row_id;
                            const isTaken = !!p.ogba_team_code || !!p.team;
                            const teamLabel = p.ogba_team_code ? (OGBA_TEAM_NAMES[p.ogba_team_code] || p.ogba_team_code) : (p.team ? 'Taken' : '');
                            const mlbTeam = getMlbTeamAbbr(p);
                            const pos = getPrimaryPosition(p.positions) || (p.is_pitcher ? 'P' : 'UT');

                            return (
                                <React.Fragment key={p.row_id}>
                                    <ThemedTr
                                        className={`group cursor-pointer transition-colors duration-300 ${isExpanded ? 'bg-[var(--lg-accent)]/10' : 'hover:bg-[var(--lg-tint)]'}`}
                                        onClick={() => toggleExpand(p.row_id ?? '')}
                                    >
                                        <ThemedTd frozen className="pl-2 w-[220px]">
                                            <div className="flex items-center gap-1.5">
                                                <PlayerNameCell position={pos} name={p.mlb_full_name || p.player_name} isPitcher={p.is_pitcher} />
                                                {isTaken && (
                                                    <span className="text-[9px] font-medium text-[var(--lg-text-muted)] opacity-50 ml-1">
                                                        {teamLabel}
                                                    </span>
                                                )}
                                            </div>
                                        </ThemedTd>

                                        <ThemedTd align="center">
                                            <span className="text-[10px] font-medium text-[var(--lg-text-muted)]">{pos}</span>
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

                                        <ThemedTd align="center">
                                            <div className="flex items-center justify-center gap-1" onClick={e => e.stopPropagation()}>
                                                {canWatch && p.id != null && (() => {
                                                    const pid = p.id as number;
                                                    const isWatched = watchedIds.has(pid);
                                                    const isPending = pendingIds.has(pid);
                                                    return (
                                                        <button
                                                            type="button"
                                                            disabled={isPending}
                                                            aria-label={isWatched ? "Remove from watchlist" : "Add to watchlist"}
                                                            aria-pressed={isWatched}
                                                            title={isWatched ? "Remove from watchlist" : "Add to watchlist"}
                                                            onClick={() => toggleWatch(pid, isWatched)}
                                                            className={`p-1 rounded transition-colors ${
                                                                isWatched
                                                                    ? "text-amber-400 hover:text-amber-300"
                                                                    : "text-[var(--lg-text-muted)] opacity-30 group-hover:opacity-80 hover:text-amber-400"
                                                            } ${isPending ? "cursor-wait" : "cursor-pointer"}`}
                                                        >
                                                            <Star className={`w-3.5 h-3.5 ${isWatched ? "fill-current" : ""}`} />
                                                        </button>
                                                    );
                                                })()}
                                                {!isTaken && (
                                                    <button
                                                        onClick={() => onClaim(p)}
                                                        disabled={disabled}
                                                        className="px-2 py-px bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded text-[9px] font-bold uppercase transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        {disabled ? "..." : "Add"}
                                                    </button>
                                                )}
                                                {isTaken && onDrop && (
                                                    <button
                                                        onClick={() => onDrop(p)}
                                                        disabled={disabled}
                                                        className="px-2 py-px bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded text-[9px] font-bold uppercase transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        Drop
                                                    </button>
                                                )}
                                            </div>
                                        </ThemedTd>
                                    </ThemedTr>

                                    {isExpanded && (
                                        <PlayerExpandedRow
                                            player={p}
                                            isTaken={isTaken}
                                            ownerName={teamLabel}
                                            onViewDetail={setSelectedPlayer}
                                            colSpan={9}
                                        />
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </ThemedTable>

            {filteredPlayers.length === 0 && (
                <div className="flex flex-col items-center justify-center p-32 text-center opacity-40">
                    <div className="text-4xl mb-6">&#x1F4E1;</div>
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
    );
}
