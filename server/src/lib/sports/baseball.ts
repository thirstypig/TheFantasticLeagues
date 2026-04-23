/**
 * Baseball-specific sport configuration.
 * Extracted from server/src/lib/sportConfig.ts — Phase 1 extract refactor.
 */

import type { SportConfig, PositionConfig, CategoryConfig } from "./types.js";

// ─── Position Configuration ───

export const POS_ORDER = ["C", "1B", "2B", "3B", "SS", "MI", "CM", "OF", "SP", "RP", "P", "DH"] as const;

export const PITCHER_CODES = ["P", "SP", "RP", "CL", "TWP"] as const;

export const POSITIONS = ["C", "1B", "2B", "3B", "SS", "MI", "CM", "OF", "DH", "P", "SP", "RP", "BN", "IL"] as const;

// ─── Position-to-Slot Mapping ───

/** Map a player's MLB position to the roster slot(s) it can fill. */
export function positionToSlots(pos: string): string[] {
  const p = pos.trim().toUpperCase();
  if (p === "C") return ["C"];
  if (p === "1B") return ["1B", "CM"];
  if (p === "2B") return ["2B", "MI"];
  if (p === "3B") return ["3B", "CM"];
  if (p === "SS") return ["SS", "MI"];
  if (p === "LF" || p === "CF" || p === "RF" || p === "OF") return ["OF"];
  if (p === "DH") return ["DH"];
  if (p === "P" || p === "SP" || p === "RP" || p === "CL" || p === "TWP") return ["P"];
  return [];
}

// ─── Category Configuration ───

export const CATEGORY_CONFIG = [
  { key: "R", label: "Runs", lowerIsBetter: false, group: "H" },
  { key: "HR", label: "Home Runs", lowerIsBetter: false, group: "H" },
  { key: "RBI", label: "RBI", lowerIsBetter: false, group: "H" },
  { key: "SB", label: "Stolen Bases", lowerIsBetter: false, group: "H" },
  { key: "AVG", label: "Average", lowerIsBetter: false, group: "H" },
  { key: "W", label: "Wins", lowerIsBetter: false, group: "P" },
  { key: "SV", label: "Saves", lowerIsBetter: false, group: "P" },
  { key: "ERA", label: "ERA", lowerIsBetter: true, group: "P" },
  { key: "WHIP", label: "WHIP", lowerIsBetter: true, group: "P" },
  { key: "K", label: "Strikeouts", lowerIsBetter: false, group: "P" },
] as const;

export type CategoryKey = (typeof CATEGORY_CONFIG)[number]["key"];

/** Map config keys to DB column names where they differ. */
export const KEY_TO_DB_FIELD: Partial<Record<CategoryKey, string>> = {
  SV: "S",
};

// ─── Default League Rules ───

export const DEFAULT_RULES = [
  // Overview
  // NOTE: `team_count` is NOT here — authoritative value is `League.maxTeams`.
  // `entry_fee` is NOT here — authoritative value is `League.entryFee`.
  // See docs/RULES_AUDIT.md for the two-system history.
  { category: "overview", key: "stats_source", value: "NL", label: "Stats Source" },
  // Roster
  { category: "roster", key: "pitcher_count", value: "9", label: "Pitchers per Team" },
  { category: "roster", key: "batter_count", value: "14", label: "Batters per Team" },
  { category: "roster", key: "roster_positions", value: JSON.stringify({ "C": 2, "1B": 1, "2B": 1, "3B": 1, "SS": 1, "MI": 1, "CM": 1, "OF": 5, "DH": 1 }), label: "Batter Positions" },
  { category: "roster", key: "outfield_mode", value: "OF", label: "Outfield Position Display" },
  { category: "roster", key: "dh_games_threshold", value: "20", label: "DH Games Threshold" },
  { category: "roster", key: "position_eligibility_gp", value: "3", label: "Position Eligibility (GP)" },
  { category: "roster", key: "pitcher_split", value: "P_ONLY", label: "Pitcher Positions" },
  // Scoring
  { category: "scoring", key: "hitting_stats", value: JSON.stringify(["R", "HR", "RBI", "SB", "AVG", "OPS", "H", "2B", "3B", "BB"]), label: "Hitting Categories" },
  { category: "scoring", key: "pitching_stats", value: JSON.stringify(["W", "SV", "K", "ERA", "WHIP", "QS", "HLD", "IP", "CG", "SHO"]), label: "Pitching Categories" },
  { category: "scoring", key: "min_innings", value: "50", label: "Minimum Innings per Period" },
  // Draft
  { category: "draft", key: "draft_mode", value: "AUCTION", label: "Draft Mode" },
  { category: "draft", key: "draft_type", value: "SNAKE", label: "Draft Type" },
  { category: "draft", key: "auction_budget", value: "400", label: "Auction Budget ($)" },
  { category: "draft", key: "min_bid", value: "1", label: "Minimum Bid ($)" },
  { category: "draft", key: "bid_timer", value: "15", label: "Bid Timer (seconds)" },
  { category: "draft", key: "nomination_timer", value: "30", label: "Nomination Timer (seconds)" },
  { category: "draft", key: "keeper_count", value: "4", label: "Keepers per Team" },
  // IL
  { category: "il", key: "il_slot_1_cost", value: "10", label: "1st IL Slot Cost ($)" },
  { category: "il", key: "il_slot_2_cost", value: "15", label: "2nd IL Slot Cost ($)" },
  // Transactions — permission toggles.
  // Default 'false' keeps add/drop + IL management commissioner-only. Flip
  // to 'true' to let team owners run these transactions on their own team.
  // Exempt from isLocked (see CommissionerService.updateRules) so commissioners
  // can change the policy mid-season without unlocking every rule.
  { category: "transactions", key: "owner_self_serve", value: "false", label: "Owner self-serve roster moves" },
  // Bonuses
  { category: "bonuses", key: "grand_slam", value: "5", label: "Grand Slam Bonus ($)" },
  { category: "bonuses", key: "shutout", value: "5", label: "Shutout Bonus ($)" },
  { category: "bonuses", key: "cycle", value: "10", label: "Cycle Bonus ($)" },
  { category: "bonuses", key: "no_hitter", value: "15", label: "No Hitter Bonus ($)" },
  { category: "bonuses", key: "perfect_game", value: "25", label: "Perfect Game Bonus ($)" },
  { category: "bonuses", key: "mvp", value: "25", label: "MVP Award ($)" },
  { category: "bonuses", key: "cy_young", value: "25", label: "Cy Young Award ($)" },
  { category: "bonuses", key: "roy", value: "10", label: "Rookie of the Year ($)" },
  // Payouts — entry fee lives on `League.entryFee`, not here.
  { category: "payouts", key: "payout_1st", value: "40", label: "1st Place (%)" },
  { category: "payouts", key: "payout_2nd", value: "25", label: "2nd Place (%)" },
  { category: "payouts", key: "payout_3rd", value: "15", label: "3rd Place (%)" },
  { category: "payouts", key: "payout_4th", value: "10", label: "4th Place (%)" },
  { category: "payouts", key: "payout_5th", value: "5", label: "5th Place (%)" },
  { category: "payouts", key: "payout_6th", value: "3", label: "6th Place (%)" },
  { category: "payouts", key: "payout_7th", value: "2", label: "7th Place (%)" },
  { category: "payouts", key: "payout_8th", value: "0", label: "8th Place (%)" },
] as const;

// ─── Opening Day Dates ───

/** Opening day dates by year — used for MLB API team lookups. */
export const OPENING_DAYS: Record<number, string> = {
  2008: '2008-03-25', 2009: '2009-04-05', 2010: '2010-04-04',
  2011: '2011-03-31', 2012: '2012-03-28', 2013: '2013-03-31',
  2014: '2014-03-22', 2015: '2015-04-05', 2016: '2016-04-03',
  2017: '2017-04-02', 2018: '2018-03-29', 2019: '2019-03-20',
  2020: '2020-07-23', 2021: '2021-04-01', 2022: '2022-04-07',
  2023: '2023-03-30', 2024: '2024-03-20', 2025: '2025-03-18',
  2026: '2026-03-25',
};

// ─── Special Players ───

/** Ohtani's MLB ID for dual-role handling. */
export const OHTANI_MLB_ID = 660271;
export const OHTANI_PITCHER_MLB_ID = 1660271;

export const TWO_WAY_PLAYERS: ReadonlyMap<number, { hitterPos: string; name: string }> = new Map([
  // Empty — Ohtani split into separate player records.
  // Do NOT re-populate: this map gates expandTwoWayPlayers(), splitTwoWayStats(),
  // and standings two-way attribution in 6+ code paths. Use POSITION_OVERRIDES below.
]);

/**
 * Position overrides for the daily sync. Maps MLB ID → display position.
 * Separate from TWO_WAY_PLAYERS (which gates stat expansion/splitting and must
 * remain empty for the two-record Ohtani architecture).
 * This map ONLY affects resolvePosition() in mlbSyncService.
 */
export const POSITION_OVERRIDES: ReadonlyMap<number, string> = new Map([
  [660271, "DH"], // Ohtani hitter — MLB API returns "TWP", we want "DH"
]);

// ─── Keeper Detection ───

export const KEEPER_SOURCE = "prior_season" as const;

export function isKeeperRoster(r: { source?: string | null }): boolean {
  return r.source === KEEPER_SOURCE;
}

// ─── Pitcher Detection ───

export function isPitcher(pos: string): boolean {
  const s = pos.trim().toUpperCase();
  return s === "P" || s === "SP" || s === "RP" || s === "CL" || s === "TWP";
}

// ─── Sport Config Object ───

const baseballPositions: PositionConfig[] = [
  { code: "C", name: "Catcher", group: "H" },
  { code: "1B", name: "First Base", group: "H", isMultiSlot: true, slotEligible: ["1B", "CM"] },
  { code: "2B", name: "Second Base", group: "H", isMultiSlot: true, slotEligible: ["2B", "MI"] },
  { code: "3B", name: "Third Base", group: "H", isMultiSlot: true, slotEligible: ["3B", "CM"] },
  { code: "SS", name: "Shortstop", group: "H", isMultiSlot: true, slotEligible: ["SS", "MI"] },
  { code: "MI", name: "Middle Infield", group: "H" },
  { code: "CM", name: "Corner", group: "H" },
  { code: "OF", name: "Outfield", group: "H" },
  { code: "DH", name: "Designated Hitter", group: "H" },
  { code: "SP", name: "Starting Pitcher", group: "P" },
  { code: "RP", name: "Relief Pitcher", group: "P" },
  { code: "P", name: "Pitcher", group: "P" },
];

const baseballCategories: CategoryConfig[] = CATEGORY_CONFIG.map((c) => ({
  id: c.key,
  name: c.label,
  group: c.group,
  isLowerBetter: c.lowerIsBetter || undefined,
  formatFn: c.group === "H" && c.key === "AVG" ? "fmtRate" : c.lowerIsBetter ? "fmt2" : "integer",
}));

export const baseballConfig: SportConfig = {
  id: "baseball",
  name: "Fantasy Baseball",
  positions: baseballPositions,
  categories: baseballCategories,
  rosterSlots: { C: 2, "1B": 1, "2B": 1, "3B": 1, SS: 1, MI: 1, CM: 1, OF: 5, DH: 1, P: 9 },
  scoringFormats: ["ROTO", "H2H_CATEGORIES", "H2H_POINTS"],
  draftFormats: ["auction", "snake"],
  seasonMonths: [3, 9],
  dataProvider: "mlb-stats-api",
  defaultRules: Object.fromEntries(DEFAULT_RULES.map((r) => [`${r.category}.${r.key}`, r.value])),
};
