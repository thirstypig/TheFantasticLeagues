/**
 * NFL-specific sport configuration.
 * Phase 4: NFL scoring and roster rules (stub).
 */

import type { SportConfig, PositionConfig, CategoryConfig } from "./types.js";

// ─── Position Configuration ───

export const POSITIONS = ["QB", "RB", "WR", "TE", "OL", "K", "DEF"] as const;

/** Map a player's NFL position to the roster slot(s) it can fill. */
export function nflPositionToSlots(pos: string): string[] {
  const p = pos.trim().toUpperCase();
  if (p === "QB") return ["QB"];
  if (p === "RB") return ["RB", "FLEX"];
  if (p === "WR") return ["WR", "FLEX"];
  if (p === "TE") return ["TE", "FLEX"];
  if (p === "K") return ["K"];
  if (p === "DEF") return ["DEF"];
  return [];
}

// ─── Categories ───

export const CATEGORY_CONFIG = [
  { id: "pass_yd", name: "Passing Yards", group: "skill", isLowerBetter: false },
  { id: "pass_td", name: "Passing Touchdowns", group: "skill", isLowerBetter: false },
  { id: "pass_int", name: "Interceptions", group: "skill", isLowerBetter: true },
  { id: "rush_yd", name: "Rushing Yards", group: "skill", isLowerBetter: false },
  { id: "rush_td", name: "Rushing Touchdowns", group: "skill", isLowerBetter: false },
  { id: "rec", name: "Receptions", group: "skill", isLowerBetter: false },
  { id: "rec_yd", name: "Receiving Yards", group: "skill", isLowerBetter: false },
  { id: "rec_td", name: "Receiving Touchdowns", group: "skill", isLowerBetter: false },
  { id: "ffl", name: "Fumbles", group: "skill", isLowerBetter: true },
  { id: "def_pts", name: "Defense Points", group: "def", isLowerBetter: false },
] as const;

// ─── Default League Rules ───

export const DEFAULT_RULES = [
  { category: "overview", key: "stats_source", value: "NFL", label: "Stats Source" },
  { category: "roster", key: "qb_count", value: "1", label: "Quarterbacks per Team" },
  { category: "roster", key: "rb_count", value: "2", label: "Running Backs per Team" },
  { category: "roster", key: "wr_count", value: "2", label: "Wide Receivers per Team" },
  { category: "roster", key: "te_count", value: "1", label: "Tight Ends per Team" },
  { category: "roster", key: "flex_count", value: "1", label: "Flex (RB/WR/TE) per Team" },
  { category: "roster", key: "def_count", value: "1", label: "Defense per Team" },
  { category: "roster", key: "k_count", value: "1", label: "Kickers per Team" },
  { category: "scoring", key: "pass_yd_per_pt", value: "0.04", label: "Points per Passing Yard" },
  { category: "scoring", key: "pass_td_pts", value: "6", label: "Points per Passing TD" },
  { category: "scoring", key: "pass_int_pts", value: "-2", label: "Points per Interception" },
  { category: "scoring", key: "rush_yd_per_pt", value: "0.1", label: "Points per Rushing Yard" },
  { category: "scoring", key: "rush_td_pts", value: "6", label: "Points per Rushing TD" },
  { category: "scoring", key: "rec_pts", value: "1", label: "Points per Reception" },
  { category: "scoring", key: "rec_yd_per_pt", value: "0.1", label: "Points per Receiving Yard" },
  { category: "scoring", key: "rec_td_pts", value: "6", label: "Points per Receiving TD" },
  { category: "scoring", key: "ffl_pts", value: "-2", label: "Points per Fumble" },
  { category: "draft", key: "draft_mode", value: "SNAKE", label: "Draft Mode" },
  { category: "draft", key: "rounds", value: "17", label: "Draft Rounds" },
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

const nflPositions: PositionConfig[] = [
  { code: "QB", name: "Quarterback", group: "skill" },
  { code: "RB", name: "Running Back", group: "skill" },
  { code: "WR", name: "Wide Receiver", group: "skill" },
  { code: "TE", name: "Tight End", group: "skill" },
  { code: "K", name: "Kicker", group: "def" },
  { code: "DEF", name: "Defense", group: "def" },
];

const nflCategories: CategoryConfig[] = CATEGORY_CONFIG.map((c) => ({
  id: c.id,
  name: c.name,
  group: c.group,
  isLowerBetter: c.isLowerBetter,
}));

export const nflConfig: SportConfig = {
  id: "nfl",
  name: "Fantasy Football",
  positions: nflPositions,
  categories: nflCategories,
  rosterSlots: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 1 },
  scoringFormats: ["POINTS"],
  draftFormats: ["snake"],
  seasonMonths: [9, 1],
  dataProvider: "nfl-api",
  defaultRules: Object.fromEntries(DEFAULT_RULES.map((r) => [`${r.category}.${r.key}`, r.value])),
};
