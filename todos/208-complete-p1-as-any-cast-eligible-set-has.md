---
status: pending
priority: p1
issue_id: "208"
tags: [code-review, typescript, roster, position-eligibility, type-safety]
dependencies: []
---

# `as any` cast in `eligible.has(p as any)` hides a real type gap — use `isSlotCode` guard

## Problem Statement

In `RosterGrid.tsx`, the eligible slot filter uses a blanket `as any` cast to satisfy TypeScript when calling `Set.has()`:

```typescript
return all.filter(p => p === "DH" || p === displayPos || eligible.has(p as any));
```

`eligible` is a `ReadonlySet<SlotCode>`. `all` is `as const` so each `p` has a union type of all its members. The cast would also suppress a bug if `all` were ever widened to include a non-`SlotCode` value — an illegal position would silently pass through without a compile error.

`isSlotCode` is already exported from `../../../lib/positionEligibility` for exactly this purpose (it's a type guard `(x: string) => x is SlotCode`). Using it makes the intent self-documenting and type-safe.

## Findings

- **File:** `client/src/features/roster/components/RosterGrid.tsx` line ~230
- `isSlotCode` exists and is exported from `lib/positionEligibility` — it is not being used here
- The `as any` cast is load-bearing: remove it and TS errors; replace with `isSlotCode(p) &&` and it's clean
- Every element of `all` is in fact a valid `SlotCode`, so the guard always passes — but that invariant is implicit, not explicit

## Proposed Solutions

### Option A — Use `isSlotCode` type guard (Recommended)
```typescript
return all.filter(p =>
  p === "DH" || p === displayPos || (isSlotCode(p) && eligible.has(p))
);
```
Add `isSlotCode` to the existing import from `../../../lib/positionEligibility`.
- **Pros:** Self-documenting, type-safe, future-proof against `all` widening
- **Cons:** None
- **Effort:** 2 lines
- **Risk:** None — same runtime behavior

### Option B — Cast as `SlotCode` instead of `any`
```typescript
eligible.has(p as SlotCode)
```
- **Pros:** Removes `any`
- **Cons:** Still a cast, not a guard — doesn't catch `all` widening
- **Effort:** 1 line

## Recommended Action

Option A — use `isSlotCode`. It's already in scope and was written for this use case.

## Acceptance Criteria
- [ ] `eligible.has(p as any)` replaced with `isSlotCode(p) && eligible.has(p)`
- [ ] `isSlotCode` imported from `lib/positionEligibility`
- [ ] `tsc --noEmit` clean on client
- [ ] All existing `RosterGrid.test.tsx` tests still pass

## Work Log
- 2026-05-18: Identified by TypeScript reviewer. `isSlotCode` exists but was not imported.
