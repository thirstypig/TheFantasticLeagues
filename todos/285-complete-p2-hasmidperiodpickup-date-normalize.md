---
status: complete
priority: p2
issue_id: 285
tags: [standings, code-fix, attribution, computeTeamStatsFromDb]
dependencies: []
---

## Problem Statement

`computeTeamStatsFromDb` (`server/src/features/standings/services/standingsService.ts`) flips an entire period to the `computeWithDailyStats` fallback if **any** roster row has `acquiredAt` strictly between `period.startDate` and `period.endDate` — compared at millisecond precision. Two artifact rows (Ohtani synthetic pitcher created 3/29; Andrew Vaughn `acquiredAt` noon on period start day) force P1 onto the daily path, which has the documented 3/25–3/28 cold-start gap — so the live P1 standings are undercounted even though P1's PSP data exists. Discovered 2026-06-09; evidence in `docs/reports/onroto-audit-2026-06-08.md` Section 5.4.

## Proposed Solutions

Normalize to calendar dates in the `hasMidPeriodPickup` check: an acquisition on the same calendar day as `period.startDate` is boundary-aligned, not mid-period. E.g. compare `yyyy-mm-dd` strings or truncate both sides to UTC midnight before the strict inequality.

Add a regression test pinning: acquiredAt at 12:00 on the period start date → PSP path; acquiredAt the day after start → daily path.

## Acceptance Criteria

- Acquisitions time-stamped any time on the period start date do not trigger the daily fallback.
- Paired test added to `standingsService.differential.test.ts` (per standings-architecture convention).
- `git mv` this todo from pending → complete.

## Resolution (2026-06-09)

Shipped in PR #393: `hasMidPeriodPickup` compares UTC calendar dates; 3 TDD path-routing tests (noon-on-start, same-day-end, day-after guard). Merged to main 2026-06-10.
