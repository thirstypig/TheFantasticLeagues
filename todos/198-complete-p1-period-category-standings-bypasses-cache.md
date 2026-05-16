---
status: pending
priority: p1
issue_id: "198"
tags: [code-review, standings, performance, cache, database]
dependencies: []
---

# `period-category-standings` endpoint bypasses cache — N uncached DB calls per request

## Problem Statement

The `/api/standings/period-category-standings` route calls `computeTeamStatsFromDb` N times (once per active/completed period) with **no caching**. It bypasses `getSeasonStandings` entirely. Each `computeTeamStatsFromDb` call makes 5 sequential DB roundtrips. With 2 periods: 10 sequential queries per user request. With 5 periods: 25 sequential queries.

The 2-minute `getSeasonStandings` cache covers `GET /api/standings/season`. The `period-category-standings` route does NOT use it. Every Season page load (which hits this endpoint for the category breakdown) hits the raw DB.

**File:** `server/src/features/standings/routes.ts` lines ~136–148

## Findings

```typescript
// routes.ts (approximate)
const allPeriods = ...;
const periodStats = await Promise.all(
  allPeriods.map(pid => computeTeamStatsFromDb(leagueId, pid))  // N uncached calls
);
```

The `getSeasonStandings` function already computes exactly this data (`periodData` array) and caches it for 2 minutes with stampede prevention. The `period-category-standings` route is re-doing the same work without benefiting from that cache.

## Proposed Solutions

### Option A — Route through `getSeasonStandings` cache (Recommended)
`getSeasonStandings` returns `{ periodIds, periodData: Array<{teamStats, standings}>, seasonRows }`. The `teamStats` arrays are exactly what `period-category-standings` needs for `computeCategoryRows`. Consume the cached result instead of re-computing.

```typescript
const { periodIds, periodData } = await getSeasonStandings(leagueId);
// periodData[i].teamStats is already computed and cached
```
- **Pros:** Zero extra DB calls after first cache hit; consistent with season standings freshness
- **Cons:** The category endpoint may want a single specific period, not all periods — check if that's the case
- **Effort:** Small-Medium
- **Risk:** Low

### Option B — Add per-(leagueId, periodId) memoization
Add a lightweight `Map<string, { data, expiry }>` keyed by `${leagueId}-${periodId}` below `getSeasonStandings`. Cache each individual period's result for 2 minutes.
- **Pros:** Fine-grained; `period-category-standings` can fetch just the period it needs
- **Cons:** More cache invalidation surface; `clearStandingsCache` must also clear this map
- **Effort:** Medium

### Option C — Move `period-category-standings` to use `getSeasonStandings` + extract
If the route needs the category breakdown for ALL periods (not one), `getSeasonStandings` already parallelizes `computeTeamStatsFromDb` across all periods. Expose `computeCategoryRows` calls from that cached result.
- **Pros:** Same behavior, cached
- **Effort:** Small

## Recommended Action

Option A — check what specific data `period-category-standings` needs and route it through `getSeasonStandings`. If it needs all periods' category data, `getSeasonStandings.periodData` already has it. If it needs only one period, Option B is cleaner.

## Acceptance Criteria
- [ ] `/api/standings/period-category-standings` does not call `computeTeamStatsFromDb` directly
- [ ] Results are served from the 2-minute cache on repeated requests
- [ ] Season page load does not trigger N uncached DB calls
- [ ] Existing behavior (category breakdown per period) unchanged

## Work Log
- 2026-05-15: Identified by Performance reviewer. Most impactful production perf issue from this session's changes.
