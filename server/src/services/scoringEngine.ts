import { PrismaClient, ScoringRule, Sport } from "@prisma/client";
import { prisma as db } from "../db/prisma.js";

/**
 * Scoring rule input for creating default rules.
 * Used when initializing a new league's scoring rules.
 */
export interface ScoringRuleInput {
  statKey: string;
  label: string;
  pointValue: number;
  sortOrder: number;
  isCustom?: boolean;
}

/**
 * Category breakdown row in NBA comparison.
 * Shows per-category comparison between home and away.
 */
export interface NBACategory {
  category: string;
  homeValue: number;
  awayValue: number;
  winner: "home" | "away" | "tie";
}

/**
 * H2H matchup comparison result for NBA.
 * Tracks wins/losses/ties and category breakdown.
 */
export interface NBAMatchupComparison {
  homeWins: number;
  awayWins: number;
  ties: number;
  breakdown: NBACategory[];
}

/**
 * Standings row for a team in H2H format.
 * Tracks W/L/T, points for/against, and current streak.
 */
export interface StandingsRow {
  teamId: number;
  teamName: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  streak: string; // e.g. "W3", "L1", "T1"
}

/**
 * Calculate total fantasy points for an NFL player based on stats and active scoring rules.
 *
 * @param stats Raw player stats from BallDontLie (e.g., { passing_yards: 250, passing_touchdowns: 2 })
 * @param rules Active scoring rules for the league
 * @returns Total fantasy points (sum of all stat × pointValue products)
 *
 * @example
 * const points = calculateNFLPoints(
 *   { passing_yards: 250, passing_touchdowns: 2 },
 *   [
 *     { statKey: 'passing_yards', pointValue: 0.04 },
 *     { statKey: 'passing_touchdowns', pointValue: 4.0 }
 *   ]
 * );
 * // Result: (250 × 0.04) + (2 × 4.0) = 18.0 points
 */
export function calculateNFLPoints(
  stats: Record<string, number>,
  rules: ScoringRule[]
): number {
  return rules.reduce((total, rule) => {
    if (!rule.isActive) return total;

    const statValue = stats[rule.statKey] ?? 0;
    return total + statValue * rule.pointValue;
  }, 0);
}

/**
 * Extract per-category statistics for NBA from raw player stats.
 *
 * Maps BallDontLie stat keys to our category names and extracts active categories.
 * For percentage stats (fg_pct, ft_pct), returns the raw value (e.g., 0.453 for 45.3%).
 * For turnovers, extracts under the 'to' category name.
 *
 * @param stats Raw player stats from BallDontLie (e.g., { pts: 28.4, reb: 7.2, fg_pct: 0.453 })
 * @param rules Active scoring rules for the league (statKeys match category names)
 * @returns Per-category stats (e.g., { pts: 28.4, reb: 7.2, fg_pct: 0.453, to: 2.1 })
 *
 * @example
 * const categories = calculateNBACategories(
 *   { pts: 28.4, reb: 7.2, ast: 5.1, fg_pct: 0.453, fg3m: 2, to: 2.1 },
 *   [
 *     { statKey: 'pts' },
 *     { statKey: 'reb' },
 *     { statKey: 'fg_pct' },
 *     { statKey: 'to' }
 *   ]
 * );
 * // Result: { pts: 28.4, reb: 7.2, fg_pct: 0.453, to: 2.1 }
 */
export function calculateNBACategories(
  stats: Record<string, number>,
  rules: ScoringRule[]
): Record<string, number> {
  const result: Record<string, number> = {};

  for (const rule of rules) {
    if (!rule.isActive) continue;

    // Map BallDontLie keys to our category names
    let value = 0;
    if (rule.statKey === "to") {
      // Turnovers are stored as 'turnover' in BallDontLie
      value = stats["turnover"] ?? 0;
    } else if (rule.statKey === "three_pm") {
      // Three-pointers made stored as 'fg3m' in BallDontLie
      value = stats["fg3m"] ?? 0;
    } else {
      // Most stats map directly (pts, reb, ast, stl, blk, fg_pct, ft_pct)
      value = stats[rule.statKey] ?? 0;
    }

    result[rule.statKey] = value;
  }

  return result;
}

/**
 * Compare home and away NBA team statistics by category.
 *
 * For each active category, determines a winner:
 * - Higher value wins for most stats (pts, reb, ast, stl, blk, fg3m, fg_pct, ft_pct)
 * - Lower value wins for turnovers ('to') — fewer turnovers is better
 *
 * @param homeStats Home team per-category stats (from calculateNBACategories)
 * @param awayStats Away team per-category stats (from calculateNBACategories)
 * @param rules Active scoring rules for the league
 * @returns Matchup comparison with category breakdown and win totals
 *
 * @example
 * const result = compareNBACategories(
 *   { pts: 110.5, reb: 45.2, to: 12.1 },
 *   { pts: 105.2, reb: 48.1, to: 10.3 },
 *   [{ statKey: 'pts' }, { statKey: 'reb' }, { statKey: 'to' }]
 * );
 * // Result:
 * // {
 * //   homeWins: 1,
 * //   awayWins: 2,
 * //   ties: 0,
 * //   breakdown: [
 * //     { category: 'pts', homeValue: 110.5, awayValue: 105.2, winner: 'home' },
 * //     { category: 'reb', homeValue: 45.2, awayValue: 48.1, winner: 'away' },
 * //     { category: 'to', homeValue: 12.1, awayValue: 10.3, winner: 'away' }
 * //   ]
 * // }
 */
export function compareNBACategories(
  homeStats: Record<string, number>,
  awayStats: Record<string, number>,
  rules: ScoringRule[]
): NBAMatchupComparison {
  let homeWins = 0;
  let awayWins = 0;
  let ties = 0;
  const breakdown: NBACategory[] = [];

  const categoryLowerIsBetter = new Set(["to"]); // Turnovers: lower is better

  for (const rule of rules) {
    if (!rule.isActive) continue;

    const homeValue = homeStats[rule.statKey] ?? 0;
    const awayValue = awayStats[rule.statKey] ?? 0;

    let winner: "home" | "away" | "tie";
    if (homeValue === awayValue) {
      winner = "tie";
      ties++;
    } else if (categoryLowerIsBetter.has(rule.statKey)) {
      // For categories where lower is better, lower value wins
      winner = homeValue < awayValue ? "home" : "away";
      if (winner === "home") homeWins++;
      else awayWins++;
    } else {
      // For categories where higher is better, higher value wins
      winner = homeValue > awayValue ? "home" : "away";
      if (winner === "home") homeWins++;
      else awayWins++;
    }

    breakdown.push({
      category: rule.statKey,
      homeValue,
      awayValue,
      winner,
    });
  }

  return {
    homeWins,
    awayWins,
    ties,
    breakdown,
  };
}

/**
 * Calculate H2H standings for a league, season, and sport.
 *
 * Aggregates all finalized H2H matchups for the season:
 * - Accumulates wins/losses/ties and points for/against per team
 * - Calculates current streak from most recent matchups
 * - Sorts by wins (desc), then pointsFor (desc)
 *
 * @param leagueId League ID
 * @param season Season year (e.g., "2026")
 * @param sport Sport ('NFL' or 'NBA')
 * @returns Sorted standings array with teams' W/L/T, PF/PA, and streak
 *
 * @example
 * const standings = await calculateStandings(1, '2026', 'NFL');
 * // Result: [
 * //   { teamId: 5, teamName: 'Chiefs', wins: 8, losses: 2, ties: 0, pointsFor: 2850, pointsAgainst: 2640, streak: 'W3' },
 * //   { teamId: 3, teamName: 'Eagles', wins: 7, losses: 3, ties: 0, pointsFor: 2920, pointsAgainst: 2710, streak: 'L1' },
 * //   ...
 * // ]
 */
export async function calculateStandings(
  leagueId: number,
  season: string,
  sport: Sport
): Promise<StandingsRow[]> {
  // Query all finalized matchups for this league/season/sport
  const matchups = await db.h2HMatchup.findMany({
    where: {
      leagueId,
      season,
      sport,
      status: "FINAL",
    },
    include: {
      homeTeam: true,
      awayTeam: true,
    },
    orderBy: {
      createdAt: "desc", // Most recent first for streak calculation
    },
  });

  // Accumulate stats per team
  const teamStats = new Map<
    number,
    {
      teamId: number;
      teamName: string;
      wins: number;
      losses: number;
      ties: number;
      pointsFor: number;
      pointsAgainst: number;
      matchups: Array<{ opponent: string; result: "W" | "L" | "T" }>;
    }
  >();

  for (const matchup of matchups) {
    const homeId = matchup.homeTeamId;
    const awayId = matchup.awayTeamId;
    const homeName = matchup.homeTeam.name;
    const awayName = matchup.awayTeam.name;
    const homeScore = matchup.homeScore ?? 0;
    const awayScore = matchup.awayScore ?? 0;

    // Initialize team records if not present
    if (!teamStats.has(homeId)) {
      teamStats.set(homeId, {
        teamId: homeId,
        teamName: homeName,
        wins: 0,
        losses: 0,
        ties: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        matchups: [],
      });
    }
    if (!teamStats.has(awayId)) {
      teamStats.set(awayId, {
        teamId: awayId,
        teamName: awayName,
        wins: 0,
        losses: 0,
        ties: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        matchups: [],
      });
    }

    const homeStats = teamStats.get(homeId)!;
    const awayStats = teamStats.get(awayId)!;

    // Update points
    homeStats.pointsFor += homeScore;
    homeStats.pointsAgainst += awayScore;
    awayStats.pointsFor += awayScore;
    awayStats.pointsAgainst += homeScore;

    // Update W/L/T
    if (homeScore > awayScore) {
      homeStats.wins++;
      awayStats.losses++;
      homeStats.matchups.unshift({ opponent: awayName, result: "W" });
      awayStats.matchups.unshift({ opponent: homeName, result: "L" });
    } else if (awayScore > homeScore) {
      awayStats.wins++;
      homeStats.losses++;
      awayStats.matchups.unshift({ opponent: homeName, result: "W" });
      homeStats.matchups.unshift({ opponent: awayName, result: "L" });
    } else {
      homeStats.ties++;
      awayStats.ties++;
      homeStats.matchups.unshift({ opponent: awayName, result: "T" });
      awayStats.matchups.unshift({ opponent: homeName, result: "T" });
    }
  }

  // Calculate streaks and build output
  const standings: StandingsRow[] = [];
  const teamStatsArray = Array.from(teamStats.values());
  for (const stats of teamStatsArray) {
    let streak = "";
    if (stats.matchups.length > 0) {
      const lastResult = stats.matchups[0].result;
      let count = 1;
      for (let i = 1; i < stats.matchups.length && i < 10; i++) {
        if (stats.matchups[i].result === lastResult) {
          count++;
        } else {
          break;
        }
      }
      streak = `${lastResult}${count}`;
    }

    standings.push({
      teamId: stats.teamId,
      teamName: stats.teamName,
      wins: stats.wins,
      losses: stats.losses,
      ties: stats.ties,
      pointsFor: stats.pointsFor,
      pointsAgainst: stats.pointsAgainst,
      streak,
    });
  }

  // Sort: wins (desc), then pointsFor (desc)
  standings.sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.pointsFor - a.pointsFor;
  });

  return standings;
}

/**
 * Get default scoring rules for a given sport.
 *
 * Used when a commissioner creates a new league to seed initial scoring rules.
 * NFL uses PPR (1 point per reception) format.
 * NBA uses 9-category format (pts, reb, ast, stl, blk, fg3m, fg%, ft%, to).
 *
 * @param sport Sport ('NFL' or 'NBA')
 * @returns Array of default scoring rule inputs for the sport
 *
 * @example
 * const nflRules = getDefaultScoringRules('NFL');
 * const nbaRules = getDefaultScoringRules('NBA');
 */
export function getDefaultScoringRules(sport: Sport): ScoringRuleInput[] {
  if (sport === "NFL") {
    return [
      {
        statKey: "passing_td",
        label: "Passing TD",
        pointValue: 4.0,
        sortOrder: 1,
      },
      {
        statKey: "passing_yards",
        label: "Passing Yards",
        pointValue: 0.04,
        sortOrder: 2,
      },
      {
        statKey: "interception",
        label: "Interception",
        pointValue: -2.0,
        sortOrder: 3,
      },
      {
        statKey: "two_pt_conversion",
        label: "2-Point Conversion",
        pointValue: 2.0,
        sortOrder: 4,
      },
      {
        statKey: "rushing_td",
        label: "Rushing TD",
        pointValue: 6.0,
        sortOrder: 5,
      },
      {
        statKey: "rushing_yards",
        label: "Rushing Yards",
        pointValue: 0.1,
        sortOrder: 6,
      },
      {
        statKey: "reception",
        label: "Reception (PPR)",
        pointValue: 1.0,
        sortOrder: 7,
      },
      {
        statKey: "receiving_td",
        label: "Receiving TD",
        pointValue: 6.0,
        sortOrder: 8,
      },
      {
        statKey: "receiving_yards",
        label: "Receiving Yards",
        pointValue: 0.1,
        sortOrder: 9,
      },
      {
        statKey: "fumble_lost",
        label: "Fumble Lost",
        pointValue: -2.0,
        sortOrder: 10,
      },
      {
        statKey: "defensive_td",
        label: "Defensive TD",
        pointValue: 6.0,
        sortOrder: 11,
      },
    ];
  } else if (sport === "NBA") {
    return [
      { statKey: "pts", label: "Points", pointValue: 1.0, sortOrder: 1 },
      { statKey: "reb", label: "Rebounds", pointValue: 1.0, sortOrder: 2 },
      { statKey: "ast", label: "Assists", pointValue: 1.0, sortOrder: 3 },
      { statKey: "stl", label: "Steals", pointValue: 1.0, sortOrder: 4 },
      { statKey: "blk", label: "Blocks", pointValue: 1.0, sortOrder: 5 },
      {
        statKey: "three_pm",
        label: "Three-Pointers Made",
        pointValue: 1.0,
        sortOrder: 6,
      },
      { statKey: "fg_pct", label: "Field Goal %", pointValue: 1.0, sortOrder: 7 },
      { statKey: "ft_pct", label: "Free Throw %", pointValue: 1.0, sortOrder: 8 },
      { statKey: "to", label: "Turnovers", pointValue: 1.0, sortOrder: 9 },
    ];
  }

  return [];
}
