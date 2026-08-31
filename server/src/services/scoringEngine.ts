import { Sport } from "@prisma/client";

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
