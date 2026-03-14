/**
 * Centralized sport configuration for baseball.
 * All baseball-specific constants live here. When adding a new sport,
 * create a parallel config and swap at the top level.
 */

// ─── Position Configuration ───

/** Canonical position order for sorting and display. */
export const POS_ORDER: string[] = ["C", "1B", "2B", "3B", "SS", "MI", "CI", "OF", "SP", "RP", "P", "DH"];

/** Score mapping for position sorting (lower = earlier in lineup). */
export const POS_SCORE: Record<string, number> = Object.fromEntries(
  POS_ORDER.map((pos, index) => [pos, index])
);

/** All position codes used in roster slots. */
export const POSITIONS: string[] = ["C", "1B", "2B", "3B", "SS", "MI", "CI", "OF", "DH", "P", "SP", "RP", "BN", "IL"];

/** Position codes that indicate a pitcher. */
export const PITCHER_CODES = ["P", "SP", "RP"] as const;

// ─── Category Configuration ───

/** Available hitting stat categories for league scoring. */
export const HITTING_CATS: string[] = [
  "R", "HR", "RBI", "SB", "AVG", "OPS", "OPS+", "WAR",
  "H", "2B", "3B", "BB", "K", "TB", "OBP", "SLG",
];

/** Available pitching stat categories for league scoring. */
export const PITCHING_CATS: string[] = [
  "W", "SV", "K", "ERA", "ERA+", "WHIP", "WAR",
  "QS", "HLD", "IP", "CG", "SHO", "L", "BB", "HR",
];

// ─── Special Players ───

/** Ohtani's MLB ID for dual-role handling. */
export const OHTANI_MLB_ID = "660271";

// ─── Pitcher Detection ───

/**
 * Returns true if the given value represents a pitcher.
 * Accepts a position string, or an object with position/group/isPitcher fields.
 */
export function isPitcher(v: any): boolean {
  if (typeof v === "string") {
    const s = v.trim().toUpperCase();
    return s === "P" || s === "SP" || s === "RP";
  }
  if (v && typeof v === "object") {
    if (v.is_pitcher != null) return !!v.is_pitcher;
    if (v.isPitcher != null) return !!v.isPitcher;

    const group = String(v.group ?? "").trim().toUpperCase();
    if (group === "P") return true;
    if (group === "H") return false;

    const pos = String(v.positions ?? v.pos ?? v.posPrimary ?? "").trim().toUpperCase();
    if (pos === "P" || pos === "SP" || pos === "RP") return true;
  }
  return false;
}

// ─── Position Utilities ───

/**
 * Normalizes a position string or comma-separated list into the primary position.
 */
export function getPrimaryPosition(posString: string | undefined): string {
  if (!posString) return "DH";
  const primary = posString.split(",")[0].trim();
  if (primary === "CM") return "1B/3B";
  if (primary === "MI") return "2B/SS";
  return primary;
}

/**
 * Sorts two players by their primary position based on POS_ORDER.
 */
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

/**
 * Maps a position for display based on the league's outfield mode.
 * When mode is "OF" (default), LF/CF/RF are all displayed as "OF".
 * When mode is "LF/CF/RF", positions are shown as-is.
 */
export function mapPosition(pos: string, outfieldMode: string = "OF"): string {
  if (outfieldMode === "OF" && OF_POSITIONS.has(pos.toUpperCase())) {
    return "OF";
  }
  return pos;
}

// ─── Stat Formatting ───

/** Format a number to 2 decimal places (e.g. ERA, WHIP). */
export function fmt2(v: number): string {
  if (!Number.isFinite(v)) return "";
  return v.toFixed(2);
}

/** Format batting average from hits/at-bats (e.g. ".289"). */
export function fmt3Avg(h: number, ab: number): string {
  if (!ab) return ".000";
  const s = (h / ab).toFixed(3);
  return s.startsWith("0") ? s.slice(1) : s;
}

/** Format a rate stat to 3 decimals (e.g. ".289"). */
export function fmtRate(v: number): string {
  if (!Number.isFinite(v)) return ".000";
  const s = v.toFixed(3);
  return s.startsWith("0") ? s.slice(1) : s;
}
