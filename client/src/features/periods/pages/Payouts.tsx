import React, { useEffect, useState, useMemo } from "react";
import { getSeasonStandings } from "../../../api";
import { toNum } from "../../../api/base";
import { getSettlement, SettlementData } from "../../standings/api";
import { useLeague } from "../../../contexts/LeagueContext";
import PageHeader from "../../../components/ui/PageHeader";
import {
  ThemedTable,
  ThemedThead,
  ThemedTh,
  ThemedTr,
  ThemedTd,
} from "../../../components/ui/ThemedTable";

export default function Payouts() {
  const { leagueId } = useLeague();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settlement, setSettlement] = useState<SettlementData | null>(null);
  const [standingsRows, setStandingsRows] = useState<any[]>([]);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const [settlementData, standingsData] = await Promise.all([
          getSettlement(leagueId),
          getSeasonStandings(leagueId),
        ]);
        setSettlement(settlementData);

        // Normalize standings rows
        const rows = (standingsData.rows || []).map((r: any) => {
          let totalPoints = toNum(r.totalPoints);
          if (!totalPoints && Array.isArray(r.periodPoints)) {
            totalPoints = r.periodPoints.reduce((s: number, v: unknown) => s + toNum(v), 0);
          }
          return { teamId: r.teamId, teamName: r.teamName, totalPoints };
        });
        setStandingsRows(rows);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load payouts data");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [leagueId]);

  // Merge standings + settlement → payout table rows
  const payoutRows = useMemo(() => {
    if (!settlement) return [];

    // Sort by total points descending → assign rank
    const sorted = [...standingsRows].sort((a, b) => b.totalPoints - a.totalPoints);

    return sorted.map((row, idx) => {
      const rank = idx + 1;
      const pctKey = String(rank);
      const payoutPct = settlement.payoutPcts[pctKey] || 0;
      const winnings = (settlement.totalPot * payoutPct) / 100;
      const net = winnings - settlement.entryFee;

      // Find team data from settlement
      const teamData = settlement.teams.find((t) => t.id === row.teamId);
      const owners = teamData?.owners || [];

      return {
        rank,
        teamId: row.teamId,
        teamName: row.teamName,
        totalPoints: row.totalPoints,
        payoutPct,
        winnings,
        net,
        owners,
      };
    });
  }, [standingsRows, settlement]);

  if (loading)
    return (
      <div className="text-center text-[var(--lg-text-muted)] py-20 animate-pulse text-sm">
        Loading payouts...
      </div>
    );

  if (error)
    return (
      <div className="max-w-4xl mx-auto px-4 py-10">
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-6 py-4 text-sm font-medium text-red-300">
          Error: {error}
        </div>
      </div>
    );

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 md:px-6 md:py-10">
      <PageHeader
        title="Payouts"
        subtitle="End-of-season settlement based on final standings and league payout rules."
      />

      {/* Summary */}
      {settlement && (
        <div className="mt-8 grid grid-cols-3 gap-4 mb-8">
          <div className="lg-card p-4 text-center">
            <div className="text-xs font-medium uppercase text-[var(--lg-text-muted)] mb-1">Entry Fee</div>
            <div className="text-2xl font-semibold text-[var(--lg-text-primary)]">
              ${settlement.entryFee}
            </div>
          </div>
          <div className="lg-card p-4 text-center">
            <div className="text-xs font-medium uppercase text-[var(--lg-text-muted)] mb-1">Teams</div>
            <div className="text-2xl font-semibold text-[var(--lg-text-primary)]">
              {settlement.teams.length}
            </div>
          </div>
          <div className="lg-card p-4 text-center">
            <div className="text-xs font-medium uppercase text-[var(--lg-text-muted)] mb-1">Total Pot</div>
            <div className="text-2xl font-semibold text-[var(--lg-accent)]">
              ${settlement.totalPot}
            </div>
          </div>
        </div>
      )}

      {/* Payout Table */}
      <div className="lg-card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <ThemedTable bare>
            <ThemedThead>
              <ThemedTr>
                <ThemedTh className="pl-6 w-16" align="center">#</ThemedTh>
                <ThemedTh>Team</ThemedTh>
                <ThemedTh>Owner(s)</ThemedTh>
                <ThemedTh align="center">Points</ThemedTh>
                <ThemedTh align="center">Payout %</ThemedTh>
                <ThemedTh align="center">Winnings</ThemedTh>
                <ThemedTh align="center">Net</ThemedTh>
                <ThemedTh className="pr-6">Pay Via</ThemedTh>
              </ThemedTr>
            </ThemedThead>
            <tbody className="divide-y divide-[var(--lg-divide)]">
              {payoutRows.map((row) => (
                <ThemedTr key={row.teamId} className="hover:bg-[var(--lg-tint)]">
                  <ThemedTd className="pl-6" align="center">
                    <span className="text-lg font-semibold text-[var(--lg-text-muted)]">{row.rank}</span>
                  </ThemedTd>
                  <ThemedTd>
                    <span className="font-semibold text-[var(--lg-text-primary)]">{row.teamName}</span>
                  </ThemedTd>
                  <ThemedTd>
                    {row.owners.map((o) => (
                      <div key={o.id} className="text-sm text-[var(--lg-text-primary)]">
                        {o.name || o.email}
                      </div>
                    ))}
                    {row.owners.length === 0 && (
                      <span className="text-xs text-[var(--lg-text-muted)] italic">No owner</span>
                    )}
                  </ThemedTd>
                  <ThemedTd align="center">
                    <span className="tabular-nums">{row.totalPoints.toFixed(1)}</span>
                  </ThemedTd>
                  <ThemedTd align="center">
                    {row.payoutPct > 0 ? (
                      <span className="font-semibold text-[var(--lg-accent)]">{row.payoutPct}%</span>
                    ) : (
                      <span className="text-[var(--lg-text-muted)]">—</span>
                    )}
                  </ThemedTd>
                  <ThemedTd align="center">
                    {row.winnings > 0 ? (
                      <span className="font-semibold text-emerald-400">${row.winnings.toFixed(0)}</span>
                    ) : (
                      <span className="text-[var(--lg-text-muted)]">—</span>
                    )}
                  </ThemedTd>
                  <ThemedTd align="center">
                    <span
                      className={`font-semibold tabular-nums ${
                        row.net > 0
                          ? "text-emerald-400"
                          : row.net < 0
                          ? "text-red-400"
                          : "text-[var(--lg-text-muted)]"
                      }`}
                    >
                      {row.net > 0 ? "+" : ""}${row.net.toFixed(0)}
                    </span>
                  </ThemedTd>
                  <ThemedTd className="pr-6">
                    <div className="flex flex-wrap gap-1">
                      {row.owners.flatMap((o) => {
                        const badges: JSX.Element[] = [];
                        if (o.venmoHandle) {
                          badges.push(
                            <span
                              key={`v-${o.id}`}
                              className="inline-flex items-center rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-400"
                              title={o.venmoHandle}
                            >
                              Venmo
                            </span>
                          );
                        }
                        if (o.zelleHandle) {
                          badges.push(
                            <span
                              key={`z-${o.id}`}
                              className="inline-flex items-center rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-semibold text-purple-400"
                              title={o.zelleHandle}
                            >
                              Zelle
                            </span>
                          );
                        }
                        if (o.paypalHandle) {
                          badges.push(
                            <span
                              key={`p-${o.id}`}
                              className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400"
                              title={o.paypalHandle}
                            >
                              PayPal
                            </span>
                          );
                        }
                        return badges;
                      })}
                      {row.owners.every(
                        (o) => !o.venmoHandle && !o.zelleHandle && !o.paypalHandle
                      ) && <span className="text-[10px] text-[var(--lg-text-muted)] italic">None</span>}
                    </div>
                  </ThemedTd>
                </ThemedTr>
              ))}
              {payoutRows.length === 0 && (
                <ThemedTr>
                  <ThemedTd colSpan={8} className="py-20 text-center">
                    <span className="text-[var(--lg-text-muted)] italic">No payout data available.</span>
                  </ThemedTd>
                </ThemedTr>
              )}
            </tbody>
          </ThemedTable>
        </div>
      </div>
    </div>
  );
}
