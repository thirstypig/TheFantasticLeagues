import React, { useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { fetchJsonApi, API_BASE } from "../../../api/base";
import { ThemedTable, ThemedThead, ThemedTh, ThemedTr, ThemedTd } from "../../../components/ui/ThemedTable";

interface TeamHealth {
  teamId: number;
  teamName: string;
  teamCode: string;
  ownerName: string;
  lastLogin: string | null;
  daysSinceLogin: number | null;
  waiverClaimsThisSeason: number;
  tradesThisSeason: number;
  periodsWithLineupSet: number;
  totalPeriods: number;
  engagementScore: number;
  status: "active" | "at-risk" | "inactive";
}

interface HealthResponse {
  health: TeamHealth[];
  leagueHealthScore: number;
}

const statusConfig = {
  active: { icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10", label: "Active" },
  "at-risk": { icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/10", label: "At Risk" },
  inactive: { icon: XCircle, color: "text-rose-400", bg: "bg-rose-500/10", label: "Inactive" },
};

export default function LeagueHealthTab({ leagueId }: { leagueId: number }) {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await fetchJsonApi<HealthResponse>(`${API_BASE}/commissioner/${leagueId}/health`);
        setData(res);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load health data");
      } finally {
        setLoading(false);
      }
    })();
  }, [leagueId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-[var(--lg-text-muted)]">
        <div className="w-8 h-8 border-3 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mr-4" />
        Loading league health...
      </div>
    );
  }

  if (error) {
    return <div className="text-center py-8 text-[var(--lg-error)]">{error}</div>;
  }

  if (!data) return null;

  const { health, leagueHealthScore } = data;
  const activeCount = health.filter(h => h.status === "active").length;
  const atRiskCount = health.filter(h => h.status === "at-risk").length;
  const inactiveCount = health.filter(h => h.status === "inactive").length;

  return (
    <div className="space-y-6">
      {/* Headline Score */}
      <div className="flex items-center gap-6">
        <div className="lg-card p-6 flex items-center gap-4">
          <Activity size={28} className="text-[var(--lg-accent)]" />
          <div>
            <div className="text-3xl font-bold text-[var(--lg-text-heading)]">{leagueHealthScore}</div>
            <div className="text-xs text-[var(--lg-text-muted)] uppercase tracking-wide">League Health</div>
          </div>
        </div>
        <div className="flex gap-4">
          <div className="text-center">
            <div className="text-xl font-bold text-emerald-400">{activeCount}</div>
            <div className="text-[10px] text-[var(--lg-text-muted)] uppercase">Active</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-amber-400">{atRiskCount}</div>
            <div className="text-[10px] text-[var(--lg-text-muted)] uppercase">At Risk</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-rose-400">{inactiveCount}</div>
            <div className="text-[10px] text-[var(--lg-text-muted)] uppercase">Inactive</div>
          </div>
        </div>
      </div>

      {/* Team Health Table */}
      <div className="overflow-x-auto">
        <ThemedTable bare density="compact" zebra aria-label="League health by team">
          <ThemedThead sticky>
            <ThemedTr>
              <ThemedTh frozen>Team</ThemedTh>
              <ThemedTh>Owner</ThemedTh>
              <ThemedTh align="center">Status</ThemedTh>
              <ThemedTh align="center">Score</ThemedTh>
              <ThemedTh align="center">Last Login</ThemedTh>
              <ThemedTh align="center">Waivers</ThemedTh>
              <ThemedTh align="center">Trades</ThemedTh>
              <ThemedTh align="center">Lineup %</ThemedTh>
            </ThemedTr>
          </ThemedThead>
          <tbody className="divide-y divide-[var(--lg-divide)]">
            {health.map((h) => {
              const cfg = statusConfig[h.status];
              const StatusIcon = cfg.icon;
              const lineupPct = h.totalPeriods > 0
                ? Math.round((h.periodsWithLineupSet / h.totalPeriods) * 100)
                : 100;

              return (
                <ThemedTr key={h.teamId} className="hover:bg-[var(--lg-tint)] transition-colors">
                  <ThemedTd frozen>
                    <span className="font-semibold text-[11px] text-[var(--lg-text-primary)]">{h.teamName}</span>
                  </ThemedTd>
                  <ThemedTd>
                    <span className="text-[11px] text-[var(--lg-text-secondary)]">{h.ownerName}</span>
                  </ThemedTd>
                  <ThemedTd align="center">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${cfg.bg} ${cfg.color}`}>
                      <StatusIcon size={10} />
                      {cfg.label}
                    </span>
                  </ThemedTd>
                  <ThemedTd align="center">
                    <span className={`font-bold text-xs ${h.engagementScore >= 70 ? "text-emerald-400" : h.engagementScore >= 40 ? "text-amber-400" : "text-rose-400"}`}>
                      {h.engagementScore}
                    </span>
                  </ThemedTd>
                  <ThemedTd align="center">
                    <span className="text-[10px] text-[var(--lg-text-muted)]">
                      {h.daysSinceLogin === null ? "Never" : h.daysSinceLogin === 0 ? "Today" : `${h.daysSinceLogin}d ago`}
                    </span>
                  </ThemedTd>
                  <ThemedTd align="center">{h.waiverClaimsThisSeason}</ThemedTd>
                  <ThemedTd align="center">{h.tradesThisSeason}</ThemedTd>
                  <ThemedTd align="center">
                    <span className={`text-[10px] font-semibold ${lineupPct >= 80 ? "text-emerald-400" : lineupPct >= 50 ? "text-amber-400" : "text-rose-400"}`}>
                      {lineupPct}%
                    </span>
                  </ThemedTd>
                </ThemedTr>
              );
            })}
          </tbody>
        </ThemedTable>
      </div>

      <p className="text-[10px] text-[var(--lg-text-muted)] italic">
        Engagement score based on login recency (30pts), waiver activity (25pts), trade activity (20pts), and lineup set rate (25pts). Sorted by score ascending — at-risk teams shown first.
      </p>
    </div>
  );
}
