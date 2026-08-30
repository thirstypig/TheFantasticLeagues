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

import { positionToSlots, PITCHER_CODES_SET } from "../../../lib/sports/baseball.js";
import { RosterRuleError } from "../../../lib/rosterRuleError.js";
import { slotsFor } from "./slotMatcher.js";

/**
 * The slot a traded player's NEW roster row should take.
 *
 * Single definition shared by both trade paths — the owner flow
 * (`features/trades/routes.ts`) and the commissioner's direct execution
 * (`CommissionerService.executeTrade`). They previously carried separate
 * copies of this rule and drifted: the commissioner path wrote `null`, and
 * because the client narrows an unrecognised slot code to "BN"
 * (`toHubPlayer.ts` → `narrowSlot`), every traded hitter silently landed on
 * the bench. Keeping one definition is what stops that recurring.
 *
 * Never returns null or an empty string: the caller writes this straight into
 * `Roster.assignedPosition`, and a blank there is the bug.
 */
export function tradeSlotFor(args: {
  assignedPosition: string | null | undefined;
  posPrimary: string | null | undefined;
}): string {
  if (args.assignedPosition) return args.assignedPosition;
  const primary = (args.posPrimary ?? "").trim().toUpperCase();
  if (!primary) return "UT";
  // "TWP" is a position, not a slot — mlbPositionToSlots("TWP") is ["P"], so
  // returning it verbatim would fall through to "BN" on the client.
  if (PITCHER_CODES_SET.has(primary)) return "P";
  return primary;
}

/**
 * Does any of the player's `posList` positions map to a slot that includes
 * `targetSlot`? Example: a player with `posList = "2B,SS"` is eligible for
 * the MI slot (because positionToSlots("2B") = ["2B","MI"] and
 * positionToSlots("SS") = ["SS","MI"]).
 */
export function isEligibleForSlot(posList: string, targetSlot: string): boolean {
  if (!targetSlot || targetSlot.length > 5) return false;
  const target = targetSlot.trim().toUpperCase();
  const positions = posList
    .split(",")
    .map(p => p.trim().toUpperCase())
    .filter(p => p.length > 0);
  return positions.some(pos => positionToSlots(pos).includes(target));
}

/**
 * Returns the best slot for the new player to inherit after a drop.
 *
 * If the dropped player's current slot is in the add player's eligible slots,
 * return it directly. Otherwise, scan the add player's eligible slots and
 * return the first one the drop player is also eligible for — so a 2B player
 * sitting in SS can "move" to 2B to make room for a new 2B/MI player.
 *
 * Falls back to `dropSlot` if no shared slot exists; the bipartite matcher
 * will resolve any remaining conflict.
 */
export function negotiateInheritedSlot(
  addPosList: string,
  dropSlot: string,
  dropPosList: string,
): string {
  if (isEligibleForSlot(addPosList, dropSlot)) return dropSlot;
  const addEligibleSlots = slotsFor(addPosList);
  for (const slot of addEligibleSlots) {
    if (isEligibleForSlot(dropPosList, slot)) return slot;
  }
  return dropSlot;
}

/**
 * Throws if the added player isn't eligible for the dropped player's slot.
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
