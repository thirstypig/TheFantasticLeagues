---
title: "Period end date test fixtures used T23:59:59.999Z instead of production noon UTC shape"
category: test-failures
problem_type: approximate_constant_boundary_masking
component: "server/src/lib/rosterWindow.ts, server/src/features/standings/__tests__"
tags:
  - test-fixtures
  - date-boundaries
  - rosterWindow
  - standingsService
  - period-end
  - ownedOn
  - clampToPeriod
  - noon-utc
---

## Symptom

Unit tests for `rosterWindow` predicates and `standingsService.differential` pass locally and in CI, but the test fixtures assert boundary behavior against a `period.endDate` shape that **never appears in production data**. Specifically, `PERIOD_END = new Date("2026-05-16T23:59:59.999Z")` was used while production stores period end dates as noon UTC (`new Date(date + "T12:00:00Z")`).

No test failure. No type error. The bug is silent — tests build false confidence in the boundary behavior.

## Root Cause

`periods/routes.ts` stores every period's `endDate` as noon UTC:

```typescript
// periods/routes.ts
endDate: new Date(endDate + "T12:00:00Z")  // noon UTC — the canonical shape
```

Three new date-comparison predicates were added to `rosterWindow.ts`:

- `overlapsPeriod()` — inclusive on both sides
- `ownedOn(roster, date)` — strict upper bound: `releasedAt > date`
- `clampToPeriod(roster, period)` — returns `{ from, to }` clamped to period boundaries

The test fixtures set `PERIOD_END = new Date("2026-05-16T23:59:59.999Z")`. Tests passed because the ordering relationship between fixture values was preserved: `releasedAt` values are always UTC midnight (`resolveEffectiveDate` anchors to `T00:00:00Z`), and both `T23:59:59.999Z` and `T12:00:00Z` are greater than midnight. So no predicate returned the wrong result — but the tests were exercising "midnight vs. end-of-day" boundary semantics rather than "midnight vs. noon" semantics.

The specific production boundary being tested — a player `releasedAt` midnight compared against `period.endDate` at noon — was never exercised.

**Pattern name: Approximate Constant Boundary Masking.** The test constant approximates the production value but doesn't match it exactly. Because the approximation preserves all ordering relationships with other fixture values, tests pass while the specific boundary being asserted remains untested.

## Fix

Changed both constants in both affected test files:

```typescript
// BEFORE — both rosterWindow.test.ts and standingsService.differential.test.ts
const PERIOD_END = new Date("2026-05-16T23:59:59.999Z");

// AFTER
// noon UTC — matches periods/routes.ts storage convention (new Date(date + "T12:00:00Z"))
const PERIOD_END = new Date("2026-05-16T12:00:00.000Z");
```

Also added two previously missing boundary tests in `rosterWindow.test.ts`:

```typescript
// Inclusive lower bound — acquiredAt exactly equals the date
it("returns true when acquiredAt equals the date (inclusive lower bound)", () => {
  expect(ownedOn({ acquiredAt: END, releasedAt: null }, END)).toBe(true);
});

// One-day tenure — releasedAt exactly equals period.startDate
it("produces from === to when releasedAt equals period.startDate (one-day tenure)", () => {
  const { from, to } = clampToPeriod(
    { acquiredAt: new Date("2026-03-22"), releasedAt: PERIOD.startDate },
    PERIOD,
  );
  expect(from).toEqual(PERIOD.startDate);
  expect(to).toEqual(PERIOD.startDate);
});
```

## Additional Affected Files (Fixed Same Session)

The related-docs search found two more test files that still used `T23:59:59.999Z`:

- `server/src/features/standings/__tests__/standingsService.IL.test.ts` line 33
- `server/src/features/standings/__tests__/standingsService.releaseAt.test.ts` lines 56, 125

These were corrected to `T12:00:00.000Z` in the same fix pass.

## Why the Boundary Matters

`ownedOn()` determines end-of-period stat attribution — which fantasy team gets credit for a player's stats when a scoring period closes. The production call is:

```typescript
if (!ownedOn(r, period.endDate)) continue;
```

Where `period.endDate` is always `T12:00:00Z`. A player released at `T12:00:00Z` exactly (same timestamp as `period.endDate`) would return `false` from `ownedOn` (strict upper bound: `releasedAt > date` fails when equal). This is correct behavior — but the tests were asserting this with a `T23:59:59Z` endDate, where midnight `releasedAt` would correctly pass without testing the noon comparison.

## Prevention

**Rule 1 — Test constants must match production storage format exactly.**

Before writing any date/time constant in a test, locate the production write path and check how the value is actually stored. If production writes `T12:00:00Z`, the test constant must be `T12:00:00Z`. Document the source in a comment on the constant:

```typescript
// noon UTC — matches periods/routes.ts storage convention
const PERIOD_END = new Date("2026-05-16T12:00:00.000Z");
```

**Rule 2 — Boundary predicates require a flip-at-constant test.**

For any predicate of the form `x > constant` or `x >= constant`, the test suite must include a case where `x === constant` and assert the expected side of the boundary. If no test changes its result when the constant shifts by one millisecond, the constant's exact value is untested.

## Related

- [`docs/solutions/logic-errors/period-date-timezone-shift.md`](../logic-errors/period-date-timezone-shift.md) — canonical doc explaining why noon UTC was chosen for period dates (timezone display buffer)
- [`docs/solutions/logic-errors/standings-boundary-and-il-slot-historical-lookup.md`](../logic-errors/standings-boundary-and-il-slot-historical-lookup.md) — complementary boundary condition doc; `gte` vs `gt` on `releasedAt` caused 73 uncredited Runs in Period 2
- [`docs/solutions/logic-errors/period-roster-historical-il-display-and-gte-boundary.md`](../logic-errors/period-roster-historical-il-display-and-gte-boundary.md) — notes that `period.startDate`/`endDate` can render off-by-one in local time; fixtures must use UTC-correct values
