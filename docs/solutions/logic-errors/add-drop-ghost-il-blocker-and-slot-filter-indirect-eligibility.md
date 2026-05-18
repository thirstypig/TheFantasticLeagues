---
title: "Add/Drop Blocked by Ghost IL Check and Overly Restrictive Drop Candidate Filter"
problem_type: logic-errors
component: transactions/add-drop
symptoms:
  - "Teams with a ghost IL player (IL-stashed player whose MLB status is no longer injured) receive GHOST_IL error and cannot execute any add/drop transaction"
  - "Drop candidate list in AddDropPanel omits eligible players whose current assigned slot differs from the adding player's eligible slots, even when the drop player has multi-position eligibility covering a compatible slot"
  - "A 2B/SS player sitting in an SS slot does not appear as a drop candidate when adding a 2B-eligible player"
tags:
  - ghost-il
  - add-drop
  - drop-candidates
  - roster-rules
  - position-eligibility
  - bipartite-matching
  - slot-inheritance
  - filteredDropCandidates
  - assertNoGhostIl
  - positionInherit
  - slotMatcher
  - AddDropPanel
  - commissioner-tool
severity: high
date_solved: "2026-05-18"
---

# Add/Drop Blocked by Ghost IL Check and Overly Restrictive Drop Candidate Filter

## Problem Statement

Two separate bugs were blocking or hiding valid add/drop transactions in the Commissioner tool.

**Bug 1 — Ghost IL blocker**: Teams with any player stashed in an IL slot whose MLB status was no longer "Injured X-Day" received a `GHOST_IL` error and could not execute any add/drop transaction. The league rule does not require forced activation of such players; they can remain in the IL slot indefinitely.

**Bug 2 — Drop candidate filter too narrow**: The drop candidate list (`filteredDropCandidates`) only showed players whose current `assignedPosition` was directly in the new player's eligible slot set. A 2B/SS player sitting in an SS slot would not appear as a valid drop target when adding a 2B player, even though dropping them would free a slot the new player can legally occupy.

## Root Cause

### Ghost IL (Bug 1)

`assertNoGhostIl(prisma, teamId)` was called inside `if (enforce)` blocks in both the `preview-claim` and `claim` endpoints of `server/src/features/transactions/routes.ts`. The function queries for players with `assignedPosition === "IL"` whose MLB status doesn't match `/^Injured (List )?\d+-Day$/` and throws `GHOST_IL` if any are found.

The check was implemented from design doc "plan Q12=b" which was later revised — the league never adopted forced activation as a rule. The comment citing the plan was the only documentation of the intent, and it wasn't updated when the rule changed.

### Drop candidate filter (Bug 2)

The client filter used current slot as a proxy for eligibility:
```typescript
const slot = assignedSlot(p);
return isSlotCode(slot) && addSlots.has(slot);  // "is this player currently in a needed slot?"
```

The correct question is: "can this player vacate a slot the new player needs — possibly by being moved to a different slot they're also eligible for?" In OGBA's no-bench, exact-cap system, a player's current slot and their eligible slots frequently diverge.

The server mirrored the problem: `inheritedPos = dropRosterPreview?.assignedPosition` blindly took the dropped player's current slot, so the new player could end up assigned to a slot they weren't eligible for (leaving the bipartite matcher to fix it, or failing if no valid assignment existed).

## Solution

### Fix 1 — Remove ghost IL check from add/drop endpoints

**File**: `server/src/features/transactions/routes.ts`

Removed the `assertNoGhostIl` block from `preview-claim`:
```typescript
// REMOVED:
if (enforce) {
  try {
    await assertNoGhostIl(prisma, teamId);
  } catch (err) {
    if (isRosterRuleError(err)) {
      return res.status(400).json({ ok: false, error: err.message, code: err.code });
    }
    throw err;
  }
}
```

Same block removed from the `claim` endpoint. The numbered comment was updated from "3. Ghost-IL pre-check" to "3. Drop-target preview."

> **Important**: `assertNoGhostIl` calls in IL stash (~line 796) and IL activate (~line 986) were intentionally kept — ghost IL remains a constraint for those specific move types. Only the add/drop flow was unblocked.

### Fix 2 — Export `slotsFor` from `slotMatcher.ts`

**File**: `server/src/features/transactions/lib/slotMatcher.ts`

```typescript
// Before:
function slotsFor(posList: string): Set<string> { ... }

// After:
export function slotsFor(posList: string): Set<string> { ... }
```

This allows `positionInherit.ts` to use the same eligibility set computation without duplicating the algorithm.

### Fix 3 — Add `negotiateInheritedSlot` to `positionInherit.ts`

**File**: `server/src/features/transactions/lib/positionInherit.ts`

```typescript
import { slotsFor } from "./slotMatcher.js";

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
```

### Fix 4 — Update `routes.ts` to use `negotiateInheritedSlot`

**File**: `server/src/features/transactions/routes.ts`

Capture drop player's `posList` inside the drop block (alongside the already-fetched `dropPlayer`):
```typescript
let dropPlayerPosList = "";
if (dropPlayerId) {
  // ...existing drop logic...
  const dropPlayer = await tx.player.findUnique({ where: { id: dropPlayerId } });
  dropPlayerPosList = dropPlayer?.posList ?? "";  // NEW
  // ...create TransactionEvent...
}
```

Updated inheritance computation:
```typescript
const inheritedPos = dropRosterPreview?.assignedPosition ?? null;
const resolvedInheritedPos = (enforce && inheritedPos && inheritedPos !== "IL" && player?.posList)
  ? negotiateInheritedSlot(player.posList, inheritedPos, dropPlayerPosList)
  : inheritedPos;
const assignedPos = (enforce && resolvedInheritedPos && resolvedInheritedPos !== "IL")
  ? resolvedInheritedPos
  : legacyAssignedPos;

// Updated bipartite matcher condition (was: inheritedPos):
if (enforce && dropPlayerId && resolvedInheritedPos && resolvedInheritedPos !== "IL") {
  // ...bipartite matcher call unchanged...
}
```

### Fix 5 — Expand `filteredDropCandidates` in `AddDropPanel.tsx`

**File**: `client/src/features/transactions/components/RosterMovesTab/AddDropPanel.tsx`

```typescript
// Before — only direct slot match:
.filter((p) => {
  const slot = assignedSlot(p);
  return isSlotCode(slot) && addSlots.has(slot);
})

// After — direct match OR indirect eligibility:
.filter((p) => {
  // Direct fit: player's current slot is one the new player can fill.
  const slot = assignedSlot(p);
  if (isSlotCode(slot) && addSlots.has(slot)) return true;
  // Indirect fit: player is eligible (via posList) for a slot the new
  // player can fill — they can be moved to open that slot.
  const playerSlots = slotsFor(p.positions || p.posPrimary || "");
  for (const addSlot of addSlots) {
    if (playerSlots.has(addSlot)) return true;
  }
  return false;
})
```

### Fix 6 — Update `slotCompatible` guard in `AddDropPanel.tsx`

```typescript
// Before:
const slotCompatible = selectedDrop && addSlots.size > 0
  ? isSlotCode(dropTargetSlot) && addSlots.has(dropTargetSlot)
  : true;

// After:
const slotCompatible = (() => {
  if (!selectedDrop || addSlots.size === 0) return true;
  const slot = assignedSlot(selectedDrop);
  if (isSlotCode(slot) && addSlots.has(slot)) return true;
  const dropSlots = slotsFor(selectedDrop.positions || selectedDrop.posPrimary || "");
  for (const addSlot of addSlots) {
    if (dropSlots.has(addSlot)) return true;
  }
  return false;
})();
```

The IIFE allows early returns inside the guard computation without a named helper function.

## Prevention & Testing

### Patterns to Watch For

**Specification drift — stale comments citing design docs**

The ghost IL check had a comment "plan Q12=b" while the actual rule had changed. Any `assert*` or `validate*` helper that cites an external plan by name should have a co-located test encoding the business rule in plain language. During review, flag these and verify the spec still matches.

Convention to adopt:
```
// Rule: <human-readable statement> (originally from <doc>; verify doc is current)
```

**Overly broad guard placement**

`assertNoGhostIl` fired unconditionally across all transaction types. Guards that apply to only some transaction types should accept the type as a parameter and gate internally, or the call site should have an explicit comment explaining why it applies here.

**Client filter using current-state as a proxy for eligibility**

Whenever a client-side array filter mirrors a server-side eligibility concept, use the same utility function or call it via `shared/`. A client filter that reimplements a narrower version of the rule will silently hide valid options.

**Two-layer consistency requirement**

This bug required fixes in both the client display filter and the server slot-negotiation function. In code review: any roster/slot eligibility change must explicitly ask "does this rule have a mirror in the client display layer?" Both files belong in the same PR.

### Unit Tests to Add

Add to `server/src/features/transactions/lib/__tests__/positionInherit.test.ts`:

```typescript
describe("negotiateInheritedSlot", () => {
  it("returns dropSlot when add player is directly eligible", () => {
    // Drop player in 2B, add player eligible for 2B → keep 2B
    expect(negotiateInheritedSlot("2B,SS", "2B", "2B")).toBe("2B");
  });

  it("finds shared slot when dropSlot is incompatible (the bug scenario)", () => {
    // Drop player in SS, add player eligible for 2B only → negotiate to 2B
    // because drop player (2B,SS) can move to 2B
    expect(negotiateInheritedSlot("2B", "SS", "2B,SS")).toBe("2B");
  });

  it("falls back to dropSlot when no shared slot exists", () => {
    // Drop player in C, add player eligible for 2B only → no shared slot
    expect(negotiateInheritedSlot("2B", "C", "C")).toBe("C");
  });

  it("does not cross pitcher/hitter slot boundary", () => {
    // Drop player (SP) in SP slot, add player eligible for 2B only
    expect(negotiateInheritedSlot("2B", "P", "SP,RP")).toBe("P");
    // Falls back — bipartite matcher resolves
  });

  it("handles MI composite slot correctly", () => {
    // Add player eligible for MI; drop player eligible for 2B,SS (→ MI)
    expect(negotiateInheritedSlot("MI", "3B", "2B,SS")).toBe("MI");
  });
});
```

Regression test at the service/endpoint layer:
```typescript
it("ghost IL player does not block add/drop (GHOST_IL regression)", async () => {
  // Set up a team with a ghost IL player (assignedPosition=IL, MLB status=Active)
  // Attempt a normal add/drop
  // Expect: no GHOST_IL error, claim succeeds
});
```

### Future Considerations

- **If ghost IL rules are ever reinstated**: scope the check to specific transaction types, not a blanket guard. Document the intended scope in the function's JSDoc, not just a PR description.
- **If bench slots are added**: `negotiateInheritedSlot` assumes every player must occupy a position slot. A `BN` slot would break this assumption. Add a config check at the top of the function and fail loudly until the logic is updated.
- **If eligibility moves to `shared/`**: extracting `isEligibleForSlot` into `shared/api/` would allow both the client filter and server negotiation to import the same function, eliminating the drift vector permanently.
- **If batch drops become possible**: `negotiateInheritedSlot` reasons about one dropped player at a time. Batch drops would require solving the assignment across all dropped players simultaneously — the function signature wouldn't extend cleanly with just a loop wrapper.

## Related Documentation

- **`docs/solutions/logic-errors/pairwise-slot-constraint-bipartite-matching.md`** — Foundational document for position eligibility and the bipartite matcher. Explains `slotsFor()`, `posList` CSV format, and how `slotMatcher.ts` works.
- **`docs/solutions/logic-errors/standings-boundary-and-il-slot-historical-lookup.md`** — Documents `assignedPosition` current-state vs. historical state distinction and IL window reconstruction.
- **`docs/solutions/logic-errors/period-roster-historical-il-display-and-gte-boundary.md`** — Companion to the above; covers IL slot display in period-roster context.
- **`docs/solutions/logic-errors/under-declared-ts-type-hid-server-fields.md`** — Documents the pattern where `posList` and `assignedPosition` may not be declared on client-side types, causing fallback to single-position behavior.
- **`todos/216-pending-p2-slotsfor-called-every-render-no-memo.md`** — Performance follow-up: `slotsFor` called per-row per-render in roster grid; proposed memoization via `useMemo`.

## Work Log

- 2026-05-18: Both bugs identified and fixed in PR #342. Ghost IL check removed from `preview-claim` and `claim` (kept in `il-stash` and `il-activate`). `negotiateInheritedSlot` added to `positionInherit.ts`. Client `filteredDropCandidates` and `slotCompatible` expanded to indirect-fit logic.
