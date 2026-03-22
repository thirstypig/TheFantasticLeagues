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

  // Waiver Order: Reverse Standings logic
  // Standings are returned ranked 1..N (1 is best).
  // So sorting by rank DESC gives N..1 (worst to best).
  const sortedWaiverOrder = React.useMemo(() => {
      // 1. Create a map of teamId -> standing data
      const standingMap = new Map(standings.map(s => [s.teamId, s]));

      // 2. Map teams to include rank info
      const teamsWithRank = teams.map(t => {
          const s = standingMap.get(t.id);
          return {
              ...t,
              rank: s?.rank || 999,
              points: s?.points || 0
          };
      });

      // 3. Sort by rank DESC (higher rank number = worse team = better waiver priority)
      // Rank 1 (Best) -> Priority Last
      // Rank 8 (Worst) -> Priority First
      return teamsWithRank.sort((a: any, b: any) => b.rank - a.rank);
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
                  <div className="text-center mb-12">
                    <h3 className="text-4xl font-semibold uppercase text-[var(--lg-text-heading)] mb-2">Waiver Priority</h3>
                    <p className="text-xs text-[var(--lg-text-muted)] uppercase font-medium opacity-40">Based on Reverse Standings</p>
                  </div>
                  
                  <div className="lg-card p-0 overflow-hidden divide-y divide-[var(--lg-divide)]">
                      {sortedWaiverOrder.map((t, idx) => (
                          <div key={t.id} className="flex items-center justify-between p-8 hover:bg-[var(--lg-tint)] transition-colors group">
                               <div className="flex items-center gap-8">
                                  <span className="text-3xl font-bold text-[var(--lg-text-muted)] opacity-10 w-12 tabular-nums group-hover:opacity-30 transition-opacity">{idx + 1}</span>
                                  <div>
                                      <div className="font-semibold text-2xl text-[var(--lg-text-primary)]">{t.name}</div>
                                      <div className="text-xs text-[var(--lg-text-muted)] font-medium uppercase mt-1 opacity-60">{t.owner || 'No Owner'}</div>
                                  </div>
                              </div>
                              <div className="text-right">
                                  <div className="text-xl font-semibold text-[var(--lg-accent)]">
                                      {t.rank === 999 ? '—' : `POS ${t.rank}`}
                                  </div>
                                  <div className="text-xs font-medium text-[var(--lg-text-muted)] mt-1 uppercase opacity-40">
                                      {t.points.toFixed(1)} Pts
                                  </div>
                              </div>
                          </div>
                      ))}
                  </div>
                  <div className="text-center text-xs font-medium text-[var(--lg-text-muted)] uppercase mt-12 bg-[var(--lg-tint)] p-6 rounded-3xl border border-[var(--lg-border-subtle)] opacity-60">
                      Waiver priority is based on reverse standings order. Claims are processed at scheduled times.
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
