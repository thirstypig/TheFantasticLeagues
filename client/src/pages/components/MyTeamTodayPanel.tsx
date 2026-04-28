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
 * The current server endpoint returns roster + schedule (which players
 * have games today + opponent + game time), but does NOT yet expose
 * actual box-score stat lines (H/AB/R/HR/RBI for hitters; IP/K/BB/ER/W
 * for pitchers). When the server-side stat surface lands it should add
 * an optional `line` field per player and (ideally) a `gameStatus` enum
 * (`"PRE" | "LIVE" | "FINAL"`). The component renders the game-status
 * shell today and will show the line when present — see TODO below for
 * the expected wire shape.
 *
 * Styling: Aurora Glass card with the ✦ SectionLabel eyebrow. Uses
 * Chip / Dot atoms for compact status indicators.
 */
import { useEffect, useMemo, useState } from "react";
import { Glass, Chip, SectionLabel, Dot } from "../../components/aurora/atoms";
import { fetchJsonApi, API_BASE } from "../../api/base";
import { useLeague } from "../../contexts/LeagueContext";
import { isPitcher } from "../../lib/sportConfig";

// ─── Types ──────────────────────────────────────────────────────────────
//
// Mirrors the server `MyPlayerToday` shape (mlb-feed/routes.ts). The
// optional `line` / `gameStatus` / `posPrimary` fields are forward-
// compatible: the server may add them without breaking this client.
//
// TODO(server): when /my-players-today gains real stat lines, the
// expected response per player is:
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
interface HittingLine {
  AB: number;
  H: number;
  R: number;
  HR: number;
  RBI: number;
  SB?: number;
  BB?: number;
}
interface PitchingLine {
  IP: string | number;
  K: number;
  BB: number;
  ER: number;
  H?: number;
  decision?: "W" | "L" | "S" | "H" | "BS" | null;
}
interface ApiPlayerToday {
  playerName: string;
  mlbId: number;
  mlbTeam: string;
  posPrimary?: string;
  gameTime: string;
  opponent: string;
  homeAway: "home" | "away";
  gameStatus?: "PRE" | "LIVE" | "FINAL";
  gameStateDesc?: string;
  line?: {
    hitting?: HittingLine;
    pitching?: PitchingLine;
  };
}

interface MyPlayersTodayResponse {
  players: ApiPlayerToday[];
  // forward-compat: server may stamp the date it computed against
  date?: string;
}

// ─── 10am-rollover cutoff ───────────────────────────────────────────────
//
// Per spec: between midnight and 10:00 local time, "today" still shows
// yesterday's date — owners want last night's box scores when they
// wake up. After 10am, we flip to today's date. This date is what we
// pass to any date-keyed query and what we render in the eyebrow.
function computeCutoffDate(): Date {
  const cutoffDate = new Date();
  if (cutoffDate.getHours() < 10) {
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
function formatHittingLine(l: HittingLine): string {
  const parts: string[] = [`${l.H}-${l.AB}`];
  if (l.HR) parts.push(`${l.HR} HR`);
  if (l.RBI) parts.push(`${l.RBI} RBI`);
  if (l.R) parts.push(`${l.R} R`);
  if (l.SB) parts.push(`${l.SB} SB`);
  return parts.join(", ");
}

// Render a pitcher line like "6 IP, 8 K, 2 ER, W". Decision tacked on
// when present; otherwise just the line.
function formatPitchingLine(l: PitchingLine): string {
  const parts: string[] = [`${l.IP} IP`];
  parts.push(`${l.K} K`);
  if (l.BB) parts.push(`${l.BB} BB`);
  parts.push(`${l.ER} ER`);
  if (l.decision) parts.push(l.decision);
  return parts.join(", ");
}

// Did this hitter have a notable game? (3+ hits or 2+ HR.) Used to
// gate the subtle ✦ flame chip.
function isHotHitter(l?: HittingLine): boolean {
  if (!l) return false;
  return l.H >= 3 || l.HR >= 2;
}

// Did this pitcher have a notable game? (10+ K or shutout-style ER=0
// over 6+ IP.)
function isHotPitcher(l?: PitchingLine): boolean {
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
  const [data, setData] = useState<MyPlayersTodayResponse | null>(null);
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
    // The server's /my-players-today endpoint computes its own "today"
    // via mlbGameDayDate(); we forward our local cutoff as `date` so a
    // future server upgrade can honor the 10am-rollover for box-score
    // queries. Today the server ignores the param — that's fine.
    fetchJsonApi<MyPlayersTodayResponse>(
      `${API_BASE}/mlb/my-players-today?leagueId=${leagueId}&date=${cutoffDateStr}`,
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

  // Split into hitters / pitchers. The server may or may not include
  // posPrimary; when missing, `isPitcher(undefined)` returns false so
  // unknown-position players default to the hitters list (a reasonable
  // fallback — most rosters skew hitter-heavy).
  const { hitters, pitchers } = useMemo(() => {
    const h: ApiPlayerToday[] = [];
    const p: ApiPlayerToday[] = [];
    for (const pl of data?.players ?? []) {
      if (isPitcher(pl.posPrimary ?? "")) p.push(pl);
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
          {formatPrettyDate(cutoffDate)}
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
          Today's player activity will appear here once games begin.
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
  players: ApiPlayerToday[];
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
        {players.map((pl) => (
          <PlayerRow key={`${pl.mlbId}-${pl.mlbTeam}`} player={pl} kind={kind} />
        ))}
      </div>
    </div>
  );
}

function PlayerRow({ player, kind }: { player: ApiPlayerToday; kind: "hitter" | "pitcher" }) {
  const opp = `${player.homeAway === "home" ? "vs" : "@"} ${player.opponent || "—"}`;

  // Decide what to render in the line-slot based on what the server
  // gave us. Order of preference:
  //   1. real stat line (hitting or pitching)
  //   2. game-status chip (LIVE / FINAL / PRE)
  //   3. fallback to game time string
  let lineNode: React.ReactNode;
  let hot = false;

  if (kind === "hitter") {
    const l = player.line?.hitting;
    if (l) {
      lineNode = (
        <span style={{ fontSize: 12, color: "var(--am-text)", fontVariantNumeric: "tabular-nums" }}>
          {formatHittingLine(l)}
        </span>
      );
      hot = isHotHitter(l);
    } else if (player.gameStatus === "FINAL") {
      lineNode = <Chip>DNP</Chip>;
    } else if (player.gameStatus === "LIVE") {
      lineNode = (
        <Chip strong>
          <Dot color="var(--am-accent)" />
          {player.gameStateDesc || "LIVE"}
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
    // pitcher
    const l = player.line?.pitching;
    if (l) {
      lineNode = (
        <span style={{ fontSize: 12, color: "var(--am-text)", fontVariantNumeric: "tabular-nums" }}>
          {formatPitchingLine(l)}
        </span>
      );
      hot = isHotPitcher(l);
    } else if (player.gameStatus === "FINAL") {
      lineNode = <Chip>Did not pitch</Chip>;
    } else if (player.gameStatus === "LIVE") {
      lineNode = (
        <Chip strong>
          <Dot color="var(--am-accent)" />
          {player.gameStateDesc || "LIVE"}
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
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        padding: "6px 8px",
        borderRadius: 10,
        background: "var(--am-surface-faint)",
        border: "1px solid var(--am-border)",
      }}
    >
      <div style={{ minWidth: 0, flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            fontSize: 13,
            color: "var(--am-text)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: 180,
          }}
          title={player.playerName}
        >
          {player.playerName}
        </span>
        {player.posPrimary && (
          <span style={{ fontSize: 10, color: "var(--am-text-faint)" }}>
            {player.posPrimary}
          </span>
        )}
        <span style={{ fontSize: 11, color: "var(--am-text-faint)" }}>
          {opp}
        </span>
        {hot && (
          <Chip strong style={{ padding: "2px 6px", fontSize: 10 }}>
            ✦ Hot
          </Chip>
        )}
      </div>
      <div style={{ flexShrink: 0 }}>{lineNode}</div>
    </div>
  );
}
