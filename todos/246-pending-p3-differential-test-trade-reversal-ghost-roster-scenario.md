---
status: pending
priority: p3
issue_id: 246
tags: [code-review, test-coverage, standings]
dependencies: []
---

## Problem Statement

`standingsService.differential.test.ts` (PR #368) covers static ownership, IL exclusion, mid-period trade, and zero-sum invariant — but does not cover the trade-reversal / ghost-roster scenario. This scenario has already caused a documented production standings corruption (`docs/solutions/logic-errors/trade-reversal-ghost-roster-double-counting.md`). Neither path should double-count a player from orphaned roster rows after a reversed trade.

## Findings

The learnings researcher surfaced `docs/solutions/logic-errors/trade-reversal-ghost-roster-double-counting.md` as directly relevant. When a trade is reversed, both directions leave ghost roster rows. A player may appear in multiple roster entries (`Roster` table) across the league. Naive attribution logic can credit them to multiple teams.

The `computeWithPeriodStats` path uses `endOfPeriodOwner` dedup (first-wins on playerId), which should handle this. The `computeWithDailyStats` path iterates all roster rows — it is less obviously safe. Neither path's handling of ghost rosters is currently pinned by a test.

## Proposed Solutions

**Option A — Add a ghost-roster test scenario to `standingsService.differential.test.ts`**

Set up rosters where the same player has overlapping rows (two non-null acquiredAt rows for different teams, simulating a reversed trade). Assert both paths credit the player exactly once — zero-sum total equals single-player total.

**Option B — Add to the existing `standingsService.releaseAt.test.ts`** (pre-existing file for boundary scenarios)

Ghost roster is a boundary scenario (releasedAt / acquiredAt overlap). Could live there instead of the differential file.

**Recommended:** Option A. The differential file is the natural home since we want to pin that BOTH paths handle it correctly.

## Acceptance Criteria

- [ ] Test scenario: player 6 has two overlapping roster rows on different teams (ghost after trade reversal)
- [ ] Both PSD and PSP paths credit the player to exactly one team (endOfPeriodOwner wins for PSP, ownership-window wins for PSD)
- [ ] Zero-sum invariant holds: league total for the player's stats equals the player's actual stat total
- [ ] All 89+ standings tests continue to pass

## Resources

- `docs/solutions/logic-errors/trade-reversal-ghost-roster-double-counting.md`
- `server/src/features/standings/__tests__/standingsService.differential.test.ts`
- `server/src/features/standings/services/standingsService.ts` — `computeWithPeriodStats` dedup guard at ~line 627
