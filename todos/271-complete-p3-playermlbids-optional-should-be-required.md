---
status: pending
priority: p3
issue_id: 271
tags: [code-review, typescript, transactions, autoResolveLineup]
dependencies: []
---

## Problem Statement

The `playerMlbIds` parameter in `applyAssignments` (PR #377) is marked `optional` (`playerMlbIds?: Map<number, number | null>`). This means callers that forget to pass it get silent `mlbId: null` on all `AppliedReassignment` output rows — a silent failure mode rather than a compile error. Since the feature's explicit goal is to surface `mlbId` for agent correlation, a silent null defeats the purpose without any diagnostic.

## Findings

From `server/src/features/transactions/lib/autoResolveLineup.ts` (PR #377):
```typescript
export function applyAssignments(
  candidates: Candidate[],
  available: SlotCode[],
  originalSlots: Map<number, SlotCode>,
  playerNames: Map<number, string>,
  playerMlbIds?: Map<number, number | null>,  // ← optional: caller can silently omit
) {
  // ...
  return candidates.map(c => ({
    // ...
    mlbId: playerMlbIds?.get(c.rosterId) ?? null,  // silently null if map not passed
  }));
}
```
- All three current call sites pass `playerMlbIds` (claim, il-stash, il-activate).
- But any future call site that omits the map silently produces `mlbId: null` for all rows.

## Proposed Solutions

### Option A — Make required (Recommended)
```typescript
export function applyAssignments(
  candidates: Candidate[],
  available: SlotCode[],
  originalSlots: Map<number, SlotCode>,
  playerNames: Map<number, string>,
  playerMlbIds: Map<number, number | null>,  // required: compile error if omitted
) {
```
Pass `new Map()` at call sites where mlbId is genuinely unavailable. **Pros:** Forces explicit handling; type error catches future callers. **Effort:** Trivial. **Risk:** None.

## Recommended Action

Option A. A required parameter with an explicit empty `new Map()` at edge-case call sites is better than optional with silent nulls.

## Technical Details

- **File:** `server/src/features/transactions/lib/autoResolveLineup.ts`
- Update all 3 call sites in `server/src/features/transactions/routes.ts` to pass the map explicitly

## Acceptance Criteria

- [ ] `playerMlbIds` is required (no `?`)
- [ ] All call sites pass an explicit `Map<number, number | null>`
- [ ] `cd server && npx tsc --noEmit` clean (ignoring zod false negative)

## Work Log

### 2026-06-05 — Surfaced by code-simplicity-reviewer during session review
