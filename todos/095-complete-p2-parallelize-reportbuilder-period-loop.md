---
status: complete
priority: p2
issue_id: "095"
tags: [code-review, performance, architecture, reports]
dependencies: []
---

# Parallelize reportBuilder period loop; extract shared `getSeasonStandings` helper

## Problem Statement

`server/src/features/reports/services/reportBuilder.ts:136-148` aggregates season standings via a sequential `for await` loop over periods:

```typescript
for (const p of periods) {
  const teamStats = await computeTeamStatsFromDb(leagueId, p.id);
  ...
}
```

`computeTeamStatsFromDb` does ~3 DB round-trips per call. For a live season with ~15 periods, that's ~45 sequential round-trips per `/report` page load — roughly 450-900ms on Supabase before any rendering.

The sibling `/api/standings/season` endpoint at `server/src/features/standings/routes.ts:198-204` ALREADY solves this correctly via `Promise.all(periodIds.map(...))`. The same per-period iteration + sum pattern exists in both callers, so the fix also opens an extraction opportunity.

## Findings

### Agent: performance-oracle
- Sequential pattern is the most impactful finding in the PR; sibling endpoint already uses `Promise.all`.
- Measured: ~15 periods × ~3 round-trips each = ~45 sequential. `Promise.all` drops to ~3 round-trips.
- Worth extracting `computeSeasonStandings(leagueId)` helper in `standingsService.ts` consumed by both callers; put parallelization in one place.

### Agent: kieran-typescript-reviewer
- Same finding: `await` inside `for…of` serializes N period queries. One-line refactor to `Promise.all(periods.map(...))`.

### Agent: architecture-strategist
- Endorses extracting `getSeasonStandings(leagueId)` shared helper. Premature to add caching, but the helper is right-sized now (15 call sites touch the same pattern).

## Proposed Solutions

### Solution 1: Parallel loop + extract helper (recommended)
1. Add `getSeasonStandings(leagueId: number)` in `server/src/features/standings/services/standingsService.ts` that:
   - Queries active/completed periods
   - Runs `Promise.all` over `computeTeamStatsFromDb(leagueId, p.id)` + `computeStandingsFromStats`
   - Returns `Array<{ teamId, totalPoints }>` sorted desc with ranks
2. Replace the loop in `reportBuilder.ts` with a single helper call.
3. Refactor `/api/standings/season` to use the same helper (keeps its per-period detail separate — only the rollup moves to the helper).

- **Pros**: One source of truth for season-rollup logic; perf win applies everywhere; future caching can live in one place.
- **Cons**: Two callers have to agree on the helper's return shape — may need small adjustments to `/season` route.
- **Effort**: Small (30-45 min)
- **Risk**: Low — covered by existing route/service tests.

### Solution 2: Parallelize in-place, no extraction
Just `Promise.all` the loop in `reportBuilder.ts`; leave duplication alone.
- **Pros**: Tiny diff, contained change
- **Cons**: Two callers diverge; next engineer adds a third with its own copy.
- **Effort**: Trivial (~5 min)
- **Risk**: Very low

### Solution 3: Do nothing
- **Pros**: Zero effort
- **Cons**: `/report` page is noticeably slower than `/season` for identical underlying computation.
- **REJECT**

## Recommended Action

Solution 1 — extract `getSeasonStandings` and parallelize at the helper. Two callers benefit; path stays clean.

## Acceptance Criteria

- [ ] `getSeasonStandings(leagueId)` exported from `standingsService.ts`
- [ ] Both `reportBuilder.ts` and `/api/standings/season` route consume the helper
- [ ] Parallel `Promise.all` execution confirmed (timestamp log or benchmark)
- [ ] Existing tests pass (standings routes + reports module)
- [ ] One-sentence performance note added to helper's JSDoc ("~15× latency improvement vs sequential loop")

## Work Log

- **2026-04-16** (Session 66 `/ce:review`): Flagged by 3 agents — performance-oracle, kieran-typescript-reviewer, architecture-strategist. All three agree on extract + parallelize.

## Resources

- `server/src/features/reports/services/reportBuilder.ts` lines 136-148 (N+1 loop)
- `server/src/features/standings/routes.ts` lines 186-253 (reference pattern already using Promise.all)
- `server/src/features/standings/services/standingsService.ts` lines 370-504 (extraction target + helper site)
