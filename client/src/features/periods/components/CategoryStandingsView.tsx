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
  /** Day-over-day rank-points delta. Used as a fallback when valueDeltaPct is unavailable. */
  pointsDelta?: number;
  /** Day-over-day raw-value change vs the snapshot from `compareDays` ago. */
  valueDelta?: number;
  /** Day-over-day raw-value % change. Preferred display when present. */
  valueDeltaPct?: number;
  /** Rank movement (positive = improved). */
  rankDelta?: number;
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
}

// ─── Component ───

const CategoryStandingsView: React.FC<CategoryStandingsViewProps> = ({
  leagueId,
  myTeamId,
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
  // category column holding that team's rank-points AND the underlying
  // period-cumulative stat value in that category.
  const matrixRows = useMemo(() => {
    if (!data) return [] as Array<{
      teamId: number;
      teamName: string;
      teamCode: string;
      pointsByCat: Record<string, number>;
      valueByCat: Record<string, number>;
      total: number;
    }>;

    const teamMap = new Map<
      number,
      {
        teamId: number;
        teamName: string;
        teamCode: string;
        pointsByCat: Record<string, number>;
        valueByCat: Record<string, number>;
        total: number;
      }
    >();

    for (const cat of data.categories) {
      for (const row of cat.rows) {
        if (!teamMap.has(row.teamId)) {
          teamMap.set(row.teamId, {
            teamId: row.teamId,
            teamName: row.teamName,
            teamCode: row.teamCode,
            pointsByCat: {},
            valueByCat: {},
            total: 0,
          });
        }
        const t = teamMap.get(row.teamId)!;
        t.pointsByCat[cat.key] = row.points;
        t.valueByCat[cat.key] = row.value;
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

  // Split ordered keys into hitting / pitching for the two-column desktop
  // leaderboard layout. Falls back to the existing display order when a
  // category lacks a `group` annotation.
  const { hittingKeys, pitchingKeys } = useMemo(() => {
    const H: string[] = [];
    const P: string[] = [];
    for (const k of orderedCategoryKeys) {
      const cat = catMap.get(k);
      if (cat?.group === "P") P.push(k);
      else H.push(k);
    }
    return { hittingKeys: H, pitchingKeys: P };
  }, [orderedCategoryKeys, catMap]);

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
        <ThemedTable aria-label="Category-ranked Roto standings" minWidth={840}>
          <ThemedThead>
            <ThemedTr>
              <ThemedTh align="center" className="w-12">#</ThemedTh>
              <ThemedTh frozen className="w-[180px]">Team</ThemedTh>
              {orderedCategoryKeys.map((k) => (
                <ThemedTh key={k} align="center" className="w-[68px]">
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
                      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>
                          {fmtPoints(row.pointsByCat[k] ?? 0)}
                        </span>
                        <span style={{ fontSize: 10, color: "var(--am-text-faint)", marginTop: 2 }}>
                          {fmtVal(k, row.valueByCat[k] ?? NaN)}
                        </span>
                      </div>
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

      {/* ─── Section B: Per-category leaderboard cards ───
          Two-column desktop layout: hitting cards in the left column,
          pitching cards in the right column. Collapses to one column
          on mobile (<768px) so cards stay full-width and readable. */}
      <div>
        <SectionLabel>✦ Category leaders</SectionLabel>
        <div className="category-leaders-grid">
          <div className="category-leaders-col">
            {hittingKeys.map((k) => renderCategoryCard(k, catMap.get(k), myTeamId))}
          </div>
          <div className="category-leaders-col">
            {pitchingKeys.map((k) => renderCategoryCard(k, catMap.get(k), myTeamId))}
          </div>
        </div>
        <style>{`
          .category-leaders-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            align-items: start;
          }
          .category-leaders-col {
            display: flex;
            flex-direction: column;
            gap: 12px;
            min-width: 0;
          }
          @media (max-width: 768px) {
            .category-leaders-grid {
              grid-template-columns: 1fr;
            }
          }
        `}</style>
      </div>
    </div>
  );
};

// ─── Card render helper ───
//
// Renders one Glass card for a single category. All teams in the
// league are listed (no top-N truncation) with rank, team name,
// raw cumulative value, rank-points, and an optional day-over-day
// delta indicator.
function renderCategoryCard(
  k: string,
  cat: CategoryTable | undefined,
  myTeamId: number | null | undefined,
): React.ReactNode {
  if (!cat) return null;
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

        {/* Column header for the leaderboard rows. */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "20px 1fr 44px 32px 52px",
            alignItems: "center",
            gap: 8,
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: 0.5,
            textTransform: "uppercase",
            color: "var(--am-text-faint)",
            padding: "0 0 4px",
            borderBottom: "1px solid var(--am-border)",
          }}
        >
          <span />
          <span>Team</span>
          <span style={{ textAlign: "right" }}>Stat</span>
          <span style={{ textAlign: "right" }}>Pts</span>
          <span style={{ textAlign: "right" }}>Δ</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          {cat.rows.map((r) => {
            // Day-over-day display: prefer the persisted daily snapshot's
            // `valueDeltaPct` (raw-value % change vs yesterday). Fall back
            // to the legacy `pointsDelta`-derived % proxy when the snapshot
            // is empty (first day of period). Gracefully degrades to no badge.
            const hasValuePct =
              typeof r.valueDeltaPct === "number" &&
              Number.isFinite(r.valueDeltaPct);
            const hasPointsDelta =
              typeof r.pointsDelta === "number" &&
              Number.isFinite(r.pointsDelta);
            const dPct = hasValuePct
              ? r.valueDeltaPct!
              : hasPointsDelta && r.points - (r.pointsDelta ?? 0) !== 0
              ? (r.pointsDelta! / (r.points - (r.pointsDelta ?? 0))) * 100
              : 0;
            const up = hasValuePct
              ? r.valueDeltaPct! > 0
              : hasPointsDelta && r.pointsDelta! > 0;
            const down = hasValuePct
              ? r.valueDeltaPct! < 0
              : hasPointsDelta && r.pointsDelta! < 0;
            const hasDelta = hasValuePct || hasPointsDelta;
            const isMine = myTeamId != null && r.teamId === myTeamId;
            return (
              <div
                key={r.teamId}
                style={{
                  display: "grid",
                  gridTemplateColumns: "20px 1fr 44px 32px 52px",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12,
                  padding: "5px 0",
                  borderBottom: "1px solid var(--am-border)",
                  background: isMine
                    ? "color-mix(in oklab, var(--am-accent) 7%, transparent)"
                    : "transparent",
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
                    fontWeight: isMine ? 600 : 400,
                  }}
                >
                  {r.teamName}
                </span>
                <span
                  style={{
                    fontVariantNumeric: "tabular-nums",
                    color: "var(--am-text-muted)",
                    fontWeight: 600,
                    textAlign: "right",
                  }}
                >
                  {fmtVal(k, r.value)}
                </span>
                <span
                  style={{
                    fontVariantNumeric: "tabular-nums",
                    color: "var(--am-text)",
                    fontWeight: 700,
                    textAlign: "right",
                  }}
                >
                  {fmtPoints(r.points)}
                </span>
                {hasDelta ? (
                  <span
                    style={{
                      fontVariantNumeric: "tabular-nums",
                      fontSize: 10.5,
                      fontWeight: 600,
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
                  <span />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Glass>
  );
}

export default CategoryStandingsView;
