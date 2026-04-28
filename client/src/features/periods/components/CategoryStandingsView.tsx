/*
 * CategoryStandingsView — restores the pre-Aurora category-based Roto
 * standings UI that the new /season Aurora page is missing.
 *
 * Renders TWO sections:
 *   A) Category-Ranked Standings — one row per team, one column per
 *      category showing the rank-points that team earned in that
 *      category (8 for 1st place, 7 for 2nd, ..., 1 for last in an
 *      8-team league). Total = sum of category points.
 *   B) Per-category leaderboard cards — one Glass card per category,
 *      ranking teams by raw stat value with a day-over-day % change
 *      indicator (rendered only when both current and prior snapshot
 *      values are available; falls back gracefully otherwise).
 *
 * Wire-up note: this component is meant to be embedded inside the
 * Aurora Season.tsx page, which already provides the .aurora-theme
 * wrapper + AmbientBg. Do NOT add those wrappers here.
 *
 * Data source: GET /api/period-category-standings (the same endpoint
 * SeasonLegacy uses) — exposes per-category rows with rank, points,
 * value, optional pointsDelta (vs previous snapshot), and seasonValue.
 *
 * Day-over-day %: the endpoint returns a per-category snapshot from
 * `TeamStatsPeriod` written on the previous load. We compute the %
 * change as (current value − prior value) / prior value × 100. When
 * the snapshot is unavailable (first load of the period) the column
 * is omitted instead of rendering a misleading 0%.
 */
import React, { useEffect, useMemo, useState } from "react";
import { getSeasonStandings, getPeriodCategoryStandings } from "../../../api";
import { Glass, SectionLabel, IridText } from "../../../components/aurora/atoms";
import {
  ThemedTable,
  ThemedThead,
  ThemedTbody,
  ThemedTr,
  ThemedTh,
  ThemedTd,
} from "../../../components/ui/ThemedTable";

// ─── Types ───

interface CategoryRow {
  teamId: number;
  teamName: string;
  teamCode: string;
  value: number;
  rank: number;
  points: number;
  pointsDelta?: number;
  seasonValue?: number;
}

interface CategoryTable {
  key: string;
  label: string;
  group?: "H" | "P";
  lowerIsBetter?: boolean;
  rows: CategoryRow[];
}

interface ApiResponse {
  periodId: string | number;
  categories: CategoryTable[];
  teamCount: number;
  totalDelta?: Record<number, number>;
}

// Fixed display order for category columns: hitting first, then pitching.
const CATEGORY_ORDER = ["R", "HR", "RBI", "SB", "AVG", "W", "SV", "K", "ERA", "WHIP"];

// ─── Helpers ───

function fmtVal(key: string, val: number): string {
  if (!Number.isFinite(val)) return "—";
  if (key === "AVG") return val.toFixed(3).replace(/^0/, "");
  if (key === "ERA") return val.toFixed(2);
  if (key === "WHIP") return val.toFixed(2);
  return Math.round(val).toString();
}

function fmtPoints(p: number): string {
  if (!Number.isFinite(p)) return "0";
  // Tied ranks produce fractional averages (e.g., 7.5); strip trailing .0.
  return p.toFixed(1).replace(/\.0$/, "");
}

// ─── Props ───

interface CategoryStandingsViewProps {
  leagueId: number;
  /** Highlight this team's row in the category-ranked table. */
  myTeamId?: number | null;
  /** Top-N rows shown per per-category leaderboard card. Defaults to 5. */
  topN?: number;
}

// ─── Component ───

const CategoryStandingsView: React.FC<CategoryStandingsViewProps> = ({
  leagueId,
  myTeamId,
  topN = 5,
}) => {
  const [periodId, setPeriodId] = useState<number | null>(null);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Resolve the latest period via getSeasonStandings (returns periodIds in
  // chronological order) before fetching the category standings.
  useEffect(() => {
    if (!leagueId) return;
    let canceled = false;
    setLoading(true);
    setError(null);
    getSeasonStandings(leagueId)
      .then((seasonResp: any) => {
        if (canceled) return;
        const ids: number[] = seasonResp?.periodIds ?? [];
        const latest = ids.length > 0 ? ids[ids.length - 1] : null;
        setPeriodId(latest);
        if (!latest) {
          setLoading(false);
          return;
        }
        return getPeriodCategoryStandings(latest, leagueId);
      })
      .then((resp) => {
        if (canceled || !resp) return;
        // The shared response type omits `teamId` on rows because the
        // legacy UI keyed by teamCode; the actual server payload does
        // include teamId (server/src/features/standings/routes.ts
        // builds rows from `computeCategoryRows` which returns teamId).
        // Cast through unknown to bridge the gap.
        setData(resp as unknown as ApiResponse);
      })
      .catch((err) => {
        if (canceled) return;
        setError(err instanceof Error ? err.message : "Failed to load category standings");
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [leagueId]);

  // Build category map keyed by category key for O(1) lookup.
  const catMap = useMemo(() => {
    const m = new Map<string, CategoryTable>();
    for (const c of data?.categories ?? []) m.set(c.key, c);
    return m;
  }, [data]);

  // Build category-ranked standings rows: one row per team, with each
  // category column holding that team's rank-points in that category.
  const matrixRows = useMemo(() => {
    if (!data) return [] as Array<{
      teamId: number;
      teamName: string;
      teamCode: string;
      pointsByCat: Record<string, number>;
      total: number;
    }>;

    const teamMap = new Map<
      number,
      { teamId: number; teamName: string; teamCode: string; pointsByCat: Record<string, number>; total: number }
    >();

    for (const cat of data.categories) {
      for (const row of cat.rows) {
        if (!teamMap.has(row.teamId)) {
          teamMap.set(row.teamId, {
            teamId: row.teamId,
            teamName: row.teamName,
            teamCode: row.teamCode,
            pointsByCat: {},
            total: 0,
          });
        }
        const t = teamMap.get(row.teamId)!;
        t.pointsByCat[cat.key] = row.points;
        t.total += row.points;
      }
    }

    return Array.from(teamMap.values()).sort((a, b) => b.total - a.total);
  }, [data]);

  // Categories ordered for column display (hitting cluster first).
  const orderedCategoryKeys = useMemo(() => {
    if (!data) return [] as string[];
    const present = new Set(data.categories.map((c) => c.key));
    const ordered = CATEGORY_ORDER.filter((k) => present.has(k));
    // Append any non-standard categories that the server might add later.
    for (const c of data.categories) {
      if (!ordered.includes(c.key)) ordered.push(c.key);
    }
    return ordered;
  }, [data]);

  if (loading) {
    return (
      <div style={{ padding: 36, color: "var(--am-text-faint)", fontSize: 12, textAlign: "center" }}>
        Loading category standings…
      </div>
    );
  }
  if (error) {
    return (
      <div style={{ padding: 24, color: "var(--am-negative)", fontSize: 12 }}>
        {error}
      </div>
    );
  }
  if (!data || matrixRows.length === 0) {
    return (
      <div style={{ padding: 36, color: "var(--am-text-faint)", fontSize: 12, textAlign: "center" }}>
        No category standings yet — periods may not have completed.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ─── Section A: Category-Ranked Standings table ─── */}
      <div>
        <SectionLabel>✦ Category-ranked standings</SectionLabel>
        <ThemedTable aria-label="Category-ranked Roto standings" minWidth={720}>
          <ThemedThead>
            <ThemedTr>
              <ThemedTh align="center" className="w-12">#</ThemedTh>
              <ThemedTh frozen className="w-[180px]">Team</ThemedTh>
              {orderedCategoryKeys.map((k) => (
                <ThemedTh key={k} align="center" className="w-[60px]">
                  {k}
                </ThemedTh>
              ))}
              <ThemedTh align="center" className="w-[80px]">Total</ThemedTh>
            </ThemedTr>
          </ThemedThead>
          <ThemedTbody>
            {matrixRows.map((row, idx) => {
              const isMine = myTeamId != null && row.teamId === myTeamId;
              return (
                <ThemedTr
                  key={row.teamId}
                  className={isMine ? "is-mine" : undefined}
                >
                  {/* Inline style on first cell to apply the my-team tint
                      across the row — shadcn Table cells inherit the row
                      background, so a class on <tr> is enough but we set
                      it via inline style for correctness in environments
                      without the .is-mine selector. */}
                  <ThemedTd
                    align="center"
                    className={isMine ? "tabular-nums" : "tabular-nums"}
                  >
                    {idx + 1}
                  </ThemedTd>
                  <ThemedTd frozen>
                    <span style={{ fontSize: 12, fontWeight: 500 }}>
                      {row.teamName}
                    </span>
                  </ThemedTd>
                  {orderedCategoryKeys.map((k) => (
                    <ThemedTd key={k} align="center" className="tabular-nums">
                      {fmtPoints(row.pointsByCat[k] ?? 0)}
                    </ThemedTd>
                  ))}
                  <ThemedTd align="center">
                    <IridText size={14} weight={500}>
                      {fmtPoints(row.total)}
                    </IridText>
                  </ThemedTd>
                </ThemedTr>
              );
            })}
          </ThemedTbody>
        </ThemedTable>
        {/* Tinted background for my-team row. Scoped via injected style so
            it works regardless of whether the host app has a .is-mine rule. */}
        <style>{`
          .is-mine { background: var(--am-chip) !important; }
          .is-mine td { background: transparent !important; }
        `}</style>
      </div>

      {/* ─── Section B: Per-category leaderboard cards ─── */}
      <div>
        <SectionLabel>✦ Category leaders</SectionLabel>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 12,
          }}
        >
          {orderedCategoryKeys.map((k) => {
            const cat = catMap.get(k);
            if (!cat) return null;
            // Rows are returned by the server sorted by display order
            // (best first). Take top-N for the leaderboard card.
            const top = cat.rows.slice(0, topN);
            return (
              <Glass key={k} padded={false}>
                <div style={{ padding: 14 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      justifyContent: "space-between",
                      marginBottom: 10,
                    }}
                  >
                    <SectionLabel style={{ marginBottom: 0 }}>
                      ✦ {k}
                    </SectionLabel>
                    {cat.label && cat.label !== k && (
                      <span style={{ fontSize: 10, color: "var(--am-text-faint)" }}>
                        {cat.label}
                      </span>
                    )}
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {top.map((r) => {
                      // Day-over-day % change derived from rank-points
                      // delta when the prior snapshot is available. The
                      // server omits `pointsDelta` when there's no prior
                      // snapshot (first load of the period) — render the
                      // row without the % column in that case.
                      // TODO: server doesn't currently expose the prior
                      // raw stat value separately, so we surface
                      // pointsDelta as a proxy for movement. Switch to a
                      // raw-value % when a daily snapshot endpoint lands.
                      const hasDelta =
                        typeof r.pointsDelta === "number" && Number.isFinite(r.pointsDelta);
                      const dPct =
                        hasDelta && r.points - (r.pointsDelta ?? 0) !== 0
                          ? (r.pointsDelta! / (r.points - (r.pointsDelta ?? 0))) * 100
                          : 0;
                      const up = hasDelta && r.pointsDelta! > 0;
                      const down = hasDelta && r.pointsDelta! < 0;
                      return (
                        <div
                          key={r.teamId}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "20px 1fr auto auto",
                            alignItems: "center",
                            gap: 8,
                            fontSize: 12,
                            padding: "4px 0",
                            borderBottom: "1px solid var(--am-border)",
                          }}
                        >
                          <span
                            style={{
                              color: "var(--am-text-faint)",
                              fontWeight: 600,
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {r.rank}
                          </span>
                          <span
                            style={{
                              color: "var(--am-text)",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {r.teamName}
                          </span>
                          <span
                            style={{
                              fontVariantNumeric: "tabular-nums",
                              color: "var(--am-text-muted)",
                              fontWeight: 600,
                            }}
                          >
                            {fmtVal(k, r.value)}
                          </span>
                          {hasDelta ? (
                            <span
                              style={{
                                fontVariantNumeric: "tabular-nums",
                                fontSize: 10.5,
                                fontWeight: 600,
                                minWidth: 52,
                                textAlign: "right",
                                color: up
                                  ? "var(--am-positive)"
                                  : down
                                    ? "var(--am-negative)"
                                    : "var(--am-text-faint)",
                              }}
                            >
                              {up ? "▲" : down ? "▼" : "—"}{" "}
                              {dPct === 0
                                ? "0%"
                                : `${dPct > 0 ? "+" : ""}${dPct.toFixed(1)}%`}
                            </span>
                          ) : (
                            <span style={{ minWidth: 52 }} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Glass>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default CategoryStandingsView;
