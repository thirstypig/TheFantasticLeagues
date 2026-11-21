/**
 * Was this MLB player eligible for this archive roster slot that season?
 * Pure. OGBA's rules (the same three the live app uses — see
 * memory/position_eligibility_layers.md and positionInherit.ts), applied to
 * past seasons, plus the two archive-only slots James defined (2026-11-20):
 *
 *   C/1B/2B/3B/SS/OF/MI/CM/CO/P  ≥3 games there that season, or ≥20 the
 *                                season before; a rookie also qualifies at
 *                                his MLB primary position.
 *   DH                           ≥10 games at DH that season, or ≥20 before.
 *   R (pre-2022 "rookie spot")   any rookie, pitcher or hitter: under 130
 *                                career at-bats and under 50 career innings
 *                                before the season (MLB's test minus roster
 *                                days, which the stats API doesn't expose).
 *   IL/DL/BN                     anyone.
 *
 * Season games are full-season totals, not games up to the moment he was
 * slotted — slightly generous for early periods; stated to James.
 */
import { mlbPositionToSlots } from "../sports/baseball.js";

export interface PlayerSeasonFacts {
  /** Games by fielding position (C, 1B, 2B, 3B, SS, LF, CF, RF, OF, P, DH) in the season. */
  games: Record<string, number>;
  /** Same, the season before. */
  priorGames: Record<string, number>;
  /** MLB primary position (statsapi), used for the rookie rule. */
  primaryPosition: string;
  /** Career totals BEFORE this season. */
  careerAbBefore: number;
  careerIpBefore: number;
  /**
   * The slot he held on this same team at the end of last season (from the
   * Salaries sheet), if any. A kept player keeps his slot — the live app's
   * grandfathering (memory/position_eligibility_layers.md, layer 1).
   */
  keptFromSlot?: string;
}

export interface Eligibility {
  eligible: boolean;
  /** Plain-English reason shown on the audit page. */
  reason: string;
}

const ROOKIE_AB = 130;
const ROOKIE_IP = 50;

export function isRookie(f: PlayerSeasonFacts): boolean {
  return f.careerAbBefore < ROOKIE_AB && f.careerIpBefore < ROOKIE_IP;
}

/** Archive slot labels as written in the sheets → the live slot codes they correspond to. */
function canonicalSlot(slot: string): string {
  const s = slot.trim().toUpperCase();
  if (s === "CO" || s === "CI") return "CM";
  if (/^(IL|DL)\d?$/.test(s) || s === "BN" || s === "RES") return "ANY";
  return s;
}

/** Positions (with games) that map to the slot under the live slot rules. */
function gamesForSlot(games: Record<string, number>, slot: string): { pos: string; games: number }[] {
  return Object.entries(games)
    .filter(([pos, g]) => g > 0 && mlbPositionToSlots(pos).includes(slot))
    .map(([pos, g]) => ({ pos, games: g }))
    .sort((a, b) => b.games - a.games);
}

export function slotEligibility(slotRaw: string, f: PlayerSeasonFacts): Eligibility {
  const slot = canonicalSlot(slotRaw);
  if (slot === "ANY") return { eligible: true, reason: "IL/reserve slot: any player" };
  // Grandfathering only within the player's role, so it can't paper over a
  // wrong match (Will Smith the pitcher "kept" in Los Doyers' C slot).
  const isPitcher = /^(P|SP|RP)$/.test(f.primaryPosition);
  const roleFits = f.primaryPosition === "TWP" || (slot === "P" ? isPitcher : !isPitcher);
  if (f.keptFromSlot && canonicalSlot(f.keptFromSlot) === slot && roleFits) {
    return { eligible: true, reason: `kept in last season's ${f.keptFromSlot} slot` };
  }
  // A pitcher can always fill a P slot — covers pitchers hurt all season (0 games).
  if (slot === "P" && /^(P|SP|RP|TWP)$/.test(f.primaryPosition) && !(f.games.P >= 3)) {
    return { eligible: true, reason: `pitcher (${f.games.P ?? 0} G that season)` };
  }

  if (slot === "R") {
    return isRookie(f)
      ? { eligible: true, reason: `rookie (${f.careerAbBefore} AB, ${Math.round(f.careerIpBefore)} IP before the season)` }
      : { eligible: false, reason: `not a rookie (${f.careerAbBefore} AB, ${Math.round(f.careerIpBefore)} IP before the season)` };
  }

  if (slot === "DH") {
    const now = f.games.DH ?? 0;
    const before = f.priorGames.DH ?? 0;
    if (now >= 10) return { eligible: true, reason: `${now} G at DH` };
    if (before >= 20) return { eligible: true, reason: `${before} G at DH the year before` };
    return { eligible: false, reason: `${now} G at DH (needs 10), ${before} the year before (needs 20)` };
  }

  // Thresholds apply per position, as in the live sync (posList is built per
  // position, then mapped to slots): 2 G at 2B + 1 at SS does not make MI.
  const now = gamesForSlot(f.games, slot).filter((x) => x.games >= 3);
  if (now.length) return { eligible: true, reason: now.map((x) => `${x.games} G at ${x.pos}`).join(", ") };
  const before = gamesForSlot(f.priorGames, slot).filter((x) => x.games >= 20);
  if (before.length) return { eligible: true, reason: `${before.map((x) => `${x.games} G at ${x.pos}`).join(", ")} the year before` };
  if (isRookie(f) && mlbPositionToSlots(f.primaryPosition).includes(slot)) {
    return { eligible: true, reason: `rookie, primary position ${f.primaryPosition}` };
  }
  const played = Object.entries(f.games).filter(([, g]) => g > 0).map(([p, g]) => `${g} G at ${p}`).join(", ") || "no games";
  return { eligible: false, reason: `not eligible at ${slotRaw}: ${played} that season` };
}
