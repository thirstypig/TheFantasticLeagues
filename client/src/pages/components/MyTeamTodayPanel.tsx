/*
 * MyTeamTodayPanel — Aurora "My Team Today" dashboard widget.
 *
 * Renders the user's rostered players grouped by Hitter / Pitcher with
 * what they did in MLB today. The "today" boundary uses a 10am-local
 * rollover: between midnight and 10:00 local time, "today" still means
 * yesterday's box scores. This matches how fantasy owners think — they
 * wake up, want to see last night's results, and only flip to the new
 * day after morning coffee.
 *
 * Data source:
 *   GET /api/mlb/my-players-today?leagueId=:id
 *   Returns: { players: Array<{ playerName, mlbId, mlbTeam, gameTime,
 *                                 opponent, homeAway }> }
 *
 * The server returns role-specific box-score stat lines when a player
 * appears in that day's game log. Hitters render hitting only; pitchers
 * render pitching only. The date uses a 10am Pacific cutoff so yesterday's
 * completed games remain visible until the next morning.
 *
 * Styling: Aurora Glass card with the ✦ SectionLabel eyebrow. Uses
 * Chip / Dot atoms for compact status indicators.
 */
import { useEffect, useMemo, useState } from "react";
import { Glass, Chip, SectionLabel, Dot } from "../../components/aurora/atoms";
import { fetchJsonApi, API_BASE } from "../../api/base";
import { useLeague } from "../../contexts/LeagueContext";
import type { RosterStatsPlayer, RosterStatsResponse } from "../home/types";

// ─── Types ──────────────────────────────────────────────────────────────
//
// Mirrors the server `MyPlayerToday` shape (mlb-feed/routes.ts). The
// optional `line` / `gameStatus` / `posPrimary` fields are forward-
// compatible: the server may add them without breaking this client.
//
// Expected response per player:
//   {
//     playerName: string,
//     mlbId: number,
//     mlbTeam: string,
//     posPrimary?: string,       // "SP", "OF", "C" — for hitter/pitcher split
//     gameTime: string,           // ISO timestamp
//     opponent: string,
//     homeAway: "home" | "away",
//     gameStatus?: "PRE" | "LIVE" | "FINAL",
//     gameStateDesc?: string,    // "Top 5", "F/10", "7:30 PM ET"
//     line?: {
//       hitting?: { AB:number; H:number; R:number; HR:number; RBI:number; SB?:number; BB?:number };
//       pitching?: { IP:string; K:number; BB:number; ER:number; H?:number; decision?: "W"|"L"|"S"|"H"|"BS"|null };
//     }
//   }
// ─── 10am-rollover cutoff ───────────────────────────────────────────────
//
// Per spec: between midnight and 10:00 local time, "today" still shows
// yesterday's date — owners want last night's box scores when they
// wake up. After 10am, we flip to today's date. This date is what we
// pass to any date-keyed query and what we render in the eyebrow.
// Hoisted to module scope (todo #167.2): `Intl.DateTimeFormat` constructor
// is non-trivial; this widget rerenders frequently and the formatter is
// stateless, so building one per render burns CPU for no reason.
const PACIFIC_HOUR_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  hour: "numeric",
  hourCycle: "h23",
});

function computeCutoffDate(): Date {
  const cutoffDate = new Date();
  const pacificHour = Number(PACIFIC_HOUR_FORMATTER.format(cutoffDate));
  if (pacificHour < 10) {
    cutoffDate.setDate(cutoffDate.getDate() - 1);
  }
  return cutoffDate;
}

function formatYyyyMmDd(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatPrettyDate(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function formatGameTimeShort(iso: string): string {
  if (!iso) return "";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// Render a hitter line like "2-4, 1 HR, 3 RBI" — drops zero-value
// counting stats so a 0-0 day reads cleanly.
function formatHittingLine(l: NonNullable<RosterStatsPlayer["hitting"]>): string {
  const parts: string[] = [`${l.H}-${l.AB}`];
  if (l.HR) parts.push(`${l.HR} HR`);
  if (l.RBI) parts.push(`${l.RBI} RBI`);
  if (l.R) parts.push(`${l.R} R`);
  if (l.SB) parts.push(`${l.SB} SB`);
  if (l.BB) parts.push(`${l.BB} BB`);
  return parts.join(", ");
}

// Render a pitcher line like "6 IP, 8 K, 2 ER, W". Decision tacked on
// when present; otherwise just the line.
function formatPitchingLine(l: NonNullable<RosterStatsPlayer["pitching"]>): string {
  const parts: string[] = [`${l.IP} IP`];
  parts.push(`${l.K} K`);
  if (l.BB) parts.push(`${l.BB} BB`);
  parts.push(`${l.ER} ER`);
  if (l.W) parts.push("W");
  if (l.L) parts.push("L");
  if (l.SV) parts.push("SV");
  return parts.join(", ");
}

// Did this hitter have a notable game? (3+ hits or 2+ HR.) Used to
// gate the subtle ✦ flame chip.
function isHotHitter(l?: RosterStatsPlayer["hitting"]): boolean {
  if (!l) return false;
  return l.H >= 3 || l.HR >= 2;
}

// Did this pitcher have a notable game? (10+ K or shutout-style ER=0
// over 6+ IP.)
function isHotPitcher(l?: RosterStatsPlayer["pitching"]): boolean {
  if (!l) return false;
  const ipNum = typeof l.IP === "number" ? l.IP : parseFloat(String(l.IP));
  if (l.K >= 10) return true;
  if (Number.isFinite(ipNum) && ipNum >= 6 && l.ER === 0) return true;
  return false;
}

// ─── Component ──────────────────────────────────────────────────────────

interface Props {
  leagueId: number;
}

export default function MyTeamTodayPanel({ leagueId }: Props) {
  const { myTeamId } = useLeague();
  const [data, setData] = useState<RosterStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cutoffDate = useMemo(() => computeCutoffDate(), []);
  const cutoffDateStr = useMemo(() => formatYyyyMmDd(cutoffDate), [cutoffDate]);

  useEffect(() => {
    if (!leagueId) {
      setLoading(false);
      return;
    }
    let canceled = false;
    setLoading(true);
    setError(null);
    // The server honors this date for both schedule and game-log lookups,
    // keeping yesterday's completed stat lines visible until 10am Pacific.
    fetchJsonApi<RosterStatsResponse>(
      `${API_BASE}/mlb/roster-stats-today?leagueId=${leagueId}&date=${cutoffDateStr}`,
    )
      .then((res) => {
        if (canceled) return;
        setData(res);
      })
      .catch((e) => {
        if (canceled) return;
        // Fail-soft: render the empty state, don't surface a toast for
        // a dashboard widget. Log for debugging.
        // eslint-disable-next-line no-console
        console.warn("[MyTeamTodayPanel] fetch failed", e);
        setError("Couldn't load today's player activity.");
        setData(null);
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [leagueId, cutoffDateStr]);

  const { hitters, pitchers } = useMemo(() => {
    const h: RosterStatsPlayer[] = [];
    const p: RosterStatsPlayer[] = [];
    for (const pl of data?.players ?? []) {
      if (pl.isPitcher) p.push(pl);
      else h.push(pl);
    }
    return { hitters: h, pitchers: p };
  }, [data]);

  const hasAnyGames = (data?.players ?? []).length > 0;

  return (
    <Glass>
      <SectionLabel>✦ My Team Today</SectionLabel>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <div style={{ fontSize: 13, color: "var(--am-text-muted)" }}>
          {formatPrettyDate(cutoffDate)} · stats hold until 10am PT
        </div>
        {myTeamId == null && (
          <Chip>No team in this league</Chip>
        )}
      </div>

      {loading && (
        <div style={{ fontSize: 12, color: "var(--am-text-faint)" }}>Loading…</div>
      )}

      {!loading && error && (
        <div style={{ fontSize: 12, color: "var(--am-text-faint)" }}>{error}</div>
      )}

      {!loading && !error && !hasAnyGames && (
        <div style={{ fontSize: 12, color: "var(--am-text-faint)", lineHeight: 1.5 }}>
          No rostered players have MLB games for this date.
        </div>
      )}

      {!loading && !error && hasAnyGames && (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {hitters.length > 0 && (
            <PlayerGroup
              title="Hitters"
              players={hitters}
              kind="hitter"
            />
          )}
          {pitchers.length > 0 && (
            <PlayerGroup
              title="Pitchers"
              players={pitchers}
              kind="pitcher"
            />
          )}
        </div>
      )}
    </Glass>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────

function PlayerGroup({
  title,
  players,
  kind,
}: {
  title: string;
  players: RosterStatsPlayer[];
  kind: "hitter" | "pitcher";
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: "var(--am-text-faint)",
          fontWeight: 600,
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <TodayStatsTable players={players} kind={kind} />
      </div>
    </div>
  );
}

function TodayStatsTable({
  players,
  kind,
}: {
  players: RosterStatsPlayer[];
  kind: "hitter" | "pitcher";
}) {
  return (
    <div style={{ overflowX: "auto", border: "1px solid var(--am-border)", borderRadius: 10 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: kind === "hitter" ? 560 : 620 }}>
        <thead>
          <tr style={{ background: "var(--am-surface-faint)" }}>
            <TodayTh align="left">Player</TodayTh>
            <TodayTh>Pos</TodayTh>
            <TodayTh>MLB</TodayTh>
            <TodayTh>Opp</TodayTh>
            {kind === "hitter" ? (
              <>
                <TodayTh>AB</TodayTh>
                <TodayTh>H</TodayTh>
                <TodayTh>R</TodayTh>
                <TodayTh>HR</TodayTh>
                <TodayTh>RBI</TodayTh>
                <TodayTh>SB</TodayTh>
              </>
            ) : (
              <>
                <TodayTh>IP</TodayTh>
                <TodayTh>K</TodayTh>
                <TodayTh>BB</TodayTh>
                <TodayTh>ER</TodayTh>
                <TodayTh>W</TodayTh>
                <TodayTh>SV</TodayTh>
              </>
            )}
            <TodayTh align="left">Status</TodayTh>
          </tr>
        </thead>
        <tbody>
          {players.map((pl) => (
            <PlayerRow key={`${pl.mlbId}-${pl.mlbTeam}`} player={pl} kind={kind} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TodayTh({
  children,
  align = "right",
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
}) {
  return (
    <th
      style={{
        padding: "7px 8px",
        textAlign: align,
        fontSize: 10,
        fontWeight: 750,
        letterSpacing: 0.9,
        textTransform: "uppercase",
        color: "var(--am-text-faint)",
        borderBottom: "1px solid var(--am-border)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  );
}

function TodayTd({
  children,
  align = "right",
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
}) {
  return (
    <td
      style={{
        padding: "7px 8px",
        textAlign: align,
        fontSize: 12,
        color: "var(--am-text)",
        borderTop: "1px solid var(--am-border)",
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </td>
  );
}

function PlayerRow({ player, kind }: { player: RosterStatsPlayer; kind: "hitter" | "pitcher" }) {
  const opp = `${player.homeAway === "home" ? "vs" : "@"} ${player.opponent || "—"}`;
  let lineNode: React.ReactNode;
  let hot = false;

  if (kind === "hitter") {
    const l = player.hitting;
    if (l) {
      lineNode = (
        <span style={{ fontSize: 12, color: "var(--am-text)", fontVariantNumeric: "tabular-nums" }}>
          {formatHittingLine(l)}
        </span>
      );
      hot = isHotHitter(l);
    } else if (/final/i.test(player.gameStatus)) {
      lineNode = <Chip>DNP</Chip>;
    } else if (/live|progress|inning|delay/i.test(player.gameStatus)) {
      lineNode = (
        <Chip strong>
          <Dot color="var(--am-accent)" />
          {player.gameStatus || "LIVE"}
        </Chip>
      );
    } else {
      // Pre-game or unknown status — show game time or a Pending chip.
      const t = formatGameTimeShort(player.gameTime);
      lineNode = (
        <span style={{ fontSize: 12, color: "var(--am-text-faint)" }}>
          {t || "Pending"}
        </span>
      );
    }
  } else {
    const l = player.pitching;
    if (l) {
      lineNode = (
        <span style={{ fontSize: 12, color: "var(--am-text)", fontVariantNumeric: "tabular-nums" }}>
          {formatPitchingLine(l)}
        </span>
      );
      hot = isHotPitcher(l);
    } else if (/final/i.test(player.gameStatus)) {
      lineNode = <Chip>Did not pitch</Chip>;
    } else if (/live|progress|inning|delay/i.test(player.gameStatus)) {
      lineNode = (
        <Chip strong>
          <Dot color="var(--am-accent)" />
          {player.gameStatus || "LIVE"}
        </Chip>
      );
    } else {
      const t = formatGameTimeShort(player.gameTime);
      lineNode = (
        <span style={{ fontSize: 12, color: "var(--am-text-faint)" }}>
          {t || "Pending"}
        </span>
      );
    }
  }

  return (
    <tr style={{ background: hot ? "color-mix(in srgb, var(--am-accent) 8%, transparent)" : "transparent" }}>
      <TodayTd align="left">
        <span style={{ fontWeight: 650 }}>{player.playerName}</span>
        {hot && <span style={{ marginLeft: 6 }}><Chip strong style={{ padding: "2px 6px", fontSize: 10 }}>Hot</Chip></span>}
      </TodayTd>
      <TodayTd align="center">{player.position || "—"}</TodayTd>
      <TodayTd align="center">{player.mlbTeam || "—"}</TodayTd>
      <TodayTd align="center">{opp}</TodayTd>
      {kind === "hitter" ? (
        <>
          <TodayTd>{player.hitting?.AB ?? "—"}</TodayTd>
          <TodayTd>{player.hitting?.H ?? "—"}</TodayTd>
          <TodayTd>{player.hitting?.R ?? "—"}</TodayTd>
          <TodayTd>{player.hitting?.HR ?? "—"}</TodayTd>
          <TodayTd>{player.hitting?.RBI ?? "—"}</TodayTd>
          <TodayTd>{player.hitting?.SB ?? "—"}</TodayTd>
        </>
      ) : (
        <>
          <TodayTd>{player.pitching?.IP ?? "—"}</TodayTd>
          <TodayTd>{player.pitching?.K ?? "—"}</TodayTd>
          <TodayTd>{player.pitching?.BB ?? "—"}</TodayTd>
          <TodayTd>{player.pitching?.ER ?? "—"}</TodayTd>
          <TodayTd>{player.pitching?.W ?? "—"}</TodayTd>
          <TodayTd>{player.pitching?.SV ?? "—"}</TodayTd>
        </>
      )}
      <TodayTd align="left">{lineNode}</TodayTd>
    </tr>
  );
}
