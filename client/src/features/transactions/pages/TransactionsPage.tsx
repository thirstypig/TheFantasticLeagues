// client/src/pages/TransactionsPage.tsx
import React, { useEffect, useState } from "react";
import { getTransactions, TransactionEvent, getPlayerSeasonStats, getLeague, PlayerSeasonStat, getSeasonStandings } from "../../../api";
import { fetchJsonApi, API_BASE } from "../../../api/base";
import { processWaiverClaims } from "../../waivers/api";
import { useAuth } from "../../../auth/AuthProvider";
import { useLeague } from "../../../contexts/LeagueContext";
import { useToast } from "../../../contexts/ToastContext";
import AddDropTab from "../../roster/components/AddDropTab";
import PageHeader from "../../../components/ui/PageHeader";
import { ThemedTable, ThemedThead, ThemedTh, ThemedTr, ThemedTd } from "../../../components/ui/ThemedTable";
import { Button } from "../../../components/ui/button";

  /* ... existing imports */

export default function TransactionsPage() {
  const { me } = useAuth();
  const authUser = me?.user;
  const { leagueId } = useLeague();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'add_drop' | 'waivers' | 'history'>('add_drop');
  const [processing, setProcessing] = useState(false);

  // Data
  const [transactions, setTransactions] = useState<TransactionEvent[]>([]);
  const [players, setPlayers] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [standings, setStandings] = useState<any[]>([]);

  // State
  const [loading, setLoading] = useState(true);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);

  async function loadData() {
    try {
      const [txResp, playersResp, lDetail, standingsResp] = await Promise.all([
           getTransactions({ take: 100 }),
           getPlayerSeasonStats(),
           getLeague(leagueId),
           getSeasonStandings()
      ]);
      setTransactions(txResp.transactions);
      setPlayers(playersResp || []);
      setStandings(standingsResp.rows || []);

      {
          const loadedTeams = lDetail.league.teams || [];
          setTeams(loadedTeams);

          // Default to first owned team (or first team for admins)
          const uid = Number(authUser?.id);
          const userTeams = authUser?.isAdmin
            ? loadedTeams
            : loadedTeams.filter((t: any) => t.ownerUserId === uid || (t.ownerships || []).some((o: any) => o.userId === uid));
          if (userTeams.length > 0) {
              setSelectedTeamId(userTeams[0].id);
          }
      }

    } catch (err: unknown) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const handleClaim = async (player: PlayerSeasonStat) => {
      if (!selectedTeamId || !leagueId) {
          toast("Please select a team to claim for.", "warning");
          return;
      }

      const confirmed = confirm(`Submit waiver claim for ${player.player_name}?`);
      if (!confirmed) return;

      try {
          await fetchJsonApi(`${API_BASE}/transactions/claim`, {
              method: 'POST',
              body: JSON.stringify({
                  leagueId,
                  teamId: selectedTeamId,
                  playerId: (player as any).player_id || (player as any).id,
                  mlbId: player.mlb_id || (player as any).mlbId,
              })
          });

          toast(`Successfully claimed ${player.player_name}!`, "success");
          await loadData();

      } catch (err: unknown) {
          console.error("Claim error:", err);
          const errMsg = err instanceof Error ? err.message : "Unknown error";
          toast(errMsg, "error");
      }
  };

  // Waiver Order: Reverse standings — worst team gets first waiver pick.
  // Uses totalPoints from season standings (cumulative roto points).
  const sortedWaiverOrder = React.useMemo(() => {
      const standingMap = new Map(standings.map(s => [s.teamId, s]));
      const teamsWithPoints = teams.map(t => {
          const s = standingMap.get(t.id);
          return {
              ...t,
              totalPoints: s?.totalPoints || 0,
              standingRank: 0, // will be computed after sort
          };
      });
      // Sort by totalPoints ASC (fewest points = worst team = first waiver pick)
      teamsWithPoints.sort((a, b) => a.totalPoints - b.totalPoints);
      // Assign standing rank (1 = best, N = worst) for display
      const byPointsDesc = [...teamsWithPoints].sort((a, b) => b.totalPoints - a.totalPoints);
      byPointsDesc.forEach((t, i) => { t.standingRank = i + 1; });
      return teamsWithPoints;
  }, [teams, standings]);

  if (loading) return <div className="text-center text-[var(--lg-text-muted)] py-20 animate-pulse text-sm">Loading roster moves...</div>;

  return (
    <div className="h-[100svh] flex flex-col overflow-hidden">
       <div className="max-w-6xl mx-auto px-4 pt-6 md:px-6 md:pt-10 w-full">
           <PageHeader 
             title="Roster Moves"
             subtitle="Add, drop, and claim players. Process waivers and review history."
             rightElement={
                  <div className="flex items-center gap-4">
                      {/* Navigation Hub */}
                      <div className="lg-card p-1 flex gap-2">
                           <Button 
                              onClick={() => setActiveTab('add_drop')}
                              variant={activeTab === 'add_drop' ? 'default' : 'ghost'}
                              size="sm"
                              className="px-6"
                           >
                               Add / Drop
                           </Button>
                           <Button 
                              onClick={() => setActiveTab('waivers')}
                              variant={activeTab === 'waivers' ? 'default' : 'ghost'}
                              size="sm"
                              className="px-6"
                           >
                               Waivers
                           </Button>
                           <Button 
                              onClick={() => setActiveTab('history')}
                              variant={activeTab === 'history' ? 'default' : 'ghost'}
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

      <div className="flex-1 overflow-auto max-w-6xl mx-auto px-4 pb-6 md:px-6 md:pb-10 w-full">
          {activeTab === 'add_drop' && (
              <div className="liquid-glass rounded-3xl p-1 bg-[var(--lg-tint)]">
                <AddDropTab players={players} onClaim={handleClaim} />
              </div>
          )}

          {activeTab === 'waivers' && (
              <div className="max-w-xl mx-auto space-y-6">
                  <div className="text-center mb-8">
                    <h3 className="text-3xl font-semibold uppercase text-[var(--lg-text-heading)] mb-2">Waiver Priority</h3>
                    <p className="text-xs text-[var(--lg-text-muted)] uppercase font-medium opacity-50">Inverse Standings — Worst Record Picks First</p>
                    <p className="text-[10px] text-[var(--lg-text-muted)] mt-1 opacity-40">
                      Updated {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · Based on current season standings
                    </p>
                  </div>

                  <div className="lg-card p-0 overflow-hidden divide-y divide-[var(--lg-divide)]">
                      {sortedWaiverOrder.map((t: any, idx: number) => {
                          const isMyTeam = teams.find((tm: any) => tm.id === t.id && (tm.ownerUserId === Number(authUser?.id) || (tm.ownerships || []).some((o: any) => o.userId === Number(authUser?.id))));
                          return (
                          <div key={t.id} className={`flex items-center justify-between p-6 hover:bg-[var(--lg-tint)] transition-colors group ${isMyTeam ? 'border-l-2 border-l-[var(--lg-accent)]' : ''}`}>
                               <div className="flex items-center gap-6">
                                  <span className="text-2xl font-bold text-[var(--lg-text-muted)] opacity-15 w-10 tabular-nums group-hover:opacity-30 transition-opacity text-center">{idx + 1}</span>
                                  <div>
                                      <div className="font-semibold text-lg text-[var(--lg-text-primary)] flex items-center gap-2">
                                        {t.name}
                                        {isMyTeam && <span className="text-[9px] font-bold uppercase text-[var(--lg-accent)] bg-[var(--lg-accent)]/10 px-1.5 py-0.5 rounded border border-[var(--lg-accent)]/20">You</span>}
                                      </div>
                                  </div>
                              </div>
                              <div className="text-right">
                                  <div className="text-sm font-semibold text-[var(--lg-text-secondary)]">
                                      {t.standingRank > 0 ? `#${t.standingRank} in standings` : '—'}
                                  </div>
                                  <div className="text-xs font-medium text-[var(--lg-text-muted)] mt-0.5 opacity-50">
                                      {t.totalPoints.toFixed(1)} pts
                                  </div>
                              </div>
                          </div>
                          );
                      })}
                  </div>
                  <div className="text-center text-[11px] font-medium text-[var(--lg-text-muted)] uppercase mt-8 bg-[var(--lg-tint)] p-4 rounded-2xl border border-[var(--lg-border-subtle)] opacity-50">
                      Worst-performing team gets first waiver pick. Priority updates with each period's standings.
                  </div>

                  {/* Commissioner Process Button */}
                  {leagueId && (authUser?.isAdmin || authUser?.memberships?.some(
                    (m: any) => Number(m.leagueId) === leagueId && m.role === "COMMISSIONER"
                  )) && (
                    <div className="text-center mt-6">
                      <Button
                        onClick={async () => {
                          if (!confirm("Process all pending waiver claims for this league?")) return;
                          setProcessing(true);
                          try {
                            const result = await processWaiverClaims(leagueId);
                            toast(`Waivers processed. ${result.logs.length} claims handled.`, "success");
                            await loadData();
                          } catch (err: unknown) {
                            const errMsg = err instanceof Error ? err.message : "Failed to process waivers";
                            toast(errMsg, "error");
                          } finally {
                            setProcessing(false);
                          }
                        }}
                        disabled={processing}
                        variant="default"
                        className="px-8"
                      >
                        {processing ? "Processing..." : "Process Waivers"}
                      </Button>
                    </div>
                  )}
              </div>
          )}

          {activeTab === 'history' && (
              <div className="lg-card p-0">
                <ThemedTable bare>
                    <ThemedThead sticky>
                      <ThemedTr>
                        <ThemedTh className="pl-8">Date</ThemedTh>
                        <ThemedTh>Team</ThemedTh>
                        <ThemedTh>Player</ThemedTh>
                        <ThemedTh className="pr-8">Type</ThemedTh>
                      </ThemedTr>
                    </ThemedThead>
                    <tbody className="divide-y divide-[var(--lg-divide)]">
                      {transactions.map((tx) => (
                        <ThemedTr key={tx.id} className="group hover:bg-[var(--lg-tint)]">
                          <ThemedTd className="pl-8">
                            {tx.effDate ? new Date(tx.effDate).toLocaleDateString() : tx.effDateRaw}
                          </ThemedTd>
                          <ThemedTd>
                            {tx.team?.name || tx.ogbaTeamName}
                          </ThemedTd>
                          <ThemedTd>
                            {tx.player?.name || tx.playerAliasRaw}
                          </ThemedTd>
                          <ThemedTd className="pr-8">
                            {tx.transactionRaw}
                          </ThemedTd>
                        </ThemedTr>
                      ))}
                      {transactions.length === 0 && (
                        <ThemedTr>
                          <ThemedTd colSpan={4} className="py-32 text-center">
                            No transactions found.
                          </ThemedTd>
                        </ThemedTr>
                      )}
                    </tbody>
                </ThemedTable>
              </div>
          )}
      </div>
    </div>
  );
}
