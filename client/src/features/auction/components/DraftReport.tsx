import React, { useState } from "react";
import { BarChart3, TrendingUp, TrendingDown, Loader2, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { fetchJsonApi, API_BASE } from "../../../api/base";
import { ThemedTable, ThemedThead, ThemedTbody, ThemedTh, ThemedTr, ThemedTd } from "../../../components/ui/ThemedTable";
import { Glass, IridText, SectionLabel } from "../../../components/aurora/atoms";

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
    <Glass style={{ padding: 14, textAlign: "center" }}>
      <SectionLabel style={{ marginBottom: 6 }}>{label}</SectionLabel>
      <IridText size={22}>{value}</IridText>
      {sub && (
        <div
          style={{
            fontSize: 10,
            color: "var(--am-text-faint)",
            marginTop: 6,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {sub}
        </div>
      )}
    </Glass>
  );
}

const AURORA_BTN_BASE: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 12px",
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 99,
  background: "var(--am-chip-strong)",
  color: "var(--am-text)",
  border: "1px solid var(--am-border-strong)",
  cursor: "pointer",
};

/* ── Component ───────────────────────────────────────────────────── */

export default function DraftReport({ leagueId, myTeamId }: DraftReportProps) {
  const [data, setData] = useState<RetrospectiveData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadReport() {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchJsonApi<RetrospectiveData>(`${API_BASE}/auction/retrospective?leagueId=${leagueId}`);
      setData(result);
    } catch {
      setError("Could not load draft report");
    } finally {
      setLoading(false);
    }
  }

  if (!data) {
    return (
      <Glass>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <BarChart3 size={18} style={{ color: "var(--am-accent)" }} />
            <SectionLabel style={{ marginBottom: 0 }}>Draft Report</SectionLabel>
          </div>
          <button
            type="button"
            onClick={loadReport}
            disabled={loading}
            style={{ ...AURORA_BTN_BASE, opacity: loading ? 0.5 : 1 }}
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <BarChart3 size={12} />}
            {loading ? "Analyzing..." : "View Draft Report"}
          </button>
        </div>
        {error && (
          <div style={{ marginTop: 10, fontSize: 12, color: "var(--am-negative)" }}>
            {error}
          </div>
        )}
      </Glass>
    );
  }

  const { league: lg } = data;

  return (
    <Glass>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <BarChart3 size={18} style={{ color: "var(--am-accent)" }} />
          <SectionLabel style={{ marginBottom: 0 }}>Draft Report</SectionLabel>
        </div>

        {/* ── League Summary ── */}
        <div>
          <SectionLabel>League Summary</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
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
        </div>

        {/* ── Bargains & Overpays ── */}
        {(data.bargains.length > 0 || data.overpays.length > 0) && (
          <div>
            <SectionLabel>Bargains & Overpays</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
              {data.bargains.length > 0 && (
                <Glass
                  style={{
                    padding: 14,
                    border: "1px solid rgba(16, 185, 129, 0.3)",
                    background: "rgba(16, 185, 129, 0.05)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                    <TrendingUp size={14} style={{ color: "var(--am-positive)" }} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: "var(--am-positive)", letterSpacing: 0.4, textTransform: "uppercase" }}>
                      Top Bargains
                    </span>
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
                          <ThemedTd className="text-right tabular-nums font-semibold">
                            <span style={{ color: "var(--am-positive)" }}>+${b.surplus}</span>
                          </ThemedTd>
                        </ThemedTr>
                      ))}
                    </ThemedTbody>
                  </ThemedTable>
                </Glass>
              )}
              {data.overpays.length > 0 && (
                <Glass
                  style={{
                    padding: 14,
                    border: "1px solid rgba(239, 68, 68, 0.3)",
                    background: "rgba(239, 68, 68, 0.05)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                    <TrendingDown size={14} style={{ color: "var(--am-negative)" }} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: "var(--am-negative)", letterSpacing: 0.4, textTransform: "uppercase" }}>
                      Top Overpays
                    </span>
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
                          <ThemedTd className="text-right tabular-nums font-semibold">
                            <span style={{ color: "var(--am-negative)" }}>${o.surplus}</span>
                          </ThemedTd>
                        </ThemedTr>
                      ))}
                    </ThemedTbody>
                  </ThemedTable>
                </Glass>
              )}
            </div>
          </div>
        )}

        {/* ── Position Spending ── */}
        <div>
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
        </div>

        {/* ── Most Contested ── */}
        <div>
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
                    <ThemedTd className="text-right tabular-nums font-semibold">
                      <span style={{ color: "var(--am-accent)" }}>${mc.price}</span>
                    </ThemedTd>
                    <ThemedTd className="text-right tabular-nums">{mc.bidCount}</ThemedTd>
                    <ThemedTd className="text-right tabular-nums">{mc.teamsInvolved}</ThemedTd>
                  </ThemedTr>
                ))}
              </ThemedTbody>
            </ThemedTable>
          </div>
        </div>

        {/* ── Team Efficiency ── */}
        <div>
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
                    <ThemedTd className="text-right tabular-nums font-semibold">
                      <span
                        style={{
                          color:
                            te.totalSurplus > 0 ? "var(--am-positive)" :
                            te.totalSurplus < 0 ? "var(--am-negative)" :
                            undefined,
                        }}
                      >
                        {te.totalSurplus > 0 ? "+" : ""}{te.totalSurplus === 0 ? "—" : `$${te.totalSurplus}`}
                      </span>
                    </ThemedTd>
                  </ThemedTr>
                ))}
              </ThemedTbody>
            </ThemedTable>
          </div>
        </div>

        {/* ── Spending Pace ── */}
        <div>
          <SectionLabel>Spending Pace</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
            {data.spendingPace.map((q, i) => {
              const prev = i > 0 ? data.spendingPace[i - 1] : null;
              const trend = prev && q.avgPrice > 0 && prev.avgPrice > 0
                ? q.avgPrice > prev.avgPrice ? "up" : q.avgPrice < prev.avgPrice ? "down" : null
                : null;
              return (
                <Glass key={q.quarter} style={{ padding: 14, textAlign: "center" }}>
                  <SectionLabel style={{ marginBottom: 6 }}>
                    Q{q.quarter} · {q.lotsCount} lots
                  </SectionLabel>
                  <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                    <IridText size={22}>${q.avgPrice}</IridText>
                    {trend === "up" && <ArrowUpRight size={14} style={{ color: "var(--am-negative)" }} />}
                    {trend === "down" && <ArrowDownRight size={14} style={{ color: "var(--am-positive)" }} />}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--am-text-faint)", marginTop: 4 }}>
                    avg · ${q.totalSpent} total
                  </div>
                </Glass>
              );
            })}
          </div>
        </div>
      </div>
    </Glass>
  );
}
