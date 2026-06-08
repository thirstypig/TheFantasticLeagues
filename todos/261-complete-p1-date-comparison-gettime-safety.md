---
status: complete
priority: p1
issue_id: 261
tags: [code-review, standings, type-safety, testing]
dependencies: []
---

## Problem Statement

`hasMidPeriodPickup` in `standingsService.ts` uses `r.acquiredAt > period.startDate` to compare Date objects. JavaScript's `>` operator coerces via `valueOf()` which works correctly when both operands are real `Date` objects (as Prisma always returns). However, if any test mock forgets to wrap a date string with `new Date()`, the comparison becomes lexicographic string comparison and silently succeeds or fails based on ISO string format rather than actual time. This class of bug has bitten the standings path before (documented in `docs/solutions/logic-errors/standings-boundary-and-il-slot-historical-lookup.md`).

## Findings

From `server/src/features/standings/services/standingsService.ts` (PR #374):
```typescript
const hasMidPeriodPickup = rosters.some(
  r => r.acquiredAt > period.startDate && r.acquiredAt < period.endDate
);
```

- `r.acquiredAt` and `period.startDate` are `Date` objects from Prisma in production.
- In test mocks (see `standingsService.pathRouting.test.ts`) these are `new Date(...)` — currently correct.
- A future mock that passes a plain string `"2026-05-01"` would silently produce wrong routing logic.
- Learnings researcher flagged: past boundary bugs on this exact code path used implicit coercion.

## Proposed Solutions

### Option A — Use `.getTime()` for explicit numeric comparison (Recommended)
```typescript
const hasMidPeriodPickup = rosters.some(
  r => r.acquiredAt.getTime() > period.startDate.getTime() &&
       r.acquiredAt.getTime() < period.endDate.getTime()
);
```
**Pros:** Unambiguous intent, safe with any `Date` object, explicit about numeric comparison. **Cons:** Slightly more verbose. **Effort:** Trivial. **Risk:** None.

### Option B — Add type assertion to document intent
Add a comment explaining why `>` is safe:
```typescript
// Date objects — valueOf() gives ms-since-epoch; comparison is numeric
const hasMidPeriodPickup = rosters.some(
  r => r.acquiredAt > period.startDate && r.acquiredAt < period.endDate
);
```
**Pros:** Zero diff. **Cons:** Comment rots; doesn't prevent future mock errors. **Effort:** Trivial. **Risk:** Still vulnerable to bad mocks.

## Recommended Action

Option A. One-liner change; makes intent explicit and safe regardless of how values arrive.

## Technical Details

- **File:** `server/src/features/standings/services/standingsService.ts` ~line 478
- **Test file:** `server/src/features/standings/__tests__/standingsService.pathRouting.test.ts` — already uses `new Date()` correctly

## Acceptance Criteria

- [ ] Comparison uses `.getTime()` on both sides
- [ ] Existing 6 path-routing tests still pass
- [ ] `cd server && npx tsc --noEmit` clean

## Work Log

### 2026-06-05 — Surfaced by kieran-typescript-reviewer during session review
