// server/src/features/matchups/services/matchupScoring.ts
import { prisma } from "../../../db/prisma.js";

interface TeamWeekStats {
  teamId: number;
  R: number; HR: number; RBI: number; SB: number; AVG: number;
  W: number; SV: number; K: number; ERA: number; WHIP: number;
}

interface CategoryResult {
  stat: string;
  teamAVal: number;
  teamBVal: number;
  winner: "A" | "B" | "TIE";
}

export interface MatchupResult {
  teamA: { catWins: number; catLosses: number; catTies: number; totalPoints: number };
  teamB: { catWins: number; catLosses: number; catTies: number; totalPoints: number };
  categories: CategoryResult[];
}

const HITTING_CATS = ["R", "HR", "RBI", "SB", "AVG"] as const;
const PITCHING_CATS = ["W", "SV", "K", "ERA", "WHIP"] as const;
const INVERSE_CATS = new Set(["ERA", "WHIP"]); // lower is better

/**
 * Compute H2H category matchup result for two teams for a given period.
 */
export async function scoreH2HCategories(
  teamAId: number,
  teamBId: number,
  periodId: number,
): Promise<MatchupResult> {
  const [statsA, statsB] = await Promise.all([
    prisma.teamStatsPeriod.findUnique({ where: { teamId_periodId: { teamId: teamAId, periodId } } }),
    prisma.teamStatsPeriod.findUnique({ where: { teamId_periodId: { teamId: teamBId, periodId } } }),
  ]);

  const categories: CategoryResult[] = [];
  let aWins = 0, bWins = 0, ties = 0;

  const allCats = [...HITTING_CATS, ...PITCHING_CATS];
  for (const stat of allCats) {
    const aVal = (statsA as any)?.[stat === "SV" ? "S" : stat] ?? 0;
    const bVal = (statsB as any)?.[stat === "SV" ? "S" : stat] ?? 0;

    let winner: "A" | "B" | "TIE";
    if (INVERSE_CATS.has(stat)) {
      // Lower is better (but 0 means no IP — treat as loss)
      if (aVal === 0 && bVal === 0) winner = "TIE";
      else if (aVal === 0) winner = "B";
      else if (bVal === 0) winner = "A";
      else winner = aVal < bVal ? "A" : aVal > bVal ? "B" : "TIE";
    } else {
      winner = aVal > bVal ? "A" : aVal < bVal ? "B" : "TIE";
    }

    if (winner === "A") aWins++;
    else if (winner === "B") bWins++;
    else ties++;

    categories.push({ stat, teamAVal: aVal, teamBVal: bVal, winner });
  }

  return {
    teamA: { catWins: aWins, catLosses: bWins, catTies: ties, totalPoints: 0 },
    teamB: { catWins: bWins, catLosses: aWins, catTies: ties, totalPoints: 0 },
    categories,
  };
}

/**
 * Compute H2H points matchup result using weighted stat values.
 */
export async function scoreH2HPoints(
  teamAId: number,
  teamBId: number,
  periodId: number,
  pointValues: Record<string, number>,
): Promise<MatchupResult> {
  const [statsA, statsB] = await Promise.all([
    prisma.teamStatsPeriod.findUnique({ where: { teamId_periodId: { teamId: teamAId, periodId } } }),
    prisma.teamStatsPeriod.findUnique({ where: { teamId_periodId: { teamId: teamBId, periodId } } }),
  ]);

  function calcPoints(stats: any): number {
    if (!stats) return 0;
    let total = 0;
    for (const [stat, weight] of Object.entries(pointValues)) {
      const key = stat === "SV" ? "S" : stat;
      const val = stats[key] ?? 0;
      total += val * weight;
    }
    return Math.round(total * 10) / 10;
  }

  const aPoints = calcPoints(statsA);
  const bPoints = calcPoints(statsB);

  return {
    teamA: { catWins: 0, catLosses: 0, catTies: 0, totalPoints: aPoints },
    teamB: { catWins: 0, catLosses: 0, catTies: 0, totalPoints: bPoints },
    categories: [],
  };
}
