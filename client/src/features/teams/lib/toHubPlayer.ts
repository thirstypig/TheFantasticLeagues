// client/src/features/teams/lib/toHubPlayer.ts
//
// Pure mapper: Team.tsx's internal RosterPlayer shape → RosterHubV3's
// RosterHubPlayer shape. Extracted from Team.tsx so the mapping is unit-
// testable in isolation. The Team component still owns the RosterPlayer
// type (it includes view-only stat fields the mapper needs); this module
// just defines a structural input that captures what the mapping reads.

import { SlotCodeSchema, type SlotCode as WireSlotCode } from "@shared/api/rosterMoves";
import { isSlotCode, type SlotCode } from "../../../lib/positionEligibility";
import type { RosterHubPlayer } from "../components/RosterHub";

/**
 * Structural input — captures every field `toHubPlayer` reads from a
 * RosterPlayer row. Defined here (not imported from Team.tsx) so the
 * mapper has no React/component coupling and tests don't have to render
 * the page to exercise it.
 */
export interface RosterPlayerInput {
  rosterId: number;
  /** Prisma Player.id — stable across roster mutations. */
  playerId: number;
  playerName: string;
  posPrimary?: string;
  /** Comma-separated full eligibility list ("OF,2B"). Drives multi-chip render. */
  posList?: string;
  assignedPosition?: string;
  isPitcher?: boolean;
  mlbTeam?: string;
  isKeeper?: boolean;
  /** Per-position GP — synthetic today, real when Player.posGames lands. */
  gamesByPos?: Record<string, number>;
  // Hitter stats (when available)
  AVG?: number | string;
  HR?: number;
  R?: number;
  RBI?: number;
  SB?: number;
  // Pitcher stats
  W?: number;
  SV?: number;
  K?: number;
  ERA?: number | string;
  WHIP?: number | string;
}

/**
 * Map a RosterPlayer to a RosterHubPlayer for the v3 hub.
 *
 * Critical contracts the unit tests pin down:
 *   - `playerId` is the Prisma Player.id, NOT rosterId. Mutation flows
 *     and per-player API calls (eligible-slots, posGames) key off this.
 *   - `posList` carries the full multi-position eligibility (e.g.
 *     "OF,2B"). When null, falls back to posPrimary so single-position
 *     players still render a chip — never returns empty string when at
 *     least one position is known.
 *   - `assignedSlot` is canonicalized to uppercase. "IL" stays "IL"; any
 *     other value is treated as a slot code. Missing assignedPosition +
 *     missing posPrimary defaults to "BN".
 *   - Role-aware stats: hitterStats and pitcherStats are mutually
 *     exclusive — exactly one is defined based on `isPitcher`. Empty
 *     stat objects (all undefined fields) are still returned so the
 *     row's stat cells render as "—" rather than crashing on
 *     `.hitterStats!.HR`.
 *   - `gamesPlayedByPosition` passes through the Record<string, number>
 *     as-is. Cast through RosterHubPlayer's narrower type because this
 *     helper doesn't know the SlotCode union — runtime values come from
 *     the server's TeamService.buildGamesByPos which uses string keys.
 */
/**
 * Narrow an arbitrary string to the `RosterHubPlayer.assignedSlot` union via
 * the shared Zod schema. Returns "BN" when the input doesn't match the
 * canonical wire vocabulary — the safe fallback because BN is always
 * available on every roster, and the caller (RosterHubV3) treats unknowns
 * as bench rows. Per todo #132 — replaces an `as any` cast that would have
 * laundered any string into the SlotCode union.
 *
 * The wire SlotCode includes structural slots (BN, IL) and the pitcher
 * sub-codes (SP, RP) in addition to the 10 eligibility slots; the
 * RosterHubPlayer.assignedSlot field accepts that full vocabulary so we
 * pass parsed wire codes through directly.
 */
function narrowSlot(raw: string): WireSlotCode {
  const result = SlotCodeSchema.safeParse(raw);
  return result.success ? result.data : "BN";
}

/**
 * Filter a synthetic per-position GP record to eligibility-slot keys only.
 * The server may emit aggregate keys (e.g. "LF") that aren't in the
 * SlotCode vocabulary; rather than casting them through, drop them so the
 * downstream `Partial<Record<SlotCode, number>>` type holds at runtime.
 * Per todo #132 — replaces an `as any` cast.
 */
function narrowGamesByPos(
  raw: Record<string, number> | undefined,
): Partial<Record<SlotCode, number>> | undefined {
  if (!raw) return undefined;
  const out: Partial<Record<SlotCode, number>> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (isSlotCode(key)) out[key] = value;
  }
  return out;
}

export function toHubPlayer(p: RosterPlayerInput): RosterHubPlayer {
  const slot = (p.assignedPosition || p.posPrimary || "BN").toUpperCase();
  return {
    rosterId: p.rosterId,
    playerId: p.playerId,
    name: p.playerName,
    posList: p.posList || p.posPrimary || "",
    posPrimary: p.posPrimary || "",
    assignedSlot: narrowSlot(slot),
    mlbTeam: p.mlbTeam,
    isKeeper: p.isKeeper,
    isPitcher: !!p.isPitcher,
    gamesPlayedByPosition: narrowGamesByPos(p.gamesByPos),
    hitterStats: p.isPitcher
      ? undefined
      : { R: p.R, HR: p.HR, RBI: p.RBI, SB: p.SB, AVG: p.AVG },
    pitcherStats: p.isPitcher
      ? { W: p.W, SV: p.SV, K: p.K, ERA: p.ERA, WHIP: p.WHIP }
      : undefined,
  };
}
