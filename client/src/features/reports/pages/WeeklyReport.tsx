/*
 * Weekly Report — Aurora screen #7 of 8.
 *
 * "This Week in Baseball" report. Net-new page (no legacy to port —
 * the original client UI was removed when the league digest moved
 * onto the Home page; the server endpoint at /api/reports/:leagueId
 * stayed live and is what this page consumes).
 *
 * Layout: hero with week navigator → digest narrative → power
 * rankings + hot/cold teams → stat-of-the-week + bold prediction →
 * proposed trade + fantasy MVP/CY → activity feed → standings
 * snapshot. Per-team insights live in a collapsible accordion at
 * the bottom (8 teams worth of grades + insights would dominate
 * the page if rendered eagerly).
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronLeft, ChevronRight, Trophy } from "lucide-react";

import {
  AmbientBg, Glass, IridText, Chip, SectionLabel,
} from "../../../components/aurora/atoms";
import "../../../components/aurora/aurora.css";
import { useLeague } from "../../../contexts/LeagueContext";
import { EmptyState } from "../../../components/ui/EmptyState";
import { getWeeklyReport, type WeeklyReport, type WeeklyReportTeamInsight } from "../api";

interface PowerRankingRow {
  rank?: number;
  teamName?: string;
  blurb?: string;
}

interface HotColdTeam {
  teamName?: string;
  reason?: string;
}

interface StatOfTheWeek {
  stat?: string;
  teamName?: string;
  value?: string | number;
  context?: string;
}

interface ProposedTrade {
  teamA?: string;
  teamB?: string;
  aGives?: string[];
  bGives?: string[];
  rationale?: string;
}

interface BoldPrediction {
  prediction?: string;
  rationale?: string;
}

interface CategoryMover {
  category?: string;
  teamName?: string;
  delta?: string;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function asArray<T = unknown>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function shiftWeekKey(weekKey: string, delta: number): string {
  const m = /^(\d{4})-W(\d{2})$/.exec(weekKey);
  if (!m) return weekKey;
  const year = parseInt(m[1], 10);
  let week = parseInt(m[2], 10) + delta;
  let y = year;
  while (week < 1) { y -= 1; week += 52; }
  while (week > 53) { y += 1; week -= 52; }
  return `${y}-W${String(week).padStart(2, "0")}`;
}

export default function WeeklyReport() {
  const { leagueId } = useLeague();
  const [weekKey, setWeekKey] = useState<string | undefined>(undefined); // undefined = current
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [openTeamId, setOpenTeamId] = useState<number | null>(null);

  useEffect(() => {
    if (!leagueId) return;
    let alive = true;
    setLoading(true);
    setErr(null);
    getWeeklyReport(leagueId, weekKey)
      .then(r => { if (alive) setReport(r); })
      .catch(e => { if (alive) setErr(e instanceof Error ? e.message : "Failed to load report"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [leagueId, weekKey]);

  const digest = report?.digest.data ?? null;
  const weekInOneSentence = asString(digest?.weekInOneSentence);
  const powerRankings = asArray<PowerRankingRow>(digest?.powerRankings);
  const hotTeam = asObject(digest?.hotTeam) as HotColdTeam | null;
  const coldTeam = asObject(digest?.coldTeam) as HotColdTeam | null;
  const statOfTheWeek = asObject(digest?.statOfTheWeek) as StatOfTheWeek | null;
  const categoryMovers = asArray<CategoryMover>(digest?.categoryMovers);
  const proposedTrade = asObject(digest?.proposedTrade) as ProposedTrade | null;
  const boldPrediction = asObject(digest?.boldPrediction) as BoldPrediction | null;
  const fantasyMVP = asObject(digest?.fantasyMVP);
  const fantasyCyYoung = asObject(digest?.fantasyCyYoung);

  const standingsRows = report?.standings.rows ?? [];
  const activity = report?.activity ?? [];
  const teamInsights = report?.teamInsights ?? [];
  const insightsAvailable = useMemo(() => teamInsights.filter(t => t.available), [teamInsights]);

  return (
    <div className="aurora-theme" style={{ position: "relative", minHeight: "100svh" }}>
      <AmbientBg />
      <div style={{ position: "relative", zIndex: 1, padding: "24px 16px 48px", maxWidth: 1200, margin: "0 auto" }}>
        {/* Hero */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
          <div>
            <SectionLabel>✦ This Week in Baseball</SectionLabel>
            <h1 style={{ fontFamily: "var(--am-display)", fontSize: 32, fontWeight: 300, color: "var(--am-text)", margin: 0, lineHeight: 1.1 }}>
              {report?.meta.leagueName ?? "Weekly Report"}
            </h1>
            {report && (
              <div style={{ marginTop: 6, fontSize: 12, color: "var(--am-text-muted)" }}>
                {report.meta.label}
                {report.meta.isCurrentWeek && <Chip strong style={{ marginLeft: 10 }}>Current</Chip>}
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              onClick={() => setWeekKey(prev => shiftWeekKey(prev ?? report?.meta.weekKey ?? "", -1))}
              aria-label="Previous week"
              style={navBtnStyle()}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={() => setWeekKey(undefined)}
              style={tabBtnStyle(weekKey === undefined)}
            >
              Current
            </button>
            <button
              type="button"
              onClick={() => setWeekKey(prev => shiftWeekKey(prev ?? report?.meta.weekKey ?? "", 1))}
              aria-label="Next week"
              style={navBtnStyle()}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {loading ? (
          <Glass>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 16px" }}>
              <div
                style={{
                  width: 36, height: 36, borderRadius: "50%",
                  border: "3px solid var(--am-border)",
                  borderTopColor: "var(--am-cardinal)",
                  animation: "spin 0.8s linear infinite",
                  marginBottom: 12,
                }}
              />
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1.4, textTransform: "uppercase", color: "var(--am-text-faint)" }}>Loading…</div>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          </Glass>
        ) : err ? (
          <Glass>
            <div style={{ fontSize: 13, color: "var(--am-text-muted)" }}>Couldn't load this week's report: {err}</div>
          </Glass>
        ) : !report?.digest.available && activity.length === 0 && standingsRows.length === 0 ? (
          <Glass>
            <EmptyState
              icon={Trophy}
              title="No report yet for this week"
              description="The weekly digest hasn't been generated. Check back after the next league digest cron runs, or browse to a prior week."
            />
          </Glass>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 16 }}>
            {/* Week-in-one-sentence narrative */}
            {weekInOneSentence && (
              <div style={{ gridColumn: "span 12" }}>
                <Glass strong>
                  <SectionLabel>Week in one sentence</SectionLabel>
                  <p style={{ margin: 0, fontFamily: "var(--am-display)", fontSize: 22, lineHeight: 1.4, fontWeight: 300, color: "var(--am-text)" }}>
                    {weekInOneSentence}
                  </p>
                </Glass>
              </div>
            )}

            {/* Power Rankings — full width, table-like */}
            {powerRankings.length > 0 && (
              <div style={{ gridColumn: "span 12" }}>
                <Glass padded={false}>
                  <div style={{ padding: "14px 16px 4px" }}>
                    <SectionLabel style={{ marginBottom: 0 }}>Power Rankings</SectionLabel>
                  </div>
                  <div style={{ padding: "8px 12px 12px" }}>
                    {powerRankings.map((row, i) => {
                      const rank = row.rank ?? i + 1;
                      return (
                        <div
                          key={i}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "40px 1fr",
                            gap: 12,
                            padding: "10px 8px",
                            borderTop: i === 0 ? "none" : "1px solid var(--am-border)",
                            alignItems: "center",
                          }}
                        >
                          <div style={{ textAlign: "center" }}>
                            {rank === 1 ? (
                              <IridText size={20}>{rank}</IridText>
                            ) : (
                              <span style={{ fontFamily: "var(--am-display)", fontSize: 18, color: "var(--am-text-muted)" }}>{rank}</span>
                            )}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--am-text)" }}>{asString(row.teamName) || "—"}</div>
                            {row.blurb && (
                              <div style={{ fontSize: 12, color: "var(--am-text-muted)", marginTop: 4, lineHeight: 1.5 }}>{asString(row.blurb)}</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Glass>
              </div>
            )}

            {/* Hot / Cold side-by-side */}
            {hotTeam && (
              <div style={{ gridColumn: "span 6" }}>
                <Glass>
                  <SectionLabel>🔥 Hot Team</SectionLabel>
                  {asString(hotTeam.teamName) && <div style={{ fontSize: 16, fontWeight: 600, color: "var(--am-text)" }}>{asString(hotTeam.teamName)}</div>}
                  {hotTeam.reason && (
                    <div style={{ fontSize: 12, color: "var(--am-text-muted)", marginTop: 6, lineHeight: 1.5 }}>{asString(hotTeam.reason)}</div>
                  )}
                </Glass>
              </div>
            )}
            {coldTeam && (
              <div style={{ gridColumn: "span 6" }}>
                <Glass>
                  <SectionLabel>❄ Cold Team</SectionLabel>
                  {asString(coldTeam.teamName) && <div style={{ fontSize: 16, fontWeight: 600, color: "var(--am-text)" }}>{asString(coldTeam.teamName)}</div>}
                  {coldTeam.reason && (
                    <div style={{ fontSize: 12, color: "var(--am-text-muted)", marginTop: 6, lineHeight: 1.5 }}>{asString(coldTeam.reason)}</div>
                  )}
                </Glass>
              </div>
            )}

            {/* Stat of the week + bold prediction */}
            {statOfTheWeek && (
              <div style={{ gridColumn: "span 6" }}>
                <Glass>
                  <SectionLabel>Stat of the Week</SectionLabel>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    {statOfTheWeek.value != null && <IridText size={28}>{asString(statOfTheWeek.value)}</IridText>}
                    {statOfTheWeek.stat && <span style={{ fontSize: 12, color: "var(--am-text-muted)" }}>{asString(statOfTheWeek.stat)}</span>}
                  </div>
                  {statOfTheWeek.teamName && <div style={{ fontSize: 13, color: "var(--am-text)", marginTop: 6 }}>{asString(statOfTheWeek.teamName)}</div>}
                  {statOfTheWeek.context && <div style={{ fontSize: 12, color: "var(--am-text-muted)", marginTop: 4, lineHeight: 1.5 }}>{asString(statOfTheWeek.context)}</div>}
                </Glass>
              </div>
            )}
            {boldPrediction && (
              <div style={{ gridColumn: "span 6" }}>
                <Glass>
                  <SectionLabel>Bold Prediction</SectionLabel>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--am-text)", lineHeight: 1.4 }}>{asString(boldPrediction.prediction) || "—"}</div>
                  {boldPrediction.rationale && (
                    <div style={{ fontSize: 12, color: "var(--am-text-muted)", marginTop: 6, lineHeight: 1.5 }}>{asString(boldPrediction.rationale)}</div>
                  )}
                </Glass>
              </div>
            )}

            {/* Category Movers */}
            {categoryMovers.length > 0 && (
              <div style={{ gridColumn: "span 12" }}>
                <Glass>
                  <SectionLabel>Category Movers</SectionLabel>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {categoryMovers.map((m, i) => (
                      <div
                        key={i}
                        style={{
                          padding: "8px 12px",
                          borderRadius: 12,
                          background: "var(--am-surface-faint)",
                          border: "1px solid var(--am-border)",
                          fontSize: 12,
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <Chip strong>{asString(m.category) || "—"}</Chip>
                        <span style={{ color: "var(--am-text)" }}>{asString(m.teamName) || "—"}</span>
                        {m.delta && <span style={{ color: "var(--am-text-muted)" }}>· {asString(m.delta)}</span>}
                      </div>
                    ))}
                  </div>
                </Glass>
              </div>
            )}

            {/* Proposed Trade */}
            {proposedTrade && (proposedTrade.teamA || proposedTrade.teamB) && (
              <div style={{ gridColumn: "span 12" }}>
                <Glass>
                  <SectionLabel>Trade of the Week</SectionLabel>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 16, alignItems: "center", marginTop: 4 }}>
                    <TradeSide name={asString(proposedTrade.teamA) || "—"} gives={asArray<string>(proposedTrade.aGives)} align="right" />
                    <Chip strong>↔</Chip>
                    <TradeSide name={asString(proposedTrade.teamB) || "—"} gives={asArray<string>(proposedTrade.bGives)} align="left" />
                  </div>
                  {proposedTrade.rationale && (
                    <div style={{ fontSize: 12, color: "var(--am-text-muted)", marginTop: 12, lineHeight: 1.5, textAlign: "center" }}>
                      {asString(proposedTrade.rationale)}
                    </div>
                  )}
                </Glass>
              </div>
            )}

            {/* Fantasy MVP + Cy Young */}
            {fantasyMVP && (
              <div style={{ gridColumn: "span 6" }}>
                <Glass>
                  <SectionLabel>Fantasy MVP</SectionLabel>
                  <div style={{ fontSize: 16, fontWeight: 600, color: "var(--am-text)" }}>{asString(fantasyMVP.playerName) || asString(fantasyMVP.name) || "—"}</div>
                  {fantasyMVP.line != null && <div style={{ fontSize: 12, color: "var(--am-text-muted)", marginTop: 6 }}>{asString(fantasyMVP.line)}</div>}
                </Glass>
              </div>
            )}
            {fantasyCyYoung && (
              <div style={{ gridColumn: "span 6" }}>
                <Glass>
                  <SectionLabel>Fantasy Cy Young</SectionLabel>
                  <div style={{ fontSize: 16, fontWeight: 600, color: "var(--am-text)" }}>{asString(fantasyCyYoung.playerName) || asString(fantasyCyYoung.name) || "—"}</div>
                  {fantasyCyYoung.line != null && <div style={{ fontSize: 12, color: "var(--am-text-muted)", marginTop: 6 }}>{asString(fantasyCyYoung.line)}</div>}
                </Glass>
              </div>
            )}

            {/* Standings snapshot */}
            {standingsRows.length > 0 && (
              <div style={{ gridColumn: "span 6" }}>
                <Glass padded={false}>
                  <div style={{ padding: "14px 16px 4px" }}>
                    <SectionLabel style={{ marginBottom: 0 }}>Standings Snapshot</SectionLabel>
                  </div>
                  <div style={{ padding: "4px 8px 12px" }}>
                    {standingsRows.slice(0, 8).map((s) => (
                      <div
                        key={s.teamId}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "32px 1fr auto",
                          padding: "8px 12px",
                          gap: 8,
                          alignItems: "center",
                          borderTop: s.rank === 1 ? "none" : "1px solid var(--am-border)",
                        }}
                      >
                        <span style={{ fontSize: 11, color: "var(--am-text-faint)", textAlign: "center" }}>{s.rank}</span>
                        <span style={{ fontSize: 13, color: "var(--am-text)", fontWeight: s.rank === 1 ? 600 : 500 }}>{s.teamName}</span>
                        {s.rank === 1 ? (
                          <IridText size={16}>{s.totalPoints}</IridText>
                        ) : (
                          <span style={{ fontSize: 13, color: "var(--am-text-muted)", fontVariantNumeric: "tabular-nums" }}>{s.totalPoints}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </Glass>
              </div>
            )}

            {/* Activity feed */}
            <div style={{ gridColumn: standingsRows.length > 0 ? "span 6" : "span 12" }}>
              <Glass padded={false}>
                <div style={{ padding: "14px 16px 4px" }}>
                  <SectionLabel style={{ marginBottom: 0 }}>This Week's Activity</SectionLabel>
                </div>
                <div style={{ padding: "4px 12px 12px", maxHeight: 360, overflowY: "auto" }}>
                  {activity.length === 0 ? (
                    <div style={{ fontSize: 13, color: "var(--am-text-muted)", fontStyle: "italic", padding: 12 }}>No transactions this week.</div>
                  ) : activity.slice(0, 25).map((a) => (
                    <div
                      key={a.id}
                      style={{
                        padding: "8px 8px",
                        borderTop: "1px solid var(--am-border)",
                        fontSize: 12,
                        display: "grid",
                        gridTemplateColumns: "auto 1fr auto",
                        gap: 8,
                        alignItems: "baseline",
                      }}
                    >
                      <Chip>{(a.type ?? "txn").toLowerCase()}</Chip>
                      <span style={{ color: "var(--am-text)" }}>
                        <span style={{ fontWeight: 600 }}>{a.teamName ?? "—"}</span>
                        {a.playerName && <span style={{ color: "var(--am-text-muted)" }}> · {a.playerName}</span>}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--am-text-faint)" }}>
                        {new Date(a.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    </div>
                  ))}
                </div>
              </Glass>
            </div>

            {/* Per-team insights — collapsible accordion at the bottom */}
            {insightsAvailable.length > 0 && (
              <div style={{ gridColumn: "span 12" }}>
                <Glass padded={false}>
                  <div style={{ padding: "14px 16px 4px" }}>
                    <SectionLabel style={{ marginBottom: 0 }}>Per-Team Insights</SectionLabel>
                  </div>
                  <div style={{ padding: "4px 8px 12px" }}>
                    {insightsAvailable.map((t) => (
                      <TeamInsightCard
                        key={t.teamId}
                        team={t}
                        open={openTeamId === t.teamId}
                        onToggle={() => setOpenTeamId(prev => prev === t.teamId ? null : t.teamId)}
                      />
                    ))}
                  </div>
                </Glass>
              </div>
            )}
          </div>
        )}

        {/* Footer attribution */}
        {report?.meta.generatedAt && (
          <div style={{ marginTop: 16, textAlign: "center", fontSize: 11, color: "var(--am-text-faint)" }}>
            Digest generated {new Date(report.meta.generatedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · Powered by Google Gemini & Anthropic Claude
          </div>
        )}
      </div>
    </div>
  );
}

function TradeSide({ name, gives, align }: { name: string; gives: string[]; align: "left" | "right" }) {
  return (
    <div style={{ textAlign: align }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--am-text)", marginBottom: 6 }}>{name}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: align === "right" ? "flex-end" : "flex-start" }}>
        {gives.length === 0 ? (
          <span style={{ fontSize: 11, color: "var(--am-text-faint)", fontStyle: "italic" }}>—</span>
        ) : gives.map((g, i) => (
          <span key={i} style={{ fontSize: 12, color: "var(--am-text-muted)" }}>{g}</span>
        ))}
      </div>
    </div>
  );
}

function TeamInsightCard({
  team, open, onToggle,
}: {
  team: WeeklyReportTeamInsight;
  open: boolean;
  onToggle: () => void;
}) {
  const data = team.data ?? {};
  const grade = asString(data.overallGrade ?? data.grade);
  const summary = asString(data.summary);
  const insights = asArray<{ category?: string; title?: string; detail?: string }>(data.insights);
  return (
    <div style={{ borderTop: "1px solid var(--am-border)" }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: "100%",
          padding: "12px 12px",
          background: "transparent",
          border: "none",
          color: "var(--am-text)",
          textAlign: "left",
          cursor: "pointer",
          display: "grid",
          gridTemplateColumns: "1fr auto auto",
          gap: 12,
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600 }}>{team.teamName}</span>
        {grade && <Chip strong>Grade · {grade}</Chip>}
        <ChevronDown
          size={16}
          style={{ color: "var(--am-text-muted)", transform: open ? "rotate(180deg)" : "rotate(0)", transition: "transform 200ms ease" }}
        />
      </button>
      {open && (
        <div style={{ padding: "0 12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          {summary && <div style={{ fontSize: 13, color: "var(--am-text-muted)", lineHeight: 1.5 }}>{summary}</div>}
          {insights.slice(0, 6).map((it, i) => (
            <div key={i} style={{ padding: "8px 10px", background: "var(--am-surface-faint)", border: "1px solid var(--am-border)", borderRadius: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                {it.category && <Chip>{asString(it.category)}</Chip>}
                {it.title && <span style={{ fontSize: 12, fontWeight: 600, color: "var(--am-text)" }}>{asString(it.title)}</span>}
              </div>
              {it.detail && <div style={{ fontSize: 12, color: "var(--am-text-muted)", lineHeight: 1.5 }}>{asString(it.detail)}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function tabBtnStyle(active: boolean): React.CSSProperties {
  return {
    padding: "6px 12px",
    borderRadius: 99,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    border: active ? "1px solid var(--am-border-strong)" : "1px solid var(--am-border)",
    background: active ? "var(--am-irid)" : "var(--am-chip)",
    color: active ? "#fff" : "var(--am-text-muted)",
    cursor: "pointer",
    transition: "all 200ms ease",
  };
}

function navBtnStyle(): React.CSSProperties {
  return {
    width: 32, height: 32,
    display: "flex", alignItems: "center", justifyContent: "center",
    borderRadius: 99,
    border: "1px solid var(--am-border)",
    background: "var(--am-surface-faint)",
    color: "var(--am-text-muted)",
    cursor: "pointer",
  };
}
