---
status: pending
priority: p3
issue_id: 227
tags: [code-review, performance, simplicity]
---

# BFS: Hoist slotsFor() Precomputation Before While Loop

## Problem Statement

In `AddDropPanel.tsx`, the BFS vacancy-propagation algorithm inside `filteredDropCandidates` calls `slotsFor(q.positions || q.posPrimary || "")` for every candidate `q` on every while-loop iteration. Since `slotsFor` parses and splits a string and allocates a new `Set` each call, the same positions string is re-parsed O(iterations) times per candidate. For a 3-hop chain with 25 roster players, that's ~75 redundant `slotsFor` calls per outer filter candidate.

At roster cap of 25 this is negligible, but it's unnecessary allocation and makes the BFS loop body harder to read.

## Proposed Solution

Hoist `qSlotsMap` and `others` before the while-loop:

```typescript
const pSlot = assignedSlot(p);
if (isSlotCode(pSlot)) {
  const others = dropCandidates.filter((q) => q !== p);
  const qSlotsMap = new Map(
    others.map((q) => [q, slotsFor(q.positions || q.posPrimary || "")])
  );
  const vacated = new Set<SlotCode>([pSlot]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const q of others) {
      const qSlot = assignedSlot(q);
      if (!isSlotCode(qSlot) || vacated.has(qSlot)) continue;
      const qSlots = qSlotsMap.get(q)!;
      for (const v of vacated) {
        if (qSlots.has(v)) {
          vacated.add(qSlot);
          changed = true;
          break;
        }
      }
    }
  }
  for (const addSlot of addSlots) {
    if (vacated.has(addSlot)) return true;
  }
}
```

Also removes the `if (q === p) continue` guard from the hot path (it's now handled by `others`).

## Acceptance Criteria
- [ ] `slotsFor` called O(n) times (once per candidate) rather than O(n × iterations)
- [ ] `others` array excludes `p` before the loop
- [ ] All 6 BFS chain-fit tests in `AddDropPanel.test.tsx` still pass
- [ ] No behavior change
