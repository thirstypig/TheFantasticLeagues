---
status: pending
priority: p2
issue_id: "244"
tags: [code-review, pr-365, standings, testing, prevention]
dependencies: []
---

# Add PSD↔PSP differential test for standings attribution

## Problem Statement

`computeWithDailyStats` (PSD path) and `computeWithPeriodStats` (PSP path)
now have INTENTIONALLY different attribution semantics for mid-period
trades:

- PSD path: stats split by ownership window (precise)
- PSP path: full PSP credited to end-of-period owner (coarse)

These produce DIFFERENT per-team results for the same mid-period-trade
scenario. The compound doc Prevention section names the rule:

> When introducing or modifying either path, add a paired test that runs
> BOTH paths on the same scenario and asserts they agree on per-team
> totals (within stat-granularity rounding).

That test doesn't exist yet. Without it, future refactors will silently
re-introduce divergence.

## Proposed Solutions

### Option 1 (recommended): Differential property test

For the no-trade case (player owned by one team for the full period), assert
PSD and PSP produce identical per-team totals. For mid-period trade scenarios,
assert the documented divergence is exactly what's expected (PSP gives full
to end-of-period owner; PSD splits). Either equality or documented
divergence — never "depends on the path."

## Acceptance Criteria

- [ ] New test file `standingsService.differential.test.ts` OR section in `standingsService.test.ts`
- [ ] Static-ownership scenario: both paths produce identical totals
- [ ] Mid-period-trade scenario: PSP credits end-of-period owner, PSD credits per-window
- [ ] Documented "convergence within rounding" tolerance for AVG/ERA/WHIP

## Resources

- Compound doc: `docs/solutions/logic-errors/closed-period-stat-attribution-uses-current-owner.md` (Prevention section)
- PR #365 architecture review finding F1
