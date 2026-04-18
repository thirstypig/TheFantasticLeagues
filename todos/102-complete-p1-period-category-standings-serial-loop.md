---
status: complete
priority: p1
issue_id: "102"
tags: [code-review, performance, correctness, standings]
dependencies: []
---

# period-category-standings serial loop blocks event loop + has rate-stat accumulation bug

## Problem Statement

`server/src/features/standings/routes.ts:110-126` contains a sequential `for` loop with `await` in the body:

```typescript
for (const p of allPeriods) {
  const pStats = p.id === pid ? teamStats : await computeTeamStatsFromDb(leagueId, p.id);
  // accumulate...
}
```

Each `computeTeamStatsFromDb` fires 3-5 DB queries. For 6 periods, that's 15-25 serial round-trips (~150-750ms). At 12 periods (full season), this could take 1-4 seconds.

Additionally, rate stats (AVG, ERA, WHIP) on lines 120-121 are being overwritten on each loop iteration instead of computed from accumulated counting-stat components. The last period's rate stats silently overwrite all previous accumulations — this is both a correctness bug and wasted computation.

## Findings

### Agent: performance-oracle
- Identified as CRITICAL-2. Serial `for` loop with `await` blocks the event loop. `Promise.all` would parallelize all period computations.
- Rate stat overwrite is a correctness issue: `seasonTotals` accumulates counting stats but `=` overwrites rate stats each iteration.

### Agent: kieran-typescript-reviewer
- Confirmed sequential pattern. Same O(N) serial DB pattern that was already fixed in `getSeasonStandings` (todo 095) but this is a DIFFERENT code path (period-category-standings endpoint, not season standings).

## Proposed Solutions

### Solution 1: Parallelize + fix rate stat computation (recommended)
1. Replace `for...of` with `Promise.all(allPeriods.map(...))` to parallelize all period DB calls
2. After accumulating counting stats, compute rate stats from components: `AVG = H / AB`, `ERA = (ER * 9) / IP`, `WHIP = (BB + H_allowed) / IP`
3. Need to also accumulate the components (H, AB, ER, IP, BB) not just the derived rates

- **Pros**: Fixes perf (~15x for 12 periods) AND correctness bug (rate stats now correct)
- **Cons**: Slightly more complex accumulation logic for rate stats
- **Effort**: Medium (~30 min)
- **Risk**: Medium — changes standings computation logic. Must verify with existing standings tests + FanGraphs parity check.

### Solution 2: Reuse `getSeasonStandings` helper
The `getSeasonStandings` helper (extracted in Session 66) already parallelizes and accumulates correctly. Consider whether this endpoint can delegate to that helper instead of reimplementing the accumulation.

- **Pros**: DRY, leverages proven helper
- **Cons**: `period-category-standings` needs per-period breakdown for the category matrix, not just season totals
- **Effort**: Medium (~30 min)
- **Risk**: Low

## Recommended Action

Solution 1 for immediate fix; evaluate Solution 2 for longer-term DRY.

## Acceptance Criteria

- [ ] `Promise.all` replaces the sequential `for` loop
- [ ] Rate stats (AVG, ERA, WHIP) computed from accumulated components, not overwritten
- [ ] Existing standings tests pass
- [ ] FanGraphs parity maintained (run `/scripts/fangraphs-audit.ts`)
- [ ] Endpoint responds in <500ms for 6 periods

## Work Log

- **2026-04-16** (Session 67 `/ce:review`): Flagged by performance-oracle (CRITICAL-2) and kieran-typescript-reviewer.

## Resources

- `server/src/features/standings/routes.ts:110-126` (serial loop)
- `server/src/features/standings/services/standingsService.ts:600-647` (reference: getSeasonStandings uses Promise.all)
- `server/src/features/standings/__tests__/routes.test.ts` (test coverage)
