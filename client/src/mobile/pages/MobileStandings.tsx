/*
 * MobileStandings — Aurora mobile twin for /season.
 *
 * Reads the same data the desktop Season page reads:
 *   1. getSeasonStandings(leagueId) → latest periodId + period-by-period rows
 *   2. getPeriodCategoryStandings(periodId, leagueId) → 10-cat tables
 *
 * Renders a sortable 5-cat table with Hitting / Pitching / Total / Period views.
 * Cells show roto points (1–10), color-graded per the Aurora Mobile
 * design canvas (≥ 8 positive, ≥ 5 text, < 5 muted).
 */
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLeague } from "../../contexts/LeagueContext";
import { getSeasonStandings, getPeriodCategoryStandings } from "../../api";
import type {
  PeriodCategoryStandingsResponse,
  PeriodCategoryKey,
} from "../../api/types";
import { MobileTopbar } from "../MobileTopbar";
import { MCard, MIridText } from "../atoms/MCard";
import { MSegmented } from "../atoms/MSegmented";
import { MSortHeader, type SortDir } from "../atoms/MSortHeader";
import { Glyph } from "../atoms/Glyph";

type ViewKey = "Hitting" | "Pitching" | "Total" | "Period";
type SortKey = "rank" | "team" | "total" | PeriodCategoryKey;

const HIT_CATS: PeriodCategoryKey[] = ["AVG", "HR", "R", "RBI", "SB"];
const PITCH_CATS: PeriodCategoryKey[] = ["W", "SV", "K", "ERA", "WHIP"];
const TOTAL_DISPLAY: PeriodCategoryKey[] = ["AVG", "HR", "RBI", "SB", "K"];

interface MatrixRow {
  teamId: number;
  teamName: string;
  teamCode: string;
  pointsByCat: Record<string, number>;
  /** Sum of points across ALL categories in the period (not just visible). */
  total: number;
}

interface PeriodRow {
  teamId: number;
  teamName: string;
  teamCode: string;
  periodPoints: number[];
  total: number;
}

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function buildMatrix(resp: PeriodCategoryStandingsResponse): MatrixRow[] {
  const teamMap = new Map<string, MatrixRow>();
  for (const cat of resp.categories ?? []) {
    for (const row of cat.rows ?? []) {
      const r = row as typeof row & { teamId?: number };
      const key = r.teamCode ?? String(r.teamId ?? r.teamName);
      let t = teamMap.get(key);
      if (!t) {
        t = {
          teamId: r.teamId ?? 0,
          teamName: r.teamName,
          teamCode: r.teamCode,
          pointsByCat: {},
          total: 0,
        };
        teamMap.set(key, t);
      }
      t.pointsByCat[cat.key] = r.points;
      t.total += r.points;
    }
  }
  return Array.from(teamMap.values());
}

function sumForView(row: MatrixRow, view: ViewKey): number {
  if (view === "Total" || view === "Period") return row.total;
  const cats = view === "Hitting" ? HIT_CATS : PITCH_CATS;
  return cats.reduce((s, k) => s + (row.pointsByCat[k] ?? 0), 0);
}

function pointColor(p: number): string {
  if (p >= 8) return "var(--am-positive)";
  if (p >= 5) return "var(--am-text)";
  return "var(--am-text-muted)";
}

export function MobileStandings() {
  const nav = useNavigate();
  const { leagueId, myTeamId } = useLeague();
  const [matrix, setMatrix] = useState<MatrixRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewKey>("Hitting");
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [periodRows, setPeriodRows] = useState<PeriodRow[]>([]);
  const [periodMeta, setPeriodMeta] = useState<{ ids: number[]; names: string[] }>({ ids: [], names: [] });

  useEffect(() => {
    if (!leagueId) return;
    let canceled = false;
    setLoading(true);
    setError(null);
    getSeasonStandings(leagueId)
      .then((season) => {
        if (canceled) return null;
        const ids: number[] = season?.periodIds ?? [];
        const names: string[] = season?.periodNames ?? [];
        // Build period rows for "By Period" view
        const rows: PeriodRow[] = (season?.rows ?? []).map((row) => {
          const r = row as Record<string, unknown>;
          const periodPointsRaw = r.periodPoints;
          const periodPoints =
            Array.isArray(periodPointsRaw) && periodPointsRaw.length
              ? ids.map((_pid, i) =>
                  toNum(Array.isArray(periodPointsRaw) ? periodPointsRaw[i] : 0)
                )
              : ids.map((pid) => toNum(r[`P${pid}`]));
          return {
            teamId: Number(r.teamId),
            teamName: String(r.teamName ?? ""),
            teamCode: typeof r.teamCode === "string" ? r.teamCode : "",
            periodPoints,
            total: periodPoints.reduce((s, v) => s + v, 0),
          };
        });
        rows.sort((a, b) => b.total - a.total);
        setPeriodMeta({ ids, names });
        setPeriodRows(rows);
        const latest = ids.length > 0 ? ids[ids.length - 1] : null;
        if (!latest) {
          if (!canceled) setMatrix([]);
          return null;
        }
        return getPeriodCategoryStandings(latest, leagueId);
      })
      .then((resp) => {
        if (canceled || !resp) return;
        setMatrix(buildMatrix(resp));
      })
      .catch((err) => {
        if (canceled) return;
        setError(err instanceof Error ? err.message : "Failed to load standings");
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [leagueId]);

  const visibleCats: PeriodCategoryKey[] =
    view === "Hitting" ? HIT_CATS : view === "Pitching" ? PITCH_CATS : TOTAL_DISPLAY;

  const onSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(sortDir === "desc" ? "asc" : "desc");
    else {
      setSortKey(k);
      setSortDir("desc");
    }
  };

  const sortedRows = useMemo(() => {
    const ranked = matrix
      .map((r) => ({ r, v: sumForView(r, view) }))
      .sort((a, b) => b.v - a.v)
      .map((x, i) => ({ ...x.r, rank: i + 1 }));

    return [...ranked].sort((a, b) => {
      let av: number | string;
      let bv: number | string;
      if (sortKey === "total") {
        av = sumForView(a, view);
        bv = sumForView(b, view);
      } else if (sortKey === "rank") {
        av = a.rank;
        bv = b.rank;
      } else if (sortKey === "team") {
        av = a.teamName;
        bv = b.teamName;
      } else {
        av = a.pointsByCat[sortKey] ?? 0;
        bv = b.pointsByCat[sortKey] ?? 0;
      }
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "desc" ? bv.localeCompare(av) : av.localeCompare(bv);
      }
      return sortDir === "desc" ? Number(bv) - Number(av) : Number(av) - Number(bv);
    });
  }, [matrix, view, sortKey, sortDir]);

  // Tuned against the longest OGBA team name ("Demolition Lumber Co.", 21
  // chars) at 390px viewport width. The prototype used 28px stat columns
  // against shorter mock names; trimming to 26px (and the total column to
  // 30px) buys ~14px for the team column without compressing the numbers.
  const colW = 26;
  const cols = `16px minmax(0,1fr) ${visibleCats.map(() => `${colW}px`).join(" ")} 30px`;

  const periodCols = `16px minmax(0,1fr) ${periodMeta.ids.map(() => "32px").join(" ")} 34px`;

  return (
    <div data-testid="mobile-standings">
      <MobileTopbar
        title="Standings"
        subtitle="Roto · 5×5"
        leading={<Glyph kind="back" size={20} />}
        onLeadingClick={() => nav(-1)}
      />

      <div style={{ padding: "0 14px 10px" }}>
        <MSegmented<ViewKey>
          options={["Hitting", "Pitching", "Total", "Period"]}
          active={view}
          onChange={setView}
          ariaLabel="Standings view"
        />
      </div>

      {error && (
        <div style={{ padding: "12px 18px", color: "var(--am-negative)", fontSize: 12 }}>{error}</div>
      )}

      {loading && !matrix.length && !periodRows.length ? (
        <div style={{ padding: "16px 18px", color: "var(--am-text-muted)", fontSize: 12 }}>
          Loading standings…
        </div>
      ) : view === "Period" ? (
        <div style={{ padding: "0 14px 12px", marginTop: 4 }}>
          {!periodRows.length && !loading ? (
            <div style={{ padding: "16px 14px", color: "var(--am-text-muted)", fontSize: 12 }}>
              No standings available yet.
            </div>
          ) : (
            <MCard padded={false}>
              {/* Period table header */}
              <div
                role="row"
                style={{
                  display: "grid",
                  gridTemplateColumns: periodCols,
                  alignItems: "center",
                  padding: "2px 12px",
                  borderBottom: "1px solid var(--am-border-strong)",
                  background: "var(--am-surface-faint)",
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: "var(--am-text-muted)",
                    textAlign: "center",
                  }}
                >
                  #
                </div>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: "var(--am-text-muted)",
                    paddingLeft: 6,
                  }}
                >
                  TEAM
                </div>
                {periodMeta.ids.map((_, i) => (
                  <div
                    key={i}
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: "var(--am-text-muted)",
                      textAlign: "center",
                    }}
                  >
                    {periodMeta.names[i] ?? `P${i + 1}`}
                  </div>
                ))}
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: "var(--am-text-muted)",
                    textAlign: "right",
                  }}
                >
                  TOT
                </div>
              </div>

              {/* Period table rows */}
              {periodRows.map((t, i) => {
                const isMe = !!myTeamId && t.teamId === myTeamId;
                return (
                  <div
                    key={t.teamCode || t.teamId}
                    role="row"
                    data-team-code={t.teamCode}
                    onClick={() => t.teamCode && nav(`/teams/${t.teamCode}`)}
                    style={{
                      display: "grid",
                      gridTemplateColumns: periodCols,
                      alignItems: "center",
                      padding: "7px 12px",
                      borderTop: i > 0 ? "1px solid var(--am-border)" : "none",
                      background: isMe ? "var(--am-chip)" : "transparent",
                      cursor: t.teamCode ? "pointer" : "default",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "var(--am-text-muted)",
                        textAlign: "center",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {i + 1}
                    </div>
                    <div style={{ minWidth: 0, paddingLeft: 6, paddingRight: 4 }}>
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--am-text)",
                          fontWeight: isMe ? 700 : 500,
                          lineHeight: 1.2,
                          letterSpacing: -0.2,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {t.teamName}
                        {isMe && (
                          <span
                            style={{
                              fontSize: 9,
                              color: "var(--am-accent)",
                              marginLeft: 5,
                              fontWeight: 700,
                              letterSpacing: 0.4,
                            }}
                          >
                            YOU
                          </span>
                        )}
                      </div>
                    </div>
                    {t.periodPoints.map((pts, pi) => (
                      <div
                        key={pi}
                        style={{
                          textAlign: "center",
                          fontSize: 13,
                          fontWeight: 700,
                          fontVariantNumeric: "tabular-nums",
                          color: "var(--am-text)",
                        }}
                      >
                        {pts}
                      </div>
                    ))}
                    <div style={{ textAlign: "right", paddingLeft: 4 }}>
                      <MIridText size={14} weight={700}>
                        {t.total}
                      </MIridText>
                    </div>
                  </div>
                );
              })}
            </MCard>
          )}
        </div>
      ) : (
        <div style={{ padding: "0 14px 12px", marginTop: 4 }}>
          <MCard padded={false}>
            <div
              role="row"
              style={{
                display: "grid",
                gridTemplateColumns: cols,
                alignItems: "center",
                padding: "2px 12px",
                borderBottom: "1px solid var(--am-border-strong)",
                background: "var(--am-surface-faint)",
              }}
            >
              <MSortHeader<SortKey> k="rank" label="#" active={sortKey} dir={sortDir} onSort={onSort} align="center" />
              <MSortHeader<SortKey> k="team" label="TEAM" active={sortKey} dir={sortDir} onSort={onSort} align="left" />
              {visibleCats.map((c) => (
                <MSortHeader<SortKey>
                  key={c}
                  k={c}
                  label={c}
                  active={sortKey}
                  dir={sortDir}
                  onSort={onSort}
                  align="center"
                />
              ))}
              <MSortHeader<SortKey> k="total" label="TOT" active={sortKey} dir={sortDir} onSort={onSort} align="right" />
            </div>

            {sortedRows.map((t, i) => {
              const isMe = !!myTeamId && t.teamId === myTeamId;
              const totalForView = sumForView(t, view);
              return (
                <div
                  key={t.teamCode || t.teamId}
                  role="row"
                  data-team-code={t.teamCode}
                  onClick={() => t.teamCode && nav(`/teams/${t.teamCode}`)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: cols,
                    alignItems: "center",
                    padding: "7px 12px",
                    borderTop: i > 0 ? "1px solid var(--am-border)" : "none",
                    background: isMe ? "var(--am-chip)" : "transparent",
                    cursor: t.teamCode ? "pointer" : "default",
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--am-text-muted)",
                      textAlign: "center",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {t.rank}
                  </div>
                  <div style={{ minWidth: 0, paddingLeft: 6, paddingRight: 4 }}>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--am-text)",
                        fontWeight: isMe ? 700 : 500,
                        lineHeight: 1.2,
                        letterSpacing: -0.2,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {t.teamName}
                      {isMe && (
                        <span
                          style={{
                            fontSize: 9,
                            color: "var(--am-accent)",
                            marginLeft: 5,
                            fontWeight: 700,
                            letterSpacing: 0.4,
                          }}
                        >
                          YOU
                        </span>
                      )}
                    </div>
                  </div>
                  {visibleCats.map((c) => {
                    const p = t.pointsByCat[c] ?? 0;
                    return (
                      <div
                        key={c}
                        style={{
                          textAlign: "center",
                          fontSize: 13,
                          fontWeight: 700,
                          fontVariantNumeric: "tabular-nums",
                          color: pointColor(p),
                        }}
                      >
                        {p}
                      </div>
                    );
                  })}
                  <div style={{ textAlign: "right", paddingLeft: 4 }}>
                    <MIridText size={14} weight={700}>
                      {totalForView.toFixed(1)}
                    </MIridText>
                  </div>
                </div>
              );
            })}

            {!loading && !sortedRows.length && (
              <div style={{ padding: "16px 14px", color: "var(--am-text-muted)", fontSize: 12 }}>
                No standings available yet.
              </div>
            )}
          </MCard>
        </div>
      )}

      <div style={{ padding: "0 14px 16px" }}>
        <div style={{ fontSize: 10, color: "var(--am-text-faint)", padding: "0 4px" }}>
          {view === "Period"
            ? "Each cell shows total roto points earned per scoring period. Tap a row to view team."
            : "Each cell shows roto points (1–10). Tap any column header to sort. Green = top tier."}
        </div>
      </div>
    </div>
  );
}
