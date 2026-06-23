/**
 * Sport-agnostic category engine for standings computation.
 * Loads categories from league.scoringSettings; defaults to MLB if not specified.
 * Week 2 refactoring: Makes standings service category-agnostic.
 */

import { getSportConfig } from "../../../lib/sports/index.js";
import type { CategoryConfig } from "../../../lib/sports/types.js";

export interface CategoryDef {
  key: string;
  label: string;
  lowerIsBetter: boolean;
}

/**
 * Load categories for a league from its sport config and scoring settings.
 * Falls back to sport default if scoring settings don't specify categories.
 */
export function getLeagueCategories(sport: string = "baseball", customCategories?: string[]): CategoryDef[] {
  const sportConfig = getSportConfig(sport);

  // If custom categories are specified (from ScoringSettings), use those
  if (customCategories && customCategories.length > 0) {
    return customCategories.map((key) => {
      const categoryConfig = sportConfig.categories.find((c) => c.id === key);
      return {
        key,
        label: categoryConfig?.name ?? key,
        lowerIsBetter: categoryConfig?.isLowerBetter ?? false,
      };
    });
  }

  // Fall back to sport default categories
  return sportConfig.categories.map((c) => ({
    key: c.id,
    label: c.name,
    lowerIsBetter: c.isLowerBetter ?? false,
  }));
}

/**
 * Extract category value from a team stats row (generic Record).
 * Handles special cases like rate stats (AVG, ERA, WHIP) that must be computed from components.
 */
export function getCategoryValue(teamStats: Record<string, number>, category: CategoryDef, sport: string = "baseball"): number {
  // Direct lookup
  if (teamStats[category.key] !== undefined) {
    return teamStats[category.key];
  }

  // Sport-specific computed stats (e.g., baseball AVG, ERA, WHIP from components)
  if (sport === "baseball") {
    if (category.key === "AVG") {
      const ab = teamStats["AB"] ?? 0;
      const h = teamStats["H"] ?? 0;
      return ab > 0 ? h / ab : 0;
    }
    if (category.key === "ERA") {
      const ip = teamStats["IP"] ?? 0;
      const er = teamStats["ER"] ?? 0;
      return ip > 0 ? (er / ip) * 9 : 0;
    }
    if (category.key === "WHIP") {
      const ip = teamStats["IP"] ?? 0;
      const bb_h = teamStats["BB_H"] ?? 0;
      return ip > 0 ? bb_h / ip : 0;
    }
  }

  // Unknown category or missing stat — return 0
  return 0;
}

/**
 * Determine if a team stat row needs component computation.
 * (e.g., AVG requires AB + H, ERA requires IP + ER, WHIP requires IP + BB_H)
 */
export function hasComponentStats(teamStats: Record<string, number>, sport: string = "baseball"): boolean {
  if (sport !== "baseball") return false;
  return (
    (teamStats["H"] !== undefined || teamStats["AB"] !== undefined) ||
    (teamStats["ER"] !== undefined || teamStats["IP"] !== undefined) ||
    (teamStats["BB_H"] !== undefined || teamStats["IP"] !== undefined)
  );
}
