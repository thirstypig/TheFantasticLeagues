---
status: pending
priority: p1
issue_id: 250
tags: [code-review, test-coverage, standings, rosterWindow]
dependencies: []
---

## Problem Statement

Both `rosterWindow.test.ts` and `standingsService.differential.test.ts` set `PERIOD_END` to `new Date("2026-05-16T23:59:59.999Z")`, but production `Period.endDate` rows are stored as `T12:00:00Z` (noon UTC) via `periods/routes.ts:85–86`. The tests build false confidence: they pass today because `releasedAt` values (always UTC midnight) and `period.endDate` (always noon) never collide in production — but the tests are not exercising the real data shape.

## Findings

- `periods/routes.ts` lines 85–86: `new Date(endDate + "T12:00:00Z")` — noon UTC storage
- `rosterWindow.test.ts:165`: `const PERIOD_END = new Date("2026-05-16T23:59:59.999Z")`
- `standingsService.differential.test.ts:54`: `const PERIOD_END = new Date("2026-05-16T23:59:59.999Z")`
- The `ownedOn` strict upper bound (`releasedAt > date`) is correct for noon endDate: a player released at UTC midnight satisfies `releasedAt > period.endDate(noon)`. But a player released at exactly noon would fail. Since `resolveEffectiveDate` always anchors to UTC midnight, this specific case can't happen now — but the tests don't enforce that invariant.
- If any migration or admin route ever writes an endDate at midnight, the predicate fails silently on period-boundary trades.

## Proposed Solutions

**Option A — Fix PERIOD_END to match production shape (Recommended)**

Change both constants to `new Date("2026-05-16T12:00:00.000Z")` to match what Prisma returns from the live DB. Add a comment explaining the noon UTC convention. Verify all assertions still pass with the corrected value.

Effort: Small | Risk: Low

**Option B — Add a normalized endDate assertion in period-creation routes**

Add a Zod refinement or runtime assertion in `periods/routes.ts` that endDate must be stored at exactly `T12:00:00Z`. This prevents drift but doesn't fix the existing test fixture.

Effort: Small | Risk: Low

**Recommended:** Option A first, then Option B as a guard.

## Technical Details

Affected files:
- `server/src/lib/__tests__/rosterWindow.test.ts` line 165
- `server/src/features/standings/__tests__/standingsService.differential.test.ts` line 54
- `server/src/features/periods/routes.ts` lines 85–86 (period creation — source of truth for endDate shape)

## Acceptance Criteria

- [ ] Both `PERIOD_END` constants use `new Date("2026-05-16T12:00:00.000Z")`
- [ ] All existing tests still pass with the corrected fixture
- [ ] A comment explains "noon UTC — matches periods/routes.ts storage convention"
- [ ] Optional: a test case in `rosterWindow.test.ts` for `ownedOn` where date is exactly noon and releasedAt is exactly noon (should return false per strict upper bound)

## Work Log

2026-06-04 — Surfaced by kieran-typescript-reviewer in session code review. Confirmed by cross-referencing `periods/routes.ts`.
