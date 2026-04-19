import React, { useEffect, useRef, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { adminDeleteLeague, adminImportRosters, getLeagues, type LeagueListItem, type LeagueRule } from "../../../api";
import { getCommissionerOverview } from "../../commissioner/api";
import { getLeagueRules } from "../../leagues/api";
import { Button } from "../../../components/ui/button";
import { ChevronDown } from "lucide-react";

// --- Types for expanded detail ---
interface LeagueDetailData {
  teams: Array<{
    id: number;
    name: string;
    code?: string | null;
    owner?: string | null;
    budget?: number | null;
    ownerUserId?: number | null;
    ownerships: Array<{ userId: number; user?: { email?: string; name?: string | null } }>;
  }>;
  memberships: Array<{
    id: number;
    userId: number;
    role: string;
    user: { email: string; name?: string | null };
  }>;
  rules: LeagueRule[];
}

function ruleVal(rules: LeagueRule[], key: string): string {
  return rules.find((r) => r.key === key)?.value ?? "";
}

export default function AdminLeagueTools() {
  const [error, setError] = useState<string | null>(null);
  const [leagues, setLeagues] = useState<LeagueListItem[]>([]);

  // Expanded league details (loaded on demand)
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [details, setDetails] = useState<Record<number, LeagueDetailData>>({});
  const [loadingDetail, setLoadingDetail] = useState(false);

  async function refresh() {
    setError(null);
    try {
      const resp = await getLeagues();
      setLeagues(resp.leagues ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load leagues.");
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const sorted = useMemo(() => {
    if (!Array.isArray(leagues)) return [];
    const xs = [...leagues];
    xs.sort((a, b) => {
      if (b.season !== a.season) return b.season - a.season;
      return String(a.name).localeCompare(String(b.name));
    });
    return xs;
  }, [leagues]);

  async function toggleExpand(leagueId: number) {
    if (expandedId === leagueId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(leagueId);

    // Load details if not cached
    if (!details[leagueId]) {
      setLoadingDetail(true);
      try {
        const [overview, rulesResp] = await Promise.all([
          getCommissionerOverview(leagueId),
          getLeagueRules(leagueId),
        ]);
        const teams = (overview as any).teams ?? (overview as any).league?.teams ?? [];
        const memberships = (overview as any).memberships ?? (overview as any).league?.memberships ?? [];
        setDetails((prev) => ({
          ...prev,
          [leagueId]: { teams, memberships, rules: rulesResp.rules ?? [] },
        }));
      } catch {
        // Silently fail — the card just won't show details
      } finally {
        setLoadingDetail(false);
      }
    }
  }

  return (
    <div className="space-y-8">
      {error && (
        <div className="p-4 rounded-2xl bg-[var(--lg-error)]/10 border border-[var(--lg-error)]/20 text-[var(--lg-error)] text-xs font-semibold uppercase tracking-wide">
          {error}
        </div>
      )}

      {/* All Leagues */}
      <div className="space-y-3">
        {sorted.map((l) => {
          const isExpanded = expandedId === l.id;
          const detail = details[l.id];

          return (
            <div
              key={l.id}
              className="lg-card p-0 overflow-hidden"
            >
              {/* League Header — always visible */}
              <button
                onClick={() => toggleExpand(l.id)}
                className="w-full flex items-center justify-between p-4 md:px-6 md:py-4 hover:bg-[var(--lg-tint)] transition-colors text-left"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-[var(--lg-accent)]/10 border border-[var(--lg-accent)]/20 flex items-center justify-center shrink-0">
                    <span className="text-sm font-semibold text-[var(--lg-accent)]">{l.season.toString().slice(-2)}</span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-[var(--lg-text-heading)] truncate">{l.name}</span>
                      <span className="text-xs text-[var(--lg-text-muted)]">{l.season}</span>
                      <span className="text-xs font-mono text-[var(--lg-text-muted)] opacity-40">#{l.id}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-[var(--lg-text-muted)]">{l.draftMode}</span>
                      {l.isPublic && <span className="text-xs text-emerald-400">Public</span>}
                    </div>
                  </div>
                </div>
                <ChevronDown
                  className={`w-4 h-4 text-[var(--lg-text-muted)] transition-transform shrink-0 ${isExpanded ? "rotate-180" : ""}`}
                />
              </button>

              {/* Expanded Detail */}
              {isExpanded && (
                <div className="border-t border-[var(--lg-border-subtle)] px-4 py-5 md:px-6 space-y-5">
                  {loadingDetail && !detail ? (
                    <div className="text-xs text-[var(--lg-text-muted)] animate-pulse">Loading details...</div>
                  ) : detail ? (
                    <>
                      {/* Quick Actions */}
                      <div className="flex items-center gap-3">
                        <Link
                          to={`/commissioner/${l.id}`}
                          className="px-4 py-2 rounded-lg bg-[var(--lg-accent)] text-white text-xs font-semibold hover:opacity-90 transition-opacity"
                        >
                          Commissioner Page →
                        </Link>
                        <button
                          onClick={async () => {
                            if (!confirm(`Delete "${l.name} ${l.season}"? This permanently removes ALL data. Cannot be undone.`)) return;
                            try {
                              setError(null);
                              await adminDeleteLeague(l.id);
                              setExpandedId(null);
                              await refresh();
                            } catch (err: unknown) {
                              setError(err instanceof Error ? err.message : "Failed to delete.");
                            }
                          }}
                          className="px-4 py-2 rounded-lg border border-[var(--lg-error)]/20 text-[var(--lg-error)] text-xs font-semibold hover:bg-[var(--lg-error)]/10 transition-all"
                        >
                          Delete Season
                        </button>
                      </div>

                      {/* Rules Snapshot */}
                      <RulesSnapshot rules={detail.rules} />

                      {/* Teams */}
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--lg-text-muted)] mb-3">
                          Teams ({detail.teams.length})
                        </h4>
                        {detail.teams.length === 0 ? (
                          <p className="text-xs text-[var(--lg-text-muted)] italic">No teams.</p>
                        ) : (
                          <div className="grid gap-2 sm:grid-cols-2">
                            {detail.teams.map((t) => {
                              const owners = t.ownerships?.length
                                ? t.ownerships.map((o) => o.user?.name || o.user?.email || `User ${o.userId}`).join(", ")
                                : t.owner || "No owner";
                              return (
                                <div
                                  key={t.id}
                                  className="flex items-center justify-between rounded-lg border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] px-3 py-2"
                                >
                                  <div className="min-w-0">
                                    <div className="text-sm font-medium text-[var(--lg-text-primary)] truncate">{t.name}</div>
                                    <div className="text-xs text-[var(--lg-text-muted)] truncate">{owners}</div>
                                  </div>
                                  <div className="text-right shrink-0 ml-3">
                                    {t.budget != null && (
                                      <div className="text-xs font-mono text-[var(--lg-accent)]">${t.budget}</div>
                                    )}
                                    {t.code && (
                                      <div className="text-xs text-[var(--lg-text-muted)] opacity-40">{t.code}</div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Members */}
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--lg-text-muted)] mb-3">
                          Members ({detail.memberships.length})
                        </h4>
                        {detail.memberships.length === 0 ? (
                          <p className="text-xs text-[var(--lg-text-muted)] italic">No members.</p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {detail.memberships.map((m) => (
                              <div
                                key={m.id}
                                className="flex items-center gap-2 rounded-lg border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] px-3 py-1.5"
                              >
                                <span className="text-xs text-[var(--lg-text-primary)]">
                                  {m.user?.name || m.user?.email}
                                </span>
                                <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                                  m.role === "COMMISSIONER"
                                    ? "bg-[var(--lg-accent)]/10 text-[var(--lg-accent)]"
                                    : "bg-[var(--lg-tint)] text-[var(--lg-text-muted)]"
                                }`}>
                                  {m.role}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  ) : null}
                </div>
              )}
            </div>
          );
        })}
        {sorted.length === 0 && (
          <div className="lg-card p-8 text-center text-sm text-[var(--lg-text-muted)]">No seasons found.</div>
        )}
      </div>

      {/* CSV Import */}
      <div className="lg-card p-4 md:p-8">
        <div className="mb-6 text-xl font-semibold uppercase tracking-tight text-[var(--lg-text-heading)]">Import Data</div>
        <div className="text-xs text-[var(--lg-text-muted)] font-semibold uppercase tracking-wide mb-8 leading-relaxed">
          Import a CSV file to populate league rosters and costs.
          <p className="mt-1 opacity-60">Required Headers: Player, MLB, Team, Cost, Keeper, Pos</p>
        </div>

        <CsvUploader leagues={sorted} onRefresh={refresh} />
      </div>
    </div>
  );
}

function RulesSnapshot({ rules }: { rules: LeagueRule[] }) {
  if (rules.length === 0) return null;

  const val = (key: string) => ruleVal(rules, key);

  const items: Array<{ label: string; value: string }> = [
    // "Teams" removed — team count lives on League.maxTeams, not LeagueRule.
    // Admin teams list already shows the count directly above this snapshot.
    { label: "Budget", value: val("auction_budget") ? `$${val("auction_budget")}` : "" },
    { label: "Hitters", value: val("batter_count") },
    { label: "Pitchers", value: val("pitcher_count") },
    { label: "Keepers", value: val("keeper_limit") },
    { label: "Hitting", value: val("hitting_stats") },
    { label: "Pitching", value: val("pitching_stats") },
  ].filter((i) => i.value);

  if (items.length === 0) return null;

  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--lg-text-muted)] mb-3">Rules</h4>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <div
            key={item.label}
            className="rounded-lg border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] px-3 py-1.5"
          >
            <span className="text-[10px] uppercase tracking-wide text-[var(--lg-text-muted)]">{item.label}: </span>
            <span className="text-xs font-medium text-[var(--lg-text-primary)]">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CsvUploader({ leagues, onRefresh }: { leagues: LeagueListItem[]; onRefresh: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [leagueId, setLeagueId] = useState<number | "">("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!leagueId || !file) return;

    setLoading(true);
    setStatus(null);
    setError(null);

    try {
      const text = await file.text();
      const result = await adminImportRosters(Number(leagueId), text);

      setStatus(`Import complete: ${result.count} players imported`);
      if (result.errors?.length) {
        setError(`Import warnings:\n${result.errors.join("\n")}`);
      }
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";

      onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleUpload} className="space-y-6 max-w-xl">
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--lg-text-muted)] mb-2">Target Season</label>
        <select
          className="w-full rounded-2xl border border-[var(--lg-glass-border)] bg-[var(--lg-glass-bg)] px-4 py-3 text-sm text-[var(--lg-text-primary)] outline-none focus:border-[var(--lg-accent)] transition-all font-semibold"
          value={leagueId}
          onChange={e => setLeagueId(Number(e.target.value) || "")}
          required
        >
          <option value="">Select season...</option>
          {leagues.map(l => (
            <option key={l.id} value={l.id}>{l.name} {l.season}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--lg-text-muted)] mb-2">CSV File</label>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          className="block w-full text-xs text-[var(--lg-text-muted)] file:mr-6 file:py-3 file:px-6 file:rounded-2xl file:border-0 file:text-xs file:font-semibold file:uppercase file:tracking-wide file:bg-[var(--lg-tint-hover)] file:text-white hover:file:bg-[var(--lg-tint-hover)] transition-all cursor-pointer"
          onChange={e => setFile(e.target.files?.[0] || null)}
          required
        />
      </div>

      <div className="pt-4">
        <Button
          type="submit"
          variant="emerald"
          disabled={loading || !leagueId || !file}
        >
          {loading ? "Uploading..." : "Upload CSV"}
        </Button>
      </div>

      {status && <div className="p-4 rounded-2xl bg-[var(--lg-success)]/10 border border-[var(--lg-success)]/20 text-[var(--lg-success)] text-xs font-semibold uppercase tracking-wide">{status}</div>}
      {error && <div className="p-4 rounded-2xl bg-[var(--lg-error)]/10 border border-[var(--lg-error)]/20 text-[var(--lg-error)] text-xs font-semibold uppercase tracking-wide whitespace-pre-wrap">{error}</div>}
    </form>
  );
}
