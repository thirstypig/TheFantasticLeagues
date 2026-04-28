import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
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
import PageHeader from "../../../components/ui/PageHeader";
import { PageSkeleton } from "../../../components/ui/Skeleton";
import { Button } from "../../../components/ui/button";
import { Plus, ChevronDown, ArrowLeftRight } from "lucide-react";
import { EmptyState } from "../../../components/ui/EmptyState";
type ActivityTab = "add_drop" | "trades" | "waivers" | "history";

export default function ActivityPageLegacy() {
  const { me } = useAuth();
  const authUser = me?.user;
  const { leagueId: currentLeagueId, myTeamId, leagueRules } = useLeague();
  const { toast } = useToast();

  const isCommissioner =
    authUser?.isAdmin ||
    authUser?.memberships?.some(
      (m: any) => Number(m.leagueId) === currentLeagueId && m.role === "COMMISSIONER"
    );

  // Permission check for the Roster Moves tab. Mirror of the server-side
  // requireTeamOwnerOrCommissioner — a non-commissioner owner sees the tab
  // when the league's transactions.owner_self_serve rule is 'true', scoped
  // to their own team. Admins/commissioners always see it.
  const isLeagueMember = Boolean(
    authUser?.memberships?.some((m: any) => Number(m.leagueId) === currentLeagueId),
  );

  const [searchParams, setSearchParams] = useSearchParams();
  const VALID_TABS: ActivityTab[] = ["waivers", "add_drop", "trades", "history"];
  const tabParam = searchParams.get("tab") as ActivityTab | null;
  const activeTab: ActivityTab = tabParam && VALID_TABS.includes(tabParam) ? tabParam : "waivers";
  const setActiveTab = (tab: ActivityTab) => setSearchParams({ tab }, { replace: true });
  const [loading, setLoading] = useState(true);

  // Transaction data
  const [transactions, setTransactions] = useState<TransactionEvent[]>([]);
  const [players, setPlayers] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [standings, setStandings] = useState<any[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [claimInFlight, setClaimInFlight] = useState(false);

  // Trade data
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
      // Load all data in parallel — trades included in the same batch
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

        // Auto-detect user's team
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

  // Waiver Order: Reverse standings — worst team gets first waiver pick
  const sortedWaiverOrder = useMemo(() => {
    const standingMap = new Map(standings.map((s) => [s.teamId, s]));
    const teamsWithPoints = teams.map((t) => {
      const s = standingMap.get(t.id);
      return { ...t, rank: 0, points: s?.totalPoints || s?.points || 0 };
    });
    // Sort by points ASC (fewest points = worst team = first waiver pick)
    teamsWithPoints.sort((a, b) => a.points - b.points);
    // Assign standing rank for display (1 = best, N = worst)
    const byPointsDesc = [...teamsWithPoints].sort((a, b) => b.points - a.points);
    byPointsDesc.forEach((t, i) => { t.rank = i + 1; });
    return teamsWithPoints;
  }, [teams, standings]);

  // Trade categorization
  const activeTrades = useMemo(
    () => trades.filter((t) => ["PROPOSED", "ACCEPTED"].includes(t.status)),
    [trades]
  );
  const completedTrades = useMemo(
    () => trades.filter((t) => !["PROPOSED", "ACCEPTED"].includes(t.status)),
    [trades]
  );

  if (loading) return <PageSkeleton />;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 md:px-6 md:py-10">
      <div className="mb-10">
        <PageHeader
          title="Activity"
          subtitle="Manage roster moves, trades, waivers, and review transaction history."
          rightElement={
            <div className="flex items-center gap-4">
              <div className="lg-card p-1 flex gap-2">
                <Button
                  onClick={() => setActiveTab("waivers")}
                  variant={activeTab === "waivers" ? "default" : "ghost"}
                  size="sm"
                  className="px-6"
                >
                  Waivers
                </Button>
                <Button
                  onClick={() => setActiveTab("add_drop")}
                  variant={activeTab === "add_drop" ? "default" : "ghost"}
                  size="sm"
                  className="px-6"
                >
                  Roster Moves
                </Button>
                <Button
                  onClick={() => setActiveTab("trades")}
                  variant={activeTab === "trades" ? "default" : "ghost"}
                  size="sm"
                  className="px-6"
                >
                  Trades
                </Button>
                <Button
                  onClick={() => setActiveTab("history")}
                  variant={activeTab === "history" ? "default" : "ghost"}
                  size="sm"
                  className="px-6"
                >
                  History
                </Button>
              </div>
            </div>
          }
        />
      </div>

      <div className="mt-6">
        {/* Waivers Tab */}
        {activeTab === "waivers" && (
          <ActivityWaiversTab
            sortedWaiverOrder={sortedWaiverOrder}
            leagueId={currentLeagueId}
            isCommissioner={isCommissioner}
          />
        )}

        {/* Roster Moves Tab — unified home for Add/Drop, Place on IL, and
            Activate from IL. Visibility gated by canManageRoster: admins and
            league commissioners always see it; team owners see it when the
            league's transactions.owner_self_serve rule is 'true'. When the
            caller is not authorized for roster moves, we keep the waiver-
            submission fallback (existing path for non-commissioner owners in
            commissioner-only leagues) so that path doesn't regress. */}
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
              <div className="p-16 text-center text-[var(--lg-text-muted)] opacity-40 italic font-medium">
                Loading…
              </div>
            );
          }

          if (permission.kind === "allow" && selectedTeamId && currentLeagueId) {
            return (
              <RosterMovesTab
                leagueId={currentLeagueId}
                teamId={selectedTeamId}
                players={players}
                onComplete={loadData}
              />
            );
          }

          // Deny — show a waiver-claim fallback for non-commissioner owners
          // in commissioner-only leagues. This is the pre-existing path,
          // preserved to avoid regressing the owner-submits-waiver flow
          // while a dedicated Waivers-tab submit UI is built separately.
          if (permission.kind === "deny" && selectedTeamId) {
            return (
              <div className="lg-card p-4">
                <p className="text-[11px] text-[var(--lg-text-muted)] mb-4">
                  {REASON_COPY[permission.reason]} You can still submit a waiver claim below.
                </p>
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
              </div>
            );
          }

          return (
            <div className="p-16 text-center text-[var(--lg-text-muted)] opacity-40 italic font-medium">
              Select a team to manage roster moves.
            </div>
          );
        })()}

        {/* Trades Tab */}
        {activeTab === "trades" && (
          <div className="space-y-8">
            {/* Propose Trade Button */}
            <div className="flex justify-end">
              <Button
                onClick={() => setShowCreateTrade(!showCreateTrade)}
                variant="default"
                className="px-8 shadow-xl shadow-blue-500/20"
              >
                <Plus className="w-4 h-4 mr-2" />
                Propose Trade
              </Button>
            </div>

            {/* Create Trade Form (inline) */}
            {showCreateTrade && (
              <CreateTradeForm
                onCancel={() => setShowCreateTrade(false)}
                onSuccess={() => {
                  loadTrades();
                  setShowCreateTrade(false);
                }}
              />
            )}

            {/* Active Trades */}
            <div>
              <div className="flex items-center gap-4 mb-6">
                <div className="w-1.5 h-6 bg-emerald-500 rounded-full shadow-lg shadow-emerald-500/20"></div>
                <h2 className="text-2xl font-semibold uppercase tracking-tight text-[var(--lg-text-heading)]">
                  Active Trades
                </h2>
              </div>
              {activeTrades.length === 0 ? (
                <EmptyState icon={ArrowLeftRight} title="No active trade proposals" description="Trades, waivers, and roster moves will appear here." compact />
              ) : (
                <div className="grid gap-6">
                  {activeTrades.map((t) => (
                    <LeagueTradeCard
                      key={t.id}
                      trade={t}
                      onRefresh={loadTrades}
                      currentUserId={Number(authUser?.id)}
                      isAdmin={isCommissioner}
                      onViewContext={() => setContextTrade(t)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Completed Trades (collapsible) */}
            {completedTrades.length > 0 && (
              <div>
                <button
                  onClick={() => setShowCompletedTrades(!showCompletedTrades)}
                  className="flex items-center gap-4 mb-6 group cursor-pointer"
                >
                  <div className="w-1.5 h-6 bg-[var(--lg-text-muted)] opacity-20 rounded-full"></div>
                  <h2 className="text-2xl font-semibold uppercase tracking-tight text-[var(--lg-text-heading)] opacity-60">
                    Completed Trades ({completedTrades.length})
                  </h2>
                  <ChevronDown
                    className={`w-5 h-5 text-[var(--lg-text-muted)] transition-transform ${
                      showCompletedTrades ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {showCompletedTrades && (
                  <div className="grid gap-6">
                    {completedTrades.map((t) => (
                      <TradeCard
                        key={t.id}
                        trade={t}
                        onRefresh={loadTrades}
                        currentUserId={Number(authUser?.id)}
                        onViewContext={() => setContextTrade(t)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* History Tab */}
        {activeTab === "history" && (
          <ActivityHistoryTab
            completedTrades={completedTrades}
            transactions={transactions}
          />
        )}

      </div>

      {/* Trade Context Modal */}
      {contextTrade && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50"
          onClick={() => setContextTrade(null)}
        >
          <div
            className="rounded-xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-[var(--lg-border-subtle)] flex justify-between items-center bg-[var(--lg-tint)]">
              <h3 className="font-semibold text-lg text-[var(--lg-text-heading)]">Trade Context</h3>
              <button
                onClick={() => setContextTrade(null)}
                className="text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)]"
              >
                ✕
              </button>
            </div>
            <div className="p-4 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-4">
              <TeamRosterView
                teamId={contextTrade.proposingTeamId ?? contextTrade.proposerId}
                teamName={contextTrade.proposingTeam?.name ?? "Proposer"}
              />
              <TeamRosterView
                teamId={contextTrade.acceptingTeamId ?? 0}
                teamName={contextTrade.acceptingTeam?.name ?? "Counterparty"}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
