
import { normCode } from "../../../lib/utils.js";
import { prisma } from "../../../db/prisma.js";
import { TWO_WAY_PLAYERS, playerStatRoles } from "../../../lib/sportConfig.js";
import { buildIlWindows, wasOnIlAtPeriodStart, type IlWindow } from "../../../lib/ilWindows.js";
import { clampToPeriod, overlapsPeriod, ownedOn } from "../../../lib/rosterWindow.js";
import { getLeagueCategories, getCategoryValue } from "../lib/categoryEngine.js";
import { onStatsChanged } from "../../../lib/statsChanged.js";

import type { PeriodStatRow } from "../../../types/stats.js";

// --- Types ---

/** CSV player row extended with team/period fields used by aggregation */
export type CsvPlayerRow = PeriodStatRow & {
  team_code?: string;
  team_name?: string;
  ER?: number | string;
  IP?: number | string;
  BB_H?: number | string;
  ogba_team_code?: string;
};

/** Team-level aggregated stat row — output of aggregation, input to ranking.
 * Sport-agnostic: every stat lives in `stats`, keyed by its DB field name
 * ("R", "HR", "S", "AVG", … for baseball; whatever a sport defines otherwise).
 * Keeping the stats nested — rather than flat beside `team` — means the
 * `team` object never widens a stat read, so dynamic reads (`stats[key]`) and
 * named arithmetic (`stats.R`) are both plain `number` access (todo #294).
 *
 * Baseball rows always carry all 15 keys: the 10 scoring categories plus the
 * rate-stat components H/AB/ER/IP/BB_H used for weighted cross-period
 * averaging (Issue #109). Use `getTeamStatValue` when a key may be absent.
 */
export interface TeamStatRow {
  team: { id: number; name: string; code: string };
  stats: Record<string, number>;
}

/** Baseball counting stats + rate-stat components, before rates are derived. */
interface BaseballAccum {
  R: number; HR: number; RBI: number; SB: number; H: number; AB: number;
  W: number; S: number; K: number; ER: number; IP: number; BB_H: number;
}

const emptyBaseballAccum = (): BaseballAccum =>
  ({ R: 0, HR: 0, RBI: 0, SB: 0, H: 0, AB: 0, W: 0, S: 0, K: 0, ER: 0, IP: 0, BB_H: 0 });

/** Derive AVG/ERA/WHIP from summed components (0 when the denominator is 0). */
function baseballStats(a: BaseballAccum): Record<string, number> {
  return {
    ...a,
    AVG: a.AB > 0 ? a.H / a.AB : 0,
    ERA: a.IP > 0 ? (a.ER / a.IP) * 9 : 0,
    WHIP: a.IP > 0 ? a.BB_H / a.IP : 0,
  };
}

const teamRef = (t: { id: number; name: string; code: string | null }) =>
  ({ id: t.id, name: t.name, code: t.code ?? t.name.substring(0, 3).toUpperCase() });

/** A single category ranking row */
export interface CategoryRow {
  teamId: number;
  teamName: string;
  teamCode: string;
  value: number;
  rank: number;
  points: number;
}

/** Final standings row */
export interface StandingsRow {
  teamId: number;
  teamName: string;
  points: number;
  rank: number;
  delta: number;
}

/** Season standings data (per-team with period breakdowns) */
export interface SeasonStandingsRow {
  teamId: number;
  teamName: string;
  teamCode: string;
  periodPoints: number[];
  totalPoints: number;
}

/** Standings-related record with team info (for buildTeamNameMap input) */
interface StandingsRecord {
  teamCode?: string;
  code?: string;
  team?: string;
  teamName?: string;
  name?: string;
}

/** Season stat row (for buildTeamNameMap input) */
interface SeasonStatInput {
  ogba_team_code?: string;
}

export function buildTeamNameMap(
  seasonStandings: StandingsRecord[] | { rows?: StandingsRecord[] } | null,
  seasonStats: SeasonStatInput[]
): Record<string, string> {
  const map: Record<string, string> = {};

  // 1. From seasonStandings
  const rows: StandingsRecord[] = Array.isArray(seasonStandings)
    ? seasonStandings
    : seasonStandings?.rows || [];
  for (const r of rows) {
    const code = normCode(r.teamCode || r.code || r.team || "");
    const name = r.teamName || r.name || r.team || "";
    if (code && name) map[code] = name;
  }

  // 2. From seasonStats
  for (const s of seasonStats) {
    const code = normCode(s.ogba_team_code);
    if (code && !map[code]) map[code] = code;
  }

  return map;
}

// Re-export from centralized sportConfig
export { CATEGORY_CONFIG, KEY_TO_DB_FIELD } from "../../../lib/sportConfig.js";
export type { CategoryKey } from "../../../lib/sportConfig.js";
import { CATEGORY_CONFIG, KEY_TO_DB_FIELD, type CategoryKey } from "../../../lib/sportConfig.js";

/**
 * Compute category rankings for teams.
 * Sport-agnostic: works with any category key in generic TeamStatRow.
 * Uses KEY_TO_DB_FIELD mapping for MLB-specific field aliases (e.g., SV → S).
 * @param stats — aggregated team stats (generic Record<string, number>)
 * @param key — category key to rank (e.g., "R", "AVG", "ERA", "SV", etc.)
 * @param lowerIsBetter — true for inverse stats (ERA, WHIP, turnovers), false for most
 */
export function computeCategoryRows(
  stats: TeamStatRow[],
  key: string,
  lowerIsBetter: boolean
): CategoryRow[] {
  // For MLB, map category keys to DB field names (e.g., SV → S)
  const dbField = KEY_TO_DB_FIELD[key as CategoryKey] || key;

  const rows = stats.map((s) => ({
    teamId: s.team.id,
    teamName: s.team.name,
    teamCode: s.team.code || s.team.name.substring(0, 3).toUpperCase(),
    value: getTeamStatValue(s, dbField),
  }));

  const n = rows.length;
  if (n === 0) return [];

  // Use rankPoints for proper tie handling
  const teamsForRank = rows.map((r) => ({
    teamCode: String(r.teamId), // use teamId as key
    value: r.value,
  }));
  const { pointsByTeam, rankByTeam } = rankPoints(
    teamsForRank,
    !lowerIsBetter,
    n
  );

  // Sort for display order
  rows.sort((a, b) => {
    if (lowerIsBetter) {
      return a.value - b.value;
    } else {
      return b.value - a.value;
    }
  });

  return rows.map((row) => ({
    ...row,
    rank: rankByTeam[String(row.teamId)] ?? 0,
    points: pointsByTeam[String(row.teamId)] ?? 0,
  }));
}

/**
 * Compute overall standings by ranking teams across all scoring categories.
 * Accepts optional `categories` to support sport-agnostic scoring.
 * Defaults to baseball's CATEGORY_CONFIG for backward compatibility.
 */
export function computeStandingsFromStats(
  stats: TeamStatRow[],
  categories?: ReadonlyArray<{ key: string; lowerIsBetter: boolean }>,
): StandingsRow[] {
  if (stats.length === 0) {
    return [];
  }

  const cats = categories ?? CATEGORY_CONFIG;

  const teamMap = new Map<
    number,
    {
      teamId: number;
      teamName: string;
      points: number;
    }
  >();

  for (const row of stats) {
    teamMap.set(row.team.id, {
      teamId: row.team.id,
      teamName: row.team.name,
      points: 0,
    });
  }

  // For each category, rank and add points
  for (const cfg of cats) {
    const rows = computeCategoryRows(stats, cfg.key, cfg.lowerIsBetter);
    for (const r of rows) {
      const team = teamMap.get(r.teamId);
      if (!team) continue;
      team.points += r.points;
    }
  }

  const standings = Array.from(teamMap.values());
  standings.sort((a, b) => b.points - a.points);

  return standings.map((s, idx) => ({
    teamId: s.teamId,
    teamName: s.teamName,
    points: s.points,
    rank: idx + 1,
    delta: 0, // later we can compute movement vs previous snapshot
  }));
}

/**
 * Aggregate player-level CSV rows into team-level stats for a given period.
 * Sport-agnostic: accumulates stats into generic Record<string, number>.
 * Rate stats (AVG, ERA, WHIP) computed via categoryEngine; call sites use getCategoryValue().
 */
export function aggregatePeriodStatsFromCsv(
  periodStats: CsvPlayerRow[],
  periodKey: string,
  sport: string = "baseball"
): TeamStatRow[] {
  // Filter rows for the requested period (CSV uses "P1", "P2", etc.)
  const periodRows = periodStats.filter(
    (r) => String(r.period_id ?? "").trim().toUpperCase() === periodKey.toUpperCase()
  );

  // Group by team_code; generic accumulator
  const teamMap = new Map<string, { teamCode: string; teamName: string; stats: Record<string, number> }>();

  for (const r of periodRows) {
    const code = String(r.team_code ?? "").trim().toUpperCase();
    if (!code) continue;

    if (!teamMap.has(code)) {
      teamMap.set(code, {
        teamCode: code,
        teamName: String(r.team_name ?? code).trim(),
        stats: {},
      });
    }

    const team = teamMap.get(code)!;
    const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

    // Sport-specific stat accumulation (MLB for now; extend for NFL/NBA)
    if (sport === "baseball") {
      team.stats["R"] = (team.stats["R"] ?? 0) + n(r.R);
      team.stats["HR"] = (team.stats["HR"] ?? 0) + n(r.HR);
      team.stats["RBI"] = (team.stats["RBI"] ?? 0) + n(r.RBI);
      team.stats["SB"] = (team.stats["SB"] ?? 0) + n(r.SB);
      team.stats["H"] = (team.stats["H"] ?? 0) + n(r.H);
      team.stats["AB"] = (team.stats["AB"] ?? 0) + n(r.AB);
      team.stats["W"] = (team.stats["W"] ?? 0) + n(r.W);
      team.stats["S"] = (team.stats["S"] ?? 0) + n(r.SV); // CSV uses SV, DB uses S
      team.stats["K"] = (team.stats["K"] ?? 0) + n(r.K);
      team.stats["ER"] = (team.stats["ER"] ?? 0) + n(r.ER);
      team.stats["IP"] = (team.stats["IP"] ?? 0) + n(r.IP);
      team.stats["BB_H"] = (team.stats["BB_H"] ?? 0) + n(r.BB_H);
    }
  }

  // Build result rows with pre-computed rate stats
  const result: TeamStatRow[] = [];
  let idx = 0;
  for (const team of teamMap.values()) {
    // Pre-compute rate stats (AVG, ERA, WHIP). ALWAYS emit a numeric value
    // (0 when the denominator is 0) so these can never go missing at runtime —
    // matching the DB-path constructors (computeWithDailyStats / mergeTeamStatRows).
    // Previously these were set only when AB/IP > 0, so a team with no AB/IP
    // produced a row missing AVG/ERA/WHIP while the type declared them required;
    // the cast below then laundered that absence. Now fixed.
    const rateStats: Record<string, number> = {};

    if (sport === "baseball") {
      const ab = team.stats["AB"] ?? 0;
      const h = team.stats["H"] ?? 0;
      rateStats["AVG"] = ab > 0 ? h / ab : 0;

      const ip = team.stats["IP"] ?? 0;
      const er = team.stats["ER"] ?? 0;
      rateStats["ERA"] = ip > 0 ? (er / ip) * 9 : 0;

      const bb_h = team.stats["BB_H"] ?? 0;
      rateStats["WHIP"] = ip > 0 ? bb_h / ip : 0;
    }

    result.push({
      team: {
        id: idx + 1,
        name: team.teamName,
        code: team.teamCode,
      },
      stats: { ...team.stats, ...rateStats },
    });
    idx++;
  }

  return result;
}

/**
 * Aggregate player-level CSV rows across ALL periods into team-level season totals.
 * Same shape as aggregatePeriodStatsFromCsv output.
 */
export function aggregateSeasonStatsFromCsv(periodStats: CsvPlayerRow[], sport: string = "baseball"): TeamStatRow[] {
  return aggregatePeriodStatsFromCsv(
    periodStats.map((r) => ({ ...r, period_id: "ALL" })),
    "ALL",
    sport
  );
}

/**
 * Safe accessor for stat values from generic TeamStatRow.
 * Used by tests and callers that need to extract numeric stats by key.
 */
export function getTeamStatValue(row: TeamStatRow, key: string): number {
  const val = row.stats[key];
  return typeof val === "number" ? val : 0;
}

export function rankPoints(
  teams: Array<{ teamCode: string; value: number }>,
  higherIsBetter: boolean,
  totalTeams: number
): { pointsByTeam: Record<string, number>; rankByTeam: Record<string, number> } {
  const sorted = [...teams].sort((a, b) => {
    if (a.value === b.value) return 0;
    return higherIsBetter ? b.value - a.value : a.value - b.value;
  });

  const pointsByTeam: Record<string, number> = {};
  const rankByTeam: Record<string, number> = {};

  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1].value === sorted[i].value) j++;

    const rankStart = i + 1;

    // Average points across tied ranks
    const tiedCount = j - i + 1;
    let pointSum = 0;
    for (let k = 0; k < tiedCount; k++) {
      pointSum += totalTeams - (i + k + 1) + 1;
    }
    const avgPoints = pointSum / tiedCount;

    for (let k = i; k <= j; k++) {
      pointsByTeam[sorted[k].teamCode] = avgPoints;
      rankByTeam[sorted[k].teamCode] = rankStart;
    }

    i = j + 1;
  }

  return { pointsByTeam, rankByTeam };
}

// --- DB → team stats ---
//
// Loading and computing are split so the season view can load EVERY period's
// rows in one query per table (todo #305) and the single-period view can keep
// loading one period at a time — both then run the same pure compute below, so
// the two can never drift apart.
//
// Every query that feeds an order-sensitive step carries a unique tie-breaker:
//   - rosters: `acquiredAt desc, id desc` — the first-wins idiom in
//     `endOfPeriodOwner`, and the order IP (a float of thirds) is summed in;
//   - IL events: `effDate asc, id asc` — a same-day IL_STASH + IL_ACTIVATE
//     pair opens and closes a stint only in that order;
//   - daily stats: `gameDate asc` (unique per player).
// Without them Postgres may return tied rows in any order, and a batched query
// over several periods need not tie-break the same way as a one-period query.

type PeriodBounds = { id: number; startDate: Date; endDate: Date };
type TeamRef = { id: number; name: string; code: string | null };
type StatLine = {
  AB: number; H: number; R: number; HR: number; RBI: number; SB: number;
  W: number; SV: number; K: number; IP: number; ER: number; BB_H: number;
};
type DailyStatLine = StatLine & { playerId: number; gameDate: Date };
type PeriodStatLine = StatLine & { playerId: number };
type RosterRow = {
  teamId: number; playerId: number; acquiredAt: Date; releasedAt: Date | null;
  assignedPosition: string | null;
  player: { id: number; mlbId: number | null; posPrimary: string };
};

const STAT_SELECT = {
  AB: true, H: true, R: true, HR: true, RBI: true, SB: true,
  W: true, SV: true, K: true, IP: true, ER: true, BB_H: true,
} as const;

const ROSTER_SELECT = {
  teamId: true,
  playerId: true,
  acquiredAt: true,
  releasedAt: true,
  assignedPosition: true,
  player: { select: { id: true, mlbId: true, posPrimary: true } },
} as const;

// DESC by acquiredAt so the "first row wins" idiom in `endOfPeriodOwner`
// picks the LATEST acquisition for a player — correct for the
// drop-and-re-add-during-period case. Without this orderBy, Prisma
// returns rows in undefined order, and an earlier roster row could
// silently win the attribution over a later one (kieran-typescript
// and code-simplicity reviews on PR #365 caught this). `id` breaks ties.
const ROSTER_ORDER = [{ acquiredAt: "desc" as const }, { id: "desc" as const }];

function loadOverlappingRosters(leagueId: number, from: Date, to: Date): Promise<RosterRow[]> {
  // SQL equivalent of `overlapsPeriod(r, { startDate: from, endDate: to })` from
  // lib/rosterWindow.ts — acquiredAt <= to AND (releasedAt IS NULL OR releasedAt >= from).
  return prisma.roster.findMany({
    where: {
      team: { leagueId },
      acquiredAt: { lte: to },
      OR: [
        { releasedAt: null },
        { releasedAt: { gte: from } },
      ],
    },
    select: ROSTER_SELECT,
    orderBy: ROSTER_ORDER,
  });
}

function loadIlEvents(playerIds: number[]) {
  return prisma.transactionEvent.findMany({
    where: {
      playerId: { in: playerIds },
      transactionType: { in: ["IL_STASH", "IL_ACTIVATE"] },
      effDate: { not: null },
    },
    select: { playerId: true, transactionType: true, effDate: true },
    orderBy: [{ effDate: "asc" }, { id: "asc" }],
  });
}

function loadDailyStats(playerIds: number[], from: Date, to: Date): Promise<DailyStatLine[]> {
  return prisma.playerStatsDaily.findMany({
    where: {
      playerId: { in: playerIds },
      gameDate: { gte: from, lte: to },
    },
    select: { playerId: true, gameDate: true, ...STAT_SELECT },
    orderBy: { gameDate: "asc" },
  });
}

/**
 * Which stats source each roster row is scored from in one period.
 *
 * Two paths with DIFFERENT attribution semantics for mid-period trades:
 *
 * Period-stats path (preferred): credits the whole period to the team that
 *   holds the player on period.endDate (todo #242).
 *
 * Daily-stats fallback: attributes stats within each roster ownership window
 *   (acquiredAt → releasedAt). Same traded player's pre-trade stats stay with
 *   the original team.
 *
 * ⚠ Retroactive shift: a new period starts in daily-stats mode for ~13h (until
 *   the 13:00 UTC cron populates PlayerStatsPeriod rows). A trade in that window
 *   is attributed under daily-stats semantics. When the cron fires, the same query
 *   retroactively re-attributes those stats under period-stats semantics. This is
 *   known and accepted: the daily-stats path is a best-effort fallback; period-stats
 *   is the authoritative view. The retroactive shift is bounded to trades that happen
 *   in the first ~13h of a new period — a narrow window.
 *
 * Prefer PlayerStatsPeriod (via MLB byDateRange API) — accurate, handles
 * doubleheaders. playerStatsDaily uses @@unique([playerId, gameDate]) which
 * collapses doubleheaders, systematically undercounting RBI, K, W, IP.
 * If a player was acquired or released strictly mid-period, PSP whole-period
 * attribution is wrong for that player: it would over-credit an acquirer with
 * pre-acquisition stats, and give a mid-period dropper nothing. Those players
 * need daily ownership windows per ADR-013.
 *
 * Compare at UTC calendar-date granularity, not timestamps (todo #285): import
 * scripts and admin tools stamp acquiredAt with a time-of-day, and stats have
 * per-day granularity anyway — an acquisition any time on the period's start or
 * end DATE is boundary-aligned. A noon-on-start-day timestamp once flipped all
 * of P1 onto the gappy daily table (audit report Section 5.4).
 *
 * Hybrid routing (todo #286): only the affected PLAYERS go through the daily
 * table; everyone boundary-aligned stays on PSP. Before this, one wire pickup
 * degraded the whole period to the daily table (doubleheader collapse, gaps) —
 * live P3 drifted off FanGraphs because of three mid-period adds.
 */
function routeStatsSource(
  rosters: RosterRow[],
  period: PeriodBounds,
  periodStatCount: number,
): { pspRosters: RosterRow[]; dailyRosters: RosterRow[] } {
  const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const periodStartDay = utcDay(period.startDate);
  const periodEndDay = utcDay(period.endDate);
  const strictlyInside = (d: Date) => utcDay(d) > periodStartDay && utcDay(d) < periodEndDay;
  // Per PLAYER, not per row: a drop-and-re-add produces two rows for one player,
  // and splitting one player's rows across the two paths would double-credit.
  const midPeriodPlayerIds = new Set(
    rosters
      .filter(r => strictlyInside(r.acquiredAt) || (r.releasedAt !== null && strictlyInside(r.releasedAt)))
      .map(r => r.playerId)
  );

  // No PlayerStatsPeriod data yet (new period) — daily is the only source.
  if (periodStatCount === 0) return { pspRosters: [], dailyRosters: rosters };
  if (midPeriodPlayerIds.size === 0) return { pspRosters: rosters, dailyRosters: [] };

  const pspRosters = rosters.filter(r => !midPeriodPlayerIds.has(r.playerId));
  // Degenerate case: every overlapping player moved mid-period — pure daily.
  if (pspRosters.length === 0) return { pspRosters: [], dailyRosters: rosters };
  return { pspRosters, dailyRosters: rosters.filter(r => midPeriodPlayerIds.has(r.playerId)) };
}

/** Score one period from already-loaded rows, using the routing above. */
function scorePeriod(
  teams: TeamRef[],
  period: PeriodBounds,
  route: { pspRosters: RosterRow[]; dailyRosters: RosterRow[] },
  ilWindowsByPlayer: Map<number, IlWindow[]>,
  periodStats: PeriodStatLine[],
  dailyStats: DailyStatLine[],
): TeamStatRow[] {
  const { pspRosters, dailyRosters } = route;
  if (dailyRosters.length === 0) {
    return sumWithPeriodStats(teams, pspRosters, period, ilWindowsByPlayer, periodStats);
  }
  if (pspRosters.length === 0) {
    return sumWithDailyStats(teams, dailyRosters, period, ilWindowsByPlayer, dailyStats);
  }
  return mergeTeamStatRows(
    teams,
    sumWithPeriodStats(teams, pspRosters, period, ilWindowsByPlayer, periodStats),
    sumWithDailyStats(teams, dailyRosters, period, ilWindowsByPlayer, dailyStats),
  );
}

/**
 * Compute team-level aggregated stats from PlayerStatsPeriod DB data.
 * Joins player stats with active rosters for the given league and period.
 * Returns TeamStatRow[] compatible with computeCategoryRows/computeStandingsFromStats.
 *
 * Attribution semantics depend on which path is active (see `routeStatsSource`):
 *
 * Period-stats path (PlayerStatsPeriod rows exist for this period):
 *   the period's stats go to the team holding the player on period.endDate.
 *
 * Daily-stats fallback (no period stats yet — brand-new period), and players
 * acquired/released strictly mid-period: stats are split at ownership
 * boundaries. Pre-trade stats stay with the original team; post-trade stats go
 * to the new team.
 *
 * IMPORTANT: A period starts in daily-stats mode for ~13 hours (until the
 * 13:00 UTC cron populates PlayerStatsPeriod rows). Any trade processed in
 * that window is initially attributed under daily-stats semantics. When the
 * cron fires, the same standings query retroactively re-attributes stats to
 * period-stats semantics — the original team loses credit, the new team gains.
 * This is intentional system behavior, not a bug, but it IS time-dependent.
 *
 * The season view does NOT call this per period; it batch-loads every period
 * (`getSeasonStandingsUncached`) and runs the same `routeStatsSource` /
 * `scorePeriod` on the loaded rows.
 */
export async function computeTeamStatsFromDb(
  leagueId: number,
  periodId: number
): Promise<TeamStatRow[]> {
  // Fetch period and teams in parallel
  const [period, teams] = await Promise.all([
    prisma.period.findUnique({ where: { id: periodId } }),
    prisma.team.findMany({
      where: { leagueId },
      select: { id: true, name: true, code: true },
      orderBy: { id: "asc" },
    }),
  ]);

  if (!period) return [];

  const rosters = await loadOverlappingRosters(leagueId, period.startDate, period.endDate);

  // Build date-aware IL windows from TransactionEvent history so that a player's
  // stats are excluded only for periods when they were actually in the IL slot —
  // not retroactively applied to periods when they were active.
  const rosterPlayerIds = [...new Set(rosters.map(r => r.playerId))];
  const [ilEvents, periodStatCount] = await Promise.all([
    loadIlEvents(rosterPlayerIds),
    prisma.playerStatsPeriod.count({ where: { periodId } }),
  ]);
  const ilWindowsByPlayer = buildIlWindows(ilEvents);

  const route = routeStatsSource(rosters, period, periodStatCount);
  const dailyPlayerIds = [...new Set(route.dailyRosters.map(r => r.playerId))];
  const [periodStats, dailyStats] = await Promise.all([
    route.pspRosters.length > 0
      ? prisma.playerStatsPeriod.findMany({ where: { periodId }, select: { playerId: true, ...STAT_SELECT } })
      : Promise.resolve([] as PeriodStatLine[]),
    route.dailyRosters.length > 0
      ? loadDailyStats(dailyPlayerIds, period.startDate, period.endDate)
      : Promise.resolve([] as DailyStatLine[]),
  ]);

  return scorePeriod(teams, period, route, ilWindowsByPlayer, periodStats, dailyStats);
}

/**
 * Merge two TeamStatRow sets (hybrid attribution, todo #286): sum counting stats
 * and rate-stat components per team, then recompute AVG/ERA/WHIP from the merged
 * components so rates are weighted correctly (Issue #109).
 */
function mergeTeamStatRows(
  teams: TeamRef[],
  a: TeamStatRow[],
  b: TeamStatRow[],
): TeamStatRow[] {
  const aById = new Map(a.map(r => [r.team.id, r]));
  const bById = new Map(b.map(r => [r.team.id, r]));
  return teams.map(t => {
    const x = aById.get(t.id);
    const y = bById.get(t.id);
    const sum = emptyBaseballAccum();
    for (const key of Object.keys(sum) as (keyof BaseballAccum)[]) {
      sum[key] = (x?.stats[key] ?? 0) + (y?.stats[key] ?? 0);
    }
    return { team: teamRef(t), stats: baseballStats(sum) };
  });
}

/**
 * Precise path: sum daily stats within each roster entry's ownership window.
 * `dailyStats` may hold rows for other players and dates (the season view loads
 * every period's rows at once): only this period's roster players are looked
 * up, and `clampToPeriod` keeps every counted day inside the period.
 */
function sumWithDailyStats(
  teams: TeamRef[],
  rosters: RosterRow[],
  period: { startDate: Date; endDate: Date },
  ilWindowsByPlayer: Map<number, IlWindow[]>,
  dailyStats: DailyStatLine[],
): TeamStatRow[] {
  // Index: playerId → date → stats
  const statsIndex = new Map<number, Map<number, DailyStatLine>>();
  for (const ds of dailyStats) {
    if (!statsIndex.has(ds.playerId)) statsIndex.set(ds.playerId, new Map());
    statsIndex.get(ds.playerId)!.set(ds.gameDate.getTime(), ds);
  }

  // For each roster entry, sum daily stats within ownership window
  const teamAccum = new Map<number, BaseballAccum>();

  for (const roster of rosters) {
    // Skip players who were on IL at the period's start date.
    // Uses TransactionEvent effDate history so past periods are scored correctly
    // even if the player's current assignedPosition has changed since.
    if (wasOnIlAtPeriodStart(roster.playerId, period.startDate, ilWindowsByPlayer)) continue;

    const { from, to } = clampToPeriod(roster, period);

    const playerDailyStats = statsIndex.get(roster.playerId);
    if (!playerDailyStats) continue;

    // Role-based attribution (shared with the FanGraphs audit): a position
    // player's mop-up pitching does NOT count toward team pitching.
    const isTwoWay = roster.player.mlbId ? TWO_WAY_PLAYERS.has(roster.player.mlbId) : false;
    const { countHitting, countPitching } = playerStatRoles({
      posPrimary: roster.player.posPrimary,
      assignedPosition: roster.assignedPosition,
      isTwoWay,
    });

    if (!teamAccum.has(roster.teamId)) {
      teamAccum.set(roster.teamId, emptyBaseballAccum());
    }
    const acc = teamAccum.get(roster.teamId)!;

    for (const [dateMs, ds] of playerDailyStats) {
      const d = new Date(dateMs);
      // releasedAt is exclusive (half-open window, see lib/rosterWindow.ts header):
      // with the conventional UTC-midnight effDate, the release day belongs to the
      // next owner (or nobody), never the dropper. Without this, a same-day
      // drop-and-re-add double-counts the boundary day, and a player released at a
      // period-start boundary leaks that day's stats to the dropper (todo #286).
      if (d >= from && d <= to && (roster.releasedAt === null || d < roster.releasedAt)) {
        if (countHitting) {
          acc.R += ds.R; acc.HR += ds.HR; acc.RBI += ds.RBI; acc.SB += ds.SB;
          acc.H += ds.H; acc.AB += ds.AB;
        }
        if (countPitching) {
          acc.W += ds.W; acc.S += ds.SV; acc.K += ds.K;
          acc.ER += ds.ER; acc.IP += ds.IP; acc.BB_H += ds.BB_H;
        }
      }
    }
  }

  return teams.map((t) => ({
    team: teamRef(t),
    stats: baseballStats(teamAccum.get(t.id) ?? emptyBaseballAccum()),
  }));
}

/** Authoritative path: whole-period PlayerStatsPeriod rows for this period. */
function sumWithPeriodStats(
  teams: TeamRef[],
  rosters: RosterRow[],
  period: { startDate: Date; endDate: Date },
  ilWindowsByPlayer: Map<number, IlWindow[]>,
  periodStats: PeriodStatLine[],
): TeamStatRow[] {
  const statsMap = new Map(periodStats.map(s => [s.playerId, s]));

  // Group rosters by teamId
  const rostersByTeam = new Map<number, typeof rosters>();
  for (const r of rosters) {
    const list = rostersByTeam.get(r.teamId) ?? [];
    list.push(r);
    rostersByTeam.set(r.teamId, list);
  }

  // End-of-period owner attribution (todo #242). For each player, the team
  // that holds them on `period.endDate` gets the period's PSP credit.
  // "Held" iff `acquiredAt <= endDate` AND (`releasedAt IS NULL` OR
  // `releasedAt > endDate`). Latest acquisition wins via the rosters query's
  // `orderBy: acquiredAt desc` + first-wins idiom below — covers the
  // drop-and-re-add-during-period case.
  // See docs/solutions/logic-errors/closed-period-stat-attribution-uses-current-owner.md
  const endOfPeriodOwner = new Map<number, number>(); // playerId → teamId
  for (const r of rosters) {
    if (!ownedOn(r, period.endDate)) continue;
    if (!endOfPeriodOwner.has(r.playerId)) {
      endOfPeriodOwner.set(r.playerId, r.teamId);
    }
  }

  return teams.map((t) => {
    let R = 0, HR = 0, RBI = 0, SB = 0, H = 0, AB = 0;
    let W = 0, S = 0, K = 0, ER = 0, IP = 0, BB_H = 0;

    const teamRosters = rostersByTeam.get(t.id) ?? [];
    // Dedup guard: same player can have multiple roster rows on this team
    // (drop-and-re-add cycle). Only one credit per player per period.
    const countedPlayers = new Set<number>();

    for (const roster of teamRosters) {
      if (countedPlayers.has(roster.playerId)) continue;

      // Skip players who were on IL at this period's start date.
      // Uses TransactionEvent effDate history — same date-aware logic as sumWithDailyStats.
      if (wasOnIlAtPeriodStart(roster.playerId, period.startDate, ilWindowsByPlayer)) continue;

      // Credit only the team that held this player on period.endDate.
      // Traded-out players (released before endDate) get no credit from this team
      // even if they were on this team during the period — the team that picked
      // them up before endDate gets the period's stats. Matches FG.
      const endOwner = endOfPeriodOwner.get(roster.playerId);
      if (endOwner !== t.id) continue;

      countedPlayers.add(roster.playerId);

      const stats = statsMap.get(roster.playerId);
      if (!stats) continue;

      const isTwoWay = roster.player.mlbId ? TWO_WAY_PLAYERS.has(roster.player.mlbId) : false;
      const { countHitting, countPitching } = playerStatRoles({
        posPrimary: roster.player.posPrimary,
        assignedPosition: roster.assignedPosition,
        isTwoWay,
      });

      if (countHitting) {
        R += stats.R; HR += stats.HR; RBI += stats.RBI; SB += stats.SB;
        H += stats.H; AB += stats.AB;
      }
      if (countPitching) {
        W += stats.W; S += stats.SV; K += stats.K;
        ER += stats.ER; IP += stats.IP; BB_H += stats.BB_H;
      }
    }

    return {
      team: teamRef(t),
      stats: baseballStats({ R, HR, RBI, SB, H, AB, W, S, K, ER, IP, BB_H }),
    };
  });
}

// In-memory cache, invalidated on every stats write (todo #305) with a TTL as a
// backstop. `pending` enables stampede prevention: if a second request arrives
// while the first is still computing, both share the same in-flight Promise
// rather than firing parallel `getSeasonStandingsUncached()` calls (mirrors the
// dashboard service cache pattern).
//
// Clear-during-compute: a compute that started before a clear read pre-clear
// data, so it must not write its result back. Each compute only touches the
// entry while that entry still holds ITS `pending` — a clear deletes the entry,
// and a newer compute replaces it, so a stale compute finds nothing it owns.
// (An earlier global generation counter got this wrong: a clear for ANY league
// left this league's settled `pending` in place, served forever — or, if the
// compute had failed, rejected forever.)
type StandingsCore = Awaited<ReturnType<typeof getSeasonStandingsUncached>>;
type StandingsResult = StandingsCore & { computedAt: string };
interface StandingsCacheEntry {
  data?: StandingsResult;
  expiry: number;
  pending?: Promise<StandingsResult>;
}
const standingsCache = new Map<number, StandingsCacheEntry>();
const STANDINGS_CACHE_TTL = 120_000; // 2 minutes

export function clearStandingsCache(leagueId?: number): void {
  if (leagueId !== undefined) standingsCache.delete(leagueId);
  else standingsCache.clear();
}

onStatsChanged(clearStandingsCache);

/**
 * Season-level standings: sum roto points across all active/completed periods.
 * Loads every period in one query per table (`computeTeamStatsForPeriods`, todo #305).
 * Shared by `/api/standings/season` and `/api/reports/:leagueId`.
 * Results cached for 2 minutes; `computedAt` reflects when this row was first
 * persisted into the cache (not when the request returned), so two clients
 * served the same cached result see the same freshness timestamp.
 */
export async function getSeasonStandings(leagueId: number): Promise<StandingsResult> {
  const cached = standingsCache.get(leagueId);
  if (cached?.data && cached.expiry > Date.now()) return cached.data;
  if (cached?.pending) return cached.pending;

  const pending = (async (): Promise<StandingsResult> => {
    const core = await getSeasonStandingsUncached(leagueId);
    return { ...core, computedAt: new Date().toISOString() };
  })();
  standingsCache.set(leagueId, { data: cached?.data, expiry: 0, pending });
  const stillOurs = () => standingsCache.get(leagueId)?.pending === pending;
  try {
    const result = await pending;
    if (stillOurs()) {
      standingsCache.set(leagueId, { data: result, expiry: Date.now() + STANDINGS_CACHE_TTL });
    }
    return result;
  } catch (err) {
    if (stillOurs()) standingsCache.delete(leagueId);
    throw err;
  }
}

/**
 * Team stats for every given period, batch-loaded (todo #305).
 *
 * Same result as calling `computeTeamStatsFromDb` once per period, but one
 * query per table instead of ~6 per period: the per-period fan-out was ~25
 * round-trips, serialized on a small connection pool. Each period's rows are
 * cut out of the batched results in memory with exactly the predicates the
 * per-period queries use, then scored by the same `scorePeriod`.
 */
async function computeTeamStatsForPeriods(
  leagueId: number,
  periods: PeriodBounds[],
): Promise<TeamStatRow[][]> {
  if (periods.length === 0) return [];

  const minStart = new Date(Math.min(...periods.map(p => p.startDate.getTime())));
  const maxEnd = new Date(Math.max(...periods.map(p => p.endDate.getTime())));
  const periodIds = periods.map(p => p.id);

  const [teams, allRosters, allPeriodStats] = await Promise.all([
    prisma.team.findMany({
      where: { leagueId },
      select: { id: true, name: true, code: true },
      orderBy: { id: "asc" },
    }),
    // Superset of every period's roster query; narrowed per period below.
    loadOverlappingRosters(leagueId, minStart, maxEnd),
    prisma.playerStatsPeriod.findMany({
      where: { periodId: { in: periodIds } },
      select: { periodId: true, playerId: true, ...STAT_SELECT },
    }),
  ]);

  const periodStatsById = new Map<number, PeriodStatLine[]>(periodIds.map(id => [id, []]));
  for (const row of allPeriodStats) periodStatsById.get(row.periodId)!.push(row);

  const perPeriod = periods.map(period => {
    // The per-period roster WHERE clause, applied in memory. `filter` keeps the
    // batched query's (acquiredAt desc, id desc) order, which is the order the
    // per-period query returns.
    const rosters = allRosters.filter(r => overlapsPeriod(r, period));
    const periodStats = periodStatsById.get(period.id)!;
    const route = routeStatsSource(rosters, period, periodStats.length);
    return { period, rosters, periodStats, route };
  });

  // IL windows are built per player from that player's own events, so one
  // query over every period's roster players gives each period the same
  // windows its own query would.
  const ilPlayerIds = [...new Set(perPeriod.flatMap(p => p.rosters.map(r => r.playerId)))];
  const dailyPeriods = perPeriod.filter(p => p.route.dailyRosters.length > 0);
  const dailyPlayerIds = [...new Set(dailyPeriods.flatMap(p => p.route.dailyRosters.map(r => r.playerId)))];

  const [ilEvents, dailyStats] = await Promise.all([
    loadIlEvents(ilPlayerIds),
    dailyPeriods.length > 0
      ? loadDailyStats(
          dailyPlayerIds,
          new Date(Math.min(...dailyPeriods.map(p => p.period.startDate.getTime()))),
          new Date(Math.max(...dailyPeriods.map(p => p.period.endDate.getTime()))),
        )
      : Promise.resolve([] as DailyStatLine[]),
  ]);
  const ilWindowsByPlayer = buildIlWindows(ilEvents);

  return perPeriod.map(p =>
    scorePeriod(teams, p.period, p.route, ilWindowsByPlayer, p.periodStats, dailyStats),
  );
}

async function getSeasonStandingsUncached(leagueId: number) {
  const periods = await prisma.period.findMany({
    where: { leagueId, status: { in: ["active", "completed"] } },
    select: { id: true, startDate: true, endDate: true },
    orderBy: { startDate: "asc" },
  });

  const periodIds = periods.map((p) => p.id);

  const statsByPeriod = await computeTeamStatsForPeriods(leagueId, periods);
  const periodData = statsByPeriod.map((teamStats) => ({
    teamStats,
    standings: computeStandingsFromStats(teamStats),
  }));

  // Accumulate total points per team
  const pointsByTeam = new Map<number, { teamId: number; teamName: string; totalPoints: number }>();
  for (const { standings } of periodData) {
    for (const entry of standings) {
      const cur = pointsByTeam.get(entry.teamId);
      if (cur) {
        cur.totalPoints += entry.points;
      } else {
        pointsByTeam.set(entry.teamId, {
          teamId: entry.teamId,
          teamName: entry.teamName,
          totalPoints: entry.points,
        });
      }
    }
  }

  const seasonRows = Array.from(pointsByTeam.values())
    .sort((a, b) => b.totalPoints - a.totalPoints)
    .map((row, i) => ({ rank: i + 1, ...row }));

  return { periodIds, periodData, seasonRows };
}
