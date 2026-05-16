---
status: pending
priority: p1
issue_id: "197"
tags: [code-review, standings, attribution, correctness, documentation]
dependencies: []
---

# Undocumented retroactive attribution shift when period transitions from daily→period stats

## Problem Statement

`computeTeamStatsFromDb` has two attribution paths with **different semantics for mid-period trades**:

- **Period-stats path** (when `PlayerStatsPeriod` rows exist): attributes ALL period stats to the player's CURRENT owner (releasedAt=null). A player traded on day 10 of 28 — the new team gets the full period's stats.
- **Daily-stats fallback** (when no period stats yet): attributes stats within each roster ownership window. Same player's pre-trade stats stay with the original team.

A new period starts in daily-stats mode (no period rows) for up to ~13 hours (until the 13:00 UTC cron runs). Any mid-period trade in that window gets attributed under daily-stats semantics. When the cron fires and `PlayerStatsPeriod` rows populate, the **same standings query retroactively re-attributes** those stats — the original team loses credit, the new team gains it.

This is a silent, time-dependent correctness issue with no test coverage and no documentation. Real OGBA money is on the line.

## Findings

- **File:** `server/src/features/standings/services/standingsService.ts` lines 427–436
- The comment at line 429 says "brand-new period before the first 13:00 UTC cron run" but doesn't document the semantic divergence or the retroactive shift
- No test covers a trade that straddles the daily→period stats path transition
- The practical window for this to trigger: period start (Tuesday/Wednesday per OGBA cadence) until ~13:00 UTC same day. Any trade processed in that window = affected.

## Proposed Solutions

### Option A — Document the contract + add a test pinning the known divergence (Recommended)
Update the `computeTeamStatsFromDb` docstring to explicitly state:
1. Period-stats path attributes full-period stats to current owner (no daily breakdown)
2. Daily-stats path splits at ownership boundary
3. Path transition is time-dependent (~13h window); a trade in the window sees retroactive re-attribution when the cron fires

Add a test asserting the period-stats behavior for a mid-period trade. Add a separate comment/test showing what daily-stats would produce for the same trade (the known divergence).

- **Pros:** Makes the contract explicit; future readers understand the system's behavior
- **Effort:** Small (docs + 1-2 tests)
- **Risk:** None — no behavior change

### Option B — Eliminate the daily-stats path for active periods
Once `syncAllActivePeriods` runs 4× daily, a period that is more than 6 hours old always has period stats. Hard-disable the daily-stats fallback after the first cron cycle (e.g., `if (period.startDate < Date.now() - 6h && periodStatCount === 0) throw` or return empty). This removes the ambiguity window.
- **Pros:** Eliminates the semantic divergence entirely for production use
- **Cons:** Daily-stats path would be unreachable; need to preserve it for brand-new periods
- **Effort:** Medium
- **Risk:** Medium — changes behavior if period stats happen to be missing

### Option C — Normalize by always attributing to the period-stats path logic even in daily-stats mode
When period stats are missing, compute them from daily stats and insert synthetic `PlayerStatsPeriod` rows. Then always use the period-stats path.
- **Pros:** Single attribution semantic
- **Cons:** Complex; write path in a read function
- **Effort:** Large

## Recommended Action

Option A first (document + test). Option B as a follow-up once the behavior is well-tested.

## Acceptance Criteria
- [ ] `computeTeamStatsFromDb` docstring documents the two attribution semantics and the transition window
- [ ] Test: trade on day 5 of 28 → period-stats path → new team gets full period stats
- [ ] Test comment documents what daily-stats path would give for the same trade
- [ ] No behavior change

## Work Log
- 2026-05-15: Identified by Architecture reviewer. Retroactive attribution shift is a silent production risk for OGBA trades that happen early in a new period.
