---
status: pending
priority: p2
issue_id: "216"
tags: [code-review, performance, roster, position-eligibility, react]
dependencies: []
---

# `slotsFor` called on every render for every row — should be memoized at roster level

## Problem Statement

`slotsFor(r.player.posList)` is called inside the position dropdown IIFE for each non-pitcher roster row on every render of `RosterGrid`. `slotsFor` splits a string, calls `positionToSlots` per token, and returns a new `Set` — not free. The commissioner "All Teams" view renders up to 156 rows (12 teams × ~13 players). Any parent state change (price edit, IL toggle, etc.) triggers a re-render that calls `slotsFor` 156 times for the same unchanging `posList` data.

## Findings

- **File:** `client/src/features/roster/components/RosterGrid.tsx` line ~228
- `slotsFor` is imported from `lib/positionEligibility`
- `r.player.posList` is data from the server — it doesn't change during a session unless the roster is refreshed
- The `rosters` prop changes only on explicit refresh; the slot sets are stable between renders
- At 12 teams with a re-render budget of e.g. a price-edit state change: 156 `Set` allocations per keypress

## Proposed Solutions

### Option A — Precompute eligible slot sets at the top of the render function (Recommended)
```typescript
// At the top of the component body or inside the inner per-team render section:
const eligibleSlotsByRosterId = useMemo(() => {
  const m = new Map<number, ReadonlySet<SlotCode>>();
  for (const r of rosters) {
    if (r.player.posList) m.set(r.id, slotsFor(r.player.posList));
  }
  return m;
}, [rosters]);

// In the IIFE (or extracted function — see todo #217):
const eligible = eligibleSlotsByRosterId.get(r.id) ?? null;
```
Only recomputes when `rosters` changes (on explicit refresh).
- **Effort:** Small
- **Risk:** None — memoized value is referentially stable

### Option B — Extract to module-scope function + rely on React's render batching
Call `slotsFor` inside the extracted function (see todo #217) but accept the per-render cost.
- **Pros:** Zero-diff to memo
- **Cons:** Doesn't fix the computation cost; still 156 calls on unrelated re-renders

## Recommended Action

Option A — `useMemo` over `rosters`. Combine with todo #217 (extract IIFE) in the same pass.

## Acceptance Criteria
- [ ] `slotsFor` is called O(rows) per `rosters` prop change, not O(rows) per render
- [ ] `eligibleSlotsByRosterId` memoized with `[rosters]` dependency
- [ ] All existing `RosterGrid.test.tsx` tests still pass

## Work Log
- 2026-05-18: Identified by Performance Oracle. 156 Set allocations per render in All-Teams view.
