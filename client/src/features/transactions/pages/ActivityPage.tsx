import React, { useEffect, useState, useCallback, useMemo } from "react";
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
import AddDropTab from "../../roster/components/AddDropTab";
import { TradeCard, LeagueTradeCard, CreateTradeForm } from "../../trades/pages/TradesPage";
import TeamRosterView from "../../teams/components/TeamRosterView";
import ActivityWaiversTab from "../components/ActivityWaiversTab";
import ActivityHistoryTab from "../components/ActivityHistoryTab";
import PageHeader from "../../../components/ui/PageHeader";
import { Button } from "../../../components/ui/button";
import { Plus, ChevronDown, ArrowLeftRight } from "lucide-react";
import { EmptyState } from "../../../components/ui/EmptyState";

type ActivityTab = "add_drop" | "trades" | "waivers" | "history";

export default function ActivityPage() {
  const { me } = useAuth();
  const authUser = me?.user;
  const { leagueId: currentLeagueId } = useLeague();
  const { toast } = useToast();

  const isCommissioner =
    authUser?.isAdmin ||
    authUser?.memberships?.some(
      (m: any) => Number(m.leagueId) === currentLeagueId && m.role === "COMMISSIONER"
    );

  const [activeTab, setActiveTab] = useState<ActivityTab>("add_drop");
  const [loading, setLoading] = useState(true);

  // Transaction data
  const [transactions, setTransactions] = useState<TransactionEvent[]>([]);
  const [players, setPlayers] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [standings, setStandings] = useState<any[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);

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
      const results = await Promise.allSettled([
        getTransactions({ leagueId: currentLeagueId, take: 100 }),
        getPlayerSeasonStats(currentLeagueId),
        getLeague(currentLeagueId),
        getSeasonStandings(),
      ]);

      const [txResult, playersResult, leagueResult, standingsResult] = results;

      if (txResult.status === "fulfilled") setTransactions(txResult.value.transactions);
      if (playersResult.status === "fulfilled") setPlayers(playersResult.value || []);
      if (standingsResult.status === "fulfilled") setStandings(standingsResult.value.rows || []);
      await loadTrades(currentLeagueId);

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
  }, [authUser?.id, currentLeagueId, loadTrades]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleClaim = async (player: PlayerSeasonStat) => {
    if (!selectedTeamId || !currentLeagueId) {
      toast("Please select a team to claim for.", "warning");
      return;
    }

    const confirmed = confirm(`Add ${player.player_name} to your roster?`);
    if (!confirmed) return;

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
    }
  };

  const handleDrop = async (player: PlayerSeasonStat) => {
    if (!selectedTeamId || !currentLeagueId) {
      toast("Please select a team first.", "warning");
      return;
    }

    const confirmed = confirm(`Drop ${player.player_name} from the roster?`);
    if (!confirmed) return;

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
    }
  };

  // Waiver Order: Reverse Standings
  const sortedWaiverOrder = useMemo(() => {
    const standingMap = new Map(standings.map((s) => [s.teamId, s]));
    const teamsWithRank = teams.map((t) => {
      const s = standingMap.get(t.id);
      return { ...t, rank: s?.rank || 999, points: s?.points || 0 };
    });
    return teamsWithRank.sort((a: any, b: any) => b.rank - a.rank);
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

  if (loading)
    return (
      <div className="text-center text-[var(--lg-text-muted)] py-20 animate-pulse text-sm">
        Loading activity...
      </div>
    );

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
                  onClick={() => setActiveTab("add_drop")}
                  variant={activeTab === "add_drop" ? "default" : "ghost"}
                  size="sm"
                  className="px-6"
                >
                  Add / Drop
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
                  onClick={() => setActiveTab("waivers")}
                  variant={activeTab === "waivers" ? "default" : "ghost"}
                  size="sm"
                  className="px-6"
                >
                  Waivers
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
        {/* Add/Drop Tab */}
        {activeTab === "add_drop" && (
          <div className="liquid-glass rounded-3xl p-1 bg-[var(--lg-tint)]">
            {isCommissioner ? (
              <AddDropTab players={players} onClaim={handleClaim} onDrop={handleDrop} />
            ) : (
              <div className="p-16 text-center text-[var(--lg-text-muted)] opacity-40 italic font-medium">
                Add/Drop is commissioner-only. Contact your league commissioner for roster changes.
              </div>
            )}
          </div>
        )}

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

        {/* Waivers Tab */}
        {activeTab === "waivers" && (
          <ActivityWaiversTab
            sortedWaiverOrder={sortedWaiverOrder}
            leagueId={currentLeagueId}
            isCommissioner={isCommissioner}
          />
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
