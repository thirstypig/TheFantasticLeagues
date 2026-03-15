import React, { useState, useMemo } from 'react';
import PlayerExpandedRow from './PlayerExpandedRow';
import { ThemedTable, ThemedThead, ThemedTh, ThemedTr, ThemedTd } from "../../../components/ui/ThemedTable";
import { getLastName } from '../../../lib/baseballUtils';

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
  teams?: { code: string; name: string; id?: number; positionCounts?: Record<string, number>; pitcherCount?: number; hitterCount?: number }[];
  onNominate?: (player: PlayerSeasonStat) => void;
  onQueue?: (playerId: string | number) => void;
  isQueued?: (playerId: string | number) => boolean;
  myTeamId?: number;
  auctionConfig?: AuctionConfig;
}

import { POS_ORDER, getPrimaryPosition } from '../../../lib/baseballUtils';

/** Map a player's MLB position to the roster slot(s) it can fill. */
function positionToSlots(pos: string): string[] {
  const p = pos.trim().toUpperCase();
  if (p === "C") return ["C"];
  if (p === "1B") return ["1B", "CI"];
  if (p === "2B") return ["2B", "MI"];
  if (p === "3B") return ["3B", "CI"];
  if (p === "SS") return ["SS", "MI"];
  if (p === "LF" || p === "CF" || p === "RF" || p === "OF") return ["OF"];
  if (p === "DH") return ["DH"];
  if (p === "P" || p === "SP" || p === "RP" || p === "TWP") return ["P"];
  return [];
}

const PITCHER_POS = new Set(["P", "SP", "RP", "TWP"]);

export default function PlayerPoolTab({ players, teams = [], onNominate, onQueue, isQueued, myTeamId, auctionConfig }: PlayerPoolTabProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);

  // View State — default to "remaining" (available players)
  const [viewGroup, setViewGroup] = useState<'hitters' | 'pitchers'>('hitters');
  const [viewMode, setViewMode] = useState<'all' | 'remaining'>('remaining');

  // Sort State
  const [sortKey, setSortKey] = useState<string>('value');
  const [sortDesc, setSortDesc] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
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
  const getStat = (p: PlayerSeasonStat, key: string) => {
      // @ts-expect-error key access
      const val = p[key] ?? p.dollar_value ?? 0;
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

     // 1. Filter Remaining
     if (viewMode === 'remaining') {
         res = res.filter(p => !p.ogba_team_code && !p.team);
     }

     // 2. Search & Filters
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
         let valA = 0;
         let valB = 0;

         if (sortKey === 'value') {
             valA = Number(a.value || a.dollar_value || 0);
             valB = Number(b.value || b.dollar_value || 0);
         } else if (sortKey === 'name') {
             return sortDesc
                ? getLastName(b.player_name).localeCompare(getLastName(a.player_name))
                : getLastName(a.player_name).localeCompare(getLastName(b.player_name));
         } else {
             valA = getStat(a, sortKey);
             valB = getStat(b, sortKey);
         }

         return sortDesc ? valB - valA : valA - valB;
     });
  }, [players, viewGroup, viewMode, searchQuery, filterTeam, filterPos, sortKey, sortDesc]);


  const toggleExpand = (id: string) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  const handleHeaderClick = (key: string) => {
      if (sortKey === key) {
          setSortDesc(!sortDesc);
      } else {
          setSortKey(key);
          setSortDesc(true);
      }
  };

  // Column count for expanded row colspan
  const colCount = viewGroup === 'hitters' ? 9 : 9;

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

        {/* All / Avail */}
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
        <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-[var(--lg-glass-bg-hover)] border-b border-[var(--lg-table-border)]">
                <tr>
                    <th className="text-left px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--lg-text-muted)] cursor-pointer" onClick={() => handleHeaderClick('name')}>Player</th>
                    {viewGroup === 'hitters' ? (
                        <>
                             <th className="text-center px-1 py-1.5 text-[10px] font-semibold uppercase text-[var(--lg-text-muted)] cursor-pointer w-8" onClick={() => handleHeaderClick('R')}>R</th>
                             <th className="text-center px-1 py-1.5 text-[10px] font-semibold uppercase text-[var(--lg-text-muted)] cursor-pointer w-8" onClick={() => handleHeaderClick('HR')}>HR</th>
                             <th className="text-center px-1 py-1.5 text-[10px] font-semibold uppercase text-[var(--lg-text-muted)] cursor-pointer w-8" onClick={() => handleHeaderClick('RBI')}>RBI</th>
                             <th className="text-center px-1 py-1.5 text-[10px] font-semibold uppercase text-[var(--lg-text-muted)] cursor-pointer w-8" onClick={() => handleHeaderClick('SB')}>SB</th>
                             <th className="text-center px-1 py-1.5 text-[10px] font-semibold uppercase text-[var(--lg-text-muted)] cursor-pointer w-10" onClick={() => handleHeaderClick('AVG')}>AVG</th>
                        </>
                    ) : (
                        <>
                             <th className="text-center px-1 py-1.5 text-[10px] font-semibold uppercase text-[var(--lg-text-muted)] cursor-pointer w-8" onClick={() => handleHeaderClick('W')}>W</th>
                             <th className="text-center px-1 py-1.5 text-[10px] font-semibold uppercase text-[var(--lg-text-muted)] cursor-pointer w-8" onClick={() => handleHeaderClick('SV')}>SV</th>
                             <th className="text-center px-1 py-1.5 text-[10px] font-semibold uppercase text-[var(--lg-text-muted)] cursor-pointer w-8" onClick={() => handleHeaderClick('K')}>K</th>
                             <th className="text-center px-1 py-1.5 text-[10px] font-semibold uppercase text-[var(--lg-text-muted)] cursor-pointer w-10" onClick={() => handleHeaderClick('ERA')}>ERA</th>
                             <th className="text-center px-1 py-1.5 text-[10px] font-semibold uppercase text-[var(--lg-text-muted)] cursor-pointer w-10" onClick={() => handleHeaderClick('WHIP')}>WHIP</th>
                        </>
                    )}
                    <th className="text-center px-1 py-1.5 text-[10px] font-semibold uppercase text-[var(--lg-text-muted)] cursor-pointer w-8" onClick={() => handleHeaderClick('value')}>$</th>
                    <th className="w-14 px-1 py-1.5"></th>
                </tr>
            </thead>
            <tbody className="divide-y divide-[var(--lg-table-border)]">
                {filteredPlayers.map((p: PlayerSeasonStat) => {
                    const isExpanded = expandedId === p.row_id;
                    const isTaken = !!p.ogba_team_code || !!p.team;
                    const owner = teams.find((t: { code: string; name: string }) => t.code === (p.ogba_team_code || p.team));

                    return (
                        <React.Fragment key={p.row_id}>
                            <tr
                                className={`cursor-pointer hover:bg-[var(--lg-tint)] ${isExpanded ? 'bg-[var(--lg-tint)]' : ''} ${isTaken ? 'opacity-40' : ''}`}
                                onClick={() => toggleExpand(p.row_id ?? '')}
                            >
                                <td className="px-2 py-1.5">
                                    <div className="font-semibold text-sm text-[var(--lg-text-primary)] leading-tight">
                                        {p.mlb_full_name || p.player_name}
                                    </div>
                                    <div className="text-[10px] text-[var(--lg-text-muted)] flex gap-1 items-center font-medium uppercase">
                                        <span className="text-[var(--lg-accent)]">{getPrimaryPosition(p.positions) || (p.is_pitcher ? 'P' : 'UT')}</span>
                                        <span className="opacity-30">·</span>
                                        <span>{p.mlb_team || 'FA'}</span>
                                        {isTaken && (
                                            <>
                                                <span className="opacity-30">·</span>
                                                <span className="text-[var(--lg-accent)]">{owner?.name ?? "Owned"}</span>
                                            </>
                                        )}
                                    </div>
                                </td>

                                {viewGroup === 'hitters' ? (
                                    <>
                                        <td className="text-center text-xs tabular-nums text-[var(--lg-text-secondary)] px-1">{p.R || '-'}</td>
                                        <td className="text-center text-xs tabular-nums text-[var(--lg-text-secondary)] px-1">{p.HR || '-'}</td>
                                        <td className="text-center text-xs tabular-nums text-[var(--lg-text-secondary)] px-1">{p.RBI || '-'}</td>
                                        <td className="text-center text-xs tabular-nums text-[var(--lg-text-secondary)] px-1">{p.SB || '-'}</td>
                                        <td className="text-center text-xs tabular-nums text-[var(--lg-text-secondary)] px-1">{typeof p.AVG === 'number' ? fmtRate(p.AVG) : '-'}</td>
                                    </>
                                ) : (
                                    <>
                                        <td className="text-center text-xs tabular-nums text-[var(--lg-text-secondary)] px-1">{p.W || '-'}</td>
                                        <td className="text-center text-xs tabular-nums text-[var(--lg-text-secondary)] px-1">{p.SV || '-'}</td>
                                        <td className="text-center text-xs tabular-nums text-[var(--lg-text-secondary)] px-1">{p.K || '-'}</td>
                                        <td className="text-center text-xs tabular-nums text-[var(--lg-text-secondary)] px-1">{p.ERA ? Number(p.ERA).toFixed(2) : '-'}</td>
                                        <td className="text-center text-xs tabular-nums text-[var(--lg-text-secondary)] px-1">{p.WHIP ? Number(p.WHIP).toFixed(2) : '-'}</td>
                                    </>
                                )}

                                <td className="text-center text-xs font-semibold text-[var(--lg-accent)] tabular-nums px-1">
                                    ${p.value || p.dollar_value || '0'}
                                </td>
                                <td className="px-1 text-center">
                                    {!isTaken && onNominate && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onNominate(p);
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
                                    )}
                                </td>
                            </tr>

                            {isExpanded && (
                                <PlayerExpandedRow
                                    player={p}
                                    isTaken={isTaken}
                                    ownerName={owner?.name ?? "Owned"}
                                    onNominate={onNominate}
                                    onQueue={onQueue}
                                    isQueued={isQueued}
                                    colSpan={colCount}
                                />
                            )}
                        </React.Fragment>
                    );
                })}
            </tbody>
        </table>
        {filteredPlayers.length === 0 && (
            <div className="py-12 text-center text-xs font-medium text-[var(--lg-text-muted)] uppercase">
                No players found
            </div>
        )}
      </div>
    </div>
  );
}
