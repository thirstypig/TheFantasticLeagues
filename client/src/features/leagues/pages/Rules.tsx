import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../../auth/AuthProvider";
import { useLeague } from "../../../contexts/LeagueContext";
import { fetchJsonApi, API_BASE } from "../../../api/base";
import { RulesEditor } from "../components/RulesEditor";
import type { LeagueListItem } from "../../../api";
import { Glass, SectionLabel } from "../../../components/aurora/atoms";

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

interface LeagueMeta {
  maxTeams?: number;
  entryFee?: number | null;
}

export default function Rules() {
  const { user } = useAuth();
  const { leagueId, leagues } = useLeague();
  const [rules, setRules] = useState<LeagueRule[]>([]);
  const [leagueMeta, setLeagueMeta] = useState<LeagueMeta>({});
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
        // Fetch rules + league meta in parallel. Team count and entry fee live on
        // the League model, not LeagueRule — see docs/RULES_AUDIT.md.
        const [rulesRes, leagueRes] = await Promise.all([
          fetchJsonApi<{ rules: LeagueRule[] }>(`${API_BASE}/leagues/${leagueId}/rules`),
          fetchJsonApi<{ league: { maxTeams?: number; entryFee?: number | null } }>(`${API_BASE}/leagues/${leagueId}`),
        ]);
        if (mounted) {
          setRules(rulesRes.rules ?? []);
          setLeagueMeta({
            maxTeams: leagueRes.league?.maxTeams,
            entryFee: leagueRes.league?.entryFee ?? null,
          });
        }
      } catch (e) {
        console.error("Failed to load rules:", e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [leagueId, refreshKey]);

  const teamCount = leagueMeta.maxTeams ?? 8;
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
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <Glass>
          <div style={{ padding: 32, textAlign: "center", color: "var(--am-text-muted)", fontSize: 13 }}>Loading rules…</div>
        </Glass>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <Glass strong>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div>
            <SectionLabel>✦ League Rules</SectionLabel>
            <h1 style={{ fontFamily: "var(--am-display)", fontSize: 30, fontWeight: 300, color: "var(--am-text)", margin: 0, lineHeight: 1.1 }}>
              League Rules
            </h1>
            <div style={{ marginTop: 6, fontSize: 13, color: "var(--am-text-muted)" }}>
              {tab === "overview" ? "League format, scoring, and operations." : "Edit league settings."}
            </div>
          </div>

          {isCommissionerOrAdmin && (
            <div style={{ display: "flex", gap: 6 }}>
              {(["overview", "settings"] as const).map((t) => {
                const isActive = tab === t;
                return (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    style={{
                      padding: "6px 14px", borderRadius: 99,
                      fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase",
                      background: isActive ? "var(--am-chip-strong)" : "var(--am-chip)",
                      color: isActive ? "var(--am-text)" : "var(--am-text-muted)",
                      border: "1px solid " + (isActive ? "var(--am-border-strong)" : "var(--am-border)"),
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {t === "overview" ? "Overview" : "Settings"}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </Glass>

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
