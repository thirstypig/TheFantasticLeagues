---
status: complete
priority: p2
issue_id: "137"
tags: [code-review, performance, players, mlb-feed]
dependencies: []
---

# Players list endpoints over-fetch the entire table; statsService MLB batch loop is sequential

## Problem Statement

Two performance issues on the players module that compound now that the v3 hub is live:

1. **`GET /api/players` and `GET /api/players/player-season-stats`** (`server/src/features/players/routes.ts:51-130, 367-462`) do `prisma.player.findMany` over *every* player (~1,000+ rows) with only filler/test exclusion in the where clause, then JS-filter by `allowedTeams` and `availability`. ~200KB transferred per request. Hit on every team page load post-PR #182.
2. **`statsService` cold-start MLB batch loop** (`server/src/features/players/services/statsService.ts:166-173, 225-232`) runs `for (const batch of batches) await mlbGetJson(...)` with a `setTimeout(100ms)` between. ~1,200 players in 50-batch chunks × 250ms ≈ 6s warm-up on cold container. Single user triggers full warm-up.

Both interact with the `connection_limit=1` constraint and Railway cold-start frequency.

## Findings

- `server/src/features/players/routes.ts:51-130` — `availability=available|owned` filter applied client-side
- `server/src/features/players/routes.ts:367-462` — same shape for stats endpoint
- `server/src/features/players/services/statsService.ts:166-173, 225-232` — sequential `await` loop
- No in-memory cache wrapper on either path

## Proposed Solutions

### Option 1: Push filters into Prisma + add cache + parallelize MLB batches (recommended)

- Translate `availability=available` → `where: { roster: { none: {} } }` (or equivalent)
- Translate `allowedTeams` → `where: { mlbTeam: { in: [...] } }`
- 60s in-memory cache keyed `(leagueId, availability, type)`; invalidate from claim/il-stash/il-activate handlers
- statsService: switch sequential loop to `pLimit(4)` parallel; cuts warm-up ~75%

**Effort:** Medium (~half day). **Risk:** Low — no behavior change beyond perf.

### Option 2: Pagination + cursor on the routes

Forces clients to stream rather than fix the over-fetch.

**Effort:** Medium. **Risk:** Higher — every consumer needs a code change.

## Recommended Action

Option 1.

## Technical Details

- `server/src/features/players/routes.ts:51-130, 367-462` — filter pushdown + cache
- `server/src/features/players/services/statsService.ts:166-173, 225-232` — bounded concurrency
- `server/src/features/transactions/routes.ts` — invalidation hooks on roster mutations

## Acceptance Criteria

- [ ] `players` route response time on cold cache reduced by ≥40%
- [ ] statsService cold-start latency reduced by ≥60% (measure before/after)
- [ ] Cache invalidates on every roster mutation (verify with test)
- [ ] No regression on filter correctness

## Resources

- Performance review under /ce:review 2026-04-30
- Todos #119, #120 (awards/sparkline caching — sister tickets)

## Work Log

### 2026-04-30 — Initial Discovery
- performance-oracle flagged during /ce:review re-run.
