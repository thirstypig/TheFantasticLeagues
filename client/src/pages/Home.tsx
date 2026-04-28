/*
 * Home — Aurora pilot (PR #135).
 *
 * Single-screen pilot of the Aurora System design handoff. Bento grid
 * over the Aurora atoms (Glass, IridescentRing, AIStrip, IridText,
 * Sparkline) inside an `.aurora-theme` wrapper so tokens are scoped
 * locally — the rest of the app continues to render with the existing
 * Liquid Glass tokens.
 *
 * Data sources (all real, no mocks):
 *   - useLeague(): leagueId, currentLeagueName, myTeamId/Code
 *   - getSeasonStandings(leagueId): top-of-table standings
 *   - getTransactions({leagueId, take: 6}): recent league activity
 *   - useAuth(): user identity for the hero "your team" framing
 *
 * What's intentionally NOT here (vs the prior 1900-line HomeLegacy.tsx):
 *   - Weekly digest, scores tile, news feed, YouTube embed, depth charts
 *   These are deferred until Aurora rolls out further. HomeLegacy.tsx
 *   is preserved at /home-classic as a side-by-side comparison.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AmbientBg, Glass, IridescentRing, IridText, Sparkline, AIStrip,
  Chip, SectionLabel, Dot,
} from "../components/aurora/atoms";
import "../components/aurora/aurora.css";
import { useAuth } from "../auth/AuthProvider";
import { useLeague } from "../contexts/LeagueContext";
import { getSeasonStandings } from "../api";
import { getTransactions, type TransactionEvent } from "../features/transactions/api";

interface StandingsRow {
  teamId: number;
  teamName: string;
  teamCode?: string;
  owner?: string;
  totalPoints: number;
  periodPoints: number[];
}

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function sumNums(arr: unknown[]): number {
  return (arr ?? []).reduce<number>((s, v) => s + toNum(v), 0);
}

export default function Home() {
  const { me } = useAuth();
  const { leagueId, currentLeagueName, currentSeason, myTeamId, myTeamCode } = useLeague();

  const [standings, setStandings] = useState<StandingsRow[]>([]);
  const [activity, setActivity] = useState<TransactionEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!leagueId) return;
    let canceled = false;
    setLoading(true);
    Promise.allSettled([
      getSeasonStandings(leagueId),
      getTransactions({ leagueId, take: 6 }),
    ]).then(([standingsRes, activityRes]) => {
      if (canceled) return;

      if (standingsRes.status === "fulfilled") {
        // Normalize the standings response shape (rows may carry P{n}
        // period-point columns or a periodPoints array; sum either way).
        const periodIds = standingsRes.value.periodIds ?? [];
        const rows = (standingsRes.value.rows ?? []).map((row: any): StandingsRow => {
          const periodPoints = Array.isArray(row.periodPoints) && row.periodPoints.length
            ? periodIds.map((_pid: number, i: number) => toNum(row.periodPoints[i]))
            : periodIds.map((pid: number) => toNum(row[`P${pid}`]));
          return {
            teamId: row.teamId,
            teamName: row.teamName,
            teamCode: row.teamCode,
            owner: row.owner,
            totalPoints: sumNums(periodPoints),
            periodPoints,
          };
        });
        // Sort descending by total points
        rows.sort((a, b) => b.totalPoints - a.totalPoints);
        setStandings(rows);
      }

      if (activityRes.status === "fulfilled") {
        setActivity(activityRes.value.transactions ?? []);
      }
    }).finally(() => { if (!canceled) setLoading(false); });

    return () => { canceled = true; };
  }, [leagueId]);

  // Derived: my team's standings row (rank, points, sparkline trend).
  const myStanding = useMemo(() => {
    if (!myTeamId) return null;
    const idx = standings.findIndex(s => s.teamId === myTeamId);
    return idx >= 0 ? { row: standings[idx], rank: idx + 1 } : null;
  }, [standings, myTeamId]);

  // Time formatter for activity rows ("3h ago" style).
  const timeAgo = (iso?: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    const ms = Date.now() - d.getTime();
    const min = Math.floor(ms / 60_000);
    if (min < 60) return `${min}m`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h`;
    return `${Math.floor(hr / 24)}d`;
  };

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
          {/* HERO — your team focus card */}
          <div style={{ gridColumn: "span 8" }}>
            <IridescentRing>
              <Glass strong style={{ borderRadius: 25, padding: 22 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <SectionLabel>
                      Your team{myStanding ? ` · ${ordinal(myStanding.rank)} of ${standings.length}` : ""}
                    </SectionLabel>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
                      <div style={{ fontFamily: "var(--am-display)", fontSize: 44, lineHeight: 1, letterSpacing: -0.5 }}>
                        {myStanding?.row.teamName ?? me?.user?.name ?? "Welcome"}
                      </div>
                      {myStanding && (
                        <IridText size={36}>{myStanding.row.totalPoints.toFixed(1)}</IridText>
                      )}
                    </div>
                    <div style={{ marginTop: 6, color: "var(--am-text-muted)", fontSize: 13 }}>
                      {currentLeagueName}{currentSeason ? ` · ${currentSeason}` : ""}
                      {myStanding?.row.owner ? ` · ${myStanding.row.owner}` : ""}
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
                      <Chip>Roto</Chip>
                      <Chip>Auction keeper</Chip>
                      {myTeamCode && (
                        <Link to={`/teams/${myTeamCode}`} style={{ textDecoration: "none" }}>
                          <Chip strong style={{ cursor: "pointer" }}>View roster →</Chip>
                        </Link>
                      )}
                    </div>
                  </div>
                  {myStanding && myStanding.row.periodPoints.length > 1 && (
                    <div style={{ textAlign: "right" }}>
                      <SectionLabel>Trend · {myStanding.row.periodPoints.length} periods</SectionLabel>
                      <div style={{ marginTop: 4 }}>
                        <Sparkline data={myStanding.row.periodPoints} w={200} h={56} />
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ marginTop: 14 }}>
                  <AIStrip
                    subtitle="Personalized to your roster"
                    items={[
                      {
                        icon: "✦",
                        title: "AI insights are running",
                        body: "Weekly digest, lineup recommendations, and trade suggestions appear here when ready.",
                        cta: "Open AI Hub",
                      },
                    ]}
                  />
                </div>
              </Glass>
            </IridescentRing>
          </div>

          {/* QUICK STATS — pinned next to hero */}
          <div style={{ gridColumn: "span 4" }}>
            <Glass strong style={{ height: "100%" }}>
              <SectionLabel>League snapshot</SectionLabel>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 6 }}>
                {[
                  { k: "Teams", v: String(standings.length || "—") },
                  { k: "Periods", v: String(myStanding?.row.periodPoints.length ?? "—") },
                  { k: "Your rank", v: myStanding ? ordinal(myStanding.rank) : "—" },
                  { k: "Your points", v: myStanding ? myStanding.row.totalPoints.toFixed(1) : "—" },
                ].map(s => (
                  <div
                    key={s.k}
                    style={{
                      padding: "12px 12px",
                      background: "var(--am-surface-faint)",
                      border: "1px solid var(--am-border)",
                      borderRadius: 14,
                    }}
                  >
                    <div style={{ fontSize: 10, color: "var(--am-text-faint)", letterSpacing: 1, fontWeight: 600 }}>
                      {s.k.toUpperCase()}
                    </div>
                    <div style={{ marginTop: 4 }}>
                      <IridText size={22}>{s.v}</IridText>
                    </div>
                  </div>
                ))}
              </div>
            </Glass>
          </div>

          {/* STANDINGS — top of the table */}
          <div style={{ gridColumn: "span 7" }}>
            <Glass>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <SectionLabel>Standings · roto points</SectionLabel>
                <Link to="/season" style={{ textDecoration: "none" }}>
                  <Chip>View full standings →</Chip>
                </Link>
              </div>
              {loading && <div style={{ padding: 24, color: "var(--am-text-faint)", fontSize: 12 }}>Loading…</div>}
              {!loading && standings.length === 0 && (
                <div style={{ padding: 24, color: "var(--am-text-faint)", fontSize: 12 }}>
                  No standings yet.
                </div>
              )}
              <div style={{ marginTop: 6 }}>
                {standings.slice(0, 7).map((t, i) => {
                  const rank = i + 1;
                  const isMine = t.teamId === myTeamId;
                  return (
                    <Link
                      key={t.teamId}
                      to={t.teamCode ? `/teams/${t.teamCode}` : "/season"}
                      style={{
                        textDecoration: "none",
                        color: "inherit",
                        display: "grid",
                        gridTemplateColumns: "24px 1fr auto",
                        alignItems: "center",
                        gap: 12,
                        padding: "9px 4px",
                        borderTop: i > 0 ? "1px solid var(--am-border)" : "none",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: "var(--am-text-faint)",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {String(rank).padStart(2, "0")}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                        <div
                          style={{
                            width: 26,
                            height: 26,
                            borderRadius: 8,
                            flexShrink: 0,
                            background: rank === 1 ? "var(--am-irid)" : "var(--am-chip-strong)",
                            display: "grid",
                            placeItems: "center",
                            fontSize: 10,
                            fontWeight: 700,
                            color: rank === 1 ? "#fff" : "var(--am-text)",
                            border: "1px solid var(--am-border)",
                          }}
                        >
                          {(t.teamCode || t.teamName).slice(0, 3).toUpperCase()}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 500,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            {t.teamName}
                            {isMine && <Chip strong style={{ fontSize: 9, padding: "1px 6px" }}>You</Chip>}
                          </div>
                          {t.owner && (
                            <div style={{ fontSize: 11, color: "var(--am-text-faint)" }}>{t.owner}</div>
                          )}
                        </div>
                      </div>
                      <div
                        style={{
                          fontVariantNumeric: "tabular-nums",
                          fontSize: 14,
                          fontWeight: 500,
                        }}
                      >
                        {t.totalPoints.toFixed(1)}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </Glass>
          </div>

          {/* ACTIVITY — recent transactions */}
          <div style={{ gridColumn: "span 5" }}>
            <Glass>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <SectionLabel>League activity</SectionLabel>
                <Link to="/activity" style={{ textDecoration: "none" }}>
                  <Chip>All →</Chip>
                </Link>
              </div>
              {loading && <div style={{ padding: 24, color: "var(--am-text-faint)", fontSize: 12 }}>Loading…</div>}
              {!loading && activity.length === 0 && (
                <div style={{ padding: 24, color: "var(--am-text-faint)", fontSize: 12 }}>
                  No recent activity.
                </div>
              )}
              <div style={{ marginTop: 6 }}>
                {activity.map((a, i) => {
                  const ago = timeAgo((a as any).effectiveDate ?? (a as any).createdAt);
                  const type = String((a as any).transactionType ?? (a as any).type ?? "Move");
                  const text =
                    (a as any).playerAliasRaw ??
                    (a as any).transactionRaw ??
                    [type, (a as any).ogbaTeamName].filter(Boolean).join(" · ");
                  return (
                    <div
                      key={(a as any).id ?? i}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "44px 70px 1fr",
                        alignItems: "center",
                        gap: 12,
                        padding: "8px 4px",
                        borderTop: i > 0 ? "1px solid var(--am-border)" : "none",
                      }}
                    >
                      <div style={{ fontSize: 11, color: "var(--am-text-faint)", fontVariantNumeric: "tabular-nums" }}>
                        {ago}
                      </div>
                      <Chip strong>{type}</Chip>
                      <div style={{ fontSize: 12.5, color: "var(--am-text)", lineHeight: 1.4 }}>
                        {String(text).slice(0, 100)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Glass>
          </div>

          {/* CTAs — bottom row of quick links */}
          <div style={{ gridColumn: "span 12" }}>
            <Glass>
              <SectionLabel>Quick links</SectionLabel>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginTop: 6 }}>
                {[
                  { to: "/players", label: "Browse players", body: "Search the full pool" },
                  { to: "/teams", label: "Teams", body: "All league teams" },
                  { to: "/activity", label: "Activity", body: "Trades, adds, drops" },
                  { to: "/ai", label: "AI Hub", body: "Insights & advice" },
                ].map(l => (
                  <Link
                    key={l.to}
                    to={l.to}
                    style={{
                      textDecoration: "none",
                      color: "inherit",
                      padding: "14px 14px",
                      background: "var(--am-surface-faint)",
                      border: "1px solid var(--am-border)",
                      borderRadius: 14,
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                    }}
                  >
                    <div style={{ fontFamily: "var(--am-display)", fontSize: 16, color: "var(--am-text)" }}>
                      {l.label}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--am-text-muted)" }}>{l.body}</div>
                  </Link>
                ))}
              </div>
            </Glass>
          </div>

          {/* Legacy escape hatch */}
          <div style={{ gridColumn: "span 12", textAlign: "center", marginTop: 4 }}>
            <Link
              to="/home-classic"
              style={{
                fontSize: 11,
                color: "var(--am-text-faint)",
                textDecoration: "none",
                letterSpacing: 0.5,
              }}
            >
              <Dot color="var(--am-text-faint)" /> Aurora pilot · view classic Home →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
