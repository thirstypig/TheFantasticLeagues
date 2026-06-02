---
status: pending
priority: p2
issue_id: 223
tags: [code-review, performance, react]
---

# selectedAdd Dependency Chain Reruns BFS on Every FA Search Keystroke

## Problem Statement

In `AddDropPanel.tsx`, `filteredDropCandidates` (which contains the BFS chain-fit algorithm) reruns on every keystroke the user types in the free-agent search box. This happens because `selectedAdd` is derived from `allFreeAgents`, which changes reference on every search filter/sort, which cascades to invalidate `addSlots`, which invalidates `filteredDropCandidates`.

The BFS is O(n²) at worst on 25 roster players — fast enough that the UI doesn't visibly stutter — but the work is entirely unnecessary: the user hasn't changed their add selection, only their search filter.

## Findings

Dependency chain (each arrow = useMemo re-runs when dep changes):

```
query state (typing in search) 
  → allFreeAgents (new array reference every keystroke)
  → selectedAdd (finds same player, but new object reference)
  → addSlots (new Set reference)
  → filteredDropCandidates (BFS reruns)
```

`selectedAdd` is found via `allFreeAgents.find(p => String(p.mlb_id) === addMlbId)`. Even though the same player is found, it's a new object reference because `allFreeAgents` is a new array each time.

The correct fix decouples `selectedAdd` from `allFreeAgents` by searching the full `players` prop directly:

```typescript
const selectedAdd = useMemo(
  () => players.find(
    (p) => !p._dbTeamId && String(p.mlb_id ?? "") === addMlbId
  ) ?? null,
  [players, addMlbId],
);
```

`players` is a stable prop reference that doesn't change on search/sort. `addMlbId` only changes when the user actually selects a different player. This makes `filteredDropCandidates` recompute only when the user actually changes their add selection.

## Proposed Solutions

### Option A: Decouple selectedAdd from allFreeAgents (Recommended)
Change `selectedAdd` memo to search `players` directly (free agents have no `_dbTeamId`). 3-line change. Makes the BFS truly stable during search.
- Effort: Small
- Risk: Low — `players` includes all team + FA players; the `!_dbTeamId` guard isolates FAs

### Option B: useMemo stabilization via usePrevious
Keep the current chain but add a `usePrevious` hook to prevent identity changes when `addMlbId` hasn't changed.
- Effort: Medium
- Risk: Medium — introduces a custom hook with more indirection

## Acceptance Criteria
- [ ] Typing in the FA search box does NOT trigger `filteredDropCandidates` recomputation (verify via React DevTools Profiler or console.count)
- [ ] Selecting a different FA DOES trigger `filteredDropCandidates` recomputation
- [ ] All existing tests pass
