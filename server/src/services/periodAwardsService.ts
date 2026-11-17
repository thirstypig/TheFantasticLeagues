/**
 * Period Awards Service — computes awards for a scoring period:
 * - Manager of Period: team with highest roto points in the period
 * - Pickup of Period: best waiver claim by fantasy production
 * - Category Kings: best team in each roto category
 */

import { prisma } from "../db/prisma.js";
import { logger } from "../lib/logger.js";
import { KEY_TO_DB_FIELD } from "../lib/sportConfig.js";
import { getLeagueCategories, type CategoryDef } from "../lib/leagueCategories.js";
import { computeTeamStatsFromDb, computeCategoryRows, type TeamStatRow } from "../features/standings/services/standingsService.js";

// ─── Types ───

export interface ManagerAward {
  teamId: number;
  teamName: string;
  teamCode: string;
  totalPoints: number;
}

export interface PickupAward {
  teamId: number;
  teamName: string;
  playerName: string;
  claimPrice: number;
  statsLine: string;
}

export interface CategoryKing {
  category: string;
  label: string;
  teamName: string;
  teamCode: string;
  value: number;
  isLowerBetter: boolean;
}

export interface PeriodAwards {
  periodId: number;
  periodName: string;
  managerOfPeriod: ManagerAward | null;
  pickupOfPeriod: PickupAward | null;
  categoryKings: CategoryKing[];
}

// ─── Helpers ───

/** Compute total roto points for each team across the league's scoring categories. */
function computeTotalRotoPoints(
  teamStats: TeamStatRow[],
  categories: ReadonlyArray<CategoryDef>,
): Map<number, number> {
  const totals = new Map<number, number>();
  for (const t of teamStats) {
    totals.set(t.team.id, 0);
  }

  for (const cfg of categories) {
    const rows = computeCategoryRows(teamStats, cfg.key, cfg.lowerIsBetter);
    for (const r of rows) {
      const prev = totals.get(r.teamId) ?? 0;
      totals.set(r.teamId, prev + r.points);
    }
  }

  return totals;
}

/** Build a human-readable stats line from player period stats. */
function buildStatsLine(stats: {
  R: number; HR: number; RBI: number; SB: number;
  W: number; SV: number; K: number;
}): string {
  const parts: string[] = [];
  const batting = [];
  if (stats.R > 0) batting.push(`${stats.R} R`);
  if (stats.HR > 0) batting.push(`${stats.HR} HR`);
  if (stats.RBI > 0) batting.push(`${stats.RBI} RBI`);
  if (stats.SB > 0) batting.push(`${stats.SB} SB`);
  if (batting.length > 0) parts.push(batting.join(", "));

  const pitching = [];
  if (stats.W > 0) pitching.push(`${stats.W} W`);
  if (stats.SV > 0) pitching.push(`${stats.SV} SV`);
  if (stats.K > 0) pitching.push(`${stats.K} K`);
  if (pitching.length > 0) parts.push(pitching.join(", "));

  return parts.join(" | ") || "No stats";
}

// ─── Main ───

export async function computePeriodAwards(
  leagueId: number,
  periodId: number,
): Promise<PeriodAwards> {
  const period = await prisma.period.findUnique({
    where: { id: periodId },
    select: { id: true, name: true, startDate: true, endDate: true, leagueId: true },
  });

  if (!period || period.leagueId !== leagueId) {
    return {
      periodId,
      periodName: "",
      managerOfPeriod: null,
      pickupOfPeriod: null,
      categoryKings: [],
    };
  }

  // Teams for name/code lookup
  const teams = await prisma.team.findMany({
    where: { leagueId },
    select: { id: true, name: true, code: true },
  });
  const teamMap = new Map(teams.map((t) => [t.id, t]));

  // Compute team-level aggregated stats
  const teamStats = await computeTeamStatsFromDb(leagueId, periodId);
  const categories = await getLeagueCategories(leagueId);

  // 1. Manager of Period — highest total roto points
  let managerOfPeriod: ManagerAward | null = null;
  if (teamStats.length > 0) {
    const totals = computeTotalRotoPoints(teamStats, categories);
    let bestTeamId = -1;
    let bestPoints = -1;
    for (const [teamId, pts] of totals) {
      if (pts > bestPoints) {
        bestPoints = pts;
        bestTeamId = teamId;
      }
    }
    const bestTeam = teamMap.get(bestTeamId);
    if (bestTeam) {
      managerOfPeriod = {
        teamId: bestTeamId,
        teamName: bestTeam.name,
        teamCode: bestTeam.code ?? bestTeam.name.substring(0, 3).toUpperCase(),
        totalPoints: bestPoints,
      };
    }
  }

  // 2. Pickup of Period — best waiver claim (SUCCESS) within period dates
  let pickupOfPeriod: PickupAward | null = null;
  const claims = await prisma.waiverClaim.findMany({
    where: {
      team: { leagueId },
      status: "SUCCESS",
      processedAt: {
        gte: period.startDate,
        lte: period.endDate,
      },
    },
    select: {
      teamId: true,
      playerId: true,
      bidAmount: true,
      player: { select: { id: true, name: true } },
    },
  });

  if (claims.length > 0) {
    // Look up stats for each claimed player in this period
    const claimPlayerIds = claims.map((c) => c.playerId);
    const playerPeriodStats = await prisma.playerStatsPeriod.findMany({
      where: { playerId: { in: claimPlayerIds }, periodId },
      select: {
        playerId: true,
        R: true, HR: true, RBI: true, SB: true,
        W: true, SV: true, K: true,
      },
    });
    const statsMap = new Map(playerPeriodStats.map((s) => [s.playerId, s]));

    // Score each claim: simple fantasy value = R + HR*2 + RBI + SB + W*2 + SV*2 + K*0.5
    let bestClaim: typeof claims[0] | null = null;
    let bestScore = -1;
    let bestStats: typeof playerPeriodStats[0] | null = null;

    for (const claim of claims) {
      const stats = statsMap.get(claim.playerId);
      if (!stats) continue;
      const score =
        stats.R + stats.HR * 2 + stats.RBI + stats.SB +
        stats.W * 2 + stats.SV * 2 + stats.K * 0.5;
      if (score > bestScore) {
        bestScore = score;
        bestClaim = claim;
        bestStats = stats;
      }
    }

    if (bestClaim && bestStats) {
      const team = teamMap.get(bestClaim.teamId);
      pickupOfPeriod = {
        teamId: bestClaim.teamId,
        teamName: team?.name ?? "Unknown",
        playerName: bestClaim.player.name,
        claimPrice: bestClaim.bidAmount,
        statsLine: buildStatsLine(bestStats),
      };
    }
  }

  // 3. Category Kings — best (rank 1) team in each category
  const categoryKings: CategoryKing[] = [];
  if (teamStats.length > 0) {
    for (const cfg of categories) {
      const rows = computeCategoryRows(teamStats, cfg.key, cfg.lowerIsBetter);
      const best = rows.find((r) => r.rank === 1);
      if (best) {
        categoryKings.push({
          category: cfg.key,
          label: cfg.label,
          teamName: best.teamName,
          teamCode: best.teamCode,
          value: best.value,
          isLowerBetter: cfg.lowerIsBetter,
        });
      }
    }
  }

  return {
    periodId,
    periodName: period.name,
    managerOfPeriod,
    pickupOfPeriod,
    categoryKings,
  };
}
