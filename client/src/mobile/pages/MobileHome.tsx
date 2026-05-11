/*
 * MobileHome — Aurora mobile twin for `/`.
 *
 * Mirrors the data desktop Home (`pages/Home.tsx`) reads — same hooks,
 * same APIs, no parallel fetch path. The narrow viewport gets a denser
 * vertical layout: hero card → AI cards (proposed trades + board) →
 * standings top-5 → recent activity.
 *
 * Sections from the design canvas that don't have a backing API yet
 * (matchup strip via getMatchup, AI recommendations via
 * getRecommendations) are intentionally NOT rendered as placeholders.
 * Active trade proposals + recent board cards substitute as the
 * "✦ For you" feed since they are the closest authentic signal we
 * have for "things that need your attention".
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { useLeague } from "../../contexts/LeagueContext";
import { getSeasonStandings } from "../../api";
import { getTransactions, type TransactionEvent } from "../../features/transactions/api";
import { getTrades, type TradeProposal } from "../../features/trades/api";
import { getBoardCards, type BoardCard } from "../../features/board/api";
import { MobileTopbar } from "../MobileTopbar";
import {
  MCard,
  MIridRing,
  MIridText,
  MLabel,
  MSection,
  MAICard,
  MChip,
} from "../atoms/MCard";
import { MSparkline } from "../atoms/MSparkline";
import { Glyph } from "../atoms/Glyph";

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

function timeAgo(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function activityText(t: TransactionEvent): string {
  const team = t.ogbaTeamName ?? t.team?.name ?? "—";
  const player = t.player?.name ?? t.playerAliasRaw ?? "player";
  const kind = (t.transactionType ?? t.type ?? "").toUpperCase();
  if (kind.includes("ADD")) return `${team} added ${player}`;
  if (kind.includes("DROP")) return `${team} dropped ${player}`;
  if (kind.includes("TRADE")) return `${team} traded`;
  if (kind.includes("IL_STASH")) return `${team} placed ${player} on IL`;
  if (kind.includes("IL_ACTIVATE")) return `${team} activated ${player} from IL`;
  return t.transactionRaw ?? `${team} · ${kind}`;
}

function activityChip(t: TransactionEvent): string {
  const kind = (t.transactionType ?? t.type ?? "").toUpperCase();
  if (kind.includes("ADD")) return "Add";
  if (kind.includes("DROP")) return "Drop";
  if (kind.includes("TRADE")) return "Trade";
  if (kind.includes("IL")) return "IL";
  return "Move";
}

export function MobileHome() {
  const nav = useNavigate();
  const { me } = useAuth();
  const { leagueId, currentLeagueName, currentSeason, myTeamId, myTeamCode } = useLeague();

  const [standings, setStandings] = useState<StandingsRow[]>([]);
  const [activity, setActivity] = useState<TransactionEvent[]>([]);
  const [activeTrades, setActiveTrades] = useState<TradeProposal[]>([]);
  const [boardCards, setBoardCards] = useState<BoardCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!leagueId) return;
    let canceled = false;
    setLoading(true);
    Promise.allSettled([
      getSeasonStandings(leagueId),
      getTransactions({ leagueId, take: 6 }),
      getTrades(leagueId, { status: "PROPOSED", limit: 4 }),
      getBoardCards({ leagueId, limit: 3 }),
    ]).then(([standingsRes, activityRes, tradesRes, boardRes]) => {
      if (canceled) return;
      if (standingsRes.status === "fulfilled") {
        const periodIds = standingsRes.value.periodIds ?? [];
        const rows = (standingsRes.value.rows ?? []).map((row): StandingsRow => {
          const r = row as Record<string, unknown>;
          const periodPointsRaw = r.periodPoints;
          const periodPoints = Array.isArray(periodPointsRaw) && periodPointsRaw.length
            ? periodIds.map((_pid, i) => toNum(periodPointsRaw[i]))
            : periodIds.map((pid) => toNum(r[`P${pid}`]));
          return {
            teamId: Number(r.teamId),
            teamName: String(r.teamName ?? ""),
            teamCode: typeof r.teamCode === "string" ? r.teamCode : undefined,
            owner: typeof r.owner === "string" ? r.owner : undefined,
            totalPoints: sumNums(periodPoints),
            periodPoints,
          };
        });
        rows.sort((a, b) => b.totalPoints - a.totalPoints);
        setStandings(rows);
      }
      if (activityRes.status === "fulfilled") {
        setActivity((activityRes.value.transactions ?? []).slice(0, 4));
      }
      if (tradesRes.status === "fulfilled") {
        setActiveTrades((tradesRes.value.trades ?? []).filter((t) => t.status === "PROPOSED"));
      }
      if (boardRes.status === "fulfilled") {
        setBoardCards(boardRes.value.items ?? []);
      }
    }).finally(() => {
      if (!canceled) setLoading(false);
    });
    return () => {
      canceled = true;
    };
  }, [leagueId]);

  const myStanding = useMemo(() => {
    if (!myTeamId) return null;
    const idx = standings.findIndex((s) => s.teamId === myTeamId);
    return idx >= 0 ? { row: standings[idx], rank: idx + 1 } : null;
  }, [standings, myTeamId]);

  const heroSparklineData = useMemo(() => {
    if (!myStanding) return [] as number[];
    return myStanding.row.periodPoints.length
      ? myStanding.row.periodPoints
      : [0, 0];
  }, [myStanding]);

  const standingsTop5 = useMemo(() => standings.slice(0, 5), [standings]);

  const aiCards: Array<{ key: string; icon: string; title: string; body: string; cta: string; onClick: () => void }> = useMemo(() => {
    const cards: Array<{ key: string; icon: string; title: string; body: string; cta: string; onClick: () => void }> = [];
    for (const trade of activeTrades.slice(0, 2)) {
      const proposer = trade.proposingTeam?.name ?? trade.proposer?.name ?? "Someone";
      cards.push({
        key: `trade-${trade.id}`,
        icon: "↺",
        title: `Trade proposal from ${proposer}`,
        body: `${trade.items?.length ?? 0} player${(trade.items?.length ?? 0) === 1 ? "" : "s"} · awaiting your review`,
        cta: "Review",
        onClick: () => nav("/activity"),
      });
    }
    for (const card of boardCards.slice(0, 2 - cards.length)) {
      cards.push({
        key: `board-${card.id}`,
        icon: "✦",
        title: card.title,
        body: card.user?.name ? `${card.user.name} · ${timeAgo(card.createdAt)}` : timeAgo(card.createdAt),
        cta: "Open",
        onClick: () => nav("/board"),
      });
    }
    return cards;
  }, [activeTrades, boardCards, nav]);

  return (
    <div data-testid="mobile-home">
      <MobileTopbar
        title={currentLeagueName || "Home"}
        subtitle={currentSeason ? `${currentSeason} · ${me?.user?.name ?? "Welcome"}` : me?.user?.name ?? "Welcome"}
        leading={<Glyph kind="bell" size={20} />}
        trailing={<Glyph kind="moreDots" size={20} />}
      />

      {/* Hero card */}
      <div style={{ padding: "0 14px 12px" }}>
        <MIridRing>
          <div style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <MLabel>
                  Your team{myStanding ? ` · ${ordinal(myStanding.rank)} of ${standings.length}` : ""}
                </MLabel>
                <div
                  style={{
                    fontFamily: "var(--am-display)",
                    fontSize: 22,
                    lineHeight: 1.05,
                    marginTop: 4,
                    color: "var(--am-text)",
                    letterSpacing: -0.4,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {myStanding?.row.teamName ?? me?.user?.name ?? "Welcome"}
                </div>
                <div style={{ fontSize: 11, color: "var(--am-text-muted)", marginTop: 3 }}>
                  {myStanding?.row.owner ?? me?.user?.name ?? ""}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                {myStanding ? (
                  <MIridText size={32} weight={500}>
                    {myStanding.row.totalPoints.toFixed(1)}
                  </MIridText>
                ) : (
                  <span style={{ fontSize: 11, color: "var(--am-text-faint)" }}>—</span>
                )}
              </div>
            </div>
            {heroSparklineData.length > 1 && (
              <div style={{ marginTop: 10 }}>
                <MSparkline data={heroSparklineData} w={320} h={36} />
              </div>
            )}
            <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
              {myTeamCode && (
                <Link
                  to={`/teams/${myTeamCode}`}
                  style={{ textDecoration: "none" }}
                  data-testid="mobile-home-view-roster"
                >
                  <MChip strong>View roster →</MChip>
                </Link>
              )}
            </div>
          </div>
        </MIridRing>
      </div>

      {aiCards.length > 0 && (
        <MSection
          title="✦ For you"
          action="See all"
          onActionClick={() => nav("/activity")}
          style={{ padding: "0 14px 12px" }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {aiCards.map((c) => (
              <MAICard key={c.key} icon={c.icon} title={c.title} body={c.body} cta={c.cta} onCtaClick={c.onClick} />
            ))}
          </div>
        </MSection>
      )}

      <MSection
        title="Standings · top 5"
        action="Full board"
        onActionClick={() => nav("/season")}
        style={{ padding: "0 14px 12px" }}
      >
        <MCard padded={false}>
          {loading && !standings.length ? (
            <div style={{ padding: "16px 14px", color: "var(--am-text-muted)", fontSize: 12 }}>
              Loading standings…
            </div>
          ) : standingsTop5.length ? (
            standingsTop5.map((t, i) => {
              const isMe = !!myTeamId && t.teamId === myTeamId;
              return (
                <div
                  key={t.teamId}
                  data-testid="mobile-home-standings-row"
                  data-team-code={t.teamCode}
                  onClick={() => t.teamCode && nav(`/teams/${t.teamCode}`)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "20px 1fr auto",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 14px",
                    borderTop: i > 0 ? "1px solid var(--am-border)" : "none",
                    background: isMe ? "var(--am-chip)" : "transparent",
                    cursor: t.teamCode ? "pointer" : "default",
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--am-text-faint)",
                      fontWeight: 700,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {i + 1}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12.5,
                        color: "var(--am-text)",
                        fontWeight: isMe ? 700 : 500,
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
                    {t.owner && (
                      <div style={{ fontSize: 10, color: "var(--am-text-faint)" }}>{t.owner}</div>
                    )}
                  </div>
                  <div>
                    <MIridText size={14} weight={700}>
                      {t.totalPoints.toFixed(1)}
                    </MIridText>
                  </div>
                </div>
              );
            })
          ) : (
            <div style={{ padding: "16px 14px", color: "var(--am-text-muted)", fontSize: 12 }}>
              No standings available yet.
            </div>
          )}
        </MCard>
      </MSection>

      <MSection
        title="League activity"
        action="See all"
        onActionClick={() => nav("/activity")}
        style={{ padding: "0 14px 12px" }}
      >
        <MCard padded={false}>
          {loading && !activity.length ? (
            <div style={{ padding: "16px 14px", color: "var(--am-text-muted)", fontSize: 12 }}>
              Loading activity…
            </div>
          ) : activity.length ? (
            activity.map((t, i) => (
              <div
                key={t.id}
                data-testid="mobile-home-activity-row"
                style={{
                  display: "grid",
                  gridTemplateColumns: "44px 1fr",
                  gap: 10,
                  padding: "10px 14px",
                  borderTop: i > 0 ? "1px solid var(--am-border)" : "none",
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--am-text-faint)",
                    fontWeight: 600,
                    fontVariantNumeric: "tabular-nums",
                    paddingTop: 1,
                  }}
                >
                  {timeAgo(t.processedAt ?? t.submittedAt ?? t.createdAt)}
                </div>
                <div>
                  <span style={{ display: "inline-block", marginRight: 6 }}>
                    <MChip strong>{activityChip(t)}</MChip>
                  </span>
                  <span style={{ fontSize: 12, color: "var(--am-text-muted)", lineHeight: 1.4 }}>
                    {activityText(t)}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div style={{ padding: "16px 14px", color: "var(--am-text-muted)", fontSize: 12 }}>
              No recent activity.
            </div>
          )}
        </MCard>
      </MSection>

      {/* Quick links */}
      <div style={{ padding: "0 14px 16px" }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 1.2,
            textTransform: "uppercase",
            color: "var(--am-text-faint)",
            marginBottom: 8,
            paddingLeft: 2,
          }}
        >
          League
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
          }}
        >
          {[
            { label: "Browse players", sub: "Search and filter", to: "/players" },
            { label: "Activity", sub: "Recent transactions", to: "/activity" },
            { label: "Board", sub: "Manager chatter", to: "/board" },
            { label: "AI Hub", sub: "Insights + digest", to: "/ai" },
            ...(myTeamCode ? [{ label: "Wire list", sub: "Waiver picks", to: `/teams/${myTeamCode}/wire-list` }] : []),
            { label: "Standings", sub: "Full board", to: "/season" },
          ].map((item) => (
            <Link
              key={item.to}
              to={item.to}
              style={{ textDecoration: "none" }}
              data-testid="mobile-home-quick-link"
            >
              <div
                style={{
                  background: "var(--am-surface)",
                  border: "1px solid var(--am-border)",
                  borderRadius: 12,
                  padding: "12px 14px",
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--am-text)",
                    lineHeight: 1.2,
                  }}
                >
                  {item.label}
                </div>
                <div
                  style={{
                    fontSize: 10.5,
                    color: "var(--am-text-faint)",
                    marginTop: 3,
                  }}
                >
                  {item.sub}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
