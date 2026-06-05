---
status: pending
priority: p2
issue_id: 260
tags: [standings, attribution, computeWithPeriodStats, ownership-window, ADR-013]
dependencies: []
---

## Problem Statement

`computeWithPeriodStats` in `standingsService.ts` assigns the entire `PlayerStatsPeriod` (PSP) row to the team that holds the player at **period end**. For periods where all transactions happen at period boundaries (exactly on `period.startDate` or `period.endDate`), this produces correct results. But if a player is **acquired mid-period**, the acquiring team receives credit for the full period's PSP — including stats the player earned before the acquisition. This silently over-credits the acquiring team in violation of ADR-013's ownership-window rule.

Periods 1 and 2 were unaffected (no mid-period pickups confirmed via `find_mid_period_trades.ts`). Period 3 has drops only (no pickups). But the bug will fire the first time a mid-period waiver claim succeeds.

## Findings

From `server/src/features/standings/services/standingsService.ts`:

```typescript
// computeTeamStatsFromDb path selection (line ~475)
if (periodStatCount > 0) {
  return computeWithPeriodStats(...)  // ← used whenever PSP data exists
}
return computeWithDailyStats(...)     // ← fallback only for new periods
```

`computeWithPeriodStats` builds `endOfPeriodOwner` map, then credits the full PSP row to that team:
- If Team A drops player on day 10 and Team B picks them up on day 15 (both mid-period):
  - Team B is end-of-period owner → gets full period PSP (days 1–28)
  - Team B is over-credited for days 1–14 (when player was on Team A)
  - Team A gets nothing — correct per ownership-window rule
  - Net error: acquiring team gets pre-acquisition stats

`computeWithDailyStats` (via `clampToPeriod`) is always correct — it only counts daily rows within the ownership window `[acquiredAt, releasedAt]`.

## Proposed Solutions

**Option A — Auto-detect and route to daily stats when mid-period pickups exist (Recommended)**

In `computeTeamStatsFromDb`, before choosing the PSP path, check whether any mid-period acquisitions occurred:

```typescript
const midPeriodPickups = rosters.filter(r =>
  r.acquiredAt > period.startDate && r.acquiredAt < period.endDate
);
if (periodStatCount > 0 && midPeriodPickups.length === 0) {
  return computeWithPeriodStats(teams, rosters, period, ilWindowsByPlayer);
}
return computeWithDailyStats(teams, rosters, period, ilWindowsByPlayer);
```

Effort: Small | Risk: Low | Backward compatible: yes (PSP still used for clean periods)

**Option B — Always use daily stats**

Remove the PSP path entirely. Simpler, always correct, but loses the PSP accuracy advantage (PSP handles doubleheaders correctly; `playerStatsDaily` collapses them via `@@unique([playerId, gameDate])`).

Effort: Tiny | Risk: Medium (may undercount K/RBI on doubleheader days)

**Recommended:** Option A. Preserves PSP accuracy for the common case; falls back to daily for the edge case.

## Technical Details

Affected files:
- `server/src/features/standings/services/standingsService.ts` — path selection logic (~line 475)
- `server/src/scripts/find_mid_period_trades.ts` — already exists for detection

## Acceptance Criteria

- [ ] `computeTeamStatsFromDb` detects mid-period acquisitions before choosing the PSP path
- [ ] Falls back to `computeWithDailyStats` when any `roster.acquiredAt` falls strictly between `period.startDate` and `period.endDate`
- [ ] Existing tests still pass (including the differential test which explicitly verifies both paths)
- [ ] Add a test case: mid-period pickup → PSP path is NOT taken; daily path is used

## Work Log

2026-06-04 — Surfaced during OnRoto vs FBST attribution audit. Confirmed by `find_mid_period_trades.ts` that Periods 1 and 2 are clean. Filed as latent P2 per ADR-013.
