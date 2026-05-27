---
status: pending
priority: p3
issue_id: 229
tags: [code-review, documentation, transactions]
---

# BFS Bench-Player Asymmetry Should Be Documented

## Problem Statement

A player assigned to the bench (`assignedPosition = "BN"`) is treated differently by the three tiers in `filteredDropCandidates`:

- **Tier 1 (direct fit)**: `isSlotCode("BN")` returns false → benched players are NOT direct-fit drops (correct — you can't assign an incoming player to BN)
- **Tier 2 (indirect fit)**: `slotsFor(p.positions)` can return slots the benched player is eligible for → benched players CAN appear as indirect-fit drops (correct — dropping a benched player frees up a slot the incoming player can fill)
- **Tier 3 (BFS chain)**: `isSlotCode(pSlot)` is false for `"BN"` → benched players are **invisible as chain intermediaries**

The asymmetry in Tier 3 is probably correct — a benched player doesn't occupy a lineup slot and can't "vacate" one by moving. But this is not documented anywhere in the code, and a future developer adding a 4th tier could easily miss it.

Additionally, a benched player CAN still be the final drop target in a chain (they'd appear via Tier 2, not Tier 3), which adds to the confusion.

## Proposed Solution

Add a comment in the BFS block clarifying bench exclusion:

```typescript
// Chain fit (arbitrary depth): BFS vacancy propagation. Start with
// p's current slot as "vacated". Repeatedly find players Q whose
// eligible slots intersect the vacated set — Q can move there,
// freeing Q's own slot. Stop when stable. Valid drop if the vacated
// set eventually intersects addSlots.
//
// Note: benched players (assignedPosition = "BN") never enter the BFS
// as chain intermediaries because "BN" is not a SlotCode and they don't
// occupy a lineup slot. They can still appear as valid drop targets via
// Tier 2 (indirect fit) above.
const pSlot = assignedSlot(p);
if (isSlotCode(pSlot)) {
```

## Acceptance Criteria
- [ ] Comment added explaining bench exclusion from BFS intermediary role
- [ ] No behavior change
- [ ] Optionally: add a test asserting a benched player appears via Tier 2 but is NOT a chain intermediary
