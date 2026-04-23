// client/src/lib/positionEligibility.ts
//
// Single source of truth for "which lineup slots is this player eligible to
// fill?" — derived from their comma-separated `posList`.
//
// Previously this helper was triplicated byte-for-byte in `PlaceOnIlModal`,
// `ActivateFromIlModal`, and `WaiverClaimForm`. The Roster Moves redesign
// consolidated it here and retyped `positionToSlots` at its source in
// `sports/baseball.ts` so the `SlotCode` literal union is enforced end-to-end.

import { positionToSlots, SLOT_CODES, type SlotCode } from "./sports/baseball";

export { SLOT_CODES, type SlotCode } from "./sports/baseball";

/**
 * Roster-slot vocabulary for `Roster.assignedPosition` values that are NOT
 * eligibility slots — a player can occupy BN or IL but those aren't produced
 * by `positionToSlots`. Kept alongside `SlotCode` so consumers assembling
 * "what could this row be assigned to?" lists have the full vocabulary.
 */
export const STRUCTURAL_SLOTS = ["BN", "IL"] as const;
export type StructuralSlot = typeof STRUCTURAL_SLOTS[number];
export type AssignedPosition = SlotCode | StructuralSlot;

/**
 * Narrow an unknown string to a SlotCode. Used inside `slotsFor` and
 * available as a public type guard for callers that pull slot strings out of
 * untyped data (e.g. server responses where assignedPosition is string).
 */
export function isSlotCode(s: string): s is SlotCode {
  // Strictly asks: is this STRING already a canonical slot code? Unlike
  // positionToSlots (which also accepts "LF"/"CF"/"RF" as valid *inputs*
  // that collapse to OF), isSlotCode rejects input-only positions.
  return (SLOT_CODES as readonly string[]).includes(s);
}

/**
 * Given a player's comma/slash/pipe/space-separated `posList` (e.g. "2B,SS"
 * or "2B/SS" or "OF DH"), return the SET of roster slots the player is
 * eligible to fill.
 *
 * Empty / null / undefined `posList` returns an empty set.
 * Unknown positions within a posList are silently dropped — the caller
 * treats "no slots" as "not eligible anywhere," which is the same UX
 * behavior as the old inline helpers.
 */
export function slotsFor(posList: string | null | undefined): ReadonlySet<SlotCode> {
  const out = new Set<SlotCode>();
  for (const raw of (posList ?? "").split(/[,/| ]+/)) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    for (const slot of positionToSlots(trimmed)) {
      out.add(slot);
    }
  }
  return out;
}
