import React, { useState, useMemo, useEffect } from 'react';
import { getPrimaryPosition, getLastName, POS_ORDER } from '../../../lib/baseballUtils';
import { getPlayerPeriodStats, PlayerSeasonStat, PeriodStatRow, fmtRate } from '../../../api';
import { NL_TEAMS, AL_TEAMS } from '../../../lib/sportConfig';
import { OGBA_TEAM_NAMES } from '../../../lib/ogbaTeams';
import { getMlbTeamAbbr } from '../../../lib/playerDisplay';
import { ThemedTable, ThemedThead, ThemedTh, ThemedTr, ThemedTd } from "../../../components/ui/ThemedTable";
import PlayerDetailModal from '../../../components/PlayerDetailModal';
import PlayerExpandedRow from '../../auction/components/PlayerExpandedRow';
import { useLeague } from '../../../contexts/LeagueContext';

interface AddDropTabProps {
    players: PlayerSeasonStat[];
    myTeamRoster?: PlayerSeasonStat[];
    onClaim: (player: PlayerSeasonStat, dropPlayerId?: number) => void;
    onDrop?: (player: PlayerSeasonStat) => void;
}

export default function AddDropTab({ players, myTeamRoster, onClaim, onDrop }: AddDropTabProps) {
    const { leagueId } = useLeague();

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
        const codes = new Set(players.map(p => p.ogba_team_code).filter(Boolean));
        return ['ALL', ...Array.from(codes).sort()];
    }, [players]);

    const uniquePositions = POS_ORDER;

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
                <div className="flex flex-wrap items-center gap-3 md:gap-6">
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

                    {/* League Filter Toggle */}
                    <div className="flex bg-[var(--lg-tint)] rounded-[var(--lg-radius-lg)] p-1 border border-[var(--lg-border-subtle)]">
                        {(['ALL', 'AL', 'NL'] as const).map(lg => (
                            <button
                                key={lg}
                                onClick={() => setFilterLeague(lg)}
                                className={`px-4 py-2 text-xs font-bold uppercase tracking-wide rounded-[var(--lg-radius-md)] transition-all ${filterLeague === lg ? 'bg-[var(--lg-accent)] text-white shadow-xl shadow-blue-500/20 scale-[1.02]' : 'text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)] hover:bg-[var(--lg-tint)]'}`}
                            >
                                {lg}
                            </button>
                        ))}
                    </div>

                    {/* Search */}
                    <div className="relative group flex-1 min-w-[240px]">
                        <input
                            type="text"
                            placeholder="Search players..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="lg-input pr-10"
                        />
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-sm opacity-30 group-focus-within:opacity-100 transition-opacity">&#x1F50D;</div>
                    </div>

                    {/* Filter Dropdowns */}
                    <div className="grid grid-cols-2 md:flex gap-2 md:gap-4">
                        <select
                            value={viewMode}
                            onChange={e => setViewMode(e.target.value as 'all' | 'remaining')}
                            className="lg-input w-auto min-w-[140px] font-medium text-xs py-2.5"
                        >
                            <option value="all">All Players</option>
                            <option value="remaining">Available</option>
                        </select>

                        <select
                            value={statsMode}
                            onChange={e => setStatsMode(e.target.value)}
                            className="lg-input w-auto min-w-[140px] font-medium text-xs py-2.5"
                        >
                            <option value="season">Season</option>
                            {periods.map(p => (
                                <option key={p} value={`period-${p}`}>Period {p}</option>
                            ))}
                        </select>

                        <select
                            value={filterTeam}
                            onChange={e => setFilterTeam(e.target.value)}
                            className="lg-input w-auto min-w-[140px] font-medium text-xs py-2.5"
                        >
                            <option value="ALL">All MLB Teams</option>
                            {uniqueMLBTeams.filter(t => t !== 'ALL').map(t => <option key={t} value={t}>{t}</option>)}
                        </select>

                        <select
                            value={filterFantasyTeam}
                            onChange={e => setFilterFantasyTeam(e.target.value)}
                            className="lg-input w-auto min-w-[140px] font-medium text-xs py-2.5"
                        >
                            <option value="ALL">All Fantasy Teams</option>
                            {uniqueFantasyTeams.filter(t => t !== 'ALL').map(t => <option key={t} value={t as string}>{OGBA_TEAM_NAMES[t as string] || t}</option>)}
                        </select>

                        <select
                            value={filterPos}
                            onChange={e => setFilterPos(e.target.value)}
                            className="lg-input w-auto min-w-[140px] font-medium text-xs py-2.5"
                        >
                            <option value="ALL">All Positions</option>
                            {uniquePositions.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            {/* Results Table */}
            <div className="overflow-x-auto">
                <ThemedTable bare>
                    <ThemedThead>
                        <ThemedTr>
                            <ThemedTh className="pl-8 py-3" onClick={() => handleSort('name')}>
                                Name {sortKey === 'name' && (sortDesc ? '▼' : '▲')}
                            </ThemedTh>

                            <ThemedTh align="center" className="w-16" onClick={() => handleSort('mlb_team')}>
                                MLB {sortKey === 'mlb_team' && (sortDesc ? '▼' : '▲')}
                            </ThemedTh>

                            {viewGroup === 'hitters' ? (
                                <>
                                    <ThemedTh align="center" className="w-16" onClick={() => handleSort('R')}>R {sortKey === 'R' && (sortDesc ? '▼' : '▲')}</ThemedTh>
                                    <ThemedTh align="center" className="w-16" onClick={() => handleSort('HR')}>HR {sortKey === 'HR' && (sortDesc ? '▼' : '▲')}</ThemedTh>
                                    <ThemedTh align="center" className="w-16" onClick={() => handleSort('RBI')}>RBI {sortKey === 'RBI' && (sortDesc ? '▼' : '▲')}</ThemedTh>
                                    <ThemedTh align="center" className="w-16" onClick={() => handleSort('SB')}>SB {sortKey === 'SB' && (sortDesc ? '▼' : '▲')}</ThemedTh>
                                    <ThemedTh align="center" className="w-16" onClick={() => handleSort('AVG')}>AVG {sortKey === 'AVG' && (sortDesc ? '▼' : '▲')}</ThemedTh>
                                </>
                            ) : (
                                <>
                                    <ThemedTh align="center" className="w-16" onClick={() => handleSort('W')}>W {sortKey === 'W' && (sortDesc ? '▼' : '▲')}</ThemedTh>
                                    <ThemedTh align="center" className="w-16" onClick={() => handleSort('SV')}>SV {sortKey === 'SV' && (sortDesc ? '▼' : '▲')}</ThemedTh>
                                    <ThemedTh align="center" className="w-16" onClick={() => handleSort('K')}>K {sortKey === 'K' && (sortDesc ? '▼' : '▲')}</ThemedTh>
                                    <ThemedTh align="center" className="w-20" onClick={() => handleSort('ERA')}>ERA {sortKey === 'ERA' && (sortDesc ? '▼' : '▲')}</ThemedTh>
                                    <ThemedTh align="center" className="w-20" onClick={() => handleSort('WHIP')}>WHIP {sortKey === 'WHIP' && (sortDesc ? '▼' : '▲')}</ThemedTh>
                                </>
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
                                        <ThemedTd className="pl-8 py-3">
                                            <div className="flex flex-col">
                                                <span className="font-bold text-[var(--lg-text-primary)] text-base tracking-tight group-hover:text-[var(--lg-accent)] transition-colors leading-tight">
                                                    {p.mlb_full_name || p.player_name}
                                                </span>
                                                <div className="flex items-center gap-3 mt-1.5">
                                                    <span className={`px-1.5 py-0.5 rounded-[var(--lg-radius-sm)] text-xs font-bold uppercase tracking-wide ${p.is_pitcher ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'}`}>
                                                        {pos}
                                                    </span>
                                                    {isTaken && (
                                                        <span className="text-xs font-medium text-[var(--lg-text-muted)] opacity-60">
                                                            {teamLabel}
                                                        </span>
                                                    )}
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
                                            <div className="flex items-center justify-center gap-2" onClick={e => e.stopPropagation()}>
                                                {!isTaken && (
                                                    <button
                                                        onClick={() => onClaim(p)}
                                                        className="px-4 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-medium uppercase transition-all"
                                                    >
                                                        Add
                                                    </button>
                                                )}
                                                {isTaken && onDrop && (
                                                    <button
                                                        onClick={() => onDrop(p)}
                                                        className="px-4 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl text-xs font-medium uppercase transition-all"
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
            </div>

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
