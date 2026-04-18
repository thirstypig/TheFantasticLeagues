import React, { useState, useMemo, useEffect } from 'react';
import PlayerExpandedRow from './PlayerExpandedRow';
import { getLastName } from '../../../lib/baseballUtils';
import { ThemedTable, ThemedThead, ThemedTbody, ThemedTh, ThemedTr, ThemedTd } from '../../../components/ui/ThemedTable';
import { SortableHeader } from '../../../components/ui/SortableHeader';
import { Star } from 'lucide-react';
import { HitterStatHeaders, PitcherStatHeaders, HitterStatCells, PitcherStatCells } from '../../../components/shared/PlayerStatsColumns';

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
  showBidPicker?: boolean;
  defaultLeagueFilter?: 'ALL' | 'NL' | 'AL';
  rankings?: Map<string, number>;
}

import { POS_ORDER, getPrimaryPosition } from '../../../lib/baseballUtils';
import { mapPosition, positionToSlots, NL_TEAMS, AL_TEAMS } from '../../../lib/sportConfig';
import { useLeague } from '../../../contexts/LeagueContext';

export default function PlayerPoolTab({ players, teams = [], onNominate, onQueue, isQueued, myTeamId, auctionConfig, onForceAssign, isCommissioner, starredIds, onToggleStar, activeBidPlayerId, activeBidAmount, showBidPicker = true, defaultLeagueFilter = 'ALL', rankings }: PlayerPoolTabProps) {
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
  type StatKey = 'name' | 'AB' | 'R' | 'HR' | 'RBI' | 'SB' | 'AVG' | 'W' | 'SV' | 'K' | 'ERA' | 'WHIP' | 'val' | 'rank';
  const [sortKey, setSortKey] = useState<StatKey>('name');
  const [sortDesc, setSortDesc] = useState(false);

  const hasRankings = rankings && rankings.size > 0;

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterLeague, setFilterLeague] = useState<'ALL' | 'NL' | 'AL'>(defaultLeagueFilter);
  const [filterTeam, setFilterTeam] = useState<string>('ALL'); // Real MLB Team
  const [filterPos, setFilterPos] = useState<string>('ALL');

  // My team data for position checks and personalized value
  const myTeamData = useMemo(() => teams.find(t => t.id === myTeamId), [teams, myTeamId]);

  // Personalized "My Value" — adjusts base value by position need and budget pressure
  const computeMyValue = useMemo(() => {
    if (!myTeamData || !auctionConfig) return (_p: PlayerSeasonStat) => null;

    const posLimits = auctionConfig.positionLimits ?? {};
    const pitcherMax = auctionConfig.pitcherCount ?? 9;
    const batterMax = auctionConfig.batterCount ?? 14;
    const teamPosCounts = myTeamData.positionCounts ?? {};
    const teamPitchers = myTeamData.pitcherCount ?? 0;
    const teamHitters = myTeamData.hitterCount ?? 0;
    const spotsLeft = myTeamData.spotsLeft ?? 0;
    const budget = myTeamData.budget ?? 0;
    const avgPerSpot = spotsLeft > 0 ? budget / spotsLeft : 0;

    // Count how many teams still need each position (scarcity)
    const positionDemand: Record<string, number> = {};
    for (const pos of Object.keys(posLimits)) {
      let teamsNeedingPos = 0;
      for (const t of teams) {
        const filled = t.positionCounts?.[pos] ?? 0;
        const limit = posLimits[pos];
        if (limit && filled < limit) teamsNeedingPos++;
      }
      positionDemand[pos] = teamsNeedingPos;
    }

    return (player: PlayerSeasonStat): number | null => {
      const baseVal = player.dollar_value ?? player.value;
      if (!baseVal) return null;

      const isPitch = player.is_pitcher;
      const primaryPos = getPrimaryPosition(player.positions).toUpperCase();
      const slots = positionToSlots(primaryPos);

      // 1. Position need multiplier
      let needMultiplier = 1.0;

      // Check if type (pitcher/hitter) is full
      if (isPitch && teamPitchers >= pitcherMax) {
        needMultiplier = 0.2; // Position full — very low value to me
      } else if (!isPitch && teamHitters >= batterMax) {
        needMultiplier = 0.2;
      } else {
        // Check specific position slots
        const openSlots = slots.filter(slot => {
          const limit = posLimits[slot];
          if (limit === undefined) return true; // No limit = always open
          return (teamPosCounts[slot] ?? 0) < limit;
        });

        if (slots.length > 0 && openSlots.length === 0) {
          needMultiplier = 0.3; // All position slots full
        } else if (openSlots.length > 0) {
          // Boost for positions I need
          const filledRatio = slots.length > 0
            ? 1 - (openSlots.length / slots.length)
            : 0;
          needMultiplier = 1.0 + (1 - filledRatio) * 0.3; // Up to +30% boost for empty positions
        }
      }

      // 2. Budget pressure — can I afford this player?
      let budgetMultiplier = 1.0;
      if (baseVal > avgPerSpot * 2) {
        budgetMultiplier = 0.8; // Expensive relative to my remaining budget
      } else if (baseVal <= avgPerSpot * 0.5 && baseVal > 0) {
        budgetMultiplier = 1.1; // Bargain relative to my budget
      }

      // 3. Scarcity — more teams need this position = higher value
      let scarcityMultiplier = 1.0;
      for (const slot of slots) {
        const demand = positionDemand[slot] ?? 0;
        if (demand >= 5) scarcityMultiplier = Math.max(scarcityMultiplier, 1.2);
        else if (demand >= 3) scarcityMultiplier = Math.max(scarcityMultiplier, 1.1);
      }

      // 4. Market pressure — if league-wide budget is low, prices drop
      let marketMultiplier = 1.0;
      const totalBudget = teams.reduce((sum, t) => sum + (t.budget ?? 0), 0);
      const totalSpots = teams.reduce((sum, t) => sum + (t.spotsLeft ?? 0), 0);
      const leagueAvgPerSpot = totalSpots > 0 ? totalBudget / totalSpots : 0;
      if (leagueAvgPerSpot < 10) marketMultiplier = 0.7; // Very tight market
      else if (leagueAvgPerSpot < 15) marketMultiplier = 0.85;
      else if (leagueAvgPerSpot > 25) marketMultiplier = 1.15; // Lots of money left

      const raw = baseVal * needMultiplier * budgetMultiplier * scarcityMultiplier * marketMultiplier;
      return Math.max(1, Math.round(raw)); // Minimum value is $1
    };
  }, [myTeamData, auctionConfig, teams]);

  // Position limit check (visual hint only)

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
      if (key === 'rank') {
        const r = rankings?.get((p.player_name || '').toLowerCase());
        return r ?? 9999; // unranked players sort to end
      }
      if (key === 'val') {
        if (myTeamId) {
          const myVal = computeMyValue(p);
          if (myVal != null) return myVal;
        }
        const raw = Number(p.dollar_value ?? p.value ?? 0);
        return raw ? Math.max(1, raw) : 0;
      }
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

  const handleHeaderClick = (key: string) => {
      if (sortKey === key) {
          setSortDesc(!sortDesc);
      } else {
          setSortKey(key as StatKey);
          // Default to descending for stats (higher is better), ascending for name
          setSortDesc(key !== 'name');
      }
  };


  // Focus nom input when it appears
  useEffect(() => {
    if (nominatingPlayer && nomInputRef.current) nomInputRef.current.focus();
  }, [nominatingPlayer]);

  // Column count for expanded row colspan (star + rank + name + 5 stats + val + action)
  const colCount = (onToggleStar ? 9 : 8) + (hasRankings ? 1 : 0);

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
        <ThemedTable bare density="compact">
            <ThemedThead sticky>
                <ThemedTr>
                    {onToggleStar && <ThemedTh className="w-6 px-0.5"> </ThemedTh>}
                    {hasRankings && <SortableHeader sortKey="rank" activeSortKey={sortKey} sortDesc={sortDesc} onSort={handleHeaderClick} align="center" className="px-1 w-8" title="My Rank (from imported rankings)">#R</SortableHeader>}
                    <SortableHeader sortKey="name" activeSortKey={sortKey} sortDesc={sortDesc} onSort={handleHeaderClick} className="px-2 tracking-wide">Player</SortableHeader>
                    {viewGroup === 'hitters' ? (
                        <HitterStatHeaders sortKey={sortKey} sortDesc={sortDesc} onSort={handleHeaderClick} />
                    ) : (
                        <PitcherStatHeaders sortKey={sortKey} sortDesc={sortDesc} onSort={handleHeaderClick} />
                    )}
                    <SortableHeader sortKey="val" activeSortKey={sortKey} sortDesc={sortDesc} onSort={handleHeaderClick} align="center" className="px-1 w-10" title={myTeamId ? "Personalized value based on your roster needs, budget, and position scarcity." : "Projected auction value."}>{myTeamId ? 'My Val' : 'Val'}</SortableHeader>
                    <ThemedTh className="w-14 px-1" title="Click Nom to nominate a player for auction"> </ThemedTh>
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
                                {/* My Rank */}
                                {hasRankings && (() => {
                                    const myRank = rankings?.get((p.player_name || '').toLowerCase());
                                    return (
                                        <ThemedTd align="center" className="px-1 w-8">
                                            {myRank ? (
                                                <span className="text-[10px] font-bold tabular-nums text-[var(--lg-accent)]">{myRank}</span>
                                            ) : (
                                                <span className="text-[10px] text-[var(--lg-text-muted)] opacity-20">-</span>
                                            )}
                                        </ThemedTd>
                                    );
                                })()}
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
                                    <HitterStatCells row={p} />
                                ) : (
                                    <PitcherStatCells row={p} />
                                )}

                                {/* Value + Surplus (AUC-05) / My Value */}
                                <ThemedTd align="center" className="px-1">
                                    {(() => {
                                        const baseVal = p.dollar_value ?? p.value;
                                        const myVal = myTeamId ? computeMyValue(p) : null;
                                        const displayVal = myVal ?? baseVal;

                                        if (!displayVal && displayVal !== 0) return <span className="text-xs text-[var(--lg-text-muted)] opacity-30 cursor-help" title="No projected value available for this player">-</span>;

                                        const isActiveBid = activeBidPlayerId && String(p.mlb_id) === activeBidPlayerId && activeBidAmount;
                                        if (isActiveBid) {
                                            const surplus = displayVal - activeBidAmount!;
                                            return (
                                                <div className="flex flex-col items-center leading-tight">
                                                    <span className="text-[10px] text-[var(--lg-text-muted)]">${displayVal}</span>
                                                    <span className={`text-[10px] font-bold ${surplus > 0 ? 'text-emerald-400' : surplus < 0 ? 'text-red-400' : 'text-[var(--lg-text-muted)]'}`}>
                                                        {surplus > 0 ? '+' : ''}{surplus}
                                                    </span>
                                                </div>
                                            );
                                        }

                                        // Show personalized value with color + tooltip
                                        const diff = myVal != null && baseVal ? myVal - baseVal : 0;
                                        const tooltip = myVal != null && baseVal
                                          ? `Base: $${baseVal} → Your value: $${myVal} (${diff >= 0 ? '+' : ''}${diff} based on roster needs)`
                                          : `Projected value: $${displayVal}`;

                                        return (
                                          <span
                                            className={`text-xs font-semibold cursor-help ${displayVal > 10 ? 'text-emerald-400' : displayVal > 0 ? 'text-[var(--lg-text-secondary)]' : 'text-red-400'}`}
                                            title={tooltip}
                                          >
                                            ${displayVal}
                                          </span>
                                        );
                                    })()}
                                </ThemedTd>

                                {/* Nominate / Bid picker */}
                                <ThemedTd align="center" className="px-1">
                                    {!isTaken && onNominate && (
                                        showBidPicker && nominatingPlayer?.mlb_id === p.mlb_id ? (
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
                                                disabled={isPositionFullForMyTeam(p)}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (isPositionFullForMyTeam(p)) return;
                                                    if (showBidPicker) {
                                                        setNominatingPlayer(p);
                                                        setStartBidInput('1');
                                                    } else {
                                                        onNominate(p, 1);
                                                    }
                                                }}
                                                className={`text-[10px] font-semibold uppercase px-2 py-1 rounded-md transition-all ${
                                                    isPositionFullForMyTeam(p)
                                                        ? 'bg-[var(--lg-border-subtle)] text-[var(--lg-text-muted)] cursor-not-allowed opacity-60'
                                                        : 'bg-[var(--lg-accent)] text-white hover:opacity-90 active:scale-95'
                                                }`}
                                                title={isPositionFullForMyTeam(p) ? 'Position full for your team' : 'Nominate'}
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
