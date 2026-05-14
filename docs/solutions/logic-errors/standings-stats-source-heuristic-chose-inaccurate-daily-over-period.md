---
title: "Standings undercounting stats due to playerStatsDaily doubleheader collapse and infrequent sync"
category: logic-errors
tags: [standings, stats-sync, doubleheaders, cron, PlayerStatsPeriod, playerStatsDaily, coverage-heuristic]
module: Standings
symptom: "RBI, K, W, and IP systematically undercounted in standings; standings up to 12 hours stale vs FanGraphs live scoring"
root_cause: "computeTeamStatsFromDb used a ≥80% coverage-ratio heuristic that selected playerStatsDaily for active periods; that table has @@unique([playerId, gameDate]) which collapses doubleheaders into one row per day, dropping stats from the second game. Compounded by syncAllActivePeriods running only once daily at 13:00 UTC."
---

# Standings undercounting stats: playerStatsDaily doubleheader collapse + infrequent sync

**Verified:** 2026-05-13 | **PRs:** fd9f9be, 8035fcf

## Symptom

Period standings showed systematically lower RBI, K, W, and IP than FanGraphs live scoring
for all teams. Example discrepancy for DLC period 2: K=158 (ours) vs K=181 (FanGraphs).
ERA/WHIP were also off. Once standings were corrected, a secondary symptom appeared: a
~12-hour lag between our numbers and FanGraphs by evening — standings only updated once
at 09:00 EDT.

## Investigation

1. Traced `computeTeamStatsFromDb` in `server/src/features/standings/services/standingsService.ts`
   to the routing branch that decided between `playerStatsDaily` and `PlayerStatsPeriod`.

2. Found the 80% coverage-ratio heuristic: counted distinct `gameDate` rows in
   `playerStatsDaily`, compared to total period days. When coverage ≥ 80%, routed to
   `computeWithDailyStats`.

3. Inspected the Prisma schema — `playerStatsDaily` has `@@unique([playerId, gameDate])`.
   On doubleheader days, both games share the same `gameDate`. Prisma's upsert collapses
   them into one row; the second game's stats overwrite the first rather than accumulating.

4. Confirmed `PlayerStatsPeriod` is populated by `syncAllActivePeriods` via the MLB
   `byDateRange` API, which aggregates across all games in the period and handles
   doubleheaders correctly.

5. Verified with live data: fetched MLB box scores for all 15 games on 2026-05-13, matched
   OGBA roster players, and confirmed: **DB (PlayerStatsPeriod) + today's box scores =
   FanGraphs for all 8 teams across all 10 categories.** W and SV matched exactly for
   every team; K/ERA/WHIP differences were purely intraday.

6. Checked `server/src/index.ts` — `syncAllActivePeriods` ran once daily at 13:00 UTC,
   meaning standings could be ~12 hours stale by evening games. Increasing to 4× daily
   closes this.

7. **Red herring**: a debugging script used `releasedAt: { gte: period.startDate }` instead
   of the service's correct `gt`. This incorrectly included players released exactly at
   the period start (keeper dropoffs at auction draft), inflating K/ERA. The production
   filter is correct — see "Note on Roster Filter" below.

## Root Cause

### Bug 1 — Wrong stats table for active periods

The coverage-ratio heuristic reliably routed active periods to `computeWithDailyStats`
because coverage was always ≥ 80% once a few game days had passed. This silently
undercounted stats on every doubleheader day:

```typescript
// OLD — routes to daily stats based on coverage ratio
const periodDays = Math.max(1, Math.ceil(
  (period.endDate.getTime() - period.startDate.getTime()) / 86400000
));
const dailyStatDays = await prisma.playerStatsDaily.groupBy({
  by: ["gameDate"],
  where: { gameDate: { gte: period.startDate, lte: period.endDate } },
});
const coverageRatio = dailyStatDays.length / periodDays;
if (coverageRatio >= 0.8) {
  return computeWithDailyStats(teams, rosters, period);   // WRONG — collapses doubleheaders
} else {
  return computeWithPeriodStats(teams, rosters, periodId);
}
```

The schema constraint is the fundamental issue:

```prisma
model PlayerStatsDaily {
  // ...
  @@unique([playerId, gameDate])
  // WARNING: doubleheaders collapse to one row per date. This table is NOT accurate
  // for period stat aggregations. Use PlayerStatsPeriod (MLB byDateRange API) instead.
}
```

### Bug 2 — Standings went stale by ~12 hours

A single 13:00 UTC cron left evening game results (first pitch ~23:00–01:00 UTC) unsynced
until the next day — a ~12-hour lag visible to users comparing against live scoring.

## Fix

### Fix 1 — Routing in `standingsService.ts` (lines ~407–420)

Replace the coverage-ratio heuristic with a direct check for `PlayerStatsPeriod` data.
If the accurate source has been synced, use it. Fall back to daily stats only for
brand-new periods before the first cron run.

```typescript
// Prefer PlayerStatsPeriod (populated by syncAllActivePeriods via MLB byDateRange API) —
// it is the accurate source and handles doubleheaders correctly. The playerStatsDaily
// table uses @@unique([playerId, gameDate]) which collapses doubleheaders into one row
// and systematically undercounts RBI, K, W, and IP.
//
// Fall back to daily stats only when PlayerStatsPeriod hasn't been synced yet
// (e.g., a brand-new period before the first 13:00 UTC cron run).
const periodStatCount = await prisma.playerStatsPeriod.count({ where: { periodId } });
if (periodStatCount > 0) {
  return computeWithPeriodStats(teams, rosters, periodId);
}
// No PlayerStatsPeriod data yet — use daily stats as a best-effort fallback.
return computeWithDailyStats(teams, rosters, period);
```

### Fix 2 — Sync frequency in `server/src/index.ts`

Extract the cron body into a shared runner and schedule 4× daily to cover the key
game windows (day games, pre-evening, East night games wrapping, West Coast late games).

```typescript
// Player stats sync — 4× daily keeps standings within ~4 hours of live scoring:
//   13:00 UTC (9 AM EDT)  — morning baseline, 1 hr after player roster sync
//   18:00 UTC (2 PM EDT)  — after day games have started
//   22:00 UTC (6 PM EDT)  — day games done, before evening games
//   02:00 UTC (10 PM EDT) — East Coast night games wrapping up
async function runStatsSyncJob() {
  logger.info({}, "Starting scheduled player stats sync");
  try {
    await syncAllActivePeriods();
    logger.info({}, "Scheduled player stats sync complete");
  } catch (err) {
    logger.error({ error: String(err) }, "Scheduled player stats sync failed");
  }
}
cron.schedule('0 13 * * *', runStatsSyncJob);
cron.schedule('0 18 * * *', runStatsSyncJob);
cron.schedule('0 22 * * *', runStatsSyncJob);
cron.schedule('0 2 * * *',  runStatsSyncJob);
```

### Note on Roster Filter

The roster filter in `computeTeamStatsFromDb` correctly uses
`releasedAt: { gt: period.startDate }` (strictly greater than). Players released exactly
at the period start — keeper dropoffs processed at the moment of an auction draft — should
not contribute stats to that period. Any debugging script that uses `gte` instead will
show inflated K and ERA for teams that dropped pitchers at the period boundary. This is
a script artifact, not a production bug.

## Prevention

### Don't use heuristics to select the authoritative data source

The 80% threshold was invisible during review (no name, no comment explaining why that
number). Replace any threshold-based routing with an explicit check against the accurate
source:

```typescript
// Explicit: "does the accurate source have data?" beats any ratio
const hasAccurateData = (await prisma.playerStatsPeriod.count({ where: { periodId } })) > 0;
return hasAccurateData
  ? computeWithPeriodStats(teams, rosters, periodId)
  : computeWithDailyStats(teams, rosters, period);
```

### Tests that would have caught this

**Doubleheader undercount regression test:**
```
Given a player plays two games on the same date (AB=4+4, H=1+2 across both)
  and playerStatsDaily has one row for that date (AB=4, H=1 — first game only)
  and PlayerStatsPeriod has the period row (AB=8, H=3)
When computeTeamStatsFromDb is called for the period
Then the team's AB=8 and H=3, not 4 and 1
```

**Source selection unit test:**
```
periodRows=5, dailyRows=10  → uses PlayerStatsPeriod
periodRows=0, dailyRows=10  → uses playerStatsDaily (fallback)
periodRows=1, dailyRows=0   → uses PlayerStatsPeriod
```

**Regression guard:** Seed `PlayerStatsPeriod` with fewer rows than `playerStatsDaily`
(simulating partial sync) and assert period source is still used. This is the exact
scenario the 80% heuristic was meant to handle but got wrong.

### Annotate `@@unique` in the schema

Add a comment to the `playerStatsDaily` model's unique constraint so the limitation is
visible to anyone reading the schema:

```prisma
@@unique([playerId, gameDate])
// Doubleheaders collapse to one row per date — do not use for period aggregations.
// Use PlayerStatsPeriod (MLB byDateRange API) which handles multi-game days correctly.
```

### Alert on daily-fallback path in production

Log a warning whenever `computeWithDailyStats` is invoked for a period older than 24 hours.
If `PlayerStatsPeriod` should exist but doesn't, it means a sync failure — not a valid
fallback case.

## Related Docs

- `docs/solutions/logic-errors/ai-grading-zero-data-random-standings.md` — earlier
  `computeTeamStatsFromDb` routing bug (wrong season table used); establishes that
  `PlayerStatsPeriod` is the authoritative source.
- `docs/solutions/logic-errors/waiver-priority-ui-server-mismatch.md` — two direct
  code references to `computeTeamStatsFromDb`; documents the period-based stats as
  authoritative source principle.
- `docs/solutions/logic-errors/mvp-cy-young-composite-scoring-not-single-stat.md` —
  documents extended stat columns added to both `PlayerStatsPeriod` and `playerStatsDaily`.
- `docs/learnings/roster-position-management.md` — section 7 documents the cron
  architecture (12:00 UTC `syncAllPlayers`, 13:00 UTC `syncAllActivePeriods`).
