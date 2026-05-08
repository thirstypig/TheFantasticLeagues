/*
 * Home — Aurora pilot (PR #135).
 *
 * Single-screen pilot of the Aurora System design handoff. Bento grid
 * over the Aurora atoms (Glass, IridescentRing, IridText) inside an
 * `.aurora-theme` wrapper so tokens are scoped
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
  AmbientBg, Glass, IridescentRing, IridText,
  Chip, SectionLabel, Dot,
} from "../components/aurora/atoms";
import "../components/aurora/aurora.css";
import { useAuth } from "../auth/AuthProvider";
import { useLeague } from "../contexts/LeagueContext";
import { getSeasonStandings } from "../api";
import {
  getActivePeriod,
  getAddEntries,
  getDropEntries,
  type WaiverPeriod,
} from "../features/wire-list/api";
import { getTransactions, type TransactionEvent } from "../features/transactions/api";
import { cancelTrade, getTrades, type TradeProposal } from "../features/trades/api";
import { getBoardCards, type BoardCard } from "../features/board/api";
import { fetchJsonApi, API_BASE } from "../api/base";
import type { RosterAlertPlayer } from "./home/types";
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
  const [activeTrades, setActiveTrades] = useState<TradeProposal[]>([]);
  const [rosterAlerts, setRosterAlerts] = useState<RosterAlertPlayer[]>([]);
  const [boardCards, setBoardCards] = useState<BoardCard[]>([]);
  const [wirePeriod, setWirePeriod] = useState<WaiverPeriod | null>(null);
  const [wireAddCount, setWireAddCount] = useState(0);
  const [wireDropCount, setWireDropCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [standingsMode, setStandingsMode] = useState<"current" | "full">("current");

  useEffect(() => {
    if (!leagueId) return;
    let canceled = false;
    setLoading(true);
    // Standings + activity from PR #135, plus roster status for IL alerts.
    Promise.allSettled([
      getSeasonStandings(leagueId),
      getTransactions({ leagueId, take: 6 }),
      // Home only renders the first 3 PROPOSED trades — push the filter
      // to the server so we don't drag the league's full trade history
      // across the wire (todo #167.1).
      getTrades(leagueId, { status: "PROPOSED", limit: 10 }),
      getBoardCards({ leagueId, limit: 3 }),
      fetchJsonApi<{ players: RosterAlertPlayer[] }>(
        `${API_BASE}/mlb/roster-status?leagueId=${leagueId}`,
      ),
    ]).then(([standingsRes, activityRes, tradesRes, boardRes, rosterRes]) => {
      if (canceled) return;

      if (standingsRes.status === "fulfilled") {
        const periodIds = standingsRes.value.periodIds ?? [];
        // Standings rows are `Record<string, unknown>` at the API boundary
        // (the server returns dynamic `Pn` columns plus an optional
        // `periodPoints` array). Narrow each field as we extract it.
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
        setActivity(activityRes.value.transactions ?? []);
      }

      if (tradesRes.status === "fulfilled") {
        // Server already filters to PROPOSED — keep the defensive filter
        // in case an older server returns mixed statuses.
        setActiveTrades((tradesRes.value.trades ?? []).filter(t => t.status === "PROPOSED"));
      }

      if (boardRes.status === "fulfilled") {
        setBoardCards(boardRes.value.items ?? []);
      }

      if (rosterRes.status === "fulfilled") {
        // Surface only injured (IL) players in this card. Minors players
        // are intentionally separate; the legacy Home had a separate accord-
        // ion for them. Keep IL-focused for the slim Aurora card.
        const ilPlayers = (rosterRes.value.players ?? []).filter(p => p.isInjured);
        setRosterAlerts(ilPlayers);
      }
    }).finally(() => { if (!canceled) setLoading(false); });

    // Wire List: fetch active period + the user's add/drop counts in
    // parallel. Soft-fails — the banner just hides on error.
    if (myTeamId) {
      getActivePeriod(leagueId).then(async ({ period }) => {
        if (canceled) return;
        if (!period) {
          setWirePeriod(null);
          return;
        }
        setWirePeriod(period);
        const [adds, drops] = await Promise.allSettled([
          getAddEntries(period.id, myTeamId),
          getDropEntries(period.id, myTeamId),
        ]);
        if (canceled) return;
        setWireAddCount(adds.status === "fulfilled" ? adds.value.entries.length : 0);
        setWireDropCount(drops.status === "fulfilled" ? drops.value.entries.length : 0);
      }).catch(() => { if (!canceled) setWirePeriod(null); });
    }

    return () => { canceled = true; };
  }, [leagueId, myTeamId]);

  // Derived: my team's standings row (rank, points).
  const myStanding = useMemo(() => {
    if (!myTeamId) return null;
    const idx = standings.findIndex(s => s.teamId === myTeamId);
    return idx >= 0 ? { row: standings[idx], rank: idx + 1 } : null;
  }, [standings, myTeamId]);
  const currentPeriodIndex = useMemo(() => {
    const maxLen = standings.reduce((acc, s) => Math.max(acc, s.periodPoints.length), 0);
    return Math.max(0, maxLen - 1);
  }, [standings]);
  const visibleStandings = useMemo(() => {
    const rows = standings.map((row) => ({
      ...row,
      displayPoints: standingsMode === "current"
        ? toNum(row.periodPoints[currentPeriodIndex])
        : row.totalPoints,
    }));
    rows.sort((a, b) => b.displayPoints - a.displayPoints || a.teamName.localeCompare(b.teamName));
    return rows;
  }, [currentPeriodIndex, standings, standingsMode]);

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

  const heroCard = (
    <IridescentRing>
      <Glass strong style={{ borderRadius: 25, padding: 22 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <SectionLabel>
              Your team{myStanding ? ` · ${ordinal(myStanding.rank)} of ${standings.length}` : ""}
            </SectionLabel>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
              <div style={{ fontFamily: "var(--am-display)", fontSize: 32, lineHeight: 1.05 }}>
                {myStanding?.row.teamName ?? me?.user?.name ?? "Welcome"}
              </div>
              {myStanding && (
                <IridText size={28}>{myStanding.row.totalPoints.toFixed(1)}</IridText>
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
        </div>
      </Glass>
    </IridescentRing>
  );

  const wirePeriodCard = wirePeriod && myTeamCode ? (
    <Glass>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <div>
          <SectionLabel>
            Waiver Wire · {wirePeriod.status === "PENDING" ? "open" : wirePeriod.status.toLowerCase()}
          </SectionLabel>
          <div style={{ fontFamily: "var(--am-display)", fontSize: 18, marginTop: 4 }}>
            {wirePeriod.status === "PENDING"
              ? `Locks ${new Date(wirePeriod.deadlineAt).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
              : wirePeriod.status === "LOCKED"
              ? "Locked — commissioner is processing outcomes"
              : "Processed"}
          </div>
        </div>
        <Link to={`/teams/${myTeamCode}/wire-list`} style={{ textDecoration: "none" }}>
          <Chip strong style={{ cursor: "pointer" }}>Open list →</Chip>
        </Link>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
        <Chip>{wireAddCount} {wireAddCount === 1 ? "Add" : "Adds"}</Chip>
        <Chip>{wireDropCount} {wireDropCount === 1 ? "Drop" : "Drops"}</Chip>
        {wireAddCount > wireDropCount && wirePeriod.status === "PENDING" && (
          <Chip color="#fbbf24">⚠ More Adds than Drops</Chip>
        )}
      </div>
    </Glass>
  ) : null;

  const standingsCard = (
    <Glass>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <SectionLabel>{standingsMode === "current" ? `Current period standings · P${currentPeriodIndex + 1}` : "Full standings · all periods"}</SectionLabel>
        <Link to="/season" style={{ textDecoration: "none" }}>
          <Chip>View full standings →</Chip>
        </Link>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
        {(["current", "full"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setStandingsMode(mode)}
            style={{
              borderRadius: 99,
              border: `1px solid ${standingsMode === mode ? "var(--am-border-strong)" : "var(--am-border)"}`,
              background: standingsMode === mode ? "var(--am-chip-strong)" : "var(--am-chip)",
              color: standingsMode === mode ? "var(--am-text)" : "var(--am-text-muted)",
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 700,
              padding: "5px 10px",
            }}
          >
            {mode === "current" ? "Current period" : "Full season"}
          </button>
        ))}
      </div>
      {loading && <div style={{ padding: 24, color: "var(--am-text-faint)", fontSize: 12 }}>Loading…</div>}
      {!loading && standings.length === 0 && (
        <div style={{ padding: 24, color: "var(--am-text-faint)", fontSize: 12 }}>
          No standings yet.
        </div>
      )}
      <div style={{ marginTop: 6 }}>
        {visibleStandings.map((t, i) => {
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
                {t.displayPoints.toFixed(1)}
              </div>
            </Link>
          );
        })}
      </div>
    </Glass>
  );

  const activityCard = (
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
          // Server-augmented fields (`effectiveDate`, `createdAt`,
          // `transactionType`) now live on the canonical `TransactionEvent`
          // type — todo #121 hoisted them out of this local intersection
          // cast and into the type definition itself.
          const ago = timeAgo(a.effectiveDate ?? a.createdAt);
          const type = String(a.transactionType ?? a.type ?? "Move");
          const text =
            a.playerAliasRaw ??
            a.transactionRaw ??
            [type, a.ogbaTeamName].filter(Boolean).join(" · ");
          const fantasyTeamName = a.ogbaTeamName ?? a.team?.name;
          return (
            <div
              key={a.id ?? i}
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
              <div style={{ fontSize: 12.5, color: "var(--am-text)", lineHeight: 1.4, minWidth: 0 }}>
                {fantasyTeamName && (
                  <span style={{ display: "block", fontSize: 10.5, color: "var(--am-text-faint)", fontWeight: 700 }}>
                    {fantasyTeamName}
                  </span>
                )}
                <span>{String(text).slice(0, 100)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </Glass>
  );

  const tradeProposalCard = activeTrades.length > 0 ? (
    <Glass>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <SectionLabel>Pending trade proposals · {activeTrades.length}</SectionLabel>
        <Link to="/activity?tab=trades" style={{ textDecoration: "none" }}>
          <Chip>Open trades →</Chip>
        </Link>
      </div>
      <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
        {activeTrades.slice(0, 3).map((trade) => {
          const isProposer = trade.proposingTeamId === myTeamId || trade.proposerId === myTeamId;
          return (
            <div
              key={trade.id}
              style={{
                borderTop: "1px solid var(--am-border)",
                paddingTop: 8,
                display: "grid",
                gap: 6,
              }}
            >
              <div style={{ fontSize: 12.5, color: "var(--am-text)", lineHeight: 1.35 }}>
                <strong>{trade.proposingTeam?.name ?? "Proposer"}</strong>
                {" proposed a trade with "}
                <strong>{trade.acceptingTeam?.name ?? "Counterparty"}</strong>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, color: "var(--am-text-faint)" }}>
                  {new Date(trade.createdAt).toLocaleDateString()}
                </span>
                {isProposer && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (!confirm("Withdraw this trade proposal?")) return;
                      await cancelTrade(trade.id);
                      setActiveTrades((current) => current.filter((t) => t.id !== trade.id));
                    }}
                    style={{
                      borderRadius: 99,
                      border: "1px solid var(--am-border)",
                      background: "var(--am-chip)",
                      color: "var(--am-text-muted)",
                      cursor: "pointer",
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "5px 10px",
                    }}
                  >
                    Withdraw
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Glass>
  ) : null;

  const boardCard = (
    <Glass>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <SectionLabel>League board</SectionLabel>
        <Link to="/board" style={{ textDecoration: "none" }}>
          <Chip>Open board →</Chip>
        </Link>
      </div>
      <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
        {boardCards.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--am-text-muted)", padding: "10px 0" }}>
            No recent board posts.
          </div>
        ) : boardCards.slice(0, 3).map((card) => (
          <Link
            key={card.id}
            to="/board"
            style={{
              textDecoration: "none",
              color: "inherit",
              display: "block",
              paddingTop: 8,
              borderTop: "1px solid var(--am-border)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <div style={{ fontSize: 12.5, fontWeight: 750, color: "var(--am-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {card.title}
              </div>
              {card.replyCount > 0 && <Chip style={{ fontSize: 9, padding: "1px 6px" }}>{card.replyCount} replies</Chip>}
            </div>
            {card.body && (
              <div style={{ marginTop: 3, fontSize: 11.5, color: "var(--am-text-muted)", lineHeight: 1.35, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                {card.body}
              </div>
            )}
            <div style={{ marginTop: 4, fontSize: 10.5, color: "var(--am-text-faint)" }}>
              {card.user?.name ?? card.metadata?.teamName ?? "League"} · {new Date(card.createdAt).toLocaleDateString()}
            </div>
          </Link>
        ))}
      </div>
    </Glass>
  );

  const injuredListCard = rosterAlerts.length > 0 ? (
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
  ) : null;

  return (
    <div className="aurora-theme">
      <div style={{ position: "relative", minHeight: "100vh", overflow: "hidden", color: "var(--am-text)" }}>
        <AmbientBg />

        {/* Bento layout styles live in client/src/components/aurora/aurora.css */}
        <div className="home-bento">
          <div className="home-column home-span-7">
            {leagueId && (
              <MyTeamTodayPanel leagueId={leagueId} />
            )}
            {leagueId && <HistoricalInsightsTab leagueId={leagueId} />}
          </div>

          <div className="home-column home-span-5">
            {heroCard}
            {wirePeriodCard}
            {standingsCard}
            {activityCard}
            {tradeProposalCard}
            <NewsFeedsPanel compact limit={5} />
            {boardCard}
            {injuredListCard}
          </div>

          {/* CTAs — bottom row of quick links */}
          <div className="home-span-12">
            <Glass>
              <SectionLabel>Quick links</SectionLabel>
              <div className="home-quick-grid">
                {[
                  { to: "/players", label: "Browse players", body: "Search the full pool" },
                  { to: "/board", label: "League Board", body: "Posts and trade block" },
                  { to: "/teams", label: "Teams", body: "All league teams" },
                  { to: "/activity", label: "Activity", body: "Trades, adds, drops" },
                  { to: "/draft-report", label: "Draft Report", body: "Auction grades" },
                  { to: "/rules", label: "Rules", body: "League settings" },
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
