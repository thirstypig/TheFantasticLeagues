---
status: pending
priority: p3
issue_id: "182"
tags: [v3-hub, deferred, dnd-kit, ux, mutations]
dependencies: []
---

# Drag-to-mutate via dnd-kit (swap/promote/bench from grab handle)

## Problem Statement

The v3 hub already wires `@dnd-kit/core` (DndContext + sensors imported in `Team.tsx:24-25`)
and the `useRosterHubDrag` hook exists at
`client/src/features/teams/hooks/useRosterHubDrag.tsx`. Row cells already accept `dragSim`
props for visual feedback. **But the drop handler doesn't queue a real pending change yet** —
drag is currently a UX preview rail, not the mutation entry point.

Pill-click selection is documented in `Team.tsx:553-555` as display-only:
> "drag-to-mutate is the new mutation entry point for swaps"

That comment is aspirational — the wiring isn't done. Today the only way to mutate slot
assignment is the row action menu ("Move to BN", etc.) opened from the `...` button.

Spun out of #128 to design the optimistic-update + revert flow before code lands.

## Findings

- `client/src/features/teams/pages/Team.tsx:24-25` — dnd-kit imports already present
- `client/src/features/teams/pages/Team.tsx:553-555` — pill-click comment cites drag-to-mutate as future entry point
- `client/src/features/teams/pages/Team.tsx:1152` — `// dnd-kit sensor setup for the DndContext wrapping the hub.`
- `client/src/features/teams/hooks/useRosterHubDrag.tsx` — hook exists; drop handler is the open question
- Memory: `roster_hub_v3_shipped.md` "What's deferred" → drag-to-mutate

## Proposed Solutions

### Option 1: Drop-handler queues a swap into `usePendingChanges` (recommended)

**Approach:**
1. `useRosterHubDrag` already detects valid drop targets (slot codes the dragged player is
   eligible for) and emits `dragSim` data for the visual preview. Extend the drop handler
   so a successful drop calls `pending.queueSwap({ rosterId, fromSlot, toSlot })` —
   the existing `usePendingChanges` reducer.
2. Visual: keep the optimistic move (cell flips immediately) — the existing
   `PendingChangeBar` shows the unsaved-count chip + Save/Revert buttons.
3. Eligibility guard: drop is rejected when the target slot is not in the player's
   eligible-slots set (re-use `isSlotCode` + `positionToSlots` already wired in the hub).
4. Keyboard parity: dnd-kit's `KeyboardSensor` is already imported; the row action menu
   keeps the keyboard path so dnd isn't a regression for accessibility.

**Pros:**
- All the hard parts (sensors, dragSim, eligibility) already done
- Pending-change queue + diff modal handle revert for free
- Keyboard fallback survives via row action menu

**Cons:**
- Touch behavior on mobile still needs verification (PointerSensor's distance threshold)
- Revert mid-drag UX (user dragged but hasn't dropped) — already handled by dnd-kit cancel
- Cross-tab safety overlap with todo #181 (rosterVersion etag) — neither blocks the other

**Effort:** Small-medium (~1 day). **Risk:** Low — the visual rail is the hard part and
it's done.

### Option 2: Defer indefinitely; row action menu is good enough

**Cons:** dnd-kit is already in the bundle; the visual rail is in production; not
finishing it leaves a half-built feature in the code. Don't.

## Recommended Action

Option 1.

## Technical Details

- `client/src/features/teams/hooks/useRosterHubDrag.tsx` — wire `pending.queueSwap` into the drop handler
- `client/src/features/teams/pages/Team.tsx:553-555` — drop the "drag-to-mutate is the new mutation entry point" caveat once shipped
- `client/src/features/teams/components/RosterHub/RosterHubV3.tsx` — already accepts `dragSim` per cell
- New tests: `useRosterHubDrag.test.tsx` already exists; add the "drop queues pending change" case

## Acceptance Criteria

- [ ] Drag from one slot to another (eligible) slot queues a pending swap
- [ ] PendingChangeBar count + Save flow exercises the swap end-to-end
- [ ] Drop on an ineligible slot is rejected (no queue, no visual flip)
- [ ] Keyboard sensor path (Tab + Space + arrow) lands the same swap
- [ ] Browser smoke `/teams/:code` mobile + desktop — no regressions on the existing pill-click selection
- [ ] `Team.tsx:555` comment updated to drop the "is the new mutation entry point" framing

## Resources

- **Source:** Spun out of todo #128 (deferred v3-hub follow-ups)
- **Memory:** `roster_hub_v3_shipped.md` "What's deferred"
- **Pairs with:** #181 (rosterVersion etag) — multi-tab race surface

## Work Log

### 2026-05-07 — Spun out of #128
- **By:** consolidation pass (todo #128 → 4 dedicated tracking todos)
