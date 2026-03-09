// client/src/pages/Period.tsx
//
// Period page:
// - Uses server-computed /api/period-category-standings?periodId=...
// - TOP: "Standings" table with category POINTS (1..N; ties split) + TOTAL
// - BELOW: Per-category tables (also show full team names)
//
// Week-over-week (+/-) requires snapshot history; not implemented here.

import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  getPeriodCategoryStandings,
  type PeriodCategoryStandingsResponse,
  type PeriodCategoryStandingTable,
  type PeriodCategoryKey,
} from "../../../lib/api";
import { ThemedTable, ThemedThead, ThemedTh, ThemedTr, ThemedTd } from "../../../components/ui/ThemedTable";
import { OGBA_TEAM_NAMES } from "../../../lib/ogbaTeams";
import PageHeader from "../../../components/ui/PageHeader";
import { useLeague } from "../../../contexts/LeagueContext";

// If you have canonical labels/dates elsewhere, replace this list.
// This is only a dropdown source.
const PERIOD_OPTIONS: Array<{ id: number; label: string }> = [
  { id: 1, label: "P1" },
  { id: 2, label: "P2" },
  { id: 3, label: "P3" },
  { id: 4, label: "P4" },
  { id: 5, label: "P5" },
  { id: 6, label: "P6" },
];

// Column order for the standings table
const STANDINGS_KEYS: PeriodCategoryKey[] = ["R", "HR", "RBI", "SB", "AVG", "W", "SV", "ERA", "WHIP", "K"];

const STANDINGS_LABELS: Record<PeriodCategoryKey, string> = {
  R: "R",
  HR: "HR",
  RBI: "RBI",
  SB: "SB",
  AVG: "AVG",
  W: "W",
  SV: "SV",
  ERA: "ERA",
  WHIP: "WHIP",
  K: "SO", // display as SO to match OGBA screenshot, while server key is K
};

function toNum(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmt1(n: any): string {
  const x = toNum(n);
  return x.toFixed(1).replace(/\.0$/, "");
}

function fmtValue(n: any): string {
  // Values can be large ints (counting) or ratios (AVG/ERA/WHIP).
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";

  // Heuristic: ratio stats tend to be < 10
  if (Math.abs(x) < 10 && x !== Math.floor(x)) return x.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  if (x !== Math.floor(x)) return x.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return String(Math.trunc(x));
}

function fullTeamName(teamCodeRaw: any, fallbackNameRaw?: any): string {
  const code = String(teamCodeRaw ?? "").trim().toUpperCase();
  if (code && OGBA_TEAM_NAMES[code]) return OGBA_TEAM_NAMES[code];
  const fb = String(fallbackNameRaw ?? "").trim();
  return fb || code || "—";
}

type StandingsRow = {
  teamCode: string;
  teamName: string; // FULL display name
  pointsByKey: Record<PeriodCategoryKey, number>;
  total: number;
};

function buildStandings(resp: PeriodCategoryStandingsResponse | null): StandingsRow[] {
  if (!resp) return [];

  const byCode = new Map<string, StandingsRow>();

  const ensure = (teamCodeRaw: any, teamNameRaw: any) => {
    const teamCode = String(teamCodeRaw ?? "").trim().toUpperCase();
    if (!teamCode) return null;

    if (!byCode.has(teamCode)) {
      const pointsByKey = {} as Record<PeriodCategoryKey, number>;
      for (const k of STANDINGS_KEYS) pointsByKey[k] = 0;

      byCode.set(teamCode, {
        teamCode,
        teamName: fullTeamName(teamCode, teamNameRaw),
        pointsByKey,
        total: 0,
      });
    } else {
      // Keep full name if possible
      const cur = byCode.get(teamCode)!;
      cur.teamName = fullTeamName(teamCode, cur.teamName || teamNameRaw);
    }

    return byCode.get(teamCode)!;
  };

  for (const cat of resp.categories ?? []) {
    const key = String((cat as any).key ?? "").trim().toUpperCase() as PeriodCategoryKey;
    if (!STANDINGS_KEYS.includes(key)) continue;

    for (const r of cat.rows ?? []) {
      const code = (r as any).teamCode;
      const name = (r as any).teamName;
      const row = ensure(code, name);
      if (!row) continue;

      const pts = toNum((r as any).points);
      row.pointsByKey[key] = pts; // one row per team per category
    }
  }

  // compute totals
  for (const row of byCode.values()) {
    row.total = STANDINGS_KEYS.reduce((sum, k) => sum + toNum(row.pointsByKey[k]), 0);
  }

  return Array.from(byCode.values()).sort((a, b) => b.total - a.total);
}

function expectedTotalPoints(teamCount: number, categoryCount: number): number {
  // Each category's roto points sum = 1+2+...+N = N*(N+1)/2
  return (teamCount * (teamCount + 1)) / 2 * categoryCount;
}

function splitCats(categories: PeriodCategoryStandingTable[]) {
  const hitting: PeriodCategoryStandingTable[] = [];
  const pitching: PeriodCategoryStandingTable[] = [];

  for (const c of categories ?? []) {
    const g = String((c as any).group ?? "").toUpperCase();
    if (g === "P") pitching.push(c);
    else hitting.push(c);
  }

  return { hitting, pitching };
}

export default function Period() {
  const { leagueId } = useLeague();
  const [periodId, setPeriodId] = useState<number>(1);
  const [resp, setResp] = useState<PeriodCategoryStandingsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const data = await getPeriodCategoryStandings(periodId, leagueId);
        if (cancelled) return;
        setResp(data);
      } catch (e: any) {
        if (cancelled) return;
        setResp(null);
        setError(e?.message || "Failed to load period category standings.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [periodId, leagueId]);

  const standingsRows = useMemo(() => buildStandings(resp), [resp]);

  const categories = useMemo(() => resp?.categories ?? [], [resp]);
  const { hitting: hittingCats, pitching: pitchingCats } = useMemo(() => splitCats(categories), [categories]);

  const teamCount = toNum((resp as any)?.teamCount);
  const catCount = (resp?.categories ?? []).length;

  const totalPointsAllTeams = useMemo(
    () => standingsRows.reduce((sum, r) => sum + toNum(r.total), 0),
    [standingsRows]
  );

  const expectedTotal = useMemo(
    () => (teamCount > 0 && catCount > 0 ? expectedTotalPoints(teamCount, catCount) : 0),
    [teamCount, catCount]
  );

  const periodLabel = PERIOD_OPTIONS.find((p) => p.id === periodId)?.label ?? `P${periodId}`;

  return (
    <div className="flex-1 min-h-screen">
      <main className="max-w-6xl mx-auto px-4 py-6 md:px-6 md:py-10">
        <PageHeader 
          title="Period Performance" 
          subtitle={
            <div className="space-y-2">
              <div className="text-[var(--lg-text-secondary)]">Category standings computed server-side from player-period totals.</div>
              {resp && (
                <div className="flex gap-4 text-xs font-medium uppercase text-[var(--lg-text-muted)]">
                  <span>Period: {String((resp as any).periodId ?? periodLabel)}</span>
                  {(resp as any).periodNum && <span>Period #{(resp as any).periodNum}</span>}
                  {teamCount && <span>Teams: {teamCount}</span>}
                </div>
              )}
            </div>
          }
          rightElement={
            <>
              <div className="flex items-center gap-3 liquid-glass p-1.5 rounded-2xl border border-[var(--lg-border-subtle)] pr-4">
                <div className="bg-[var(--lg-tint)] px-3 py-2 rounded-xl text-xs font-medium uppercase text-[var(--lg-text-muted)]">Select Period</div>
                <select
                  value={periodId}
                  onChange={(e) => setPeriodId(Number(e.target.value))}
                  className="bg-transparent text-sm text-[var(--lg-text-primary)] outline-none font-bold cursor-pointer hover:text-[var(--lg-accent)] transition-colors"
                >
                  {PERIOD_OPTIONS.map((p) => (
                    <option key={p.id} value={p.id} className="bg-[var(--lg-bg-primary)] border-none">
                      Period {p.id} ({p.label})
                    </option>
                  ))}
                </select>
              </div>
              <Link 
                to="/players" 
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-all text-xs font-medium uppercase shadow-lg shadow-blue-500/5 group"
              >
                <span>Final Rosters</span>
                <span className="group-hover:translate-x-0.5 transition-transform">→</span>
              </Link>
            </>
          }
        />

        {error && (
          <div className="mb-8 rounded-2xl border border-red-500/20 bg-red-500/10 px-6 py-4 text-sm font-medium text-red-300 flex items-center gap-3">
             <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
            Error: {error}
          </div>
        )}

        {/* TOP: Standings (category points) */}
        <div className="mb-12">
          <div className="overflow-hidden rounded-3xl liquid-glass border border-[var(--lg-border-subtle)] shadow-2xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-[var(--lg-tint)] border-b border-[var(--lg-border-subtle)] px-8 py-6">
              <div>
                <h2 className="text-xl font-semibold text-[var(--lg-text-heading)]">Roto Standings</h2>
                <div className="mt-1 text-sm font-medium text-[var(--lg-text-muted)]">
                  Live ranking matrix based on category performance (1..{teamCount || "N"}).
                </div>
              </div>

              <div className="flex items-center gap-8 border-l border-[var(--lg-border-subtle)] pl-8 h-12">
                <div className="space-y-1">
                  <div className="text-xs font-medium uppercase text-[var(--lg-text-muted)]">Point Check</div>
                  <div className="text-xl font-bold text-[var(--lg-text-primary)] tabular-nums flex items-end gap-2 leading-none">
                    {loading ? "---" : fmt1(totalPointsAllTeams)}
                    {expectedTotal ? (
                      <span className="text-xs font-bold text-[var(--lg-text-muted)] opacity-60">/ {fmt1(expectedTotal)}</span>
                    ) : null}
                  </div>
                </div>
                {expectedTotal && (
                   <div className={`px-3 py-1.5 rounded-xl text-xs font-medium uppercase border ${
                     Math.abs(totalPointsAllTeams - expectedTotal) < 1e-6 
                        ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/5" 
                        : "border-amber-500/30 text-amber-400 bg-amber-500/5"
                   }`}>
                     {Math.abs(totalPointsAllTeams - expectedTotal) < 1e-6 ? "Verified" : "Sync Error"}
                   </div>
                )}
              </div>
            </div>

            <ThemedTable bare>
              <ThemedThead>
                <ThemedTr>
                  <ThemedTh className="px-6 w-16">#</ThemedTh>
                  <ThemedTh className="px-6">Team</ThemedTh>

                  {STANDINGS_KEYS.map((k) => (
                    <ThemedTh key={k} align="center" className="px-4">
                      {STANDINGS_LABELS[k]}
                    </ThemedTh>
                  ))}

                  <ThemedTh align="center" className="px-6">
                    TOTAL
                  </ThemedTh>
                  <ThemedTh align="center" className="px-6">
                    +/-
                  </ThemedTh>
                </ThemedTr>
              </ThemedThead>

              <tbody>
                {loading ? (
                  <ThemedTr>
                    <ThemedTd colSpan={2 + STANDINGS_KEYS.length + 2} align="center" className="px-6 py-12 italic">
                      Loading stats...
                    </ThemedTd>
                  </ThemedTr>
                ) : standingsRows.length === 0 ? (
                  <ThemedTr>
                    <ThemedTd colSpan={2 + STANDINGS_KEYS.length + 2} align="center" className="px-6 py-12 italic">
                      No data found for this period.
                    </ThemedTd>
                  </ThemedTr>
                ) : (
                  standingsRows.map((r, idx) => (
                    <ThemedTr key={r.teamCode}>
                      <ThemedTd className="px-6 text-xs opacity-50">{idx + 1}</ThemedTd>

                      <ThemedTd className="px-6">
                        <div className="font-bold">{r.teamName}</div>
                      </ThemedTd>

                      {STANDINGS_KEYS.map((k) => (
                        <ThemedTd key={k} align="center" className="px-4">
                          {fmt1(r.pointsByKey[k])}
                        </ThemedTd>
                      ))}

                      <ThemedTd align="center" className="px-6">
                        <span className="font-bold text-[var(--lg-accent)]">{fmt1(r.total)}</span>
                      </ThemedTd>

                      <ThemedTd align="center" className="px-6 opacity-30">—</ThemedTd>
                    </ThemedTr>
                  ))
                )}
              </tbody>
            </ThemedTable>
          </div>
        </div>

        {/* Category standings */}
        <div className="grid grid-cols-1 gap-6 md:gap-12 lg:grid-cols-2">
          {/* Hitting */}
          <section>
            <div className="mb-6 flex items-end justify-between px-2">
              <h2 className="text-2xl font-semibold text-[var(--lg-text-heading)]">Hitting Categories</h2>
              {teamCount && <div className="text-xs font-medium uppercase text-[var(--lg-text-muted)]">Ranked {teamCount}..1</div>}
            </div>

            <div className="space-y-8">
              {loading ? (
                 <div className="text-sm font-medium text-[var(--lg-text-muted)] animate-pulse">Loading hitters...</div>
              ) : hittingCats.length === 0 ? (
                 <div className="text-sm font-medium text-[var(--lg-text-muted)] italic">No hitting data.</div>
              ) : (
                hittingCats.map((cat) => <CategoryCard key={cat.key} cat={cat} />)
              )}
            </div>
          </section>

          {/* Pitching */}
          <section>
             <div className="mb-6 flex items-end justify-between px-2">
              <h2 className="text-2xl font-semibold text-[var(--lg-text-heading)]">Pitching Categories</h2>
              {teamCount && <div className="text-xs font-medium uppercase text-[var(--lg-text-muted)]">Ranked {teamCount}..1</div>}
            </div>

            <div className="space-y-8">
              {loading ? (
                 <div className="text-sm font-medium text-[var(--lg-text-muted)] animate-pulse">Loading pitchers...</div>
              ) : pitchingCats.length === 0 ? (
                <div className="text-sm font-medium text-[var(--lg-text-muted)] italic">No pitching data.</div>
              ) : (
                pitchingCats.map((cat) => <CategoryCard key={cat.key} cat={cat} />)
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function CategoryCard({ cat }: { cat: PeriodCategoryStandingTable }) {
  return (
    <div className="overflow-hidden rounded-3xl liquid-glass border border-[var(--lg-border-subtle)] shadow-lg">
      <div className="flex items-center justify-between bg-[var(--lg-tint)] border-b border-[var(--lg-border-subtle)] px-6 py-4">
        <div className="text-base font-semibold text-[var(--lg-text-heading)]">{cat.label}</div>
        <div className="text-xs font-medium uppercase text-[var(--lg-text-muted)] flex items-center gap-2">
          {cat.higherIsBetter ? (
             <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Ascending</span>
          ) : (
            <span className="px-1.5 py-0.5 rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20">Descending</span>
          )}
        </div>
      </div>

      <ThemedTable bare>
        <ThemedThead>
          <ThemedTr>
            <ThemedTh className="px-6 w-16">Rank</ThemedTh>
            <ThemedTh className="px-6">Team</ThemedTh>
            <ThemedTh align="center" className="px-6 w-28">Value</ThemedTh>
            <ThemedTh align="right" className="px-6 w-24">Points</ThemedTh>
          </ThemedTr>
        </ThemedThead>

        <tbody>
          {(cat.rows ?? []).map((r: any, idx: number) => {
            const code = String(r.teamCode ?? "").trim().toUpperCase();
            const name = fullTeamName(code, r.teamName);

            return (
              <ThemedTr key={`${code || "—"}-${idx}`}>
                <ThemedTd className="px-6 text-xs opacity-50">{r.rank ?? idx + 1}</ThemedTd>
                <ThemedTd className="px-6">
                  <div className="font-bold">{name}</div>
                </ThemedTd>
                <ThemedTd align="center" className="px-6">{fmtValue(r.value)}</ThemedTd>
                <ThemedTd align="right" className="px-6">
                  <span className="font-bold text-[var(--lg-accent)]">{fmt1(r.points)}</span>
                </ThemedTd>
              </ThemedTr>
            );
          })}
        </tbody>
      </ThemedTable>

      <div className="px-6 py-3 bg-[var(--lg-tint)] text-xs font-medium uppercase text-[var(--lg-text-muted)] opacity-40">
        Computed from player stats.
      </div>
    </div>
  );
}
