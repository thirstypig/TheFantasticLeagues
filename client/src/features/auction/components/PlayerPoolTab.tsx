import React, { useState, useMemo, useEffect } from 'react';
import PlayerExpandedRow from './PlayerExpandedRow';
import { getLastName } from '../../../lib/baseballUtils';
import { ThemedTable, ThemedThead, ThemedTbody, ThemedTh, ThemedTr, ThemedTd } from '../../../components/ui/ThemedTable';
import { Star } from 'lucide-react';

import {
  PlayerSeasonStat,
  fmtRate,
} from '../../../api';

interface AuctionConfig {
  pitcherCount?: number;
  batterCount?: number;
  positionLimits?: Record<string, number> | null;
}

interface PlayerPoolTabProps {
  players: PlayerSeasonStat[];
  teams?: { code: string; name: string; id?: number; positionCounts?: Record<string, number>; pitcherCount?: number; hitterCount?: number; budget?: number; maxBid?: number; rosterCount?: number; spotsLeft?: number }[];
  onNominate?: (player: PlayerSeasonStat, startBid?: number) => void;
  onQueue?: (playerId: string | number) => void;
  isQueued?: (playerId: string | number) => boolean;
  myTeamId?: number;
  auctionConfig?: AuctionConfig;
  onForceAssign?: (player: PlayerSeasonStat, teamId: number, price: number) => void;
  isCommissioner?: boolean;
  starredIds?: Set<string>;
  onToggleStar?: (mlbId: string) => void;
  activeBidPlayerId?: string;
  activeBidAmount?: number;
}

import { POS_ORDER, getPrimaryPosition } from '../../../lib/baseballUtils';
import { mapPosition, positionToSlots, NL_TEAMS, AL_TEAMS } from '../../../lib/sportConfig';
import { useLeague } from '../../../contexts/LeagueContext';

export default function PlayerPoolTab({ players, teams = [], onNominate, onQueue, isQueued, myTeamId, auctionConfig, onForceAssign, isCommissioner, starredIds, onToggleStar, activeBidPlayerId, activeBidAmount }: PlayerPoolTabProps) {
  const { outfieldMode } = useLeague();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);

  // Nomination bid picker state
  const [nominatingPlayer, setNominatingPlayer] = useState<PlayerSeasonStat | null>(null);
  const [startBidInput, setStartBidInput] = useState('1');
  const nomInputRef = React.useRef<HTMLInputElement>(null);

  // View State — default to "remaining" (available players)
  const [viewGroup, setViewGroup] = useState<'hitters' | 'pitchers'>('hitters');
  const [viewMode, setViewMode] = useState<'all' | 'remaining' | 'starred'>('remaining');

  // Sort State
  type StatKey = 'name' | 'R' | 'HR' | 'RBI' | 'SB' | 'AVG' | 'W' | 'SV' | 'K' | 'ERA' | 'WHIP' | 'val';
  const [sortKey, setSortKey] = useState<StatKey>('name');
  const [sortDesc, setSortDesc] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterLeague, setFilterLeague] = useState<'ALL' | 'NL' | 'AL'>('ALL');
  const [filterTeam, setFilterTeam] = useState<string>('ALL'); // Real MLB Team
  const [filterPos, setFilterPos] = useState<string>('ALL');

  // Position limit check: is this position full for MY team? (visual hint only —
  // nominations are always allowed; position limits are enforced on bids)
  const myTeamData = useMemo(() => teams.find(t => t.id === myTeamId), [teams, myTeamId]);

  const isPositionFullForMyTeam = useMemo(() => {
    if (!myTeamData || !auctionConfig) return () => false;
    const posLimits = auctionConfig.positionLimits;
    const pitcherMax = auctionConfig.pitcherCount ?? 9;
    const batterMax = auctionConfig.batterCount ?? 14;
    const teamPosCounts = myTeamData.positionCounts ?? {};
    const teamPitchers = myTeamData.pitcherCount ?? 0;
    const teamHitters = myTeamData.hitterCount ?? 0;

    return (player: PlayerSeasonStat): boolean => {
      const isPitch = player.is_pitcher;

      // Check pitcher/hitter totals
      if (isPitch && teamPitchers >= pitcherMax) return true;
      if (!isPitch && teamHitters >= batterMax) return true;

      // Check per-position limits (hitters only)
      if (!isPitch && posLimits) {
        const primaryPos = getPrimaryPosition(player.positions).toUpperCase();
        const slots = positionToSlots(primaryPos);
        if (slots.length > 0) {
          const allFull = slots.every(slot => {
            const limit = posLimits[slot];
            if (limit === undefined) return false;
            return (teamPosCounts[slot] ?? 0) >= limit;
          });
          if (allFull) return true;
        }
      }

      return false;
    };
  }, [myTeamData, auctionConfig]);

  // Derived Options
  const uniqueTeams = useMemo(() => {
    const teams = new Set(players.map(p => p.mlb_team || 'FA'));
    return ['ALL', ...Array.from(teams).sort()];
  }, [players]);

  const uniquePositions = POS_ORDER;

  // Helper to get stat value
  const getStat = (p: PlayerSeasonStat, key: StatKey) => {
      if (key === 'val') return Number(p.dollar_value ?? p.value ?? 0);
      const val = p[key] ?? 0;
      return Number(val) || 0;
  };

  // Filter & Sort
  const filteredPlayers = useMemo(() => {
     let res = players;

     // 0. Filter by Group (Hitter vs Pitcher)
     if (viewGroup === 'hitters') {
         res = res.filter(p => !p.is_pitcher);
     } else {
         res = res.filter(p => p.is_pitcher);
     }

     // 1. Filter by availability / starred
     if (viewMode === 'remaining') {
         res = res.filter(p => !p.ogba_team_code && !p.team);
     } else if (viewMode === 'starred') {
         res = res.filter(p => starredIds?.has(String(p.mlb_id)));
     }

     // 2. League filter (NL/AL/All)
     if (filterLeague !== 'ALL') {
       const leagueTeams = filterLeague === 'NL' ? NL_TEAMS : AL_TEAMS;
       res = res.filter(p => leagueTeams.has(p.mlb_team || ''));
     }

     // 3. Search & Filters
     res = res.filter(p => {
        if (searchQuery && !p.player_name?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        if (filterTeam !== 'ALL' && (p.mlb_team || 'FA') !== filterTeam) return false;

        // Position filter — exact match on normalized position
        if (filterPos !== 'ALL') {
             const pPos = getPrimaryPosition(p.positions);
             if (pPos !== filterPos && !pPos.includes(filterPos + "/") && !pPos.includes("/" + filterPos)) return false;
        }
        return true;
     });

     // 3. Sort
     return res.sort((a, b) => {
         if (sortKey === 'name') {
             return sortDesc
                ? getLastName(b.player_name).localeCompare(getLastName(a.player_name))
                : getLastName(a.player_name).localeCompare(getLastName(b.player_name));
         }

         const valA = getStat(a, sortKey);
         const valB = getStat(b, sortKey);
         return sortDesc ? valB - valA : valA - valB;
     });
  }, [players, viewGroup, viewMode, searchQuery, filterLeague, filterTeam, filterPos, sortKey, sortDesc]);


  const toggleExpand = (id: string) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  const handleHeaderClick = (key: StatKey) => {
      if (sortKey === key) {
          setSortDesc(!sortDesc);
      } else {
          setSortKey(key);
          // Default to descending for stats (higher is better), ascending for name
          setSortDesc(key !== 'name');
      }
  };

  /** Sort indicator arrow */
  const sortArrow = (key: StatKey) =>
    sortKey === key ? (sortDesc ? ' ▾' : ' ▴') : '';

  // Focus nom input when it appears
  useEffect(() => {
    if (nominatingPlayer && nomInputRef.current) nomInputRef.current.focus();
  }, [nominatingPlayer]);

  // Column count for expanded row colspan (star + name + 5 stats + val + action)
  const colCount = onToggleStar ? 9 : 8;

  return (
    <div className="h-full flex flex-col bg-[var(--lg-glass-bg)]">
      {/* Single-line filter bar */}
      <div className="px-1.5 py-1 border-b border-[var(--lg-table-border)] flex items-center gap-1 bg-[var(--lg-glass-bg-hover)] z-10">

        {/* H / P toggle */}
        <div className="flex bg-[var(--lg-tint)] rounded-md p-0.5 border border-[var(--lg-border-subtle)] shrink-0">
            <button
                onClick={() => setViewGroup('hitters')}
                className={`px-2 py-1 text-[10px] font-semibold uppercase rounded transition-all ${viewGroup === 'hitters' ? 'bg-[var(--lg-accent)] text-white' : 'text-[var(--lg-text-muted)]'}`}
            >
                H
            </button>
            <button
                onClick={() => setViewGroup('pitchers')}
                className={`px-2 py-1 text-[10px] font-semibold uppercase rounded transition-all ${viewGroup === 'pitchers' ? 'bg-[var(--lg-accent)] text-white' : 'text-[var(--lg-text-muted)]'}`}
            >
                P
            </button>
        </div>

        {/* Expandable Search */}
        <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            className={`px-2 py-1 rounded-md bg-[var(--lg-tint)] border border-[var(--lg-border-subtle)] text-xs text-[var(--lg-text-primary)] outline-none focus:border-[var(--lg-accent)] placeholder:opacity-30 transition-all ${searchFocused || searchQuery ? 'w-32' : 'w-16'}`}
        />

        {/* All / Avail / Starred */}
        <div className="flex bg-[var(--lg-tint)] rounded-md p-0.5 border border-[var(--lg-border-subtle)] shrink-0">
            <button
                onClick={() => setViewMode('all')}
                className={`px-2 py-1 text-[10px] font-semibold uppercase rounded transition-all ${viewMode === 'all' ? 'bg-[var(--lg-tint-hover)] text-[var(--lg-text-primary)]' : 'text-[var(--lg-text-muted)]'}`}
            >
                All
            </button>
            <button
                onClick={() => setViewMode('remaining')}
                className={`px-2 py-1 text-[10px] font-semibold uppercase rounded transition-all ${viewMode === 'remaining' ? 'bg-[var(--lg-tint-hover)] text-[var(--lg-text-primary)]' : 'text-[var(--lg-text-muted)]'}`}
            >
                Avail
            </button>
            {onToggleStar && (
                <button
                    onClick={() => setViewMode('starred')}
                    className={`px-2 py-1 text-[10px] font-semibold rounded transition-all flex items-center gap-0.5 ${viewMode === 'starred' ? 'bg-amber-500/20 text-amber-400' : 'text-[var(--lg-text-muted)]'}`}
                    title="Starred players"
                >
                    <Star size={10} fill={viewMode === 'starred' ? 'currentColor' : 'none'} />
                </button>
            )}
        </div>

        {/* NL / AL / All toggle */}
        <div className="flex bg-[var(--lg-tint)] rounded-md p-0.5 border border-[var(--lg-border-subtle)] shrink-0">
            <button
                onClick={() => setFilterLeague('ALL')}
                className={`px-2 py-1 text-[10px] font-semibold uppercase rounded transition-all ${filterLeague === 'ALL' ? 'bg-[var(--lg-tint-hover)] text-[var(--lg-text-primary)]' : 'text-[var(--lg-text-muted)]'}`}
            >
                All
            </button>
            <button
                onClick={() => setFilterLeague('NL')}
                className={`px-2 py-1 text-[10px] font-semibold uppercase rounded transition-all ${filterLeague === 'NL' ? 'bg-[var(--lg-tint-hover)] text-[var(--lg-text-primary)]' : 'text-[var(--lg-text-muted)]'}`}
            >
                NL
            </button>
            <button
                onClick={() => setFilterLeague('AL')}
                className={`px-2 py-1 text-[10px] font-semibold uppercase rounded transition-all ${filterLeague === 'AL' ? 'bg-[var(--lg-tint-hover)] text-[var(--lg-text-primary)]' : 'text-[var(--lg-text-muted)]'}`}
            >
                AL
            </button>
        </div>

        {/* Pos + Team dropdowns */}
        <select
            value={filterPos}
            onChange={(e) => setFilterPos(e.target.value)}
            className="px-1.5 py-1 text-[10px] font-semibold uppercase rounded-md border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] text-[var(--lg-text-primary)] outline-none cursor-pointer"
        >
            <option value="ALL" className="text-black">Pos</option>
            {uniquePositions.map(p => <option key={p} value={p} className="text-black">{p}</option>)}
        </select>
        <select
            value={filterTeam}
            onChange={(e) => setFilterTeam(e.target.value)}
            className="px-1.5 py-1 text-[10px] font-semibold uppercase rounded-md border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] text-[var(--lg-text-primary)] outline-none cursor-pointer"
        >
            {uniqueTeams.map(t => <option key={t} value={t} className="text-black">{t === 'ALL' ? 'Tm' : t}</option>)}
        </select>

        {/* Count */}
        <span className="text-[10px] text-[var(--lg-text-muted)] tabular-nums ml-auto shrink-0">{filteredPlayers.length}</span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <ThemedTable bare compact>
            <ThemedThead className="sticky top-0 z-10 bg-[var(--lg-glass-bg-hover)]">
                <ThemedTr>
                    {onToggleStar && <ThemedTh className="w-6 px-0.5"> </ThemedTh>}
                    <ThemedTh className="px-2 tracking-wide" onClick={() => handleHeaderClick('name')}>Player{sortArrow('name')}</ThemedTh>
                    {viewGroup === 'hitters' ? (
                        <>
                             <ThemedTh align="center" className="px-1 w-8" onClick={() => handleHeaderClick('R')}>R{sortArrow('R')}</ThemedTh>
                             <ThemedTh align="center" className="px-1 w-8" onClick={() => handleHeaderClick('HR')}>HR{sortArrow('HR')}</ThemedTh>
                             <ThemedTh align="center" className="px-1 w-8" onClick={() => handleHeaderClick('RBI')}>RBI{sortArrow('RBI')}</ThemedTh>
                             <ThemedTh align="center" className="px-1 w-8" onClick={() => handleHeaderClick('SB')}>SB{sortArrow('SB')}</ThemedTh>
                             <ThemedTh align="center" className="px-1 w-10" onClick={() => handleHeaderClick('AVG')}>AVG{sortArrow('AVG')}</ThemedTh>
                        </>
                    ) : (
                        <>
                             <ThemedTh align="center" className="px-1 w-8" onClick={() => handleHeaderClick('W')}>W{sortArrow('W')}</ThemedTh>
                             <ThemedTh align="center" className="px-1 w-8" onClick={() => handleHeaderClick('SV')}>SV{sortArrow('SV')}</ThemedTh>
                             <ThemedTh align="center" className="px-1 w-8" onClick={() => handleHeaderClick('K')}>K{sortArrow('K')}</ThemedTh>
                             <ThemedTh align="center" className="px-1 w-10" onClick={() => handleHeaderClick('ERA')}>ERA{sortArrow('ERA')}</ThemedTh>
                             <ThemedTh align="center" className="px-1 w-10" onClick={() => handleHeaderClick('WHIP')}>WHIP{sortArrow('WHIP')}</ThemedTh>
                        </>
                    )}
                    <ThemedTh align="center" className="px-1 w-10" onClick={() => handleHeaderClick('val')}>Val{sortArrow('val')}</ThemedTh>
                    <ThemedTh className="w-14 px-1"> </ThemedTh>
                </ThemedTr>
            </ThemedThead>
            <ThemedTbody className="divide-y divide-[var(--lg-table-border)]">
                {filteredPlayers.map((p: PlayerSeasonStat) => {
                    const isExpanded = expandedId === p.row_id;
                    const isTaken = !!p.ogba_team_code || !!p.team;
                    const owner = teams.find((t: { code: string; name: string }) => t.code === (p.ogba_team_code || p.team));

                    return (
                        <React.Fragment key={p.row_id}>
                            <ThemedTr
                                className={`${isExpanded ? 'bg-[var(--lg-tint)]' : ''} ${isTaken ? 'opacity-40' : ''}`}
                                onClick={() => toggleExpand(p.row_id ?? '')}
                            >
                                {/* Star */}
                                {onToggleStar && (
                                    <ThemedTd className="px-0.5 w-6" align="center">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onToggleStar(String(p.mlb_id)); }}
                                            className="p-0.5 hover:scale-110 transition-transform"
                                            title={starredIds?.has(String(p.mlb_id)) ? 'Remove from watchlist' : 'Add to watchlist'}
                                        >
                                            <Star size={12} className={starredIds?.has(String(p.mlb_id)) ? 'text-amber-400 fill-amber-400' : 'text-[var(--lg-text-muted)] opacity-30'} />
                                        </button>
                                    </ThemedTd>
                                )}
                                <ThemedTd className="px-2">
                                    <div className="font-semibold text-sm text-[var(--lg-text-primary)] leading-tight">
                                        {p.mlb_full_name || p.player_name}
                                    </div>
                                    <div className="text-[10px] text-[var(--lg-text-muted)] flex gap-1 items-center font-medium uppercase">
                                        <span className="text-[var(--lg-accent)]">{mapPosition(getPrimaryPosition(p.positions) || (p.is_pitcher ? 'P' : 'UT'), outfieldMode)}</span>
                                        <span className="opacity-30">·</span>
                                        <span>{p.mlb_team || 'FA'}</span>
                                        {isTaken && (
                                            <>
                                                <span className="opacity-30">·</span>
                                                <span className="text-[var(--lg-accent)]">{owner?.name ?? "Owned"}</span>
                                            </>
                                        )}
                                    </div>
                                </ThemedTd>

                                {viewGroup === 'hitters' ? (
                                    <>
                                        <ThemedTd align="center" className="text-xs text-[var(--lg-text-secondary)] px-1">{p.R || '-'}</ThemedTd>
                                        <ThemedTd align="center" className="text-xs text-[var(--lg-text-secondary)] px-1">{p.HR || '-'}</ThemedTd>
                                        <ThemedTd align="center" className="text-xs text-[var(--lg-text-secondary)] px-1">{p.RBI || '-'}</ThemedTd>
                                        <ThemedTd align="center" className="text-xs text-[var(--lg-text-secondary)] px-1">{p.SB || '-'}</ThemedTd>
                                        <ThemedTd align="center" className="text-xs text-[var(--lg-text-secondary)] px-1">{typeof p.AVG === 'number' ? fmtRate(p.AVG) : '-'}</ThemedTd>
                                    </>
                                ) : (
                                    <>
                                        <ThemedTd align="center" className="text-xs text-[var(--lg-text-secondary)] px-1">{p.W || '-'}</ThemedTd>
                                        <ThemedTd align="center" className="text-xs text-[var(--lg-text-secondary)] px-1">{p.SV || '-'}</ThemedTd>
                                        <ThemedTd align="center" className="text-xs text-[var(--lg-text-secondary)] px-1">{p.K || '-'}</ThemedTd>
                                        <ThemedTd align="center" className="text-xs text-[var(--lg-text-secondary)] px-1">{p.ERA ? Number(p.ERA).toFixed(2) : '-'}</ThemedTd>
                                        <ThemedTd align="center" className="text-xs text-[var(--lg-text-secondary)] px-1">{p.WHIP ? Number(p.WHIP).toFixed(2) : '-'}</ThemedTd>
                                    </>
                                )}

                                {/* Value + Surplus (AUC-05) */}
                                <ThemedTd align="center" className="px-1">
                                    {(() => {
                                        const val = p.dollar_value ?? p.value;
                                        if (!val) return <span className="text-xs text-[var(--lg-text-muted)] opacity-30">-</span>;
                                        const isActiveBid = activeBidPlayerId && String(p.mlb_id) === activeBidPlayerId && activeBidAmount;
                                        if (isActiveBid) {
                                            const surplus = val - activeBidAmount!;
                                            return (
                                                <div className="flex flex-col items-center leading-tight">
                                                    <span className="text-[10px] text-[var(--lg-text-muted)]">${val}</span>
                                                    <span className={`text-[10px] font-bold ${surplus > 0 ? 'text-emerald-400' : surplus < 0 ? 'text-red-400' : 'text-[var(--lg-text-muted)]'}`}>
                                                        {surplus > 0 ? '+' : ''}{surplus}
                                                    </span>
                                                </div>
                                            );
                                        }
                                        return <span className="text-xs text-[var(--lg-text-secondary)]">${val}</span>;
                                    })()}
                                </ThemedTd>

                                {/* Nominate / Bid picker */}
                                <ThemedTd align="center" className="px-1">
                                    {!isTaken && onNominate && (
                                        nominatingPlayer?.mlb_id === p.mlb_id ? (
                                            <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
                                                <span className="text-[10px] text-[var(--lg-text-muted)]">$</span>
                                                <input
                                                    ref={nomInputRef}
                                                    type="number"
                                                    min={1}
                                                    max={myTeamData?.maxBid ?? 999}
                                                    value={startBidInput}
                                                    onChange={e => setStartBidInput(e.target.value)}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter') {
                                                            const bid = Math.max(1, Math.min(parseInt(startBidInput) || 1, myTeamData?.maxBid ?? 999));
                                                            onNominate(p, bid);
                                                            setNominatingPlayer(null);
                                                            setStartBidInput('1');
                                                        }
                                                        if (e.key === 'Escape') {
                                                            setNominatingPlayer(null);
                                                            setStartBidInput('1');
                                                        }
                                                    }}
                                                    className="w-10 px-1 py-0.5 text-[10px] text-center rounded border border-[var(--lg-border-subtle)] bg-[var(--lg-bg-secondary)] text-[var(--lg-text-primary)] outline-none focus:ring-1 focus:ring-[var(--lg-accent)]"
                                                />
                                                <button
                                                    onClick={() => {
                                                        const bid = Math.max(1, Math.min(parseInt(startBidInput) || 1, myTeamData?.maxBid ?? 999));
                                                        onNominate(p, bid);
                                                        setNominatingPlayer(null);
                                                        setStartBidInput('1');
                                                    }}
                                                    className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-[var(--lg-accent)] text-white hover:opacity-90"
                                                >
                                                    Go
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setNominatingPlayer(p);
                                                    setStartBidInput('1');
                                                }}
                                                className={`text-[10px] font-semibold uppercase px-2 py-1 rounded-md hover:opacity-90 active:scale-95 transition-all ${
                                                    isPositionFullForMyTeam(p)
                                                        ? 'bg-[var(--lg-border-subtle)] text-[var(--lg-text-muted)]'
                                                        : 'bg-[var(--lg-accent)] text-white'
                                                }`}
                                                title={isPositionFullForMyTeam(p) ? 'Position full for your team (others can still bid)' : 'Nominate'}
                                            >
                                                Nom
                                            </button>
                                        )
                                    )}
                                </ThemedTd>
                            </ThemedTr>

                            {isExpanded && (
                                <PlayerExpandedRow
                                    player={p}
                                    isTaken={isTaken}
                                    ownerName={owner?.name ?? "Owned"}
                                    onNominate={onNominate}
                                    onQueue={onQueue}
                                    isQueued={isQueued}
                                    colSpan={colCount}
                                    onForceAssign={isCommissioner ? onForceAssign : undefined}
                                    assignTeams={isCommissioner ? teams.filter(t => t.id != null).map(t => ({ id: t.id!, name: t.name })) : undefined}
                                />
                            )}
                        </React.Fragment>
                    );
                })}
            </ThemedTbody>
        </ThemedTable>
        {filteredPlayers.length === 0 && (
            <div className="py-12 text-center text-xs font-medium text-[var(--lg-text-muted)] uppercase">
                No players found
            </div>
        )}
      </div>
    </div>
  );
}
