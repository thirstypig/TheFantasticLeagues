---
status: pending
priority: p2
issue_id: "138"
tags: [code-review, performance, awards, agent-native]
dependencies: []
---

# Collapse two redundant groupBys in `computeAwardsRankings`; thread AbortSignal into compute

## Problem Statement

Two adjacent issues on the awards compute path:

1. **Redundant scans.** `server/src/features/mlb-feed/services/awardsService.ts:176-191` issues two `prisma.playerStatsPeriod.groupBy` calls with **identical** where clauses and group keys — one for counting stats, one for `IP`/`BB_H`. Under `connection_limit=1` they serialize on the wire. Doubles the DB cost of every uncached awards request. The IP/BB_H values are then merged client-side via `ipMap.get(...)` — could be a single `_sum` block.
2. **No AbortSignal.** `awardsRoutes.ts:58` calls `computeAwardsRankings(leagueId, weekKey)` synchronously. If an agent times out client-side, the server compute keeps running. Same applies to extended-stats compute paths.

Todo #119 covers the caching/persistence decision; this is orthogonal — even with cache the *cold path* should be fast and cancellable.

## Findings

- `server/src/features/mlb-feed/services/awardsService.ts:176-191` — two `groupBy` calls
- `server/src/features/mlb-feed/awardsRoutes.ts:58` — no req.signal threading
- Prisma supports merging the `_sum` fields — no schema reason for the split

## Proposed Solutions

### Option 1: Merge groupBys + thread req.signal (recommended)

Combine the two `_sum` blocks into one `groupBy`. Pass `req.signal` (or Express 4 equivalent: `req.on("close")` short-circuit) into the awards compute, check between aggregation stages.

**Effort:** Small (~2h). **Risk:** Low.

## Recommended Action

Option 1.

## Technical Details

- `server/src/features/mlb-feed/services/awardsService.ts:176-191`
- `server/src/features/mlb-feed/awardsRoutes.ts:58`
- See also #133 (the relocation) — natural to do these together

## Acceptance Criteria

- [ ] Single `groupBy` call covers all `_sum` fields
- [ ] Awards endpoint p50 latency improves on cold path (measure)
- [ ] AbortSignal threaded; aborted requests stop work mid-flight (test with manual cancel)

## Resources

- Performance review under /ce:review 2026-04-30
- Todo #119 (caching)

## Work Log

### 2026-04-30 — Initial Discovery
- performance-oracle + agent-native-reviewer both flagged during /ce:review re-run.
