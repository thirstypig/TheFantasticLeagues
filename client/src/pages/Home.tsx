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
import { fetchJsonApi, API_BASE } from "../api/base";
import type { DigestResponse, RosterAlertPlayer } from "./home/types";
import HistoricalInsightsTab from "./components/HistoricalInsightsTab";
import NewsFeedsPanel from "./components/NewsFeedsPanel";
import MyTeamTodayPanel from "./components/MyTeamTodayPanel";

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
  const [digest, setDigest] = useState<DigestResponse | null>(null);
  const [rosterAlerts, setRosterAlerts] = useState<RosterAlertPlayer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!leagueId) return;
    let canceled = false;
    setLoading(true);
    // Four parallel fetches — standings + activity from PR #135, plus the
    // ported legacy data sources for parity (PR #137):
    //   - league digest (AI weekly summary, power rankings)
    //   - roster status (injured + minors players from /mlb/roster-status)
    Promise.allSettled([
      getSeasonStandings(leagueId),
      getTransactions({ leagueId, take: 6 }),
      fetchJsonApi<DigestResponse>(`${API_BASE}/mlb/league-digest?leagueId=${leagueId}`),
      fetchJsonApi<{ players: RosterAlertPlayer[] }>(
        `${API_BASE}/mlb/roster-status?leagueId=${leagueId}`,
      ),
    ]).then(([standingsRes, activityRes, digestRes, rosterRes]) => {
      if (canceled) return;

      if (standingsRes.status === "fulfilled") {
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
        rows.sort((a, b) => b.totalPoints - a.totalPoints);
        setStandings(rows);
      }

      if (activityRes.status === "fulfilled") {
        setActivity(activityRes.value.transactions ?? []);
      }

      if (digestRes.status === "fulfilled") {
        setDigest(digestRes.value);
      }

      if (rosterRes.status === "fulfilled") {
        // Surface only injured (IL) players in this card. Minors players
        // are intentionally separate; the legacy Home had a separate accord-
        // ion for them. Keep IL-focused for the slim Aurora card.
        const ilPlayers = (rosterRes.value.players ?? []).filter(p => p.isInjured);
        setRosterAlerts(ilPlayers);
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
                  {/* Historical Weekly Insights with prior-week tabs (W18, W17,
                      W16…) so users can navigate past digests. Restored from
                      pre-Aurora pattern; feeds the same digest endpoint with
                      a weekKey query param. */}
                  {leagueId && <HistoricalInsightsTab leagueId={leagueId} />}
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

          {/* WEEKLY DIGEST — AI-generated league summary, ported from
              HomeLegacy. Shows when the digest endpoint has data; gracefully
              hidden when not yet generated for this week. */}
          {digest?.powerRankings && digest.powerRankings.length > 0 && (
            <div style={{ gridColumn: "span 12" }}>
              <Glass>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 12 }}>
                  <div>
                    <SectionLabel>✦ Weekly digest{digest.weekKey ? ` · ${digest.weekKey}` : ""}</SectionLabel>
                    {digest.weekInOneSentence && (
                      <div style={{ fontSize: 16, color: "var(--am-text)", fontFamily: "var(--am-display)", lineHeight: 1.35, maxWidth: 880 }}>
                        {digest.weekInOneSentence}
                      </div>
                    )}
                  </div>
                  {digest.statOfTheWeek && (
                    <Chip strong>STAT · {digest.statOfTheWeek.slice(0, 50)}</Chip>
                  )}
                </div>

                <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
                  {/* Power rankings */}
                  <div>
                    <SectionLabel>Power rankings</SectionLabel>
                    <div>
                      {digest.powerRankings.slice(0, 8).map(pr => (
                        <div
                          key={pr.rank}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "26px 110px 1fr",
                            gap: 10,
                            padding: "7px 0",
                            borderTop: pr.rank > 1 ? "1px solid var(--am-border)" : "none",
                            alignItems: "baseline",
                          }}
                        >
                          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--am-text-faint)", fontVariantNumeric: "tabular-nums" }}>
                            {String(pr.rank).padStart(2, "0")}
                          </div>
                          <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--am-text)" }}>{pr.teamName}</div>
                          <div style={{ fontSize: 11.5, color: "var(--am-text-muted)", lineHeight: 1.45 }}>
                            {pr.commentary}
                            {pr.movement && pr.movement !== "→" && (
                              <span style={{ marginLeft: 6, fontWeight: 600, color: "var(--am-text-faint)" }}>
                                {pr.movement}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Hot/cold + bold prediction */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {digest.hotTeam && (
                      <div style={{ padding: 12, borderRadius: 14, background: "var(--am-surface-faint)", border: "1px solid var(--am-border)" }}>
                        <div style={{ fontSize: 10, color: "var(--am-positive)", fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>HOT TEAM</div>
                        <div style={{ fontSize: 13, fontWeight: 600, fontFamily: "var(--am-display)" }}>{digest.hotTeam.name}</div>
                        <div style={{ fontSize: 11.5, color: "var(--am-text-muted)", marginTop: 4, lineHeight: 1.45 }}>{digest.hotTeam.reason}</div>
                      </div>
                    )}
                    {digest.coldTeam && (
                      <div style={{ padding: 12, borderRadius: 14, background: "var(--am-surface-faint)", border: "1px solid var(--am-border)" }}>
                        <div style={{ fontSize: 10, color: "var(--am-negative)", fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>COLD TEAM</div>
                        <div style={{ fontSize: 13, fontWeight: 600, fontFamily: "var(--am-display)" }}>{digest.coldTeam.name}</div>
                        <div style={{ fontSize: 11.5, color: "var(--am-text-muted)", marginTop: 4, lineHeight: 1.45 }}>{digest.coldTeam.reason}</div>
                      </div>
                    )}
                    {digest.boldPrediction && (
                      <div style={{ padding: 12, borderRadius: 14, background: "var(--am-ai-strip)", border: "1px solid var(--am-border)" }}>
                        <div style={{ fontSize: 10, color: "var(--am-text-faint)", fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>BOLD PREDICTION</div>
                        <div style={{ fontSize: 12, color: "var(--am-text)", lineHeight: 1.5 }}>{digest.boldPrediction}</div>
                      </div>
                    )}
                  </div>
                </div>
              </Glass>
            </div>
          )}

          {/* INJURED LIST — slim 4-up of IL'd roster players, ported from
              HomeLegacy. Hidden when nobody on the league is on IL. */}
          {rosterAlerts.length > 0 && (
            <div style={{ gridColumn: "span 12" }}>
              <Glass>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <SectionLabel>Injured list · {rosterAlerts.length}</SectionLabel>
                  <Chip>League-wide</Chip>
                </div>
                <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
                  {rosterAlerts.slice(0, 8).map(p => (
                    <div
                      key={`${p.mlbId}-${p.playerName}`}
                      style={{
                        padding: 12,
                        borderRadius: 14,
                        background: "var(--am-surface-faint)",
                        border: "1px solid var(--am-border)",
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <Dot color="var(--am-negative)" />
                        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--am-text)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {p.playerName}
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--am-text-muted)" }}>
                        {p.mlbStatus} · {p.position} · {p.mlbTeam}
                      </div>
                      {p.ilInjury && (
                        <div style={{ fontSize: 10.5, color: "var(--am-text-faint)" }}>{p.ilInjury}</div>
                      )}
                    </div>
                  ))}
                </div>
                {rosterAlerts.length > 8 && (
                  <div style={{ marginTop: 8, fontSize: 11, color: "var(--am-text-faint)", textAlign: "center" }}>
                    + {rosterAlerts.length - 8} more
                  </div>
                )}
              </Glass>
            </div>
          )}

          {/* MY TEAM TODAY — daily player activity widget with 10am rollover */}
          {leagueId && (
            <div style={{ gridColumn: "span 6" }}>
              <MyTeamTodayPanel leagueId={leagueId} />
            </div>
          )}

          {/* NEWS FEEDS — Reddit / YouTube / Yahoo / ESPN */}
          <div style={{ gridColumn: "span 6" }}>
            <NewsFeedsPanel />
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
