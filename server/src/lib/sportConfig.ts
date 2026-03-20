/**
 * Centralized sport configuration for baseball (server-side).
 * All baseball-specific constants live here.
 */

// ─── Position Configuration ───

export const POS_ORDER = ["C", "1B", "2B", "3B", "SS", "MI", "CI", "OF", "SP", "RP", "P", "DH"] as const;

export const PITCHER_CODES = ["P", "SP", "RP", "TWP"] as const;

export const POSITIONS = ["C", "1B", "2B", "3B", "SS", "MI", "CI", "OF", "DH", "P", "SP", "RP", "BN", "IL"] as const;

// ─── Position-to-Slot Mapping ───

/** Map a player's MLB position to the roster slot(s) it can fill. */
export function positionToSlots(pos: string): string[] {
  const p = pos.trim().toUpperCase();
  if (p === "C") return ["C"];
  if (p === "1B") return ["1B", "CI"];
  if (p === "2B") return ["2B", "MI"];
  if (p === "3B") return ["3B", "CI"];
  if (p === "SS") return ["SS", "MI"];
  if (p === "LF" || p === "CF" || p === "RF" || p === "OF") return ["OF"];
  if (p === "DH") return ["DH"];
  if (p === "P" || p === "SP" || p === "RP" || p === "TWP") return ["P"];
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
  { category: "overview", key: "team_count", value: "8", label: "Number of Teams" },
  { category: "overview", key: "stats_source", value: "NL", label: "Stats Source" },
  // Roster
  { category: "roster", key: "pitcher_count", value: "9", label: "Pitchers per Team" },
  { category: "roster", key: "batter_count", value: "14", label: "Batters per Team" },
  { category: "roster", key: "roster_positions", value: JSON.stringify({ "C": 2, "1B": 1, "2B": 1, "3B": 1, "SS": 1, "MI": 1, "CI": 1, "OF": 5, "DH": 1 }), label: "Batter Positions" },
  { category: "roster", key: "outfield_mode", value: "OF", label: "Outfield Position Display" },
  { category: "roster", key: "dh_games_threshold", value: "20", label: "DH Games Threshold" },
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
  // Bonuses
  { category: "bonuses", key: "grand_slam", value: "5", label: "Grand Slam Bonus ($)" },
  { category: "bonuses", key: "shutout", value: "5", label: "Shutout Bonus ($)" },
  { category: "bonuses", key: "cycle", value: "10", label: "Cycle Bonus ($)" },
  { category: "bonuses", key: "no_hitter", value: "15", label: "No Hitter Bonus ($)" },
  { category: "bonuses", key: "perfect_game", value: "25", label: "Perfect Game Bonus ($)" },
  { category: "bonuses", key: "mvp", value: "25", label: "MVP Award ($)" },
  { category: "bonuses", key: "cy_young", value: "25", label: "Cy Young Award ($)" },
  { category: "bonuses", key: "roy", value: "10", label: "Rookie of the Year ($)" },
  // Payouts
  { category: "payouts", key: "entry_fee", value: "300", label: "Team Entry Fee ($)" },
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

/**
 * Two-way players who should appear as both a hitter and a pitcher in player lists.
 * Map of mlbId → { hitterPos: position for hitter row, name: display name }.
 * When synced from MLB roster API, these players typically come in as "DH" only.
 */
export const TWO_WAY_PLAYERS: ReadonlyMap<number, { hitterPos: string; name: string }> = new Map([
  [OHTANI_MLB_ID, { hitterPos: "DH", name: "Shohei Ohtani" }],
]);

// ─── Pitcher Detection ───

export function isPitcher(pos: string): boolean {
  const s = pos.trim().toUpperCase();
  return s === "P" || s === "SP" || s === "RP" || s === "TWP";
}
