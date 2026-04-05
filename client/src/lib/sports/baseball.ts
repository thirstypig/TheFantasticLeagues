/**
 * Baseball-specific sport configuration (client-side).
 * Extracted from client/src/lib/sportConfig.ts — Phase 1 extract refactor.
 */

import type { SportConfig, PositionConfig, CategoryConfig } from "./types";

// ─── Position Configuration ───

export const POS_ORDER: string[] = ["C", "1B", "2B", "3B", "SS", "MI", "CM", "OF", "P", "DH"];

export const POS_SCORE: Record<string, number> = Object.fromEntries(
  POS_ORDER.map((pos, index) => [pos, index])
);

export const POSITIONS: string[] = ["C", "1B", "2B", "3B", "SS", "MI", "CM", "OF", "DH", "P", "SP", "RP", "BN", "IL"];

export const PITCHER_CODES = ["P", "SP", "RP", "CL", "TWP"] as const;

// ─── Position-to-Slot Mapping ───

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

export const HITTING_CATS: string[] = [
  "R", "HR", "RBI", "SB", "AVG", "OPS", "OPS+", "WAR",
  "H", "2B", "3B", "BB", "K", "TB", "OBP", "SLG",
];

export const PITCHING_CATS: string[] = [
  "W", "SV", "K", "ERA", "ERA+", "WHIP", "WAR",
  "QS", "HLD", "IP", "CG", "SHO", "L", "BB", "HR",
];

// ─── MLB League Team Sets ───

export const NL_TEAMS = new Set(["ARI","AZ","ATL","CHC","CIN","COL","LAD","MIA","MIL","NYM","PHI","PIT","SD","SF","STL","WSH"]);

export const AL_TEAMS = new Set(["BAL","BOS","CLE","DET","HOU","KC","LAA","MIN","NYY","OAK","ATH","SEA","TB","TEX","TOR","CWS"]);

// ─── Special Players ───

export const OHTANI_MLB_ID = "660271";
export const OHTANI_PITCHER_MLB_ID = "1660271";

export function resolveRealMlbId(mlbId: string): string {
  return mlbId === OHTANI_PITCHER_MLB_ID ? OHTANI_MLB_ID : mlbId;
}

// ─── Pitcher Detection ───

export function isPitcher(v: string | Record<string, unknown> | null | undefined): boolean {
  if (typeof v === "string") {
    const s = v.trim().toUpperCase();
    return s === "P" || s === "SP" || s === "RP" || s === "CL" || s === "TWP";
  }
  if (v && typeof v === "object") {
    if (v.is_pitcher != null) return !!v.is_pitcher;
    if (v.isPitcher != null) return !!v.isPitcher;

    const group = String(v.group ?? "").trim().toUpperCase();
    if (group === "P") return true;
    if (group === "H") return false;

    const pos = String(v.positions ?? v.pos ?? v.posPrimary ?? "").trim().toUpperCase();
    if (pos === "P" || pos === "SP" || pos === "RP" || pos === "TWP") return true;
  }
  return false;
}

// ─── Position Utilities ───

export function getPrimaryPosition(posString: string | undefined): string {
  if (!posString) return "DH";
  const primary = posString.split(",")[0].trim().toUpperCase();
  if (primary === "CM") return "1B/3B";
  if (primary === "MI") return "2B/SS";
  if (primary === "LF" || primary === "CF" || primary === "RF") return "OF";
  if (primary === "SP" || primary === "RP") return "P";
  return primary;
}

export function sortByPosition<T extends { positions?: string }>(a: T, b: T): number {
  const pa = getPrimaryPosition(a.positions);
  const pb = getPrimaryPosition(b.positions);
  const keyA = pa.split("/")[0];
  const keyB = pb.split("/")[0];
  const sa = POS_SCORE[keyA] ?? 99;
  const sb = POS_SCORE[keyB] ?? 99;
  return sa - sb;
}

// ─── Outfield Position Mapping ───

const OF_POSITIONS = new Set(["LF", "CF", "RF"]);

export function mapPosition(pos: string, outfieldMode: string = "OF"): string {
  if (outfieldMode === "OF" && OF_POSITIONS.has(pos.toUpperCase())) {
    return "OF";
  }
  return pos;
}

// ─── Position Normalization ───

export function normalizePosition(pos: string | null | undefined): string {
  const s = String(pos ?? "").trim();
  if (!s) return "";
  return s.toUpperCase();
}

// ─── Player Display Helpers ───

export function getMlbTeamAbbr(row: Record<string, unknown>): string {
  const v =
    row?.mlb_team ??
    row?.mlbTeam ??
    row?.mlb_team_abbr ??
    row?.mlbTeamAbbr ??
    row?.team_mlb ??
    row?.mlbTeamName ??
    "";
  return String(v ?? "").trim();
}

// ─── Stat Formatting ───

export function fmt2(v: number): string {
  if (!Number.isFinite(v)) return "";
  return v.toFixed(2);
}

export function fmt3Avg(h: number, ab: number): string {
  if (!ab) return ".000";
  const s = (h / ab).toFixed(3);
  return s.startsWith("0") ? s.slice(1) : s;
}

export function fmtRate(v: number): string {
  if (!Number.isFinite(v)) return ".000";
  const s = v.toFixed(3);
  return s.startsWith("0") ? s.slice(1) : s;
}

export function gradeColor(grade: string): string {
  const g = grade.replace(/[+-]/g, "").toUpperCase();
  if (g === "A") return "text-emerald-400";
  if (g === "B") return "text-blue-400";
  if (g === "C") return "text-amber-400";
  if (g === "D") return "text-orange-400";
  return "text-red-400";
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

const baseballCategories: CategoryConfig[] = [
  { id: "R", name: "Runs", group: "H", formatFn: "integer" },
  { id: "HR", name: "Home Runs", group: "H", formatFn: "integer" },
  { id: "RBI", name: "RBI", group: "H", formatFn: "integer" },
  { id: "SB", name: "Stolen Bases", group: "H", formatFn: "integer" },
  { id: "AVG", name: "Average", group: "H", formatFn: "fmtRate" },
  { id: "W", name: "Wins", group: "P", formatFn: "integer" },
  { id: "SV", name: "Saves", group: "P", formatFn: "integer" },
  { id: "ERA", name: "ERA", group: "P", isLowerBetter: true, formatFn: "fmt2" },
  { id: "WHIP", name: "WHIP", group: "P", isLowerBetter: true, formatFn: "fmt2" },
  { id: "K", name: "Strikeouts", group: "P", formatFn: "integer" },
];

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
  defaultRules: {},
};
