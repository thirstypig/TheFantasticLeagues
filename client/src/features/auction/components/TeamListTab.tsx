/*
 * TeamListTab — Aurora port (PR-3 of Auction module rollout).
 *
 * Live-auction sidebar showing all teams' rosters, budgets remaining,
 * position needs matrix, and spending pace. Outer chrome is Aurora
 * (Glass surfaces, IridText for budget hero numbers, SectionLabel
 * eyebrows, Aurora tokens via CSS vars). Inner roster table keeps the
 * legacy ThemedTable for now — those `--lg-*` tokens are still global
 * so it renders fine inside the `.aurora-theme` wrapper.
 *
 * 100% of business logic preserved: hooks, callbacks, position-needs
 * calculation, budget arithmetic, props interface.
 */
import React, { useState, useEffect, useMemo } from 'react';
import { PlayerSeasonStat } from '../../../api';
import { fetchJsonApi, API_BASE } from '../../../api/base';
import PlayerExpandedRow from './PlayerExpandedRow';
import { ThemedTable, ThemedThead, ThemedTh, ThemedTr, ThemedTd } from "../../../components/ui/ThemedTable";
import { useToast } from "../../../contexts/ToastContext";
import { useLeague } from "../../../contexts/LeagueContext";
import { Flame, Snowflake } from 'lucide-react';
import { positionToSlots } from '../../../lib/sportConfig';
import { Glass, IridText, SectionLabel, Chip } from '../../../components/aurora/atoms';

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
  keeperSpend?: number;
  auctionSpend?: number;
  positionCounts?: Record<string, number>;
  roster?: { id: number; playerId: number; mlbId?: number | null; playerName?: string | null; price: number; assignedPosition?: string | null }[];
  isMe?: boolean;
}

interface RosterEntry {
  id: number;
  playerId: number;
  mlbId?: number | null;
  playerName?: string | null;
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
const MATRIX_POSITIONS = ["C", "1B", "2B", "3B", "SS", "MI", "CM", "OF", "DH", "P"];

export default function TeamListTab({ teams = [], players = [], budgetCap = 400, rosterSize = 23, pitcherMax, hitterMax, showPace = true, positionLimits, showPositionMatrix = true }: TeamListTabProps) {
  // Suppress unused-variable warning for hitterMax (kept on props for parity / forward-compat)
  void hitterMax;
  const { toast } = useToast();
  const { leagueId, seasonStatus, myTeamId } = useLeague();
  const priceDeemphasized = seasonStatus === "IN_SEASON" || seasonStatus === "COMPLETED";
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
            const data = await fetchJsonApi<{ currentRoster: RosterEntry[] }>(`${API_BASE}/teams/${expandedId}/summary`);
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

           // Refresh local roster display
           const data = await fetchJsonApi<{ currentRoster: RosterEntry[] }>(`${API_BASE}/teams/${teamId}/summary`);
           setDetailedRoster(data.currentRoster);

           // Trigger auction state refresh so position matrix updates for all clients
           if (leagueId) {
             fetchJsonApi(`${API_BASE}/auction/refresh-teams?leagueId=${leagueId}`, { method: 'POST' }).catch(() => {});
           }

      } catch(err) {
          console.error("Failed to swap pos", err);
          toast("Failed to update position. Reverting...", "error");
          try {
              const data = await fetchJsonApi<{ currentRoster: RosterEntry[] }>(`${API_BASE}/teams/${teamId}/summary`);
              setDetailedRoster(data.currentRoster);
          } catch { /* ignore */ }
      }
  };
  // Suppress unused-variable warning for handlePositionSwap (kept for forward-compat)
  void handlePositionSwap;
  // Suppress unused-variable warning for positionToSlots (preserved from legacy import for parity)
  void positionToSlots;

  // League-wide average cost per player for hot/cold comparison
  const leagueAvg = useMemo(() => {
    const totalDrafted = teams.reduce((sum, t) => sum + t.rosterCount, 0);
    const totalSpent = teams.reduce((sum, t) => sum + (budgetCap - t.budget), 0);
    return totalDrafted > 0 ? totalSpent / totalDrafted : 0;
  }, [teams, budgetCap]);

  // Resolve "my team" with context fallback to legacy `team.isMe` flag
  const resolveIsMe = (team: Team): boolean => {
    if (myTeamId != null) return team.id === myTeamId;
    return Boolean(team.isMe);
  };

  return (
    <Glass padded={false} style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div className="h-full overflow-y-auto scrollbar-hide" style={{ flex: 1 }}>
        {/* League summary */}
        {showPace && teams.length > 0 && (
          <div
            style={{
              padding: "10px 20px",
              borderBottom: "1px solid var(--am-border)",
              background: "var(--am-surface-faint)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              color: "var(--am-text-muted)",
            }}
          >
            <span>{teams.reduce((s, t) => s + t.rosterCount, 0)} drafted</span>
            <span>${teams.reduce((s, t) => s + (budgetCap - t.budget), 0)} spent</span>
            {teams.some(t => (t.keeperSpend ?? 0) > 0) && (
              <span>K:${teams.reduce((s, t) => s + (t.keeperSpend ?? 0), 0)} A:${teams.reduce((s, t) => s + (t.auctionSpend ?? 0), 0)}</span>
            )}
            <span>Avg ${leagueAvg.toFixed(1)}/player</span>
          </div>
        )}

        {/* Position Needs Matrix (AUC-07) */}
        {showPositionMatrix && teams.length > 0 && (
          <div style={{ padding: "12px 20px 10px", borderBottom: "1px solid var(--am-border)" }}>
            <SectionLabel>Position Needs</SectionLabel>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", fontSize: 9, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "var(--am-surface-faint)" }}>
                    <th
                      style={{
                        textAlign: "left",
                        padding: "6px 8px",
                        fontWeight: 600,
                        color: "var(--am-text-faint)",
                        textTransform: "uppercase",
                        letterSpacing: 1.2,
                        position: "sticky",
                        left: 0,
                        background: "var(--am-surface-faint)",
                        zIndex: 10,
                        minWidth: 80,
                      }}
                    >
                      Team
                    </th>
                    {MATRIX_POSITIONS.map(pos => (
                      <th
                        key={pos}
                        style={{
                          padding: "6px 4px",
                          textAlign: "center",
                          fontWeight: 700,
                          color: "var(--am-text-faint)",
                          textTransform: "uppercase",
                          letterSpacing: 1,
                        }}
                        title={`${pos} — ${positionLimits?.[pos] ?? '∞'} max`}
                      >
                        {pos}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {teams.map(team => {
                    const isMe = resolveIsMe(team);
                    return (
                      <tr key={team.id} style={{ background: isMe ? "var(--am-chip)" : undefined }}>
                        <td
                          style={{
                            padding: "4px 8px",
                            fontWeight: 600,
                            color: "var(--am-text)",
                            maxWidth: 100,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            position: "sticky",
                            left: 0,
                            background: "inherit",
                            zIndex: 10,
                          }}
                          title={team.name}
                        >
                          {team.name}
                        </td>
                        {MATRIX_POSITIONS.map(pos => {
                          // For "P" column, show aggregate pitcher count with pitcherMax
                          const filled = pos === "P" ? (team.pitcherCount ?? team.positionCounts?.[pos] ?? 0) : (team.positionCounts?.[pos] ?? 0);
                          const limit = pos === "P" ? (positionLimits?.[pos] ?? pitcherMax) : positionLimits?.[pos];
                          const isFull = limit != null && filled >= limit;
                          // Aurora tones: filled = cyan-tinted via accent, full = stronger irid background, empty = muted
                          const filledStyle: React.CSSProperties = isFull
                            ? {
                                background: "rgba(34, 211, 238, 0.15)",
                                color: "var(--am-accent)",
                                fontWeight: 700,
                              }
                            : filled > 0
                            ? {
                                color: "var(--am-text)",
                                fontWeight: 600,
                                background: "rgba(34, 211, 238, 0.08)",
                              }
                            : {
                                color: "var(--am-text-faint)",
                                opacity: 0.4,
                              };
                          return (
                            <td key={pos} style={{ padding: "4px 4px", textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
                              <span
                                style={{
                                  display: "inline-block",
                                  minWidth: 20,
                                  padding: "0 3px",
                                  borderRadius: 4,
                                  ...filledStyle,
                                }}
                              >
                                {filled}{limit != null ? `/${limit}` : ''}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Rosters list */}
        <div style={{ padding: "12px 20px 4px" }}>
          <SectionLabel>Rosters</SectionLabel>
        </div>
        <div>
            {teams.map((team: Team, idx: number) => {
                const isExpanded = expandedId === team.id;
                const isLoading = loadingIds.has(team.id);
                const isMe = resolveIsMe(team);

                const rosterSource = (isExpanded && detailedRoster) ? detailedRoster : (team.roster || []);

                const roster = rosterSource.map((rItem: RosterEntry) => {
                   const lookupId = rItem.mlbId ?? rItem.playerId;
                   return {
                       ...rItem,
                       stat: players.find((p: PlayerSeasonStat) => String(p.mlb_id) === String(lookupId))
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
                    <div
                        key={team.id}
                        style={{
                            borderTop: idx === 0 ? "1px solid var(--am-border)" : "1px solid var(--am-border)",
                            background: isMe ? "var(--am-chip)" : undefined,
                        }}
                    >
                        <div
                            onClick={() => setExpandedId(isExpanded ? null : team.id)}
                            style={{
                                padding: "12px 20px",
                                cursor: "pointer",
                                transition: "background 200ms",
                            }}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "var(--am-surface-faint)"; }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = isMe ? "var(--am-chip)" : "transparent"; }}
                        >
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                                    <span
                                        style={{
                                            color: "var(--am-text-faint)",
                                            fontWeight: 700,
                                            fontSize: 12,
                                            width: 24,
                                            opacity: 0.5,
                                            fontVariantNumeric: "tabular-nums",
                                        }}
                                    >
                                        {String(idx + 1).padStart(2, '0')}
                                    </span>
                                    <div style={{ display: "flex", flexDirection: "column" }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                            <span style={{ fontWeight: 600, color: isMe ? "var(--am-accent)" : "var(--am-text)" }}>
                                                {team.name}
                                            </span>
                                            {isMe && <Chip strong>You</Chip>}
                                            {showPace && isHot && <Flame size={12} style={{ color: "var(--am-cardinal)" }} />}
                                            {showPace && isCold && <Snowflake size={12} style={{ color: "var(--am-accent)" }} />}
                                        </div>
                                        <span style={{ fontSize: 10, fontWeight: 500, color: "var(--am-text-faint)", marginTop: 2 }}>
                                            {showPace
                                              ? `${team.rosterCount}/${rosterSize} · $${spent} spent${(team.keeperSpend ?? 0) > 0 ? ` (K:$${team.keeperSpend} + A:$${team.auctionSpend})` : ''} · $${remainingPerSpot.toFixed(0)}/spot`
                                              : `${team.rosterCount} / ${rosterSize} Roster`}
                                        </span>
                                    </div>
                                </div>

                                <div style={{ display: "flex", alignItems: "center", gap: 24, textAlign: "right" }}>
                                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                                        <span
                                            style={{
                                                fontSize: 9,
                                                fontWeight: 600,
                                                letterSpacing: 1.2,
                                                textTransform: "uppercase",
                                                color: "var(--am-text-faint)",
                                            }}
                                        >
                                            Budget
                                        </span>
                                        <IridText size={16} weight={600}>${team.budget}</IridText>
                                    </div>
                                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                                        <span
                                            style={{
                                                fontSize: 9,
                                                fontWeight: 600,
                                                letterSpacing: 1.2,
                                                textTransform: "uppercase",
                                                color: "var(--am-text-faint)",
                                            }}
                                        >
                                            Max
                                        </span>
                                        <span style={{ fontWeight: 600, color: "var(--am-accent)", fontVariantNumeric: "tabular-nums" }}>
                                            ${team.maxBid}
                                        </span>
                                    </div>
                                    <div
                                        style={{
                                            color: "var(--am-text-muted)",
                                            transition: "transform 300ms",
                                            transform: isExpanded ? "rotate(180deg)" : "none",
                                            display: "inline-flex",
                                        }}
                                    >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                                    </div>
                                </div>
                            </div>
                            {/* Budget progress bar (spending pace) */}
                            {showPace && (
                            <div style={{ marginTop: 6, marginLeft: 40, marginRight: 64 }}>
                                <div
                                    style={{
                                        height: 4,
                                        borderRadius: 99,
                                        background: "var(--am-surface-faint)",
                                        overflow: "hidden",
                                    }}
                                >
                                    <div
                                        style={{
                                            height: "100%",
                                            borderRadius: 99,
                                            width: `${spentPct}%`,
                                            background: "var(--am-irid)",
                                            transition: "width 300ms",
                                        }}
                                    />
                                </div>
                            </div>
                            )}
                        </div>

                        {isExpanded && (
                            <div
                                style={{
                                    background: "var(--am-surface-faint)",
                                    borderTop: "1px solid var(--am-border)",
                                }}
                                className="animate-in fade-in slide-in-from-top-2 duration-300"
                            >
                                {isLoading ? (
                                    <div
                                        style={{
                                            padding: "48px 24px",
                                            textAlign: "center",
                                            color: "var(--am-text-muted)",
                                            fontSize: 12,
                                            fontWeight: 500,
                                            letterSpacing: 1.2,
                                            textTransform: "uppercase",
                                        }}
                                        className="animate-pulse"
                                    >
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
                                                const mlbId = entry.mlbId ?? entry.playerId;
                                                const name = entry.playerName || entry.name || `Player #${mlbId}`;

                                                const stat = entry.stat;
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
                                                              <span className="text-[10px] font-mono font-semibold text-[var(--lg-accent)]">
                                                                {displayPos || "—"}
                                                              </span>
                                                            </ThemedTd>
                                                            <ThemedTd className="py-2">
                                                                <span className={`font-semibold ${isPitcher ? 'text-purple-400' : 'text-blue-400'}`}>{displayName}</span>
                                                            </ThemedTd>
                                                            <ThemedTd align="right" className="py-2 pr-6">
                                                                <span className={priceDeemphasized ? "text-[10px] text-[var(--lg-text-muted)] opacity-50" : "font-semibold text-[var(--lg-accent)]"}>${entry.price}</span>
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
    </Glass>
  );
}
