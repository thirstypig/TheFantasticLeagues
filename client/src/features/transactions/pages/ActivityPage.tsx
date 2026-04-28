/*
 * ActivityPage — Aurora port (post-shell rollout).
 *
 * Renders inside AuroraShell so we do NOT add aurora-theme / AmbientBg
 * wrappers here — the shell provides them. Page-level chrome moves to
 * Aurora atoms (Glass hero, IridText display heading, segmented tab
 * pills, footer escape link). Tab content delegates to the existing
 * children (ActivityWaiversTab, RosterMovesTab, ActivityHistoryTab,
 * TradeCard) which keep their legacy `--lg-*` token styling — those
 * tokens stay globally defined so legacy children render acceptably
 * inside the Aurora wrapper. Deeper Aurora ports of those children
 * are follow-up PRs.
 *
 * Legacy 477-LOC version preserved at /activity-classic via
 * ActivityPageLegacy.tsx.
 */
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  getTransactions,
  TransactionEvent,
  getPlayerSeasonStats,
  getLeague,
  PlayerSeasonStat,
  getSeasonStandings,
} from "../../../api";
import { fetchJsonApi, API_BASE } from "../../../api/base";
import {
  getTrades,
  TradeProposal,
} from "../../trades/api";
import { useAuth } from "../../../auth/AuthProvider";
import { useLeague, findMyTeam } from "../../../contexts/LeagueContext";
import { useToast } from "../../../contexts/ToastContext";
import WaiverClaimForm from "../../waivers/components/WaiverClaimForm";
import RosterMovesTab from "../components/RosterMovesTab";
import { canManageRoster, REASON_COPY } from "../lib/permissions";
import { TradeCard, LeagueTradeCard, CreateTradeForm } from "../../trades/pages/TradesPage";
import TeamRosterView from "../../teams/components/TeamRosterView";
import ActivityWaiversTab from "../components/ActivityWaiversTab";
import ActivityHistoryTab from "../components/ActivityHistoryTab";
import { Plus, ChevronDown, ArrowLeftRight } from "lucide-react";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Glass, IridText, SectionLabel } from "../../../components/aurora/atoms";

type ActivityTab = "add_drop" | "trades" | "waivers" | "history";

const TABS: { key: ActivityTab; label: string }[] = [
  { key: "waivers", label: "Waivers" },
  { key: "add_drop", label: "Roster Moves" },
  { key: "trades", label: "Trades" },
  { key: "history", label: "History" },
];

export default function ActivityPage() {
  const { me } = useAuth();
  const authUser = me?.user;
  const { leagueId: currentLeagueId, myTeamId, leagueRules } = useLeague();
  const { toast } = useToast();

  const isCommissioner =
    authUser?.isAdmin ||
    authUser?.memberships?.some(
      (m: any) => Number(m.leagueId) === currentLeagueId && m.role === "COMMISSIONER"
    );

  const isLeagueMember = Boolean(
    authUser?.memberships?.some((m: any) => Number(m.leagueId) === currentLeagueId),
  );

  const [searchParams, setSearchParams] = useSearchParams();
  const VALID_TABS: ActivityTab[] = ["waivers", "add_drop", "trades", "history"];
  const tabParam = searchParams.get("tab") as ActivityTab | null;
  const activeTab: ActivityTab = tabParam && VALID_TABS.includes(tabParam) ? tabParam : "waivers";
  const setActiveTab = (tab: ActivityTab) => setSearchParams({ tab }, { replace: true });
  const [loading, setLoading] = useState(true);

  const [transactions, setTransactions] = useState<TransactionEvent[]>([]);
  const [players, setPlayers] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [standings, setStandings] = useState<any[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [claimInFlight, setClaimInFlight] = useState(false);

  const [trades, setTrades] = useState<TradeProposal[]>([]);
  const [showCreateTrade, setShowCreateTrade] = useState(false);
  const [showCompletedTrades, setShowCompletedTrades] = useState(false);
  const [contextTrade, setContextTrade] = useState<TradeProposal | null>(null);

  const loadTrades = useCallback(async (lid?: number) => {
    const resolvedId = lid ?? currentLeagueId;
    if (!resolvedId) return;
    try {
      const res = await getTrades(resolvedId, "all");
      setTrades(res.trades || []);
    } catch {
      setTrades([]);
    }
  }, [currentLeagueId]);

  const loadData = useCallback(async () => {
    if (!currentLeagueId) { setLoading(false); return; }
    try {
      const results = await Promise.allSettled([
        getTransactions({ leagueId: currentLeagueId, take: 100 }),
        getPlayerSeasonStats(currentLeagueId),
        getLeague(currentLeagueId),
        getSeasonStandings(currentLeagueId),
        getTrades(currentLeagueId, "all"),
      ]);

      const [txResult, playersResult, leagueResult, standingsResult, tradesResult] = results;

      if (txResult.status === "fulfilled") setTransactions(txResult.value.transactions);
      if (playersResult.status === "fulfilled") setPlayers(playersResult.value || []);
      if (standingsResult.status === "fulfilled") setStandings(standingsResult.value.rows || []);
      if (tradesResult.status === "fulfilled") setTrades(tradesResult.value.trades || []);

      if (leagueResult.status === "fulfilled") {
        const loadedTeams = leagueResult.value.league.teams || [];
        setTeams(loadedTeams);

        const uid = Number(authUser?.id);
        const myTeam = findMyTeam(loadedTeams, uid);
        if (myTeam) {
          setSelectedTeamId(myTeam.id);
        } else if (loadedTeams.length > 0) {
          setSelectedTeamId(loadedTeams[0].id);
        }
      }
    } catch (err: unknown) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [authUser?.id, currentLeagueId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleClaim = async (player: PlayerSeasonStat) => {
    if (claimInFlight) return;
    if (!selectedTeamId || !currentLeagueId) {
      toast("Please select a team to claim for.", "warning");
      return;
    }

    const confirmed = confirm(`Add ${player.player_name} to your roster?`);
    if (!confirmed) return;

    setClaimInFlight(true);
    try {
      await fetchJsonApi(`${API_BASE}/transactions/claim`, {
        method: "POST",
        body: JSON.stringify({
          leagueId: currentLeagueId,
          teamId: selectedTeamId,
          playerId: (player as any).player_id || (player as any).id,
          mlbId: player.mlb_id || (player as any).mlbId,
        }),
      });
      toast(`Successfully added ${player.player_name}!`, "success");
      await loadData();
    } catch (err: unknown) {
      console.error("Claim error:", err);
      const errMsg = err instanceof Error ? err.message : "Unknown error";
      toast(errMsg, "error");
    } finally {
      setClaimInFlight(false);
    }
  };

  const handleDrop = async (player: PlayerSeasonStat) => {
    if (claimInFlight) return;
    if (!selectedTeamId || !currentLeagueId) {
      toast("Please select a team first.", "warning");
      return;
    }

    const confirmed = confirm(`Drop ${player.player_name} from the roster?`);
    if (!confirmed) return;

    setClaimInFlight(true);
    try {
      await fetchJsonApi(`${API_BASE}/transactions/drop`, {
        method: "POST",
        body: JSON.stringify({
          leagueId: currentLeagueId,
          teamId: selectedTeamId,
          playerId: (player as any).player_id || (player as any).id,
        }),
      });
      toast(`Successfully dropped ${player.player_name}.`, "success");
      await loadData();
    } catch (err: unknown) {
      console.error("Drop error:", err);
      const errMsg = err instanceof Error ? err.message : "Unknown error";
      toast(errMsg, "error");
    } finally {
      setClaimInFlight(false);
    }
  };

  // Suppress unused-var warnings; preserved for future Aurora deep-port of children
  void handleClaim;
  void handleDrop;

  const sortedWaiverOrder = useMemo(() => {
    const standingMap = new Map(standings.map((s) => [s.teamId, s]));
    const teamsWithPoints = teams.map((t) => {
      const s = standingMap.get(t.id);
      return { ...t, rank: 0, points: s?.totalPoints || s?.points || 0 };
    });
    teamsWithPoints.sort((a, b) => a.points - b.points);
    const byPointsDesc = [...teamsWithPoints].sort((a, b) => b.points - a.points);
    byPointsDesc.forEach((t, i) => { t.rank = i + 1; });
    return teamsWithPoints;
  }, [teams, standings]);

  const activeTrades = useMemo(
    () => trades.filter((t) => ["PROPOSED", "ACCEPTED"].includes(t.status)),
    [trades]
  );
  const completedTrades = useMemo(
    () => trades.filter((t) => !["PROPOSED", "ACCEPTED"].includes(t.status)),
    [trades]
  );

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Hero */}
      <Glass strong>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div>
            <SectionLabel>✦ Activity</SectionLabel>
            <h1 style={{ fontFamily: "var(--am-display)", fontSize: 30, fontWeight: 300, color: "var(--am-text)", margin: 0, lineHeight: 1.1 }}>
              Manage roster moves.
            </h1>
            <div style={{ marginTop: 6, fontSize: 13, color: "var(--am-text-muted)" }}>
              Roster moves, trades, waivers, and a full transaction history — all in one place.
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <SectionLabel style={{ marginBottom: 2 }}>Activity</SectionLabel>
            <IridText size={26}>{transactions.length + trades.length}</IridText>
          </div>
        </div>

        {/* Tab pills */}
        <div style={{ marginTop: 16, display: "flex", gap: 6, flexWrap: "wrap" }}>
          {TABS.map((t) => {
            const isActive = t.key === activeTab;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setActiveTab(t.key)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "8px 14px",
                  borderRadius: 99,
                  fontSize: 12,
                  fontWeight: 600,
                  background: isActive ? "var(--am-chip-strong)" : "var(--am-chip)",
                  color: isActive ? "var(--am-text)" : "var(--am-text-muted)",
                  border: "1px solid " + (isActive ? "var(--am-border-strong)" : "var(--am-border)"),
                  cursor: "pointer",
                  fontFamily: "inherit",
                  letterSpacing: 0.2,
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </Glass>

      {loading ? (
        <Glass>
          <div role="status" aria-label="Loading" style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--am-text-muted)", fontSize: 13 }}>
            Loading…
          </div>
        </Glass>
      ) : (
        <>
          {activeTab === "waivers" && (
            <Glass padded={false}>
              <div style={{ padding: 16 }}>
                <ActivityWaiversTab
                  sortedWaiverOrder={sortedWaiverOrder}
                  leagueId={currentLeagueId}
                  isCommissioner={isCommissioner}
                />
              </div>
            </Glass>
          )}

          {activeTab === "add_drop" && (() => {
            const permission = canManageRoster({
              leagueId: currentLeagueId || null,
              teamId: selectedTeamId,
              isAdmin: Boolean(authUser?.isAdmin),
              isCommissioner: (lid) =>
                Boolean(authUser?.memberships?.some(
                  (m: any) => String(m.leagueId) === lid && m.role === "COMMISSIONER",
                )),
              myTeamId: myTeamId ?? null,
              leagueRules,
              isLeagueMember,
            });

            if (permission.kind === "loading") {
              return (
                <Glass>
                  <div style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--am-text-muted)", fontSize: 13 }}>
                    Loading…
                  </div>
                </Glass>
              );
            }

            if (permission.kind === "allow" && selectedTeamId && currentLeagueId) {
              return (
                <Glass padded={false}>
                  <div style={{ padding: 16 }}>
                    <RosterMovesTab
                      leagueId={currentLeagueId}
                      teamId={selectedTeamId}
                      players={players}
                      onComplete={loadData}
                    />
                  </div>
                </Glass>
              );
            }

            if (permission.kind === "deny" && selectedTeamId) {
              return (
                <Glass>
                  <div style={{ fontSize: 12, color: "var(--am-text-muted)", marginBottom: 14 }}>
                    {REASON_COPY[permission.reason]} You can still submit a waiver claim below.
                  </div>
                  <WaiverClaimForm
                    players={players}
                    myTeamId={selectedTeamId}
                    myTeamBudget={teams.find(t => t.id === selectedTeamId)?.budget ?? 400}
                    myRoster={players.filter((p: any) => {
                      const tid = (p as any)._dbTeamId || teams.find(t => t.name === p.ogba_team_name)?.id;
                      return tid === selectedTeamId;
                    })}
                    onComplete={loadData}
                  />
                </Glass>
              );
            }

            return (
              <Glass>
                <div style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--am-text-muted)", fontSize: 13, fontStyle: "italic" }}>
                  Select a team to manage roster moves.
                </div>
              </Glass>
            );
          })()}

          {activeTab === "trades" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => setShowCreateTrade(!showCreateTrade)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 16px",
                    borderRadius: 99,
                    fontSize: 12,
                    fontWeight: 600,
                    background: "var(--am-chip-strong)",
                    color: "var(--am-text)",
                    border: "1px solid var(--am-border-strong)",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  <Plus size={13} />
                  Propose Trade
                </button>
              </div>

              {showCreateTrade && (
                <Glass padded={false}>
                  <div style={{ padding: 16 }}>
                    <CreateTradeForm
                      onCancel={() => setShowCreateTrade(false)}
                      onSuccess={() => {
                        loadTrades();
                        setShowCreateTrade(false);
                      }}
                    />
                  </div>
                </Glass>
              )}

              <div>
                <SectionLabel>Active Trades</SectionLabel>
                {activeTrades.length === 0 ? (
                  <Glass>
                    <EmptyState
                      icon={ArrowLeftRight}
                      title="No active trade proposals"
                      description="Trades, waivers, and roster moves will appear here."
                      compact
                    />
                  </Glass>
                ) : (
                  <div style={{ display: "grid", gap: 12 }}>
                    {activeTrades.map((t) => (
                      <Glass key={t.id} padded={false}>
                        <div style={{ padding: 16 }}>
                          <LeagueTradeCard
                            trade={t}
                            onRefresh={loadTrades}
                            currentUserId={Number(authUser?.id)}
                            isAdmin={isCommissioner}
                            onViewContext={() => setContextTrade(t)}
                          />
                        </div>
                      </Glass>
                    ))}
                  </div>
                )}
              </div>

              {completedTrades.length > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowCompletedTrades(!showCompletedTrades)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 10,
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                      color: "var(--am-text-faint)",
                      fontFamily: "inherit",
                    }}
                  >
                    <SectionLabel style={{ marginBottom: 0 }}>
                      Completed Trades · {completedTrades.length}
                    </SectionLabel>
                    <ChevronDown
                      size={14}
                      style={{
                        transition: "transform 200ms",
                        transform: showCompletedTrades ? "rotate(180deg)" : "none",
                      }}
                    />
                  </button>
                  {showCompletedTrades && (
                    <div style={{ display: "grid", gap: 12 }}>
                      {completedTrades.map((t) => (
                        <Glass key={t.id} padded={false}>
                          <div style={{ padding: 16 }}>
                            <TradeCard
                              trade={t}
                              onRefresh={loadTrades}
                              currentUserId={Number(authUser?.id)}
                              onViewContext={() => setContextTrade(t)}
                            />
                          </div>
                        </Glass>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === "history" && (
            <Glass padded={false}>
              <div style={{ padding: 16 }}>
                <ActivityHistoryTab
                  completedTrades={completedTrades}
                  transactions={transactions}
                />
              </div>
            </Glass>
          )}
        </>
      )}

      {/* Footer escape link */}
      <div style={{ marginTop: 8, textAlign: "center", fontSize: 11, color: "var(--am-text-faint)" }}>
        Need the original layout? <Link to="/activity-classic" style={{ color: "var(--am-text-muted)", textDecoration: "underline" }}>View classic Activity →</Link>
      </div>

      {/* Trade Context Modal */}
      {contextTrade && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 60,
          }}
          onClick={() => setContextTrade(null)}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 960, maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <Glass strong padded={false}>
              <div style={{ padding: 14, borderBottom: "1px solid var(--am-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: "var(--am-display)", fontSize: 16, fontWeight: 500, color: "var(--am-text)" }}>Trade Context</span>
                <button
                  type="button"
                  onClick={() => setContextTrade(null)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--am-text-muted)",
                    fontSize: 18,
                    cursor: "pointer",
                    padding: 0,
                    lineHeight: 1,
                  }}
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
              <div style={{ padding: 14, overflowY: "auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
                <TeamRosterView
                  teamId={contextTrade.proposingTeamId ?? contextTrade.proposerId}
                  teamName={contextTrade.proposingTeam?.name ?? "Proposer"}
                />
                <TeamRosterView
                  teamId={contextTrade.acceptingTeamId ?? 0}
                  teamName={contextTrade.acceptingTeam?.name ?? "Counterparty"}
                />
              </div>
            </Glass>
          </div>
        </div>
      )}
    </div>
  );
}
