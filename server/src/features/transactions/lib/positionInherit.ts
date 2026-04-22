// server/src/features/transactions/lib/positionInherit.ts
// Position-inherit guard — "added player must fill the dropped player's exact
// slot" (plan Q8 follow-on). Deliberately stricter than every mainstream
// fantasy platform (Yahoo/ESPN/CBS/Fantrax all use free-slot assignment) —
// OGBA runs exact-cap with no bench, so slot eligibility matters at the edge.
//
// Used by:
//   - /transactions/claim (add-paired-with-drop)
//   - /transactions/il-stash (added player takes stashed player's slot)
//   - /transactions/il-activate (activated player takes dropped player's slot)
//   - Waiver batch processor (same check, re-evaluated at processing time)

import { positionToSlots } from "../../../lib/sports/baseball.js";
import { RosterRuleError } from "../../../lib/rosterRuleError.js";

/**
 * Does any of the player's `posList` positions map to a slot that includes
 * `targetSlot`? Example: a player with `posList = "2B,SS"` is eligible for
 * the MI slot (because positionToSlots("2B") = ["2B","MI"] and
 * positionToSlots("SS") = ["SS","MI"]).
 */
export function isEligibleForSlot(posList: string, targetSlot: string): boolean {
  if (!targetSlot) return false;
  const target = targetSlot.trim().toUpperCase();
  const positions = posList
    .split(",")
    .map(p => p.trim().toUpperCase())
    .filter(p => p.length > 0);
  return positions.some(pos => positionToSlots(pos).includes(target));
}

/**
 * Throws if the added player isn't eligible for the dropped player's slot.
 * Use after the drop target's `assignedPosition` has been read from Roster.
 *
 * The error message calls out a concrete remedy ("pick a different drop
 * whose slot can fit the added player") because the UX mitigation in the
 * plan assumes owners see this error and adjust — they should know why.
 */
export function assertAddEligibleForDropSlot(
  add: { name: string; posList: string },
  dropSlot: string,
): void {
  if (!isEligibleForSlot(add.posList, dropSlot)) {
    throw new RosterRuleError(
      "POSITION_INELIGIBLE",
      `${add.name} (${add.posList}) is not eligible for the ${dropSlot} slot. Pick a different drop whose slot ${add.name} can fill.`,
      { addName: add.name, addPosList: add.posList, dropSlot },
    );
  }
}
