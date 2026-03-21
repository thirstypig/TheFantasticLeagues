import React, { useState } from "react";
import { BarChart3, TrendingUp, TrendingDown, Loader2, Target, Users, DollarSign, Gavel, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { fetchJsonApi } from "../../../api/base";
import { ThemedTable, ThemedThead, ThemedTbody, ThemedTh, ThemedTr, ThemedTd } from "../../../components/ui/ThemedTable";

/* ── Types (matches server response) ─────────────────────────────── */

interface SurplusEntry {
  playerName: string; position: string; price: number; projectedValue: number; surplus: number;
}

interface PositionSpend {
  position: string; totalSpent: number; avgPrice: number; playerCount: number;
}

interface ContestedLot {
  playerName: string; position: string; price: number; bidCount: number; teamsInvolved: number;
}

interface TeamEfficiency {
  teamId: number; teamName: string; totalSpent: number; playersAcquired: number;
  avgPrice: number; budgetRemaining: number; bargainCount: number; overpayCount: number; totalSurplus: number;
}

interface QuarterPace {
  quarter: number; avgPrice: number; totalSpent: number; lotsCount: number;
}

interface RetrospectiveData {
  league: {
    totalLots: number; totalSpent: number; avgPrice: number; medianPrice: number;
    mostExpensivePlayer: { playerName: string; position: string; price: number } | null;
    cheapestWin: { playerName: string; position: string; price: number } | null;
    totalBidsPlaced: number; avgBidsPerLot: number;
  };
  bargains: SurplusEntry[];
  overpays: SurplusEntry[];
  positionSpending: PositionSpend[];
  mostContested: ContestedLot[];
  teamEfficiency: TeamEfficiency[];
  spendingPace: QuarterPace[];
}

/* ── Props ───────────────────────────────────────────────────────── */

interface DraftReportProps {
  leagueId: number;
  myTeamId?: number;
}

/* ── Helpers ─────────────────────────────────────────────────────── */

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] p-3 text-center">
      <div className="text-lg font-semibold text-[var(--lg-text-primary)] tabular-nums">{value}</div>
      <div className="text-[10px] font-semibold uppercase text-[var(--lg-text-muted)] mt-0.5">{label}</div>
      {sub && <div className="text-[10px] text-[var(--lg-text-muted)] mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--lg-text-muted)] mt-5 mb-2">{children}</h4>;
}

/* ── Component ───────────────────────────────────────────────────── */

export default function DraftReport({ leagueId, myTeamId }: DraftReportProps) {
  const [data, setData] = useState<RetrospectiveData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadReport() {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchJsonApi<RetrospectiveData>(`/api/auction/retrospective?leagueId=${leagueId}`);
      setData(result);
    } catch {
      setError("Could not load draft report");
    } finally {
      setLoading(false);
    }
  }

  if (!data) {
    return (
      <div className="rounded-lg border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[var(--lg-accent)]" />
            <h3 className="text-sm font-semibold text-[var(--lg-text-primary)]">Draft Report</h3>
          </div>
          <button
            onClick={loadReport}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-[var(--lg-accent)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <BarChart3 size={14} />}
            {loading ? "Analyzing..." : "View Draft Report"}
          </button>
        </div>
        {error && <p className="text-xs text-[var(--lg-error)] mt-2">{error}</p>}
      </div>
    );
  }

  const { league: lg } = data;

  return (
    <div className="rounded-lg border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] p-5 space-y-1">
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="w-5 h-5 text-[var(--lg-accent)]" />
        <h3 className="text-sm font-semibold text-[var(--lg-text-primary)]">Draft Report</h3>
      </div>

      {/* ── League Summary ── */}
      <SectionLabel>League Summary</SectionLabel>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatCard label="Total Lots" value={lg.totalLots} />
        <StatCard label="Total Spent" value={`$${lg.totalSpent}`} />
        <StatCard label="Avg Price" value={`$${lg.avgPrice}`} />
        <StatCard label="Median Price" value={`$${lg.medianPrice}`} />
        <StatCard label="Total Bids" value={lg.totalBidsPlaced} />
        <StatCard label="Avg Bids/Lot" value={lg.avgBidsPerLot} />
        <StatCard
          label="Most Expensive"
          value={lg.mostExpensivePlayer ? `$${lg.mostExpensivePlayer.price}` : "—"}
          sub={lg.mostExpensivePlayer ? `${lg.mostExpensivePlayer.playerName} (${lg.mostExpensivePlayer.position})` : undefined}
        />
        <StatCard
          label="Cheapest Win"
          value={lg.cheapestWin ? `$${lg.cheapestWin.price}` : "—"}
          sub={lg.cheapestWin ? `${lg.cheapestWin.playerName} (${lg.cheapestWin.position})` : undefined}
        />
      </div>

      {/* ── Bargains & Overpays ── */}
      {(data.bargains.length > 0 || data.overpays.length > 0) && (
        <>
          <SectionLabel>Bargains & Overpays</SectionLabel>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.bargains.length > 0 && (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <TrendingUp size={14} className="text-emerald-500" />
                  <span className="text-xs font-semibold text-emerald-500">Top Bargains</span>
                </div>
                <ThemedTable>
                  <ThemedThead>
                    <ThemedTr>
                      <ThemedTh>Player</ThemedTh>
                      <ThemedTh className="text-right">Price</ThemedTh>
                      <ThemedTh className="text-right">Value</ThemedTh>
                      <ThemedTh className="text-right">Surplus</ThemedTh>
                    </ThemedTr>
                  </ThemedThead>
                  <ThemedTbody>
                    {data.bargains.map(b => (
                      <ThemedTr key={b.playerName}>
                        <ThemedTd>
                          <span className="font-medium text-[var(--lg-text-primary)]">{b.playerName}</span>
                          <span className="text-[10px] text-[var(--lg-text-muted)] ml-1">{b.position}</span>
                        </ThemedTd>
                        <ThemedTd className="text-right tabular-nums">${b.price}</ThemedTd>
                        <ThemedTd className="text-right tabular-nums">${b.projectedValue}</ThemedTd>
                        <ThemedTd className="text-right tabular-nums text-emerald-500 font-semibold">+${b.surplus}</ThemedTd>
                      </ThemedTr>
                    ))}
                  </ThemedTbody>
                </ThemedTable>
              </div>
            )}
            {data.overpays.length > 0 && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <TrendingDown size={14} className="text-red-400" />
                  <span className="text-xs font-semibold text-red-400">Top Overpays</span>
                </div>
                <ThemedTable>
                  <ThemedThead>
                    <ThemedTr>
                      <ThemedTh>Player</ThemedTh>
                      <ThemedTh className="text-right">Price</ThemedTh>
                      <ThemedTh className="text-right">Value</ThemedTh>
                      <ThemedTh className="text-right">Surplus</ThemedTh>
                    </ThemedTr>
                  </ThemedThead>
                  <ThemedTbody>
                    {data.overpays.map(o => (
                      <ThemedTr key={o.playerName}>
                        <ThemedTd>
                          <span className="font-medium text-[var(--lg-text-primary)]">{o.playerName}</span>
                          <span className="text-[10px] text-[var(--lg-text-muted)] ml-1">{o.position}</span>
                        </ThemedTd>
                        <ThemedTd className="text-right tabular-nums">${o.price}</ThemedTd>
                        <ThemedTd className="text-right tabular-nums">${o.projectedValue}</ThemedTd>
                        <ThemedTd className="text-right tabular-nums text-red-400 font-semibold">${o.surplus}</ThemedTd>
                      </ThemedTr>
                    ))}
                  </ThemedTbody>
                </ThemedTable>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Position Spending ── */}
      <SectionLabel>Spending by Position</SectionLabel>
      <div className="overflow-x-auto">
        <ThemedTable>
          <ThemedThead>
            <ThemedTr>
              <ThemedTh>Position</ThemedTh>
              <ThemedTh className="text-right">Players</ThemedTh>
              <ThemedTh className="text-right">Total Spent</ThemedTh>
              <ThemedTh className="text-right">Avg Price</ThemedTh>
            </ThemedTr>
          </ThemedThead>
          <ThemedTbody>
            {data.positionSpending.map(ps => (
              <ThemedTr key={ps.position}>
                <ThemedTd className="font-semibold text-[var(--lg-text-primary)]">{ps.position}</ThemedTd>
                <ThemedTd className="text-right tabular-nums">{ps.playerCount}</ThemedTd>
                <ThemedTd className="text-right tabular-nums">${ps.totalSpent}</ThemedTd>
                <ThemedTd className="text-right tabular-nums">${ps.avgPrice}</ThemedTd>
              </ThemedTr>
            ))}
          </ThemedTbody>
        </ThemedTable>
      </div>

      {/* ── Most Contested ── */}
      <SectionLabel>Most Contested Players</SectionLabel>
      <div className="overflow-x-auto">
        <ThemedTable>
          <ThemedThead>
            <ThemedTr>
              <ThemedTh>Player</ThemedTh>
              <ThemedTh className="text-right">Price</ThemedTh>
              <ThemedTh className="text-right">Bids</ThemedTh>
              <ThemedTh className="text-right">Teams</ThemedTh>
            </ThemedTr>
          </ThemedThead>
          <ThemedTbody>
            {data.mostContested.map(mc => (
              <ThemedTr key={mc.playerName}>
                <ThemedTd>
                  <span className="font-medium text-[var(--lg-text-primary)]">{mc.playerName}</span>
                  <span className="text-[10px] text-[var(--lg-text-muted)] ml-1">{mc.position}</span>
                </ThemedTd>
                <ThemedTd className="text-right tabular-nums font-semibold text-[var(--lg-accent)]">${mc.price}</ThemedTd>
                <ThemedTd className="text-right tabular-nums">{mc.bidCount}</ThemedTd>
                <ThemedTd className="text-right tabular-nums">{mc.teamsInvolved}</ThemedTd>
              </ThemedTr>
            ))}
          </ThemedTbody>
        </ThemedTable>
      </div>

      {/* ── Team Efficiency ── */}
      <SectionLabel>Team Efficiency</SectionLabel>
      <div className="overflow-x-auto">
        <ThemedTable>
          <ThemedThead>
            <ThemedTr>
              <ThemedTh>Team</ThemedTh>
              <ThemedTh className="text-right">Spent</ThemedTh>
              <ThemedTh className="text-right">Players</ThemedTh>
              <ThemedTh className="text-right">Avg $</ThemedTh>
              <ThemedTh className="text-right">Left</ThemedTh>
              <ThemedTh className="text-right">Surplus</ThemedTh>
            </ThemedTr>
          </ThemedThead>
          <ThemedTbody>
            {data.teamEfficiency.map(te => (
              <ThemedTr key={te.teamId} className={te.teamId === myTeamId ? "bg-[var(--lg-tint)]" : ""}>
                <ThemedTd className="font-medium text-[var(--lg-text-primary)]">{te.teamName}</ThemedTd>
                <ThemedTd className="text-right tabular-nums">${te.totalSpent}</ThemedTd>
                <ThemedTd className="text-right tabular-nums">{te.playersAcquired}</ThemedTd>
                <ThemedTd className="text-right tabular-nums">${te.avgPrice}</ThemedTd>
                <ThemedTd className="text-right tabular-nums">${te.budgetRemaining}</ThemedTd>
                <ThemedTd className={`text-right tabular-nums font-semibold ${te.totalSurplus > 0 ? "text-emerald-500" : te.totalSurplus < 0 ? "text-red-400" : ""}`}>
                  {te.totalSurplus > 0 ? "+" : ""}{te.totalSurplus === 0 ? "—" : `$${te.totalSurplus}`}
                </ThemedTd>
              </ThemedTr>
            ))}
          </ThemedTbody>
        </ThemedTable>
      </div>

      {/* ── Spending Pace ── */}
      <SectionLabel>Spending Pace</SectionLabel>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {data.spendingPace.map((q, i) => {
          const prev = i > 0 ? data.spendingPace[i - 1] : null;
          const trend = prev && q.avgPrice > 0 && prev.avgPrice > 0
            ? q.avgPrice > prev.avgPrice ? "up" : q.avgPrice < prev.avgPrice ? "down" : null
            : null;
          return (
            <div key={q.quarter} className="rounded-lg border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] p-3 text-center">
              <div className="text-[10px] font-semibold uppercase text-[var(--lg-text-muted)] mb-1">
                Q{q.quarter} · {q.lotsCount} lots
              </div>
              <div className="flex items-center justify-center gap-1">
                <span className="text-lg font-semibold text-[var(--lg-text-primary)] tabular-nums">
                  ${q.avgPrice}
                </span>
                {trend === "up" && <ArrowUpRight size={14} className="text-red-400" />}
                {trend === "down" && <ArrowDownRight size={14} className="text-emerald-500" />}
              </div>
              <div className="text-[10px] text-[var(--lg-text-muted)]">avg · ${q.totalSpent} total</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
