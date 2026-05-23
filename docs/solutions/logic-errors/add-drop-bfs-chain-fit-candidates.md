---
title: Drop Candidate Filter Misses Chain-Vacancy Players in AddDropPanel
date: 2026-05-22
problem_type: logic-error
component: AddDropPanel / filteredDropCandidates
symptoms:
  - Valid drop candidates were missing from the drop list when adding a free agent whose slot could only be freed by a chain move (e.g., an incumbent moving to an alternate eligible slot)
  - Pure-position players appeared un-droppable even though dropping them would be roster-legal after a slot shuffle
  - Drop list was artificially truncated by a .slice(0, 10) cap, hiding valid chain-vacancy candidates on larger rosters
tags:
  - roster-moves
  - drop-candidates
  - bfs
  - slot-eligibility
  - chain-vacancy
  - add-drop-panel
related_prs:
  - PR #349
severity: medium
status: resolved
---

## Problem

`AddDropPanel.filteredDropCandidates` filtered the drop list using two tiers:

1. **Direct fit** — player's assigned slot is already in `addSlots` (slots the incoming FA can fill)
2. **Indirect fit** — player's eligible positions (`posList`) overlap with `addSlots`

**What was missed:** chain-fit players — players whose slot only becomes free after another roster player is moved.

### Concrete example

Adding Rennie Lile (positions `"2B"` → `addSlots = {2B, MI}`):

| Player | Assigned | Eligible | Tier 1? | Tier 2? | Should appear? |
|--------|----------|----------|---------|---------|----------------|
| Tatis Fake | 2B | 2B, OF | ✅ Yes | ✅ Yes | ✅ Yes |
| Pure OF Guy | OF | OF | ❌ No | ❌ No | **✅ Yes** — if Tatis moves to OF, 2B opens |
| First Base Only | 1B | 1B | ❌ No | ❌ No | ❌ No |

Before PR #349, **Pure OF Guy was invisible in the drop list** — even though dropping him and moving Tatis to OF is a perfectly legal chain transaction. The server's bipartite matcher (`resolveLineup`) would have found this assignment automatically, but the UI never surfaced him as a valid drop.

A second problem: a `.slice(0, 10)` cap discarded players ranked 11+ regardless of chain validity.

---

## Root Cause

The filter checked only immediate slot overlap between the candidate player and `addSlots`. It had no concept of transitive slot availability: dropping player P frees a slot → another player Q can shift into that slot → Q's slot is now free → and so on until a slot the incoming player needs is vacated. Without a graph traversal, any chain longer than one hop was invisible.

---

## Solution

### Tier 3: BFS Vacancy Propagation

Added as the third filter in `filteredDropCandidates` in `AddDropPanel.tsx`:

```typescript
// Chain fit (arbitrary depth): BFS vacancy propagation. Start with
// p's current slot as "vacated". Repeatedly find players Q whose
// eligible slots intersect the vacated set — Q can move there,
// freeing Q's own slot. Stop when stable. Valid drop if the vacated
// set eventually intersects addSlots (a slot the new player can fill).
const pSlot = assignedSlot(p);
if (isSlotCode(pSlot)) {
  const vacated = new Set<string>([pSlot]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const q of dropCandidates) {
      if (q === p) continue;
      const qSlot = assignedSlot(q);
      if (!isSlotCode(qSlot) || vacated.has(qSlot)) continue;
      const qSlots = slotsFor(q.positions || q.posPrimary || "");
      for (const v of vacated) {
        if (isSlotCode(v) && qSlots.has(v)) {
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

**How the algorithm works:**

1. Start: `vacated = {pSlot}` — the slot freed by dropping candidate P
2. Inner loop: for every other roster player Q, check if any of Q's eligible slots (`slotsFor(q.positions)`) intersect `vacated`. If yes, Q can shift into a vacated slot, freeing Q's current slot — add `qSlot` to `vacated`.
3. Repeat until no new slots are added (`changed = false`).
4. If `vacated` now contains any slot in `addSlots`, P is a valid drop via chain.

The `while (changed)` outer loop guarantees termination (the `vacated` set is finite and only grows). Correct for 1-hop, 2-hop, or N-hop chains.

### Slice Cap Removal

```typescript
// Before
.sort((a, b) => comparePlayers(a, b, dropSortKey, dropSortDir))
.slice(0, 10);  ← removed

// After
.sort((a, b) => comparePlayers(a, b, dropSortKey, dropSortDir));
```

The cap was a leftover performance guard from early development when roster sizes were unknown. Active OGBA rosters have ≤25 players; the full filter runs in O(n²) per candidate, which is negligible at this scale. Chain-fit candidates appear lower in the sorted list (by position sort order), so the cap specifically hurt them.

---

## How the Server Handles the Actual Assignment

This is a **UI filter only** — it decides what the user *sees* as droppable. The server's `resolveLineup` bipartite matcher is the authority for what is *legal*. When the user selects a chain-fit drop (e.g., drop Pure OF Guy + add Rennie Lile), `resolveLineup` finds the globally-optimal slot assignment including moving Tatis to OF, and returns `appliedReassignments` in the response (shown as a toast). The `SlotRearrangementSection` manual overrides are complementary — they let the user specify slot moves explicitly, but the server will auto-resolve anything not overridden.

---

## Related Documentation

- [`docs/solutions/logic-errors/add-drop-ghost-il-blocker-and-slot-filter-indirect-eligibility.md`](add-drop-ghost-il-blocker-and-slot-filter-indirect-eligibility.md) — the preceding fix that added Tier 2 (indirect fit via `posList`); the chain fix (PR #349) builds directly on top of it
- [`docs/solutions/logic-errors/pairwise-slot-constraint-bipartite-matching.md`](pairwise-slot-constraint-bipartite-matching.md) — the server-side bipartite matcher that resolves chains at claim time; explains why the UI filter only needs to determine *candidate eligibility*, not the full assignment

### Key functions

| Function | Location |
|----------|----------|
| `slotsFor` (client) | `client/src/lib/positionEligibility.ts` |
| `isSlotCode` | `client/src/lib/positionEligibility.ts` |
| `assignedSlot` | `AddDropPanel.tsx` (module-private) |
| `resolveLineup` | `server/src/features/transactions/lib/slotMatcher.ts` |

---

## Prevention & Testing

### Tests Added (PR #349)

Six tests in `AddDropPanel.test.tsx` describe block `"AddDropPanel — chain-drop-candidates (PR #349)"`:

1. Chain-fit player appears when a moveable 2B+OF player creates a vacancy path
2. Direct-fit player still appears alongside the chain-fit player (non-regression)
3. Player with no chain path does not appear (boundary)
4. Updated "New player eligible for:" label renders
5. Updated empty-state text renders when no drops qualify
6. Removes the 10-player cap — all 11 chain-fit players appear

### Extending the Filter (Adding a 4th Tier)

Before adding a new tier, check whether extending BFS depth handles the case. The current algorithm already handles N-hop chains — if candidates are still missing, verify that `slotsFor` returns the expected set for their `positions` field first (run the `positionEligibility.test.ts` suite).

If a 4th tier is genuinely needed:
- Write the failing test **before** the implementation (proves the candidate is currently excluded)
- Cover all three regression surfaces: new tier appears, existing tiers not broken, boundary cases excluded
- Test cap behavior explicitly with N+1 players

### RTL Selector Trap: Numbered Player Names

When testing lists with sequentially numbered fixtures, unanchored regex selectors match more rows than intended:

```ts
// BREAKS when "OF Player 1", "OF Player 10", "OF Player 11" all exist
screen.getByRole("row", { name: /OF Player 1/ })
// RTL: Found multiple elements with role "row" and name matching /OF Player 1/
```

**Fix:**

```ts
// Anchored regex
screen.getByRole("row", { name: /^OF Player 1$/ })

// Plain text (preferred for presence checks)
screen.getByText("OF Player 1")

// For absence checks, always use queryBy (getBy throws)
expect(screen.queryByText("OF Player 7")).not.toBeInTheDocument()
```

**Rule of thumb:** If a fixture has more than 9 items with a shared prefix (Player 1…Player 10+), use exact text or anchored regex. Encountered during PR #349 cap-removal test.
