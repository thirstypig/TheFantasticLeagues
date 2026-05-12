---
status: pending
priority: p1
issue_id: "184"
tags: [code-review, wire-list, mobile, architecture, refactor]
dependencies: []
---

# Extract `useWireListOwner` hook — eliminate MobileWireList/WireListOwnerPage duplication

## Problem Statement

`MobileWireList.tsx` and `WireListOwnerPage.tsx` share ~120 lines of identical stateful logic: team resolution, period fetch, add/drop entry fetch, `withPending`, `swapAddPriorities`, `swapDropPriorities`, `removeAdd`, `removeDrop`, `setDropMode`. The wire-list processor is a real-money commissioner flow — any correctness fix must now be applied in two places or one diverges silently.

## Findings

Architecture agent (PR #333 review) flagged this as P1. Code-simplicity agent confirmed the duplication is verbatim across both files. After the performance fix (getTeams extracted to one-time effect), the shared logic is even cleaner to extract.

## Proposed Solution

Create `client/src/features/wire-list/hooks/useWireListOwner.ts` with signature:

```ts
export function useWireListOwner(leagueId: number | null, teamCode: string) {
  // Returns: { teamId, period, adds, drops, loading, error,
  //            reload, withPending, swapAddPriorities, swapDropPriorities,
  //            removeAdd, removeDrop, setDropMode, isReadOnly,
  //            addPlayerIds, dropPlayerIds, pending,
  //            showAddPicker, setShowAddPicker, showDropPicker, setShowDropPicker }
}
```

Both pages become thin shells that call the hook and pass state to JSX.

## Acceptance Criteria

- [ ] Hook exists at `client/src/features/wire-list/hooks/useWireListOwner.ts`
- [ ] `MobileWireList.tsx` body reduced to JSX-only (no useState/useCallback for data logic)
- [ ] `WireListOwnerPage.tsx` uses the same hook
- [ ] `tsc --noEmit` clean
- [ ] Browser verify both desktop and mobile wire list work with an active PENDING period

## Work Log

- 2026-05-11: Identified during PR #333 code review (architecture + simplicity agents).
