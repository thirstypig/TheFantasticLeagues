
import { normCode } from "../../../lib/utils.js";
import { prisma } from "../../../db/prisma.js";
import { TWO_WAY_PLAYERS, PITCHER_CODES_SET as PITCHER_CODES } from "../../../lib/sportConfig.js";
import { buildIlWindows, wasOnIlAtPeriodStart, type IlWindow } from "../../../lib/ilWindows.js";
import { clampToPeriod, ownedOn } from "../../../lib/rosterWindow.js";
import { getLeagueCategories, getCategoryValue } from "../lib/categoryEngine.js";

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
 * Sport-agnostic: stats keyed by category ID, computed on-demand via categoryEngine.
 * All stats stored by key (e.g., "R", "HR", "AVG", "W", "ERA", etc. per sport).
 * Rate stats (AVG, ERA, WHIP) computed from components via getCategoryValue().
 */
export interface TeamStatRow {
  team: { id: number; name: string; code: string };
  [statKey: string]: number | { id: number; name: string; code: string } | undefined;
}

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

export function computeCategoryRows(
  stats: TeamStatRow[],
  key: CategoryKey,
  lowerIsBetter: boolean
): CategoryRow[] {
  const dbField = KEY_TO_DB_FIELD[key] || key;
  const rows = stats.map((s) => ({
    teamId: s.team.id,
    teamName: s.team.name,
    teamCode: s.team.code || s.team.name.substring(0, 3).toUpperCase(),
    value: Number(s[dbField]),
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
    const rows = computeCategoryRows(stats, cfg.key as CategoryKey, cfg.lowerIsBetter);
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
    // Pre-compute rate stats (AVG, ERA, WHIP) from component stats
    const rateStats: Record<string, number> = {};

    if (sport === "baseball") {
      const ab = team.stats["AB"] ?? 0;
      const h = team.stats["H"] ?? 0;
      if (ab > 0) rateStats["AVG"] = h / ab;

      const ip = team.stats["IP"] ?? 0;
      const er = team.stats["ER"] ?? 0;
      if (ip > 0) rateStats["ERA"] = (er / ip) * 9;

      const bb_h = team.stats["BB_H"] ?? 0;
      if (ip > 0) rateStats["WHIP"] = bb_h / ip;
    }

    result.push({
      team: {
        id: idx + 1,
        name: team.teamName,
        code: team.teamCode,
      },
      ...team.stats,  // Spread accumulated stats
      ...rateStats,   // Add pre-computed rate stats
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
  const val = row[key];
  if (typeof val === "number") return val;
  return 0;
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

/**
 * Compute team-level aggregated stats from PlayerStatsPeriod DB data.
 * Joins player stats with active rosters for the given league and period.
 * Returns TeamStatRow[] compatible with computeCategoryRows/computeStandingsFromStats.
 *
 * Attribution semantics depend on which path is active:
 *
 * Period-stats path (PlayerStatsPeriod rows exist for this period):
 *   ALL period stats are attributed to the player's CURRENT owner
 *   (releasedAt=null). A mid-period trade gives the full period's stats
 *   to the new team regardless of when the trade occurred.
 *
 * Daily-stats fallback (no period stats yet — brand-new period):
 *   Stats are split at ownership boundaries. Pre-trade stats stay with
 *   the original team; post-trade stats go to the new team.
 *
 * IMPORTANT: A period starts in daily-stats mode for ~13 hours (until the
 * 13:00 UTC cron populates PlayerStatsPeriod rows). Any trade processed in
 * that window is initially attributed under daily-stats semantics. When the
 * cron fires, the same standings query retroactively re-attributes stats to
 * period-stats semantics — the original team loses credit, the new team gains.
 * This is intentional system behavior, not a bug, but it IS time-dependent.
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

  // SQL equivalent of `overlapsPeriod(r, period)` from lib/rosterWindow.ts —
  // acquiredAt <= endDate AND (releasedAt IS NULL OR releasedAt >= startDate).
  const rosters = await prisma.roster.findMany({
    where: {
      team: { leagueId },
      acquiredAt: { lte: period.endDate },
      OR: [
        { releasedAt: null },
        { releasedAt: { gte: period.startDate } },
      ],
    },
    select: {
      teamId: true,
      playerId: true,
      acquiredAt: true,
      releasedAt: true,
      assignedPosition: true,
      player: { select: { id: true, mlbId: true, posPrimary: true } },
    },
    // DESC by acquiredAt so the "first row wins" idiom in `endOfPeriodOwner`
    // picks the LATEST acquisition for a player — correct for the
    // drop-and-re-add-during-period case. Without this orderBy, Prisma
    // returns rows in undefined order, and an earlier roster row could
    // silently win the attribution over a later one (kieran-typescript
    // and code-simplicity reviews on PR #365 caught this).
    orderBy: [{ acquiredAt: "desc" }],
  });

  // Build date-aware IL windows from TransactionEvent history so that a player's
  // stats are excluded only for periods when they were actually in the IL slot —
  // not retroactively applied to periods when they were active.
  const rosterPlayerIds = [...new Set(rosters.map(r => r.playerId))];
  const [ilEvents, periodStatCount] = await Promise.all([
    prisma.transactionEvent.findMany({
      where: {
        playerId: { in: rosterPlayerIds },
        transactionType: { in: ["IL_STASH", "IL_ACTIVATE"] },
        effDate: { not: null },
      },
      select: { playerId: true, transactionType: true, effDate: true },
      orderBy: { effDate: "asc" },
    }),
    prisma.playerStatsPeriod.count({ where: { periodId } }),
  ]);
  const ilWindowsByPlayer = buildIlWindows(ilEvents);

  // --- Stats source selection ---
  //
  // Two paths with DIFFERENT attribution semantics for mid-period trades:
  //
  // Period-stats path (preferred): attributes ALL period stats to the player's
  //   CURRENT owner (releasedAt === null). A player traded on day 10 of 28 → the
  //   new team gets the full period's stats.
  //
  // Daily-stats fallback: attributes stats within each roster ownership window
  //   (acquiredAt → releasedAt). Same traded player's pre-trade stats stay with
  //   the original team.
  //
  // ⚠ Retroactive shift: a new period starts in daily-stats mode for ~13h (until
  //   the 13:00 UTC cron populates PlayerStatsPeriod rows). A trade in that window
  //   is attributed under daily-stats semantics. When the cron fires, the same query
  //   retroactively re-attributes those stats under period-stats semantics. This is
  //   known and accepted: the daily-stats path is a best-effort fallback; period-stats
  //   is the authoritative view. The retroactive shift is bounded to trades that happen
  //   in the first ~13h of a new period — a narrow window.
  //
  // Prefer PlayerStatsPeriod (via MLB byDateRange API) — accurate, handles
  // doubleheaders. playerStatsDaily uses @@unique([playerId, gameDate]) which
  // collapses doubleheaders, systematically undercounting RBI, K, W, IP.
  // If a player was acquired or released strictly mid-period, PSP whole-period
  // attribution is wrong for that player: it would over-credit an acquirer with
  // pre-acquisition stats, and give a mid-period dropper nothing. Those players
  // need daily ownership windows per ADR-013.
  //
  // Compare at UTC calendar-date granularity, not timestamps (todo #285): import
  // scripts and admin tools stamp acquiredAt with a time-of-day, and stats have
  // per-day granularity anyway — an acquisition any time on the period's start or
  // end DATE is boundary-aligned. A noon-on-start-day timestamp once flipped all
  // of P1 onto the gappy daily table (audit report Section 5.4).
  //
  // Hybrid routing (todo #286): only the affected PLAYERS go through the daily
  // table; everyone boundary-aligned stays on PSP. Before this, one wire pickup
  // degraded the whole period to the daily table (doubleheader collapse, gaps) —
  // live P3 drifted off FanGraphs because of three mid-period adds.
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

  if (periodStatCount > 0 && midPeriodPlayerIds.size === 0) {
    return computeWithPeriodStats(teams, rosters, period, ilWindowsByPlayer);
  }

  // No PlayerStatsPeriod data yet (new period) — daily is the only source.
  if (periodStatCount === 0) {
    return computeWithDailyStats(teams, rosters, period, ilWindowsByPlayer);
  }

  const pspRosters = rosters.filter(r => !midPeriodPlayerIds.has(r.playerId));
  const dailyRosters = rosters.filter(r => midPeriodPlayerIds.has(r.playerId));

  // Degenerate case: every overlapping player moved mid-period — pure daily.
  if (pspRosters.length === 0) {
    return computeWithDailyStats(teams, rosters, period, ilWindowsByPlayer);
  }

  const [pspRows, dailyRows] = await Promise.all([
    computeWithPeriodStats(teams, pspRosters, period, ilWindowsByPlayer),
    computeWithDailyStats(teams, dailyRosters, period, ilWindowsByPlayer),
  ]);
  return mergeTeamStatRows(teams, pspRows, dailyRows);
}

/**
 * Merge two TeamStatRow sets (hybrid attribution, todo #286): sum counting stats
 * and rate-stat components per team, then recompute AVG/ERA/WHIP from the merged
 * components so rates are weighted correctly (Issue #109).
 */
function mergeTeamStatRows(
  teams: { id: number; name: string; code: string | null }[],
  a: TeamStatRow[],
  b: TeamStatRow[],
): TeamStatRow[] {
  const aById = new Map(a.map(r => [r.team.id, r]));
  const bById = new Map(b.map(r => [r.team.id, r]));
  return teams.map(t => {
    const x = aById.get(t.id);
    const y = bById.get(t.id);
    const n = (v: number | undefined) => v ?? 0;
    const H = n(x?.H) + n(y?.H);
    const AB = n(x?.AB) + n(y?.AB);
    const ER = n(x?.ER) + n(y?.ER);
    const IP = n(x?.IP) + n(y?.IP);
    const BB_H = n(x?.BB_H) + n(y?.BB_H);
    return {
      team: { id: t.id, name: t.name, code: t.code ?? t.name.substring(0, 3).toUpperCase() },
      R: n(x?.R) + n(y?.R),
      HR: n(x?.HR) + n(y?.HR),
      RBI: n(x?.RBI) + n(y?.RBI),
      SB: n(x?.SB) + n(y?.SB),
      AVG: AB > 0 ? H / AB : 0,
      W: n(x?.W) + n(y?.W),
      S: n(x?.S) + n(y?.S),
      K: n(x?.K) + n(y?.K),
      ERA: IP > 0 ? (ER / IP) * 9 : 0,
      WHIP: IP > 0 ? BB_H / IP : 0,
      H, AB, ER, IP, BB_H,
    };
  });
}

/** Precise path: sum daily stats within each roster entry's ownership window. */
async function computeWithDailyStats(
  teams: { id: number; name: string; code: string | null }[],
  rosters: {
    teamId: number; playerId: number; acquiredAt: Date; releasedAt: Date | null;
    assignedPosition: string | null;
    player: { id: number; mlbId: number | null; posPrimary: string };
  }[],
  period: { startDate: Date; endDate: Date },
  ilWindowsByPlayer: Map<number, IlWindow[]>,
): Promise<TeamStatRow[]> {
  // Collect all unique playerIds for a single bulk query
  const playerIds = [...new Set(rosters.map(r => r.playerId))];

  // Fetch all daily stats for these players within the period
  const dailyStats = await prisma.playerStatsDaily.findMany({
    where: {
      playerId: { in: playerIds },
      gameDate: { gte: period.startDate, lte: period.endDate },
    },
    select: {
      playerId: true, gameDate: true,
      AB: true, H: true, R: true, HR: true, RBI: true, SB: true,
      W: true, SV: true, K: true, IP: true, ER: true, BB_H: true,
    },
  });

  // Index: playerId → date → stats
  const statsIndex = new Map<number, Map<number, typeof dailyStats[0]>>();
  for (const ds of dailyStats) {
    if (!statsIndex.has(ds.playerId)) statsIndex.set(ds.playerId, new Map());
    statsIndex.get(ds.playerId)!.set(ds.gameDate.getTime(), ds);
  }

  // For each roster entry, sum daily stats within ownership window
  const teamAccum = new Map<number, { R: number; HR: number; RBI: number; SB: number; H: number; AB: number; W: number; S: number; K: number; ER: number; IP: number; BB_H: number }>();

  for (const roster of rosters) {
    // Skip players who were on IL at the period's start date.
    // Uses TransactionEvent effDate history so past periods are scored correctly
    // even if the player's current assignedPosition has changed since.
    if (wasOnIlAtPeriodStart(roster.playerId, period.startDate, ilWindowsByPlayer)) continue;

    const { from, to } = clampToPeriod(roster, period);

    const playerDailyStats = statsIndex.get(roster.playerId);
    if (!playerDailyStats) continue;

    // Two-way player check
    const isTwoWay = roster.player.mlbId ? TWO_WAY_PLAYERS.has(roster.player.mlbId) : false;
    const pos = (roster.assignedPosition ?? roster.player.posPrimary ?? "").toUpperCase();
    const assignedAsP = PITCHER_CODES.has(pos);
    const countHitting = !isTwoWay || !assignedAsP;
    const countPitching = !isTwoWay || assignedAsP;

    if (!teamAccum.has(roster.teamId)) {
      teamAccum.set(roster.teamId, { R: 0, HR: 0, RBI: 0, SB: 0, H: 0, AB: 0, W: 0, S: 0, K: 0, ER: 0, IP: 0, BB_H: 0 });
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

  return teams.map((t) => {
    const acc = teamAccum.get(t.id) ?? { R: 0, HR: 0, RBI: 0, SB: 0, H: 0, AB: 0, W: 0, S: 0, K: 0, ER: 0, IP: 0, BB_H: 0 };
    return {
      team: { id: t.id, name: t.name, code: t.code ?? t.name.substring(0, 3).toUpperCase() },
      R: acc.R, HR: acc.HR, RBI: acc.RBI, SB: acc.SB,
      AVG: acc.AB > 0 ? acc.H / acc.AB : 0,
      W: acc.W, S: acc.S, K: acc.K,
      ERA: acc.IP > 0 ? (acc.ER / acc.IP) * 9 : 0,
      WHIP: acc.IP > 0 ? acc.BB_H / acc.IP : 0,
      // Components for weighted cross-period averaging (Issue #109)
      H: acc.H, AB: acc.AB, ER: acc.ER, IP: acc.IP, BB_H: acc.BB_H,
    };
  });
}

/** Fallback path: use cumulative PlayerStatsPeriod (pre-daily-data periods). */
async function computeWithPeriodStats(
  teams: { id: number; name: string; code: string | null }[],
  rosters: {
    teamId: number; playerId: number; acquiredAt: Date; releasedAt: Date | null;
    assignedPosition: string | null;
    player: { id: number; mlbId: number | null; posPrimary: string };
  }[],
  period: { id: number; startDate: Date; endDate: Date },
  ilWindowsByPlayer: Map<number, IlWindow[]>,
): Promise<TeamStatRow[]> {
  const periodId = period.id;
  const periodStats = await prisma.playerStatsPeriod.findMany({
    where: { periodId },
    select: {
      playerId: true,
      AB: true, H: true, R: true, HR: true, RBI: true, SB: true,
      W: true, SV: true, K: true, IP: true, ER: true, BB_H: true,
    },
  });

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
      // Uses TransactionEvent effDate history — same date-aware logic as computeWithDailyStats.
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
      const pos = (roster.assignedPosition ?? roster.player.posPrimary ?? "").toUpperCase();
      const assignedAsP = PITCHER_CODES.has(pos);

      const countHitting = !isTwoWay || !assignedAsP;
      const countPitching = !isTwoWay || assignedAsP;

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
      team: { id: t.id, name: t.name, code: t.code ?? t.name.substring(0, 3).toUpperCase() },
      R, HR, RBI, SB,
      AVG: AB > 0 ? H / AB : 0,
      W, S, K,
      ERA: IP > 0 ? (ER / IP) * 9 : 0,
      WHIP: IP > 0 ? BB_H / IP : 0,
      // Components for weighted cross-period averaging (Issue #109)
      H, AB, ER, IP, BB_H,
    };
  });
}

// In-memory TTL cache — stats change only on daily cron syncs (12:00 + 13:00 UTC).
// `pending` enables stampede prevention: if a second request arrives while the
// first is still computing, both share the same in-flight Promise rather than
// firing parallel `getSeasonStandingsUncached()` calls (mirrors the dashboard
// service cache pattern).
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

/**
 * Season-level standings: sum roto points across all active/completed periods.
 * Parallelizes per-period DB calls via Promise.all (~15× faster than sequential).
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
  try {
    const result = await pending;
    standingsCache.set(leagueId, { data: result, expiry: Date.now() + STANDINGS_CACHE_TTL });
    return result;
  } catch (err) {
    standingsCache.delete(leagueId);
    throw err;
  }
}

async function getSeasonStandingsUncached(leagueId: number) {
  const periods = await prisma.period.findMany({
    where: { leagueId, status: { in: ["active", "completed"] } },
    select: { id: true },
    orderBy: { startDate: "asc" },
  });

  const periodIds = periods.map((p) => p.id);

  const periodData = await Promise.all(
    periodIds.map(async (pid) => {
      const teamStats = await computeTeamStatsFromDb(leagueId, pid);
      const standings = computeStandingsFromStats(teamStats);
      return { teamStats, standings };
    }),
  );

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
