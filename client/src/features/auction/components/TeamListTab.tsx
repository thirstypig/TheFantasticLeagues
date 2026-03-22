import React, { useState, useEffect, useMemo } from 'react';
import { PlayerSeasonStat } from '../../../api';
import { fetchJsonApi, API_BASE } from '../../../api/base';
import PlayerExpandedRow from './PlayerExpandedRow';
import { ThemedTable, ThemedThead, ThemedTh, ThemedTr, ThemedTd } from "../../../components/ui/ThemedTable";
import { useToast } from "../../../contexts/ToastContext";
import { Flame, Snowflake } from 'lucide-react';

interface Team {
  id: number;
  name: string;
  code: string;
  budget: number;
  maxBid: number;
  rosterCount: number;
  spotsLeft?: number;
  pitcherCount?: number;
  hitterCount?: number;
  positionCounts?: Record<string, number>;
  roster?: { id: number; playerId: number; price: number; assignedPosition?: string | null }[];
  isMe?: boolean;
}

interface RosterEntry {
  id: number;
  playerId: number;
  mlbId?: number;
  name?: string;
  price: number;
  assignedPosition?: string | null;
  posList?: string;
  posPrimary?: string;
  player?: { posList?: string; posPrimary?: string };
  stat?: PlayerSeasonStat;
}

interface TeamListTabProps {
  teams?: Team[];
  players?: PlayerSeasonStat[];
  budgetCap?: number;
  rosterSize?: number;
  pitcherMax?: number;
  hitterMax?: number;
  showPace?: boolean;
  positionLimits?: Record<string, number> | null;
  showPositionMatrix?: boolean;
}

// Position order for the matrix display
const MATRIX_POSITIONS = ["C", "1B", "2B", "3B", "SS", "MI", "CI", "OF", "DH", "P"];

export default function TeamListTab({ teams = [], players = [], budgetCap = 400, rosterSize = 23, pitcherMax, hitterMax, showPace = true, positionLimits, showPositionMatrix = true }: TeamListTabProps) {
  const { toast } = useToast();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detailedRoster, setDetailedRoster] = useState<RosterEntry[] | null>(null);
  const [loadingIds, setLoadingIds] = useState<Set<number>>(new Set());
  const [expandedPlayerId, setExpandedPlayerId] = useState<number | null>(null);

  // Fetch detailed roster when expanding
  useEffect(() => {
    if (!expandedId) {
        setDetailedRoster(null);
        return;
    }

    // If we have detailed roster for this ID already, maybe keep it? 
    // But we want to refresh on re-expand too.
    const fetchRoster = async () => {
        try {
            setLoadingIds(prev => new Set(prev).add(expandedId));
            const data = await fetchJsonApi<{ currentRoster: RosterEntry[] }>(`/api/teams/${expandedId}/summary`);
            setDetailedRoster(data.currentRoster);
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingIds((prev: Set<number>) => {
                const next = new Set(prev);
                next.delete(expandedId!);
                return next;
            });
        }
    };
    fetchRoster();
  }, [expandedId]);

  const handlePositionSwap = async (teamId: number, rosterId: number, newPos: string) => {
      // Optimistic update
      setDetailedRoster((prev: RosterEntry[] | null) => {
          if (!prev) return prev;
          return prev.map((r: RosterEntry) => {
              if (r.id === rosterId) {
                  return { ...r, assignedPosition: newPos };
              }
              return r;
          });
      });

      try {
           await fetchJsonApi(`${API_BASE}/teams/${teamId}/roster/${rosterId}`, {
               method: 'PATCH',
               body: JSON.stringify({ assignedPosition: newPos })
           });

           const data = await fetchJsonApi<{ currentRoster: RosterEntry[] }>(`/api/teams/${teamId}/summary`);
           setDetailedRoster(data.currentRoster);

      } catch(err) {
          console.error("Failed to swap pos", err);
          toast("Failed to update position. Reverting...", "error");
          try {
              const data = await fetchJsonApi<{ currentRoster: RosterEntry[] }>(`/api/teams/${teamId}/summary`);
              setDetailedRoster(data.currentRoster);
          } catch { /* ignore */ }
      }
  };

  // League-wide average cost per player for hot/cold comparison
  const leagueAvg = useMemo(() => {
    const totalDrafted = teams.reduce((sum, t) => sum + t.rosterCount, 0);
    const totalSpent = teams.reduce((sum, t) => sum + (budgetCap - t.budget), 0);
    return totalDrafted > 0 ? totalSpent / totalDrafted : 0;
  }, [teams, budgetCap]);

  return (
    <div className="h-full overflow-y-auto scrollbar-hide">
        {/* League summary */}
        {showPace && teams.length > 0 && (
          <div className="px-6 py-2 border-b border-[var(--lg-divide)] bg-[var(--lg-glass-bg-hover)] flex items-center justify-between text-[10px] font-semibold uppercase text-[var(--lg-text-muted)]">
            <span>{teams.reduce((s, t) => s + t.rosterCount, 0)} drafted</span>
            <span>${teams.reduce((s, t) => s + (budgetCap - t.budget), 0)} spent</span>
            <span>Avg ${leagueAvg.toFixed(1)}/player</span>
          </div>
        )}

        {/* Position Needs Matrix (AUC-07) */}
        {showPositionMatrix && teams.length > 0 && (
          <div className="overflow-x-auto border-b border-[var(--lg-divide)]">
            <table className="w-full text-[9px]">
              <thead>
                <tr className="bg-[var(--lg-glass-bg-hover)]">
                  <th className="text-left px-2 py-1.5 font-semibold text-[var(--lg-text-muted)] uppercase tracking-wide sticky left-0 bg-[var(--lg-glass-bg-hover)] z-10 min-w-[80px]">Team</th>
                  {MATRIX_POSITIONS.map(pos => (
                    <th key={pos} className="px-1 py-1.5 text-center font-bold text-[var(--lg-text-muted)] uppercase" title={`${pos} — ${positionLimits?.[pos] ?? '∞'} max`}>{pos}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {teams.map(team => (
                  <tr key={team.id} className={team.isMe ? 'bg-[var(--lg-accent)]/5' : ''}>
                    <td className="px-2 py-1 font-semibold text-[var(--lg-text-primary)] truncate max-w-[100px] sticky left-0 bg-inherit z-10" title={team.name}>{team.name}</td>
                    {MATRIX_POSITIONS.map(pos => {
                      // For "P" column, show aggregate pitcher count with pitcherMax
                      const filled = pos === "P" ? (team.pitcherCount ?? team.positionCounts?.[pos] ?? 0) : (team.positionCounts?.[pos] ?? 0);
                      const limit = pos === "P" ? (positionLimits?.[pos] ?? pitcherMax) : positionLimits?.[pos];
                      const isFull = limit != null && filled >= limit;
                      return (
                        <td key={pos} className="px-1 py-1 text-center tabular-nums">
                          <span className={`inline-block min-w-[20px] px-0.5 rounded ${
                            isFull ? 'bg-red-500/15 text-red-400 font-bold' : filled > 0 ? 'text-emerald-400 font-semibold' : 'text-[var(--lg-text-muted)] opacity-30'
                          }`}>
                            {filled}{limit != null ? `/${limit}` : ''}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="divide-y divide-[var(--lg-divide)]">
            {teams.map((team: Team, idx: number) => {
                const isExpanded = expandedId === team.id;
                const isLoading = loadingIds.has(team.id);

                const rosterSource = (isExpanded && detailedRoster) ? detailedRoster : (team.roster || []);

                const roster = rosterSource.map((rItem: RosterEntry) => {
                   return {
                       ...rItem,
                       stat: players.find((p: PlayerSeasonStat) => String(p.mlb_id) == String(rItem.playerId))
                   };
                });

                const spent = budgetCap - team.budget;
                const spotsLeft = team.spotsLeft ?? (rosterSize - team.rosterCount);
                const avgCost = team.rosterCount > 0 ? spent / team.rosterCount : 0;
                const remainingPerSpot = spotsLeft > 0 ? team.budget / spotsLeft : 0;
                const spentPct = Math.min(100, (spent / budgetCap) * 100);
                const isHot = team.rosterCount >= 2 && avgCost > leagueAvg * 1.25;
                const isCold = team.rosterCount >= 2 && avgCost < leagueAvg * 0.75;

                return (
                    <div key={team.id} className={`${team.isMe ? 'bg-[var(--lg-tint)]' : ''}`}>
                        <div
                            className="px-6 py-3 cursor-pointer hover:bg-[var(--lg-tint)] transition-all"
                            onClick={() => setExpandedId(isExpanded ? null : team.id)}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <span className="text-[var(--lg-text-muted)] font-bold text-xs w-6 opacity-30">{String(idx + 1).padStart(2, '0')}</span>
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-1.5">
                                            <span className={`font-semibold ${team.isMe ? 'text-[var(--lg-accent)]' : 'text-[var(--lg-text-primary)]'}`}>
                                                {team.name}
                                            </span>
                                            {showPace && isHot && <Flame size={12} className="text-red-400" />}
                                            {showPace && isCold && <Snowflake size={12} className="text-blue-400" />}
                                        </div>
                                        <span className="text-[10px] font-medium text-[var(--lg-text-muted)] opacity-60">
                                            {showPace
                                              ? `${team.rosterCount}/${rosterSize} · avg $${avgCost.toFixed(0)} · $${remainingPerSpot.toFixed(0)}/spot left`
                                              : `${team.rosterCount} / ${rosterSize} Roster`}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-6 text-right">
                                    <div className="flex flex-col items-end">
                                        <span className="text-xs font-medium uppercase text-[var(--lg-text-muted)] opacity-50">Budget</span>
                                        <span className="font-semibold text-[var(--lg-text-primary)]">${team.budget}</span>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <span className="text-xs font-medium uppercase text-[var(--lg-text-muted)] opacity-50">Max</span>
                                        <span className="font-semibold text-[var(--lg-accent)]">${team.maxBid}</span>
                                    </div>
                                    <div className={`text-[var(--lg-text-muted)] transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                                    </div>
                                </div>
                            </div>
                            {/* Budget progress bar */}
                            {showPace && (
                            <div className="mt-1.5 ml-10 mr-16">
                                <div className="h-1 rounded-full bg-[var(--lg-tint)] overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all ${
                                            spentPct > 85 ? 'bg-red-400' : spentPct > 60 ? 'bg-amber-400' : 'bg-emerald-400'
                                        }`}
                                        style={{ width: `${spentPct}%` }}
                                    />
                                </div>
                            </div>
                            )}
                        </div>

                        {isExpanded && (
                            <div className="bg-black/20 border-t border-[var(--lg-border-faint)] animate-in fade-in slide-in-from-top-2 duration-300">
                                {isLoading ? (
                                    <div className="px-6 py-12 text-center text-[var(--lg-text-muted)] text-xs font-medium uppercase animate-pulse">
                                        Loading roster...
                                    </div>
                                ) : (
                                    <ThemedTable>
                                        <ThemedThead>
                                            <ThemedTr>
                                                <ThemedTh className="w-16">Pos</ThemedTh>
                                                <ThemedTh>Player</ThemedTh>
                                                <ThemedTh align="right" className="pr-6">Salary</ThemedTh>
                                            </ThemedTr>
                                        </ThemedThead>
                                        <tbody className="divide-y divide-[var(--lg-divide)]">
                                            {roster.map((entry: RosterEntry) => {
                                                const mlbId = entry.mlbId || entry.playerId; 
                                                const name = entry.name || `Player #${entry.playerId}`;
                                                
                                                const stat = players.find((p: PlayerSeasonStat) => String(p.mlb_id) == String(mlbId));
                                                const displayName = stat?.mlb_full_name || stat?.player_name || name;
                                                const displayPos = entry.assignedPosition || stat?.positions || 'BN';
                                                
                                                const playerObj = stat || ({
                                                    row_id: String(mlbId),
                                                    mlb_id: String(mlbId),
                                                    player_name: name,
                                                    mlb_full_name: name,
                                                    positions: displayPos,
                                                    is_pitcher: displayPos === 'P'
                                                } as unknown as PlayerSeasonStat);

                                                const isRowExpanded = expandedPlayerId === entry.id;
                                                const isPitcher = playerObj.is_pitcher;

                                                return (
                                                    <React.Fragment key={entry.id}>
                                                        <ThemedTr 
                                                            className={`cursor-pointer ${isRowExpanded ? 'bg-[var(--lg-tint)]' : ''}`}
                                                            onClick={() => setExpandedPlayerId(isRowExpanded ? null : entry.id)}
                                                        >
                                                            <ThemedTd className="py-2">
                                                              <div onClick={(e) => e.stopPropagation()}>
                                                                <select 
                                                                    className="appearance-none bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20 cursor-pointer hover:bg-emerald-500/20 transition-all outline-none"
                                                                    value={displayPos}
                                                                    onChange={(e) => handlePositionSwap(team.id, entry.id, e.target.value)}
                                                                >
                                                                    {(() => {
                                                                        const rawList = entry.posList || entry.posPrimary || entry.player?.posList || entry.player?.posPrimary || stat?.positions || 'BN';
                                                                        const statList = stat?.positions || '';
                                                                        const combined = [rawList, statList].join(',');
                                                                        const opts = combined.split(',').map((s: string) => s.trim()).filter(Boolean);
                                                                        const distinct = Array.from(new Set([...opts, 'BN', 'UTIL', 'P'])); 
                                                                        return distinct.map(p => <option key={p} value={p} className="text-black">{p}</option>);
                                                                    })()}
                                                                </select>
                                                              </div>
                                                            </ThemedTd>
                                                            <ThemedTd className="py-2">
                                                                <span className={`font-semibold ${isPitcher ? 'text-purple-400' : 'text-blue-400'}`}>{displayName}</span>
                                                            </ThemedTd>
                                                            <ThemedTd align="right" className="py-2 pr-6">
                                                                <span className="font-semibold text-[var(--lg-accent)]">${entry.price}</span>
                                                            </ThemedTd>
                                                        </ThemedTr>
                                                        {isRowExpanded && (
                                                            <PlayerExpandedRow 
                                                                player={playerObj} 
                                                                isTaken={true} 
                                                                ownerName={team.name}
                                                                colSpan={3} 
                                                            />
                                                        )}
                                                    </React.Fragment>
                                                );
                                            })}
                                            {/* Dummy Keepers */}
                                            {Array.from({ length: Math.max(0, 4 - roster.length) }).map((_, i) => (
                                                 <ThemedTr key={`keeper-dummy-${i}`} className="opacity-30">
                                                    <ThemedTd className="py-2"><span className="italic">K</span></ThemedTd>
                                                    <ThemedTd className="py-2"><span className="italic font-medium uppercase">Keeper Slot {roster.length + i + 1}</span></ThemedTd>
                                                    <ThemedTd align="right" className="py-2 pr-6">$-</ThemedTd>
                                                 </ThemedTr>
                                            ))}
                                        </tbody>
                                    </ThemedTable>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    </div>
  );
}
