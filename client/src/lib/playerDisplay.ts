// client/src/lib/playerDisplay.ts
// Thin re-export layer — canonical implementations live in sportConfig.ts.
// Kept for backwards compatibility with existing imports.

export {
  isPitcher,
  normalizePosition,
  getMlbTeamAbbr,
  sortByPosition,
} from "./sportConfig";

import { fmtAvg4 } from "../api/base";

/** Normalize TWP (two-way player) to DH/P for display; fallback to em-dash for nullish. */
export const displayPos = (pos: string | undefined | null): string => {
  if (!pos) return "\u2014";
  const p = pos.toUpperCase();
  if (p === "TWP") return "DH/P";
  return p;
};

/** Format a batting average value with 4 decimal places (.2576) — matches FanGraphs display. */
export function formatAvg(v: string | number | null | undefined): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return fmtAvg4(n);
}
