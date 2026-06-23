/**
 * NBA-specific sport configuration.
 * Phase 4: NBA scoring and roster rules (stub).
 */

import type { SportConfig, PositionConfig, CategoryConfig } from "./types.js";

// ─── Position Configuration ───

export const POSITIONS = ["PG", "SG", "SF", "PF", "C"] as const;

// ─── Categories ───

export const CATEGORY_CONFIG = [
  { id: "pts", name: "Points", group: "all", isLowerBetter: false },
  { id: "reb", name: "Rebounds", group: "all", isLowerBetter: false },
  { id: "ast", name: "Assists", group: "all", isLowerBetter: false },
  { id: "stl", name: "Steals", group: "all", isLowerBetter: false },
  { id: "blk", name: "Blocks", group: "all", isLowerBetter: false },
  { id: "3pm", name: "Three-Pointers Made", group: "all", isLowerBetter: false },
  { id: "fg%", name: "Field Goal %", group: "all", isLowerBetter: false },
  { id: "ft%", name: "Free Throw %", group: "all", isLowerBetter: false },
  { id: "to", name: "Turnovers", group: "all", isLowerBetter: true },
] as const;

// ─── Default League Rules ───

export const DEFAULT_RULES = [
  { category: "overview", key: "stats_source", value: "NBA", label: "Stats Source" },
  { category: "roster", key: "pg_count", value: "1", label: "Point Guards per Team" },
  { category: "roster", key: "sg_count", value: "1", label: "Shooting Guards per Team" },
  { category: "roster", key: "sf_count", value: "1", label: "Small Forwards per Team" },
  { category: "roster", key: "pf_count", value: "1", label: "Power Forwards per Team" },
  { category: "roster", key: "c_count", value: "1", label: "Centers per Team" },
  { category: "roster", key: "bench_count", value: "3", label: "Bench Spots per Team" },
  { category: "scoring", key: "pts_per_stat", value: "1", label: "Points per Point Scored" },
  { category: "scoring", key: "reb_per_stat", value: "1.2", label: "Points per Rebound" },
  { category: "scoring", key: "ast_per_stat", value: "1.5", label: "Points per Assist" },
  { category: "scoring", key: "stl_per_stat", value: "2", label: "Points per Steal" },
  { category: "scoring", key: "blk_per_stat", value: "2", label: "Points per Block" },
  { category: "scoring", key: "3pm_per_stat", value: "1", label: "Points per Three-Pointer" },
  { category: "scoring", key: "to_per_stat", value: "-1", label: "Points per Turnover" },
  { category: "draft", key: "draft_mode", value: "SNAKE", label: "Draft Mode" },
  { category: "draft", key: "rounds", value: "13", label: "Draft Rounds" },
  { category: "draft", key: "seconds_per_pick", value: "60", label: "Seconds per Pick" },
  { category: "payouts", key: "payout_1st", value: "40", label: "1st Place (%)" },
  { category: "payouts", key: "payout_2nd", value: "25", label: "2nd Place (%)" },
  { category: "payouts", key: "payout_3rd", value: "15", label: "3rd Place (%)" },
  { category: "payouts", key: "payout_4th", value: "10", label: "4th Place (%)" },
  { category: "payouts", key: "payout_5th", value: "5", label: "5th Place (%)" },
  { category: "payouts", key: "payout_6th", value: "3", label: "6th Place (%)" },
  { category: "payouts", key: "payout_7th", value: "2", label: "7th Place (%)" },
  { category: "payouts", key: "payout_8th", value: "0", label: "8th Place (%)" },
] as const;

// ─── Sport Config Object ───

const nbaPositions: PositionConfig[] = [
  { code: "PG", name: "Point Guard", group: "all" },
  { code: "SG", name: "Shooting Guard", group: "all" },
  { code: "SF", name: "Small Forward", group: "all" },
  { code: "PF", name: "Power Forward", group: "all" },
  { code: "C", name: "Center", group: "all" },
];

const nbaCategories: CategoryConfig[] = CATEGORY_CONFIG.map((c) => ({
  id: c.id,
  name: c.name,
  group: c.group,
  isLowerBetter: c.isLowerBetter,
}));

export const nbaConfig: SportConfig = {
  id: "nba",
  name: "Fantasy Basketball",
  positions: nbaPositions,
  categories: nbaCategories,
  rosterSlots: { PG: 1, SG: 1, SF: 1, PF: 1, C: 1, BENCH: 3 },
  scoringFormats: ["H2H_CATEGORIES", "POINTS"],
  draftFormats: ["snake"],
  seasonMonths: [10, 4],
  dataProvider: "nba-api",
  defaultRules: Object.fromEntries(DEFAULT_RULES.map((r) => [`${r.category}.${r.key}`, r.value])),
};
