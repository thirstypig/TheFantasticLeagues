
import { normCode } from "../../../lib/utils.js";
import { prisma } from "../../../db/prisma.js";
import { TWO_WAY_PLAYERS, PITCHER_CODES } from "../../../lib/sportConfig.js";

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

/** Team-level aggregated stat row — output of aggregation, input to ranking */
export interface TeamStatRow {
  team: { id: number; name: string; code: string };
  R: number;
  HR: number;
  RBI: number;
  SB: number;
  AVG: number;
  W: number;
  S: number;
  ERA: number;
  WHIP: number;
  K: number;
  [key: string]: number | { id: number; name: string; code: string };
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
 * Returns objects shaped like DB TeamStatsPeriod rows with { team: { id, name, code } }
 * so they can be passed directly to computeCategoryRows.
 */
export function aggregatePeriodStatsFromCsv(
  periodStats: CsvPlayerRow[],
  periodKey: string
): TeamStatRow[] {
  // Filter rows for the requested period (CSV uses "P1", "P2", etc.)
  const periodRows = periodStats.filter(
    (r) => String(r.period_id ?? "").trim().toUpperCase() === periodKey.toUpperCase()
  );

  // Group by team_code
  const teamMap = new Map<
    string,
    {
      teamCode: string;
      teamName: string;
      R: number;
      HR: number;
      RBI: number;
      SB: number;
      H: number;
      AB: number;
      W: number;
      S: number; // DB uses "S" for saves
      K: number;
      ER: number;
      IP: number;
      BB_H: number;
    }
  >();

  for (const r of periodRows) {
    const code = String(r.team_code ?? "").trim().toUpperCase();
    if (!code) continue;

    if (!teamMap.has(code)) {
      teamMap.set(code, {
        teamCode: code,
        teamName: String(r.team_name ?? code).trim(),
        R: 0, HR: 0, RBI: 0, SB: 0, H: 0, AB: 0,
        W: 0, S: 0, K: 0, ER: 0, IP: 0, BB_H: 0,
      });
    }

    const team = teamMap.get(code)!;
    const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

    team.R += n(r.R);
    team.HR += n(r.HR);
    team.RBI += n(r.RBI);
    team.SB += n(r.SB);
    team.H += n(r.H);
    team.AB += n(r.AB);
    team.W += n(r.W);
    team.S += n(r.SV); // CSV uses SV, DB uses S
    team.K += n(r.K);
    team.ER += n(r.ER);
    team.IP += n(r.IP);
    team.BB_H += n(r.BB_H);
  }

  // Compute rate stats (AVG, ERA, WHIP) from components
  const result: TeamStatRow[] = [];
  let idx = 0;
  for (const team of teamMap.values()) {
    const AVG = team.AB > 0 ? team.H / team.AB : 0;
    const ERA = team.IP > 0 ? (team.ER / team.IP) * 9 : 0;
    const WHIP = team.IP > 0 ? team.BB_H / team.IP : 0;

    result.push({
      team: {
        id: idx + 1, // synthetic ID — used only for ranking
        name: team.teamName,
        code: team.teamCode,
      },
      R: team.R,
      HR: team.HR,
      RBI: team.RBI,
      SB: team.SB,
      AVG,
      W: team.W,
      S: team.S, // computeCategoryRows maps SV → "S"
      ERA,
      WHIP,
      K: team.K,
    });
    idx++;
  }

  return result;
}

/**
 * Aggregate player-level CSV rows across ALL periods into team-level season totals.
 * Same shape as aggregatePeriodStatsFromCsv output.
 */
export function aggregateSeasonStatsFromCsv(periodStats: CsvPlayerRow[]): TeamStatRow[] {
  return aggregatePeriodStatsFromCsv(
    periodStats.map((r) => ({ ...r, period_id: "ALL" })),
    "ALL"
  );
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

  // Get ALL roster entries that overlapped with this period (not just active ones)
  // This enables date-aware stats attribution for mid-period trades/drops
  const rosters = await prisma.roster.findMany({
    where: {
      team: { leagueId },
      acquiredAt: { lt: period.endDate },
      OR: [
        { releasedAt: null },
        { releasedAt: { gt: period.startDate } },
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
  });

  // Use daily stats path ONLY when we have complete coverage (>= 80% of period days).
  // Otherwise fall back to cumulative PlayerStatsPeriod which always has the full picture.
  const periodDays = Math.max(1, Math.ceil((period.endDate.getTime() - period.startDate.getTime()) / 86400000));
  const dailyStatDays = await prisma.playerStatsDaily.groupBy({
    by: ["gameDate"],
    where: { gameDate: { gte: period.startDate, lte: period.endDate } },
  });
  const coverageRatio = dailyStatDays.length / periodDays;

  if (coverageRatio >= 0.8) {
    return computeWithDailyStats(teams, rosters, period);
  } else {
    return computeWithPeriodStats(teams, rosters, periodId);
  }
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
    const from = roster.acquiredAt > period.startDate ? roster.acquiredAt : period.startDate;
    const to = roster.releasedAt && roster.releasedAt < period.endDate ? roster.releasedAt : period.endDate;

    const playerDailyStats = statsIndex.get(roster.playerId);
    if (!playerDailyStats) continue;

    // Two-way player check
    const isTwoWay = roster.player.mlbId ? TWO_WAY_PLAYERS.has(roster.player.mlbId) : false;
    const pos = (roster.assignedPosition ?? roster.player.posPrimary ?? "").toUpperCase();
    const assignedAsP = PITCHER_CODES.some(code => code === pos);
    const countHitting = !isTwoWay || !assignedAsP;
    const countPitching = !isTwoWay || assignedAsP;

    if (!teamAccum.has(roster.teamId)) {
      teamAccum.set(roster.teamId, { R: 0, HR: 0, RBI: 0, SB: 0, H: 0, AB: 0, W: 0, S: 0, K: 0, ER: 0, IP: 0, BB_H: 0 });
    }
    const acc = teamAccum.get(roster.teamId)!;

    for (const [dateMs, ds] of playerDailyStats) {
      const d = new Date(dateMs);
      if (d >= from && d <= to) {
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
  periodId: number,
): Promise<TeamStatRow[]> {
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

  // Build a set of players who are currently active on each team.
  // For cumulative period stats (no daily breakdown), we attribute ALL period stats
  // to the team that currently holds the player (releasedAt === null).
  const activePlayerTeam = new Map<number, number>(); // playerId → teamId
  for (const r of rosters) {
    if (r.releasedAt === null) {
      activePlayerTeam.set(r.playerId, r.teamId);
    }
  }

  return teams.map((t) => {
    let R = 0, HR = 0, RBI = 0, SB = 0, H = 0, AB = 0;
    let W = 0, S = 0, K = 0, ER = 0, IP = 0, BB_H = 0;

    const teamRosters = rostersByTeam.get(t.id) ?? [];
    // Track which players we've already counted (avoid double-counting if player
    // was traded away and back — only count for the ACTIVE entry or most recent)
    const countedPlayers = new Set<number>();

    for (const roster of teamRosters) {
      if (countedPlayers.has(roster.playerId)) continue;
      countedPlayers.add(roster.playerId);

      // Skip players who were traded away — attribute their stats to their current team only
      const currentTeam = activePlayerTeam.get(roster.playerId);
      if (currentTeam !== undefined && currentTeam !== t.id) continue;

      const stats = statsMap.get(roster.player.id);
      if (!stats) continue;

      const isTwoWay = roster.player.mlbId ? TWO_WAY_PLAYERS.has(roster.player.mlbId) : false;
      const assignedAsP = PITCHER_CODES.includes(
        (roster.assignedPosition ?? roster.player.posPrimary ?? "").toUpperCase() as any
      );

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
    };
  });
}

// In-memory TTL cache — stats change only on daily cron syncs (12:00 + 13:00 UTC)
const standingsCache = new Map<number, { data: Awaited<ReturnType<typeof getSeasonStandingsUncached>>; expiry: number }>();
const STANDINGS_CACHE_TTL = 120_000; // 2 minutes

export function clearStandingsCache(leagueId?: number): void {
  if (leagueId !== undefined) standingsCache.delete(leagueId);
  else standingsCache.clear();
}

/**
 * Season-level standings: sum roto points across all active/completed periods.
 * Parallelizes per-period DB calls via Promise.all (~15× faster than sequential).
 * Shared by `/api/standings/season` and `/api/reports/:leagueId`.
 * Results cached for 2 minutes (stats change only on daily cron syncs).
 */
export async function getSeasonStandings(
  leagueId: number,
): Promise<{
  periodIds: number[];
  /** Per-period detail (teamStats + standings for each period). */
  periodData: Array<{ teamStats: TeamStatRow[]; standings: StandingsRow[] }>;
  /** Roto points summed across periods, sorted desc, ranked. */
  seasonRows: Array<{ rank: number; teamId: number; teamName: string; totalPoints: number }>;
}> {
  const cached = standingsCache.get(leagueId);
  if (cached && cached.expiry > Date.now()) return cached.data;
  const result = await getSeasonStandingsUncached(leagueId);
  standingsCache.set(leagueId, { data: result, expiry: Date.now() + STANDINGS_CACHE_TTL });
  return result;
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
