/**
 * Scoring Engine — Strategy pattern for multiple scoring formats.
 *
 * Three implementations:
 *   1. RotoScoringEngine       — existing roto points system
 *   2. H2HCategoryScoringEngine — weekly matchups, category wins
 *   3. PointsScoringEngine      — fantasy points per stat event
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../../../db/prisma.js";
import {
  computeTeamStatsFromDb,
  computeStandingsFromStats,
  type TeamStatRow,
} from "./standingsService.js";

// ─── Types ───

export interface StandingRow {
  teamId: number;
  teamName: string;
  teamCode: string;
  points: number;
  rank: number;
  record?: string; // "5-3-2" for H2H
  wins?: number;
  losses?: number;
  ties?: number;
  pct?: number;
  gb?: number;
  categories?: Record<string, { value: number; rank: number; points: number }>;
}

export interface ScoringEngine {
  /** Compute standings for a single period. */
  computePeriodStandings(leagueId: number, periodId: number): Promise<StandingRow[]>;
  /** Compute season-level standings (cumulative). */
  computeSeasonStandings(leagueId: number): Promise<StandingRow[]>;
}

// ─── Default Points Config ───

export const DEFAULT_POINTS_CONFIG: Record<string, number> = {
  R: 1, HR: 4, RBI: 1, SB: 2, H: 0.5,
  W: 7, SV: 5, K: 1,
};

// ─── 1. Roto Scoring Engine ───

export class RotoScoringEngine implements ScoringEngine {
  async computePeriodStandings(leagueId: number, periodId: number): Promise<StandingRow[]> {
    const teamStats = await computeTeamStatsFromDb(leagueId, periodId);
    const standings = computeStandingsFromStats(teamStats);
    return standings.map((s) => ({
      teamId: s.teamId,
      teamName: s.teamName,
      teamCode: teamStats.find((t) => t.team.id === s.teamId)?.team.code ?? s.teamName.substring(0, 3).toUpperCase(),
      points: s.points,
      rank: s.rank,
    }));
  }

  async computeSeasonStandings(leagueId: number): Promise<StandingRow[]> {
    const periods = await prisma.period.findMany({
      where: { leagueId, status: { in: ["active", "completed"] } },
      orderBy: { startDate: "asc" },
    });

    // Accumulate roto points across periods
    const teamTotals = new Map<number, { teamName: string; teamCode: string; points: number }>();

    for (const period of periods) {
      const periodStandings = await this.computePeriodStandings(leagueId, period.id);
      for (const s of periodStandings) {
        const existing = teamTotals.get(s.teamId);
        if (existing) {
          existing.points += s.points;
        } else {
          teamTotals.set(s.teamId, { teamName: s.teamName, teamCode: s.teamCode, points: s.points });
        }
      }
    }

    const sorted = [...teamTotals.entries()]
      .map(([teamId, data]) => ({ teamId, ...data }))
      .sort((a, b) => b.points - a.points);

    return sorted.map((s, idx) => ({
      teamId: s.teamId,
      teamName: s.teamName,
      teamCode: s.teamCode,
      points: s.points,
      rank: idx + 1,
    }));
  }
}

// ─── 2. H2H Category Scoring Engine ───

export class H2HCategoryScoringEngine implements ScoringEngine {
  async computePeriodStandings(leagueId: number, periodId: number): Promise<StandingRow[]> {
    // For a single period, show roto-style category breakdown (useful for period detail)
    const teamStats = await computeTeamStatsFromDb(leagueId, periodId);
    const standings = computeStandingsFromStats(teamStats);
    return standings.map((s) => ({
      teamId: s.teamId,
      teamName: s.teamName,
      teamCode: teamStats.find((t) => t.team.id === s.teamId)?.team.code ?? s.teamName.substring(0, 3).toUpperCase(),
      points: s.points,
      rank: s.rank,
    }));
  }

  async computeSeasonStandings(leagueId: number): Promise<StandingRow[]> {
    // Preload all teams for name/code lookup
    const allTeams = await prisma.team.findMany({
      where: { leagueId },
      select: { id: true, name: true, code: true },
    });
    const teamMap = new Map(allTeams.map(t => [t.id, t]));

    // Season standings = cumulative W-L-T from scored matchups
    const matchups = await prisma.matchup.findMany({
      where: { leagueId, result: { not: Prisma.JsonNull } },
    });

    const records = new Map<number, { teamName: string; teamCode: string; wins: number; losses: number; ties: number }>();

    const getOrCreate = (id: number) => {
      if (!records.has(id)) {
        const t = teamMap.get(id);
        records.set(id, { teamName: t?.name ?? `Team ${id}`, teamCode: t?.code ?? `T${id}`, wins: 0, losses: 0, ties: 0 });
      }
      return records.get(id)!;
    };

    for (const m of matchups) {
      const result = m.result as any;
      if (!result) continue;

      const recA = getOrCreate(m.teamAId);
      const recB = getOrCreate(m.teamBId);

      // Each individual category win/loss counts toward season record
      recA.wins += result.teamA?.catWins ?? 0;
      recA.losses += result.teamA?.catLosses ?? 0;
      recA.ties += result.teamA?.catTies ?? 0;
      recB.wins += result.teamB?.catWins ?? 0;
      recB.losses += result.teamB?.catLosses ?? 0;
      recB.ties += result.teamB?.catTies ?? 0;
    }

    // Include teams with no matchups yet
    for (const t of allTeams) {
      getOrCreate(t.id);
    }

    const standings = [...records.entries()]
      .map(([teamId, r]) => {
        const total = r.wins + r.losses + r.ties;
        const pct = total > 0 ? (r.wins + 0.5 * r.ties) / total : 0;
        return { teamId, ...r, pct };
      })
      .sort((a, b) => b.pct - a.pct || b.wins - a.wins);

    const leader = standings[0];
    return standings.map((s, idx) => ({
      teamId: s.teamId,
      teamName: s.teamName,
      teamCode: s.teamCode,
      points: s.wins, // "points" = total category wins for sorting
      rank: idx + 1,
      record: `${s.wins}-${s.losses}-${s.ties}`,
      wins: s.wins,
      losses: s.losses,
      ties: s.ties,
      pct: Math.round(s.pct * 1000) / 1000,
      gb: idx === 0 ? 0 : Math.round(((leader.wins - s.wins) + (s.losses - leader.losses)) / 2 * 10) / 10,
    }));
  }
}

// ─── 3. Points Scoring Engine ───

export class PointsScoringEngine implements ScoringEngine {
  private pointsConfig: Record<string, number>;

  constructor(pointsConfig?: Record<string, number> | null) {
    this.pointsConfig = pointsConfig ?? DEFAULT_POINTS_CONFIG;
  }

  private calcTeamPoints(teamStats: TeamStatRow): number {
    let total = 0;
    for (const [stat, weight] of Object.entries(this.pointsConfig)) {
      // Map SV key to S (DB column name)
      const key = stat === "SV" ? "S" : stat;
      const val = (teamStats as any)[key] ?? 0;
      total += val * weight;
    }
    return Math.round(total * 10) / 10;
  }

  async computePeriodStandings(leagueId: number, periodId: number): Promise<StandingRow[]> {
    const teamStats = await computeTeamStatsFromDb(leagueId, periodId);
    const scored = teamStats.map((ts) => ({
      teamId: ts.team.id,
      teamName: ts.team.name,
      teamCode: ts.team.code,
      points: this.calcTeamPoints(ts),
    }));

    scored.sort((a, b) => b.points - a.points);
    return scored.map((s, idx) => ({ ...s, rank: idx + 1 }));
  }

  async computeSeasonStandings(leagueId: number): Promise<StandingRow[]> {
    // Preload teams
    const allTeams = await prisma.team.findMany({
      where: { leagueId },
      select: { id: true, name: true, code: true },
    });
    const teamMap = new Map(allTeams.map(t => [t.id, t]));

    // For points leagues with H2H matchups, season standings = W-L-T from matchup results
    const matchups = await prisma.matchup.findMany({
      where: { leagueId, result: { not: Prisma.JsonNull } },
    });

    if (matchups.length === 0) {
      // No matchups scored yet — fall back to cumulative points
      return this.computeCumulativeStandings(leagueId);
    }

    const records = new Map<number, { teamName: string; teamCode: string; wins: number; losses: number; ties: number; totalPoints: number }>();

    const getOrCreate = (id: number) => {
      if (!records.has(id)) {
        const t = teamMap.get(id);
        records.set(id, { teamName: t?.name ?? `Team ${id}`, teamCode: t?.code ?? `T${id}`, wins: 0, losses: 0, ties: 0, totalPoints: 0 });
      }
      return records.get(id)!;
    };

    for (const m of matchups) {
      const result = m.result as any;
      if (!result) continue;

      const recA = getOrCreate(m.teamAId);
      const recB = getOrCreate(m.teamBId);

      const ptsA = result.teamA?.totalPoints ?? 0;
      const ptsB = result.teamB?.totalPoints ?? 0;
      recA.totalPoints += ptsA;
      recB.totalPoints += ptsB;

      if (ptsA > ptsB) { recA.wins++; recB.losses++; }
      else if (ptsB > ptsA) { recB.wins++; recA.losses++; }
      else { recA.ties++; recB.ties++; }
    }

    // Include teams with no matchups
    for (const t of allTeams) {
      getOrCreate(t.id);
    }

    const standings = [...records.entries()]
      .map(([teamId, r]) => {
        const total = r.wins + r.losses + r.ties;
        const pct = total > 0 ? (r.wins + 0.5 * r.ties) / total : 0;
        return { teamId, ...r, pct };
      })
      .sort((a, b) => b.pct - a.pct || b.totalPoints - a.totalPoints);

    const leader = standings[0];
    return standings.map((s, idx) => ({
      teamId: s.teamId,
      teamName: s.teamName,
      teamCode: s.teamCode,
      points: s.totalPoints,
      rank: idx + 1,
      record: `${s.wins}-${s.losses}-${s.ties}`,
      wins: s.wins,
      losses: s.losses,
      ties: s.ties,
      pct: Math.round(s.pct * 1000) / 1000,
      gb: idx === 0 ? 0 : Math.round(((leader.wins - s.wins) + (s.losses - leader.losses)) / 2 * 10) / 10,
    }));
  }

  /** Fallback: cumulative points across all periods (no matchup data). */
  private async computeCumulativeStandings(leagueId: number): Promise<StandingRow[]> {
    const periods = await prisma.period.findMany({
      where: { leagueId, status: { in: ["active", "completed"] } },
      orderBy: { startDate: "asc" },
    });

    const teamTotals = new Map<number, { teamName: string; teamCode: string; points: number }>();

    for (const period of periods) {
      const periodStandings = await this.computePeriodStandings(leagueId, period.id);
      for (const s of periodStandings) {
        const existing = teamTotals.get(s.teamId);
        if (existing) {
          existing.points += s.points;
        } else {
          teamTotals.set(s.teamId, { teamName: s.teamName, teamCode: s.teamCode, points: s.points });
        }
      }
    }

    const sorted = [...teamTotals.entries()]
      .map(([teamId, data]) => ({ teamId, ...data }))
      .sort((a, b) => b.points - a.points);

    return sorted.map((s, idx) => ({
      teamId: s.teamId,
      teamName: s.teamName,
      teamCode: s.teamCode,
      points: s.points,
      rank: idx + 1,
    }));
  }
}

// ─── Factory ───

export type ScoringFormat = "ROTO" | "H2H_CATEGORIES" | "H2H_POINTS";

/**
 * Create the appropriate scoring engine for a league's format.
 * Reads league config from DB if needed (for points config).
 */
export async function createScoringEngine(leagueId: number): Promise<ScoringEngine> {
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { scoringFormat: true, pointsConfig: true },
  });

  const format = (league?.scoringFormat ?? "ROTO") as ScoringFormat;

  switch (format) {
    case "H2H_CATEGORIES":
      return new H2HCategoryScoringEngine();
    case "H2H_POINTS":
      return new PointsScoringEngine(league?.pointsConfig as Record<string, number> | null);
    case "ROTO":
    default:
      return new RotoScoringEngine();
  }
}

/**
 * Create a scoring engine from a known format (avoids DB lookup when league is already loaded).
 */
export function createScoringEngineFromFormat(
  format: ScoringFormat,
  pointsConfig?: Record<string, number> | null,
): ScoringEngine {
  switch (format) {
    case "H2H_CATEGORIES":
      return new H2HCategoryScoringEngine();
    case "H2H_POINTS":
      return new PointsScoringEngine(pointsConfig);
    case "ROTO":
    default:
      return new RotoScoringEngine();
  }
}
