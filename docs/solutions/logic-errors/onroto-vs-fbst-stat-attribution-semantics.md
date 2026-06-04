---
title: "OnRoto credits current-roster YTD stats; FBST credits ownership-window stats"
category: logic-errors
problem_type: attribution_model_mismatch
component: "server/src/features/standings/services/standingsService.ts"
tags:
  - standings
  - stat-attribution
  - ownership-window
  - onroto
  - roto-scoring
  - fantasy-baseball
  - OGBA
  - period-snapshot
  - computeWithPeriodStats
  - computeWithDailyStats
---

## Symptom

FBST season stat totals diverge from OnRoto's league display by significant amounts for teams that acquired or dropped players mid-season:

- Teams that **dropped pitchers** show *higher* FBST totals than OnRoto (e.g., +16 K for RGing Sluggers)
- Teams that **acquired pitchers with pre-pickup production** show *lower* FBST totals than OnRoto (e.g., −6 SV for The Show)

A current-week control test (same active date window) shows 6 of 8 teams matching OnRoto exactly, confirming the **data pipeline is healthy** — the gap is attribution logic only.

## The Two Models

### OnRoto — Roster-Snapshot YTD

```
stats[team] = Σ player.YTD_stats  for every player in team.currentRoster
```

Stats are a function of who is on the roster *right now*. Drop a player → their entire season production disappears from your column tomorrow. Pick someone up → you instantly inherit every stat they accumulated all season, including games played for a different fantasy team.

### FBST — Ownership-Window

```
stats[team][period] = Σ player.dailyStats  for each day player was on team.roster
```

Stats are the Cartesian intersection of (player, team, date). Drop a player → you keep what they earned while they were yours; their future stats disappear. Pick someone up → you get their production from your pickup date onward, not their pre-acquisition totals.

**FBST's model is correct for OGBA.** Period-by-period roto scoring accumulates across periods. You own what you owned.

## Specific Player Examples (2026 Season)

| Player | Transaction | FBST (ownership-window) | OnRoto (roster-snapshot) | Gap |
|---|---|---|---|---|
| Tanner Scott → The Show | Picked up May 17 | Counts saves from May 17 onward | Credits The Show with all pre-May-17 saves | −6 SV (FBST lower) |
| Zac Gallen → RGing Sluggers | Dropped end of Period 2 | Credits RGing with P1+P2 K (29 total) | Wipes all K after drop | +16 K (FBST higher) |
| Victor Vodnik → DLC | 4 saves on DLC roster, dropped later | Retains 4 SV + associated K for DLC | Removes stats after drop | Part of DLC's +11 K / +1 SV advantage |
| Ryan Walker → The Show | 3 saves in P1+P2, dropped before P3 | Retains 3 SV for The Show | Removes all saves after drop | The Show shows higher SV in FBST |

## Audit Methodology

**Step 1 — Current-week control.**
Compare FBST and OnRoto using the same active date window (current lineup period). If 6+ of 8 teams match exactly, the data pipeline is healthy and any season-total gap is attribution-only.

**Step 2 — Transaction cross-reference.**
Pull the transaction log for any team showing a large gap. Cross-reference acquisition/drop dates against the stat categories where the gap appears.

**Step 3 — Player-level PSP spot-check.**
For a suspicious team, run per-pitcher PSP data and confirm each player's stats are present (`in PSP? YES`) and plausible. Zeros are valid if the player was injured; missing rows (`NO ⚠`) indicate a sync problem.

**Step 4 — Period boundary audit.**
Confirm whether transactions happened at period boundaries or mid-period. If all transactions are boundary-aligned, both `computeWithPeriodStats` and `computeWithDailyStats` produce identical results and standings are unambiguous.

## FBST Implementation: Two Attribution Paths

`server/src/features/standings/services/standingsService.ts` has two stat aggregation paths:

### `computeWithDailyStats()` — Correct for all cases

Uses `clampToPeriod()` to split daily stat rows (`PlayerStatsDaily`) by exact ownership window. Correctly handles any mid-period transaction regardless of timing.

```typescript
// Awards stats only within this roster entry's ownership window
const { from, to } = clampToPeriod(roster, period);
// ... filters daily rows where gameDate >= from && gameDate <= to
```

### `computeWithPeriodStats()` — Correct only at period boundaries

Determines ownership by checking who held the player at **period end**, then assigns that team the player's entire `PlayerStatsPeriod` (PSP) row:

```typescript
const endOfPeriodOwner = new Map<number, number>();
for (const r of rosters) {
  if (!ownedOn(r, period.endDate)) continue;
  if (!endOfPeriodOwner.has(r.playerId)) {
    endOfPeriodOwner.set(r.playerId, r.teamId);
  }
}
```

**Latent bug:** If a player is acquired mid-period, the end-of-period owner gets credit for the player's **entire period PSP**, including production from before the pickup. This mirrors OnRoto's over-crediting behavior. No mid-period acquisitions occurred in OGBA Periods 1 or 2 (all transactions at boundaries), so this bug has not fired. It would silently over-credit a team the first time a mid-period waiver claim lands on an active contributor.

### Production Path Selection

```typescript
if (periodStatCount > 0) {
  return computeWithPeriodStats(teams, rosters, period, ilWindowsByPlayer);
}
return computeWithDailyStats(teams, rosters, period, ilWindowsByPlayer);
```

PSP rows exist for all active periods (synced every 13 hours) → production always uses `computeWithPeriodStats`. The daily path is a fallback for the first 13 hours of a new period before the cron runs.

## Prevention

**Signal that an attribution mismatch may have occurred:**
- Season totals diverge from OnRoto across multiple counting categories simultaneously for the same team
- Gap grows after a week with multiple adds/drops of high-production contributors
- A team that recently picked up a hot reliever shows suspiciously high saves relative to the days since pickup

**Future fix (if mid-period transactions start occurring):**
Route all standings computation through `computeWithDailyStats` rather than `computeWithPeriodStats`. The daily path correctly handles all transaction timing. Alternatively, augment `computeWithPeriodStats` to detect the acquiring team's pickup date and pro-rate PSP using daily stats for the overlap window.

## Related

- [`docs/solutions/logic-errors/closed-period-stat-attribution-uses-current-owner.md`](closed-period-stat-attribution-uses-current-owner.md) — named the end-of-period-owner semantic and fixed `computeWithPeriodStats` from a current-owner (`releasedAt === null`) bug
- [`docs/solutions/logic-errors/standings-stat-attribution-and-avg-rounding.md`](standings-stat-attribution-and-avg-rounding.md) — design rule for the active-holder-gets-100% attribution model; uses OnRoto as the external baseline
- [`docs/solutions/logic-errors/standings-stats-source-heuristic-chose-inaccurate-daily-over-period.md`](standings-stats-source-heuristic-chose-inaccurate-daily-over-period.md) — trust hierarchy: PSP > PSD; PSP is authoritative for whole-period attribution
- [`docs/solutions/logic-errors/current-state-field-used-as-historical-predicate.md`](current-state-field-used-as-historical-predicate.md) — anti-pattern class; OnRoto's `releasedAt === null` check is the canonical current-state-used-as-historical predicate
- [`docs/solutions/logic-errors/standings-boundary-and-il-slot-historical-lookup.md`](standings-boundary-and-il-slot-historical-lookup.md) — "current state vs. historical state" mental model; IL attribution uses the same ownership-window approach
- [`docs/solutions/logic-errors/trade-reversal-ghost-roster-double-counting.md`](trade-reversal-ghost-roster-double-counting.md) — historical origin of `activePlayerTeam` map pattern in `computeWithPeriodStats`
