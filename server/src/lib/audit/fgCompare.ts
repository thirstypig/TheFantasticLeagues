// server/src/lib/audit/fgCompare.ts
import { emptyStatLine, type StatLine } from "./types.js";

/**
 * The only categories FanGraphs' standings page publishes as raw counting
 * values. ERA/WHIP/AVG are shown, but never their components.
 */
export const FG_COUNTING_KEYS = ["R", "HR", "RBI", "SB", "W", "SV", "K"] as const;

/**
 * FBST team names and FanGraphs team names differ by trailing punctuation for
 * at least one OGBA team ("Demolition Lumber Co." vs "Demolition Lumber Co").
 * Both sides go through this before the join, so the lookup isn't silently
 * empty for exactly one team.
 *
 * A miss here is NOT loud: the caller falls back to `{}`, every FG category
 * reads 0, and that team reports a residual equal to its entire season. If an
 * audit shows one team with enormous across-the-board residuals while the
 * others reconcile, suspect this join before suspecting the data.
 */
export function normalizeTeamName(name: string): string {
  return name.trim().replace(/\.+$/, "").trim();
}

/**
 * Project a 12-key StatLine down to the 7 keys FanGraphs can be compared on.
 *
 * fgTotals has AB/H/IP/ER/BB_H pinned at 0 by construction — not because FBST
 * is wrong, but because FanGraphs never published those numbers. Classifying
 * the full 12 keys would diff FBST's real AB/H/IP/ER/BB_H against a permanent
 * zero and report a large residual for every team on every run, making a
 * season PASS structurally unreachable. A verdict that can only ever be
 * FINDINGS is noise nobody reads.
 */
export function toFgComparableStatLine(line: StatLine): StatLine {
  const out = emptyStatLine();
  for (const k of FG_COUNTING_KEYS) out[k] = line[k];
  return out;
}
