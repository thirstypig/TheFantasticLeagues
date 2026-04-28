/*
 * Standings — Aurora port (PR #138).
 *
 * Aurora bento layout for the season standings matrix. Mirrors the
 * design's StandingsAmbient screen from the Aurora System.html bundle:
 *   - Header card: title + week count + chips
 *   - Matrix card: team × periods + total + delta with iridescent
 *     gradient cells for the highest values
 *
 * Data shape: Each row from `getSeasonStandings(leagueId)` carries
 * `periodPoints` (array per period) + `totalPoints` (sum). Cells use
 * an intensity-based gradient — top scores in each period get the
 * iridescent treatment, mid-range tints, low transparent.
 *
 * The legacy Season page (1500+ LOC of period-detail tabs, H2H mode,
 * matchups view, sorting) is preserved at /season-classic for now.
 * Port the remaining views into Aurora when the pilot expands; for
 * now this is parity with the Home → "View full standings →" link.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AmbientBg, Glass, IridText, Chip, SectionLabel,
} from "../../../components/aurora/atoms";
import "../../../components/aurora/aurora.css";
import { useLeague } from "../../../contexts/LeagueContext";
import { getSeasonStandings } from "../../../api";
import CategoryStandingsView from "../components/CategoryStandingsView";

interface MatrixRow {
  teamId: number;
  teamName: string;
  teamCode?: string;
  owner?: string;
  periodPoints: number[];
  totalPoints: number;
}

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function sumNums(arr: unknown[]): number {
  return (arr ?? []).reduce<number>((s, v) => s + toNum(v), 0);
}

export default function Season() {
  const { leagueId, currentLeagueName, myTeamId } = useLeague();
  const [periodNames, setPeriodNames] = useState<string[]>([]);
  const [rows, setRows] = useState<MatrixRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"periods" | "categories">("periods");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    if (!leagueId) return;
    let canceled = false;
    setLoading(true);
    setError(null);
    getSeasonStandings(leagueId)
      .then(data => {
        if (canceled) return;
        const periodIds: number[] = data.periodIds ?? [];
        setPeriodNames(data.periodNames ?? periodIds.map(id => `P${id}`));

        const normalized = (data.rows ?? []).map((row: any): MatrixRow => {
          const periodPoints = Array.isArray(row.periodPoints) && row.periodPoints.length
            ? periodIds.map((_pid: number, i: number) => toNum(row.periodPoints[i]))
            : periodIds.map((pid: number) => toNum(row[`P${pid}`]));
          return {
            teamId: row.teamId,
            teamName: row.teamName,
            teamCode: row.teamCode,
            owner: row.owner,
            periodPoints,
            totalPoints: sumNums(periodPoints),
          };
        });
        normalized.sort((a, b) => b.totalPoints - a.totalPoints);
        setRows(normalized);
        setUpdatedAt(new Date());
      })
      .catch(err => {
        if (canceled) return;
        setError(err instanceof Error ? err.message : "Failed to load standings");
      })
      .finally(() => { if (!canceled) setLoading(false); });
    return () => { canceled = true; };
  }, [leagueId]);

  // Per-period max — used to grade cell intensity. Max gets iridescent;
  // ≥80% of max gets chip-strong; rest are transparent.
  const periodMaxes = useMemo(() => {
    if (rows.length === 0) return [] as number[];
    const numPeriods = rows[0].periodPoints.length;
    const maxes: number[] = [];
    for (let i = 0; i < numPeriods; i++) {
      let mx = 0;
      for (const r of rows) mx = Math.max(mx, r.periodPoints[i] ?? 0);
      maxes.push(mx);
    }
    return maxes;
  }, [rows]);

  // Period-over-period delta = last period's points - prior period's points.
  // Returns 0 when fewer than 2 periods exist.
  function lastDelta(periodPoints: number[]): number {
    if (periodPoints.length < 2) return 0;
    return periodPoints[periodPoints.length - 1] - periodPoints[periodPoints.length - 2];
  }

  return (
    <div className="aurora-theme">
      <div style={{ position: "relative", minHeight: "100vh", overflow: "hidden", color: "var(--am-text)" }}>
        <AmbientBg />

        <div
          style={{
            position: "relative",
            zIndex: 10,
            padding: "32px 28px 80px",
            display: "grid",
            gridTemplateColumns: "repeat(12, 1fr)",
            gridAutoRows: "minmax(0, auto)",
            gap: 14,
            maxWidth: 1400,
            margin: "0 auto",
          }}
        >
          {/* HEADER */}
          <div style={{ gridColumn: "span 12" }}>
            <Glass strong>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <SectionLabel>Standings · Roto points</SectionLabel>
                  <div style={{ fontFamily: "var(--am-display)", fontSize: 36, lineHeight: 1, letterSpacing: -0.4 }}>
                    {currentLeagueName || "League"}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--am-text-muted)", marginTop: 6 }}>
                    {rows.length > 0 && `${rows.length} teams · ${periodNames.length} period${periodNames.length === 1 ? "" : "s"}`}
                    {updatedAt && ` · refreshed ${formatTimeAgo(updatedAt)}`}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <Chip>Live</Chip>
                  <Chip>Roto</Chip>
                  <Link to="/injured-list" style={{ textDecoration: "none" }}>
                    <Chip>League IL →</Chip>
                  </Link>
                </div>
              </div>
              {/* View toggle: Periods matrix (default) vs Categories (Roto rank-points) */}
              <div style={{ marginTop: 14, display: "flex", gap: 6 }}>
                {(["periods", "categories"] as const).map((mode) => {
                  const isActive = viewMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setViewMode(mode)}
                      style={{
                        padding: "6px 14px",
                        borderRadius: 99,
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: 0.6,
                        textTransform: "uppercase",
                        background: isActive ? "var(--am-chip-strong)" : "var(--am-chip)",
                        color: isActive ? "var(--am-text)" : "var(--am-text-muted)",
                        border: "1px solid " + (isActive ? "var(--am-border-strong)" : "var(--am-border)"),
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      {mode === "periods" ? "By Period" : "By Category"}
                    </button>
                  );
                })}
              </div>
            </Glass>
          </div>

          {/* CATEGORY STANDINGS VIEW (Roto rank-points) */}
          {viewMode === "categories" && leagueId && (
            <div style={{ gridColumn: "span 12" }}>
              <CategoryStandingsView leagueId={leagueId} />
            </div>
          )}

          {/* PERIODS MATRIX */}
          {viewMode === "periods" && (
          <div style={{ gridColumn: "span 12" }}>
            <Glass padded={false}>
              {loading && (
                <div style={{ padding: 36, color: "var(--am-text-faint)", fontSize: 12, textAlign: "center" }}>
                  Loading standings…
                </div>
              )}
              {error && (
                <div style={{ padding: 24, color: "var(--am-negative)", fontSize: 12 }}>
                  {error}
                </div>
              )}
              {!loading && !error && rows.length === 0 && (
                <div style={{ padding: 36, color: "var(--am-text-faint)", fontSize: 12, textAlign: "center" }}>
                  No standings yet — periods may not have completed.
                </div>
              )}
              {!loading && rows.length > 0 && (
                <div style={{ overflow: "auto" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "separate",
                      borderSpacing: 0,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    <thead>
                      <tr style={{ fontSize: 10, color: "var(--am-text-faint)", letterSpacing: 1, fontWeight: 600 }}>
                        <th style={{ padding: "12px 14px", textAlign: "left" }}>#</th>
                        <th style={{ padding: "12px 14px", textAlign: "left" }}>TEAM</th>
                        {periodNames.map((name, i) => (
                          <th key={i} style={{ padding: "12px 8px", textAlign: "center", whiteSpace: "nowrap" }}>
                            {abbreviatePeriod(name)}
                          </th>
                        ))}
                        <th style={{ padding: "12px 14px", textAlign: "right" }}>TOTAL</th>
                        <th style={{ padding: "12px 14px", textAlign: "right" }}>Δ LAST</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((t, i) => {
                        const rank = i + 1;
                        const isMine = t.teamId === myTeamId;
                        const delta = lastDelta(t.periodPoints);
                        return (
                          <tr
                            key={t.teamId}
                            style={{
                              borderTop: "1px solid var(--am-border)",
                              background: isMine ? "color-mix(in oklab, var(--am-accent) 7%, transparent)" : "transparent",
                            }}
                          >
                            <td style={{ padding: "10px 14px", fontSize: 12, color: "var(--am-text-muted)" }}>
                              {String(rank).padStart(2, "0")}
                            </td>
                            <td style={{ padding: "10px 14px" }}>
                              <Link
                                to={t.teamCode ? `/teams/${t.teamCode}` : "#"}
                                style={{ textDecoration: "none", color: "inherit", display: "flex", alignItems: "center", gap: 10 }}
                              >
                                <div
                                  style={{
                                    width: 26,
                                    height: 26,
                                    borderRadius: 7,
                                    background: rank === 1 ? "var(--am-irid)" : "var(--am-chip-strong)",
                                    display: "grid",
                                    placeItems: "center",
                                    fontSize: 9.5,
                                    fontWeight: 700,
                                    color: rank === 1 ? "#fff" : "var(--am-text)",
                                    border: "1px solid var(--am-border)",
                                  }}
                                >
                                  {(t.teamCode || t.teamName).slice(0, 3).toUpperCase()}
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                  <span style={{ fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                                    {t.teamName}
                                    {isMine && <Chip strong style={{ fontSize: 9, padding: "1px 6px" }}>You</Chip>}
                                  </span>
                                  {t.owner && (
                                    <span style={{ fontSize: 10.5, color: "var(--am-text-faint)" }}>{t.owner}</span>
                                  )}
                                </div>
                              </Link>
                            </td>
                            {t.periodPoints.map((p, j) => {
                              const max = periodMaxes[j] ?? 0;
                              const isPeak = p === max && max > 0;
                              const isStrong = !isPeak && max > 0 && p / max >= 0.8;
                              return (
                                <td
                                  key={j}
                                  style={{ padding: "10px 8px", textAlign: "center" }}
                                >
                                  <span
                                    style={{
                                      display: "inline-block",
                                      minWidth: 30,
                                      padding: "3px 8px",
                                      borderRadius: 6,
                                      fontSize: 11.5,
                                      fontWeight: 600,
                                      color: isPeak ? "#fff" : "var(--am-text-muted)",
                                      background: isPeak
                                        ? "var(--am-irid)"
                                        : isStrong
                                          ? "var(--am-chip-strong)"
                                          : "transparent",
                                    }}
                                  >
                                    {p.toFixed(1)}
                                  </span>
                                </td>
                              );
                            })}
                            <td style={{ padding: "10px 14px", textAlign: "right" }}>
                              <IridText size={16} weight={500}>{t.totalPoints.toFixed(1)}</IridText>
                            </td>
                            <td
                              style={{
                                padding: "10px 14px",
                                textAlign: "right",
                                fontSize: 11,
                                fontWeight: 600,
                                color: delta > 0 ? "var(--am-positive)" : delta < 0 ? "var(--am-negative)" : "var(--am-text-faint)",
                              }}
                            >
                              {delta === 0 ? "—" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}`}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Glass>
          </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ─── helpers ───

function formatTimeAgo(d: Date): string {
  const ms = Date.now() - d.getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "moments ago";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

// Period names from the API are sometimes long (e.g., "Mar 23 – Mar 29");
// shorten for matrix headers so the table doesn't sprawl horizontally.
function abbreviatePeriod(name: string): string {
  // Try to extract a leading "Mon DD" — that's the start of the period.
  const m = name.match(/^([A-Z][a-z]{2}\s+\d{1,2})/);
  if (m) return m[1];
  // Fallback: first 8 chars.
  return name.slice(0, 8);
}
