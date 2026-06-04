---
status: pending
priority: p2
issue_id: 252
tags: [code-review, test-coverage, rosterWindow, standings]
dependencies: [250]
---

## Problem Statement

Two boundary cases in the new `rosterWindow.ts` predicates are not pinned by tests:

1. `clampToPeriod`: no test for `releasedAt === period.startDate` (a player released exactly on period day 1 — should produce `from === to === period.startDate`, crediting exactly one day in the PSD loop)
2. `ownedOn`: no test for `acquiredAt === date` (acquired exactly on the target date — should return `true` since the upper bound is `<=`)

These are the "symmetric" boundary cases for the ones already tested (`clampToPeriod` covers `releasedAt === period.endDate`; `ownedOn` covers `releasedAt === date`). Their absence is a coverage gap, not a bug — but since these predicates are load-bearing for stats attribution, pinning boundary semantics is the documented convention for this codebase.

## Findings

From kieran-typescript-reviewer:
- `rosterWindow.test.ts` tests `clampToPeriod` for `releasedAt === period.endDate` (line 254–256) but not `releasedAt === period.startDate`
- `rosterWindow.test.ts` tests `ownedOn` for `releasedAt === date` (strict false) but not `acquiredAt === date` (should be true)
- The `[acquiredAt, releasedAt)` convention in the file header is the contract these tests are meant to pin

## Proposed Solutions

**Option A — Add two focused tests to `rosterWindow.test.ts` (Recommended)**

```typescript
// In describe("clampToPeriod"):
it("produces from === to when releasedAt equals period.startDate", () => {
  const { from, to } = clampToPeriod({ acquiredAt: new Date("2026-03-22"), releasedAt: PERIOD.startDate }, PERIOD);
  expect(from).toEqual(PERIOD.startDate);
  expect(to).toEqual(PERIOD.startDate);
});

// In describe("ownedOn"):
it("returns true when acquiredAt equals the date (inclusive lower bound)", () => {
  expect(ownedOn({ acquiredAt: END, releasedAt: null }, END)).toBe(true);
});
```

Effort: Small | Risk: None

**Recommended:** Option A only.

## Technical Details

Affected files:
- `server/src/lib/__tests__/rosterWindow.test.ts`

Note: Dependency on #250 — fix `PERIOD_END` fixture first so the new tests use the correct noon-UTC timestamp shape.

## Acceptance Criteria

- [ ] `clampToPeriod` test: `releasedAt === period.startDate` → `{ from: startDate, to: startDate }`
- [ ] `ownedOn` test: `acquiredAt === date` → `true`
- [ ] Both tests pass with the noon-UTC `PERIOD_END` from todo #250
- [ ] No existing tests broken

## Work Log

2026-06-04 — Surfaced by kieran-typescript-reviewer. Paired boundary cases with existing tests.
