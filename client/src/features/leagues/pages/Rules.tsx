import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../../auth/AuthProvider";
import { useLeague } from "../../../contexts/LeagueContext";
import { fetchJsonApi, API_BASE } from "../../../api/base";
import { RulesEditor } from "../components/RulesEditor";
import type { LeagueListItem } from "../../../api";

interface LeagueRule {
  id: number;
  leagueId: number;
  category: string;
  key: string;
  value: string;
  label: string;
  isLocked: boolean;
}

function rv(rules: LeagueRule[], key: string): string {
  return rules.find((r) => r.key === key)?.value ?? "";
}

export default function Rules() {
  const { user } = useAuth();
  const { leagueId, leagues } = useLeague();
  const [rules, setRules] = useState<LeagueRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "settings">("overview");
  const [refreshKey, setRefreshKey] = useState(0);

  const isCommissionerOrAdmin = useMemo(() => {
    if (user?.isAdmin) return true;
    return (leagues ?? []).some(
      (l: LeagueListItem) =>
        l.id === leagueId &&
        l?.access?.type === "MEMBER" &&
        l?.access?.role === "COMMISSIONER"
    );
  }, [leagues, leagueId, user]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const data = await fetchJsonApi<{ rules: LeagueRule[] }>(
          `${API_BASE}/leagues/${leagueId}/rules`
        );
        if (mounted) setRules(data.rules ?? []);
      } catch (e) {
        console.error("Failed to load rules:", e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [leagueId, refreshKey]);

  const teamCount = parseInt(rv(rules, "team_count")) || 8;
  const draftMode = rv(rules, "draft_mode") || "Auction";
  const batterCount = parseInt(rv(rules, "batter_count")) || 14;
  const pitcherCount = parseInt(rv(rules, "pitcher_count")) || 9;
  const budget = rv(rules, "auction_budget") || "300";
  const keeperCount = rv(rules, "keeper_count") || "4";
  const statsSource = rv(rules, "stats_source") || "NL";
  const dhThreshold = rv(rules, "dh_games_threshold") || "20";
  const posEligGp = rv(rules, "position_eligibility_gp") || "20";

  let hittingCats: string[] = [];
  let pitchingCats: string[] = [];
  try { hittingCats = JSON.parse(rv(rules, "hitting_stats")); } catch { hittingCats = ["R", "HR", "RBI", "SB", "AVG"]; }
  try { pitchingCats = JSON.parse(rv(rules, "pitching_stats")); } catch { pitchingCats = ["W", "SV", "ERA", "WHIP", "K"]; }
  if (!Array.isArray(hittingCats)) hittingCats = ["R", "HR", "RBI", "SB", "AVG"];
  if (!Array.isArray(pitchingCats)) pitchingCats = ["W", "SV", "ERA", "WHIP", "K"];

  let rosterPositions: Record<string, number> = {};
  try { rosterPositions = JSON.parse(rv(rules, "roster_positions")); } catch { /* ignore */ }

  const bonusRules = rules.filter((r) => r.category === "bonuses" && r.value && r.value !== "0");
  const payoutRules = rules.filter((r) => r.category === "payouts" && r.value && r.value !== "0");
  const ilRules = rules.filter((r) => r.category === "il" && r.value && r.value !== "0");

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-6 md:px-6 md:py-10">
        <div className="text-center text-[var(--lg-text-muted)] py-20 animate-pulse">Loading rules...</div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 md:px-6 md:py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--lg-text-heading)]">League Rules</h1>
          <p className="text-[var(--lg-text-muted)] mt-1 text-sm font-medium">
            {tab === "overview" ? "League format, scoring, and operations." : "Edit league settings."}
          </p>
        </div>

        {isCommissionerOrAdmin && (
          <div className="flex gap-1 bg-[var(--lg-tint)] p-1 rounded-xl border border-[var(--lg-border-faint)]">
            <button
              onClick={() => setTab("overview")}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide transition-all ${
                tab === "overview"
                  ? "bg-[var(--lg-bg-card)] text-[var(--lg-text-primary)] shadow-sm"
                  : "text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)]"
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setTab("settings")}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide transition-all ${
                tab === "settings"
                  ? "bg-[var(--lg-bg-card)] text-[var(--lg-text-primary)] shadow-sm"
                  : "text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)]"
              }`}
            >
              Settings
            </button>
          </div>
        )}
      </div>

      {/* Settings tab — RulesEditor */}
      {tab === "settings" && isCommissionerOrAdmin && (
        <RulesEditor leagueId={leagueId} canEdit={true} onSaved={() => setRefreshKey(k => k + 1)} />
      )}

      {/* Overview tab — human-readable guide */}
      {tab === "overview" && (
        <div className="grid grid-cols-1 gap-4 md:gap-8">
          {/* League Overview */}
          <section className="lg-card p-4 md:p-8">
            <h2 className="text-xl font-semibold tracking-tight text-[var(--lg-text-heading)] mb-6 uppercase">League Overview</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-4">
              {[
                { label: "Format", value: `Roto (${hittingCats.length}x${pitchingCats.length})` },
                { label: "Teams", value: `${teamCount} Teams` },
                { label: "Stats Source", value: statsSource },
                { label: "Draft", value: `Live ${draftMode}` },
                { label: "Budget", value: `$${budget}` },
                { label: "Keepers", value: `${keeperCount} per team` },
                { label: "Roster", value: `${batterCount}H + ${pitcherCount}P` },
                { label: "DH Threshold", value: `${dhThreshold} games` },
                { label: "Pos. Eligibility", value: `${posEligGp} GP` },
              ].map((item) => (
                <div key={item.label} className="bg-[var(--lg-tint)] p-3 md:p-4 rounded-2xl border border-[var(--lg-border-faint)]">
                  <div className="text-[10px] uppercase tracking-wide font-bold text-[var(--lg-text-muted)] mb-1 opacity-40">{item.label}</div>
                  <div className="text-sm font-bold text-[var(--lg-text-primary)]">{item.value}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Roster Positions */}
          {Object.keys(rosterPositions).length > 0 && (
            <section className="lg-card p-4 md:p-8">
              <h2 className="text-xl font-semibold tracking-tight text-[var(--lg-text-heading)] mb-6 uppercase">Roster Positions</h2>
              <div className="flex flex-wrap gap-2">
                {Object.entries(rosterPositions).map(([pos, count]) => (
                  <div key={pos} className="flex items-center gap-2 px-4 py-2 bg-[var(--lg-tint)] rounded-xl border border-[var(--lg-border-subtle)]">
                    <span className="text-xs font-bold text-[var(--lg-text-primary)] uppercase">{pos}</span>
                    <span className="text-xs font-bold text-[var(--lg-accent)]">{count}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Scoring Categories */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
            <section className="lg-card p-4 md:p-8">
              <h2 className="text-lg font-semibold text-[var(--lg-text-heading)] mb-4 flex items-center gap-3 uppercase tracking-tight">
                <span className="flex items-center justify-center w-7 h-7 bg-blue-500/20 text-blue-400 rounded-lg text-xs font-bold border border-blue-500/20">H</span>
                Hitting
              </h2>
              <div className="flex flex-wrap gap-2">
                {hittingCats.map((cat) => (
                  <span key={cat} className="px-3 py-1.5 bg-[var(--lg-tint)] text-[var(--lg-text-primary)] text-xs font-bold rounded-lg border border-[var(--lg-border-subtle)] uppercase tracking-tight">
                    {cat}
                  </span>
                ))}
              </div>
            </section>

            <section className="lg-card p-4 md:p-8">
              <h2 className="text-lg font-semibold text-[var(--lg-text-heading)] mb-4 flex items-center gap-3 uppercase tracking-tight">
                <span className="flex items-center justify-center w-7 h-7 bg-emerald-500/20 text-emerald-400 rounded-lg text-xs font-bold border border-emerald-500/20">P</span>
                Pitching
              </h2>
              <div className="flex flex-wrap gap-2">
                {pitchingCats.map((cat) => (
                  <span key={cat} className="px-3 py-1.5 bg-[var(--lg-tint)] text-[var(--lg-text-primary)] text-xs font-bold rounded-lg border border-[var(--lg-border-subtle)] uppercase tracking-tight">
                    {cat}
                  </span>
                ))}
              </div>
            </section>
          </div>

          {/* Scoring System */}
          <section className="lg-card p-4 md:p-8">
            <h2 className="text-xl font-semibold tracking-tight text-[var(--lg-text-heading)] mb-4 uppercase">Scoring</h2>
            <p className="text-sm text-[var(--lg-text-muted)] leading-relaxed">
              Each stat category is ranked across all {teamCount} teams. 1st place gets {teamCount} points, 2nd gets {teamCount - 1}, down to {teamCount}th getting 1 point. Points are averaged for ties.
              Total points across all {hittingCats.length + pitchingCats.length} categories determine the period winner.
            </p>
          </section>

          {/* Bonuses */}
          {bonusRules.length > 0 && (
            <section className="lg-card p-4 md:p-8">
              <h2 className="text-xl font-semibold tracking-tight text-[var(--lg-text-heading)] mb-6 uppercase">Bonuses</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {bonusRules.map((r) => (
                  <div key={r.id} className="bg-[var(--lg-tint)] p-3 rounded-xl border border-[var(--lg-border-faint)]">
                    <div className="text-[10px] uppercase tracking-wide font-bold text-[var(--lg-text-muted)] mb-1 opacity-40">{r.label}</div>
                    <div className="text-sm font-bold text-[var(--lg-text-primary)]">${r.value}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* IL */}
          {ilRules.length > 0 && (
            <section className="lg-card p-4 md:p-8">
              <h2 className="text-xl font-semibold tracking-tight text-[var(--lg-text-heading)] mb-6 uppercase">Injured List</h2>
              <div className="grid grid-cols-2 gap-3">
                {ilRules.map((r) => (
                  <div key={r.id} className="bg-[var(--lg-tint)] p-3 rounded-xl border border-[var(--lg-border-faint)]">
                    <div className="text-[10px] uppercase tracking-wide font-bold text-[var(--lg-text-muted)] mb-1 opacity-40">{r.label}</div>
                    <div className="text-sm font-bold text-[var(--lg-text-primary)]">${r.value}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Payouts */}
          {payoutRules.length > 0 && (
            <section className="lg-card p-4 md:p-8">
              <h2 className="text-xl font-semibold tracking-tight text-[var(--lg-text-heading)] mb-6 uppercase">Payouts</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {payoutRules.map((r) => (
                  <div key={r.id} className="bg-[var(--lg-tint)] p-3 rounded-xl border border-[var(--lg-border-faint)]">
                    <div className="text-[10px] uppercase tracking-wide font-bold text-[var(--lg-text-muted)] mb-1 opacity-40">{r.label}</div>
                    <div className="text-sm font-bold text-[var(--lg-text-primary)]">{r.value}%</div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
