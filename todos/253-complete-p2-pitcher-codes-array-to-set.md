---
status: pending
priority: p2
issue_id: 253
tags: [code-review, performance, standing, refactoring]
dependencies: []
---

## Problem Statement

`PITCHER_CODES` is exported from `server/src/lib/sportConfig.ts` (or `baseball.ts`) as a readonly array `["P", "SP", "RP", "CL", "TWP"]`. The hot loop in both `computeWithDailyStats` and `computeWithPeriodStats` checks membership with `.some(code => code === pos)`, which creates a new arrow function closure on every iteration. Meanwhile, four other places in the codebase independently re-wrap the array in `new Set(PITCHER_CODES)` for O(1) `.has()` lookups.

This is a code-smell more than a production bottleneck (leagues are small), but the inconsistency means every new consumer either re-wraps the array or adds another `.some()`. Exporting a companion `Set` eliminates the drift.

## Findings

From performance-oracle:
- `standingsService.ts` lines 534, 649: `.some()` pattern
- `auction/routes.ts`: `new Set(PITCHER_CODES)` local re-wrap
- `auctionDaySnapshot.ts`: `new Set(PITCHER_CODES)` local re-wrap
- `fangraphs-audit.ts` (script): `new Set(PITCHER_CODES)` local re-wrap
- 4 independent re-wrappings of the same constant = classic divergence surface

## Proposed Solutions

**Option A — Export a companion Set alongside the array (Recommended)**

In `sportConfig.ts` (or wherever `PITCHER_CODES` is defined):
```typescript
export const PITCHER_CODES = ["P", "SP", "RP", "CL", "TWP"] as const;
export const PITCHER_CODES_SET: ReadonlySet<string> = new Set(PITCHER_CODES);
```

Update all call sites to use `PITCHER_CODES_SET.has(pos)` instead of `PITCHER_CODES.some(c => c === pos)` or local `new Set(PITCHER_CODES)`.

Effort: Small | Risk: Low

**Option B — Replace the array with a Set entirely**

Change `PITCHER_CODES` to a `ReadonlySet<string>`. Breaks any callers that use the array as an iterable (e.g., for spread, `.map`, `.join`). More disruptive.

Effort: Medium | Risk: Medium

**Recommended:** Option A. Additive change, no existing call sites broken.

## Technical Details

Affected files:
- `server/src/lib/sportConfig.ts` (or `baseball.ts`) — export site
- `server/src/features/standings/services/standingsService.ts` lines 534, 649
- `server/src/features/auction/routes.ts`
- `server/src/features/auction/auctionDaySnapshot.ts`
- `scripts/fangraphs-audit.ts`

## Acceptance Criteria

- [ ] `PITCHER_CODES_SET` exported as `ReadonlySet<string>` from the source module
- [ ] `standingsService.ts` hot loop uses `.has()` not `.some()`
- [ ] All 3 `new Set(PITCHER_CODES)` local re-wraps removed
- [ ] No new `.some()` calls on `PITCHER_CODES` in the diff
- [ ] tsc clean; all standing tests pass

## Work Log

2026-06-04 — Surfaced by performance-oracle. Pre-existing pattern not introduced by this PR, but now has 5 instances.
