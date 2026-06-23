/**
 * Sport-agnostic type definitions for the sport registry.
 * Week 1 refactor: Extract baseball config, add NFL/NBA stubs.
 */

export interface SportConfig {
  id: string; // "baseball", "nfl", "nba"
  name: string;
  positions: PositionConfig[];
  categories: CategoryConfig[];
  rosterSlots: Record<string, number>;
  scoringFormats: string[];
  draftFormats: string[];
  seasonMonths: [number, number];
  dataProvider: string;
  defaultRules: Record<string, string>;
}

export interface PositionConfig {
  code: string;
  name: string;
  group: string;        // "H" for hitters, "P" for pitchers (MLB); "skill", "def" (NFL); "all" (NBA)
  isMultiSlot?: boolean;
  slotEligible?: string[]; // Which roster slots can use this position
}

export interface CategoryConfig {
  id: string;
  name: string;
  group: string;        // "H" for hitting, "P" for pitching (MLB); varies by sport
  isLowerBetter?: boolean; // e.g., ERA/WHIP are lower-better
  formatFn?: string;    // name of formatting function (fmtRate, fmt2, integer, etc.)
}

