/**
 * Centralized sport configuration for baseball (server-side).
 * All baseball-specific constants live here.
 */

// ─── Position Configuration ───

export const POS_ORDER = ["C", "1B", "2B", "3B", "SS", "MI", "CI", "OF", "SP", "RP", "P", "DH"] as const;

export const PITCHER_CODES = ["P", "SP", "RP"] as const;

export const POSITIONS = ["C", "1B", "2B", "3B", "SS", "MI", "CI", "OF", "DH", "P", "SP", "RP", "BN", "IL"] as const;

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

// ─── Pitcher Detection ───

export function isPitcher(pos: string): boolean {
  const s = pos.trim().toUpperCase();
  return s === "P" || s === "SP" || s === "RP";
}
