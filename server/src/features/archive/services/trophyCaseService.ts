import { prisma } from '../../../db/prisma.js';
import { logger } from '../../../lib/logger.js';

export interface ChampionshipEntry {
  year: number;
  teamName: string;
  teamCode: string;
}

export interface AllTimeStandingEntry {
  teamCode: string;
  teamName: string;
  totalPoints: number;
  seasons: number;
  avgRank: number;
  avgScore: number;
}

export interface Records {
  bestSeason: { year: number; teamCode: string; teamName: string; totalScore: number } | null;
  worstSeason: { year: number; teamCode: string; teamName: string; totalScore: number } | null;
  mostChampionships: { teamCode: string; teamName: string; count: number } | null;
  bestCategoryBySeason: Record<string, { year: number; teamCode: string; teamName: string; value: number }>;
}

export interface DynastyScoreEntry {
  teamCode: string;
  teamName: string;
  score: number;
  championships: number;
  seasons: number;
  avgRank: number;
}

export interface TrophyCase {
  championships: ChampionshipEntry[];
  allTimeStandings: AllTimeStandingEntry[];
  records: Records;
  dynastyScores: DynastyScoreEntry[];
}

/**
 * Compute the full trophy case from HistoricalStanding data across all seasons.
 */
export async function computeTrophyCase(leagueId: number): Promise<TrophyCase> {
  // Fetch all historical standings for the league (or all if leagueId not set on seasons)
  const standings = await prisma.historicalStanding.findMany({
    where: {
      season: {
        OR: [
          { leagueId },
          { leagueId: null }, // include legacy seasons without leagueId
        ],
      },
    },
    include: {
      season: { select: { year: true } },
    },
    orderBy: { season: { year: 'asc' } },
  });

  if (standings.length === 0) {
    return {
      championships: [],
      allTimeStandings: [],
      records: {
        bestSeason: null,
        worstSeason: null,
        mostChampionships: null,
        bestCategoryBySeason: {},
      },
      dynastyScores: [],
    };
  }

  // Total number of teams per season (needed for dynasty score)
  const teamsPerSeason = new Map<number, number>();
  for (const s of standings) {
    const year = s.season.year;
    teamsPerSeason.set(year, (teamsPerSeason.get(year) ?? 0) + 1);
  }

  // --- Championships ---
  const championships: ChampionshipEntry[] = standings
    .filter(s => s.finalRank === 1)
    .map(s => ({ year: s.season.year, teamName: s.teamName, teamCode: s.teamCode }));

  // --- All-Time Standings & Dynasty Scores ---
  const teamAgg = new Map<string, {
    teamName: string;
    totalPoints: number;
    seasons: number;
    totalRank: number;
    championships: number;
    dynastyScore: number;
  }>();

  for (const s of standings) {
    const N = teamsPerSeason.get(s.season.year) ?? 8;
    let entry = teamAgg.get(s.teamCode);
    if (!entry) {
      entry = { teamName: s.teamName, totalPoints: 0, seasons: 0, totalRank: 0, championships: 0, dynastyScore: 0 };
      teamAgg.set(s.teamCode, entry);
    }
    // Keep the most recent team name
    entry.teamName = s.teamName;
    entry.totalPoints += s.totalScore;
    entry.seasons += 1;
    entry.totalRank += s.finalRank;

    // Dynasty scoring
    if (s.finalRank === 1) {
      entry.championships += 1;
      entry.dynastyScore += 100;
    } else if (s.finalRank === 2) {
      entry.dynastyScore += 60;
    } else if (s.finalRank === 3) {
      entry.dynastyScore += 40;
    }
    // Per-season participation + finish bonus
    entry.dynastyScore += (N - s.finalRank + 1) * 5;
    entry.dynastyScore += 5; // seasons played bonus
  }

  const allTimeStandings: AllTimeStandingEntry[] = Array.from(teamAgg.entries())
    .map(([teamCode, agg]) => ({
      teamCode,
      teamName: agg.teamName,
      totalPoints: agg.totalPoints,
      seasons: agg.seasons,
      avgRank: Math.round((agg.totalRank / agg.seasons) * 10) / 10,
      avgScore: Math.round((agg.totalPoints / agg.seasons) * 10) / 10,
    }))
    .sort((a, b) => b.totalPoints - a.totalPoints);

  const dynastyScores: DynastyScoreEntry[] = Array.from(teamAgg.entries())
    .map(([teamCode, agg]) => ({
      teamCode,
      teamName: agg.teamName,
      score: agg.dynastyScore,
      championships: agg.championships,
      seasons: agg.seasons,
      avgRank: Math.round((agg.totalRank / agg.seasons) * 10) / 10,
    }))
    .sort((a, b) => b.score - a.score);

  // --- Records ---
  let bestSeason: Records['bestSeason'] = null;
  let worstSeason: Records['worstSeason'] = null;

  for (const s of standings) {
    if (!bestSeason || s.totalScore > bestSeason.totalScore) {
      bestSeason = { year: s.season.year, teamCode: s.teamCode, teamName: s.teamName, totalScore: s.totalScore };
    }
    if (!worstSeason || s.totalScore < worstSeason.totalScore) {
      worstSeason = { year: s.season.year, teamCode: s.teamCode, teamName: s.teamName, totalScore: s.totalScore };
    }
  }

  // Most championships
  let mostChampionships: Records['mostChampionships'] = null;
  for (const [teamCode, agg] of teamAgg.entries()) {
    if (agg.championships > 0 && (!mostChampionships || agg.championships > mostChampionships.count)) {
      mostChampionships = { teamCode, teamName: agg.teamName, count: agg.championships };
    }
  }

  // Best category scores by season
  const categoryFields = ['R', 'HR', 'RBI', 'SB', 'AVG', 'W', 'SV', 'K', 'ERA', 'WHIP'] as const;
  const bestCategoryBySeason: Records['bestCategoryBySeason'] = {};

  for (const cat of categoryFields) {
    const scoreField = `${cat}_score` as keyof typeof standings[0];
    let best: { year: number; teamCode: string; teamName: string; value: number } | null = null;

    for (const s of standings) {
      const val = s[scoreField] as number | null;
      if (val != null && (!best || val > best.value)) {
        best = { year: s.season.year, teamCode: s.teamCode, teamName: s.teamName, value: val };
      }
    }

    if (best) {
      bestCategoryBySeason[cat] = best;
    }
  }

  const records: Records = {
    bestSeason,
    worstSeason,
    mostChampionships,
    bestCategoryBySeason,
  };

  logger.info({ leagueId, seasonsCount: teamsPerSeason.size, teamsCount: teamAgg.size }, 'Trophy case computed');

  return { championships, allTimeStandings, records, dynastyScores };
}
