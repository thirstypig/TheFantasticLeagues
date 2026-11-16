---
priority: p3
issue_id: 305
tags: [performance, standings, connection-pool, capacity, supabase, prisma, cache]
dependencies: []
---

## Problem Statement
A cold standings computation (`getSeasonStandings`, cache miss) takes **~3s** measured
against prod (2926–3033ms, dead consistent from a laptop → us-west-1 pooler). Root cause:
`getSeasonStandingsUncached` fans out `Promise.all` over N periods and each
`computeTeamStatsFromDb` fires ~6 queries (period+teams, roster, IL-events+count, PSP/daily)
→ **~25 DB round-trips for a full compute**. The code is written to parallelize, but the
prod pooler is `connection_limit=1`, so every query **serializes on a single connection**.

Confirmed empirically this session: forcing `connection_limit=5` on the same prod DB dropped
the cold compute to **~1300ms median (best ~800ms)** — the existing parallelism was throttled
by the pool size, not the query logic.

Capacity impact: with `connection_limit=1`, a cold standings compute holds the app's ONLY
connection for ~3s, queuing every other DB-backed request behind it. The 120s in-memory
standings cache is the only thing masking this — and it is **TTL-only, never invalidated on
stat sync** (`clearStandingsCache` has no caller in the sync path). So every 120s the first
request pays full cost, and a cache-miss storm (all owners refreshing right after a sync)
serializes the whole app. This is the capacity ceiling, not user count.

## Proposed Solutions (ranked)
1. **Raise `connection_limit`** (cheapest — exploits existing `Promise.all`). The `=1` is a
   free-tier IPv6 workaround; verify the Supabase plan/pooler tolerates a small pool (e.g. 5)
   from the single Railway instance without tripping pooler limits. ~2.3× win for a config change.
2. **Batch the per-period query fan-out.** Load all periods' rosters / PSP / IL-events in one
   query each (across periods), compute in memory — turns ~25 round-trips into ~6. Helps
   regardless of pool size; gets cold compute well under 500ms. Requires refactoring
   `computeTeamStatsFromDb` / `getSeasonStandingsUncached` for bulk loading.
3. **Persist the standings cache + invalidate on sync.** Recompute once per stat sync, serve
   from a table (or bump TTL + call `clearStandingsCache` from the sync path). Makes cold
   computes rare instead of every-120s. Pairs with a `syncedAt`/computedAt column (todo #300).

## Acceptance Criteria
- Cold `getSeasonStandings` for OGBA (leagueId 20) under a target (e.g. < 500ms from Railway),
  measured before/after.
- If raising `connection_limit`: confirm no pooler-limit regression under the single Railway instance.
- Standings cache invalidated on stat sync (not TTL-only), if solution 3 is taken.
- `git mv` this todo from pending → complete.

## Evidence (2026-07-03 measurements, read-only vs prod)
- `connection_limit=1`: cold ~3000ms median, warm (cache hit) ~0ms.
- `connection_limit=5`: cold ~1300ms median (best ~800ms).
- Query fan-out: `standingsService.ts:824 getSeasonStandingsUncached` → per-period
  `computeTeamStatsFromDb` (`:403`), ~6 queries each. Discovered during the capacity/load
  stress-test investigation.

## Work Log

### 2026-10-19 — Solutions 1 and 3 done; narrowed to solution 2, downgraded P2 → P3

- **Solution 1 is already live.** Prod `DATABASE_URL` carries `connection_limit=5` (verified via
  `railway variables`, 2026-10-19). Nobody recorded when it changed. Per the measurements above that
  is the ~3000ms → ~1300ms step.
- **Solution 3 shipped (cache invalidated on stats write).** `syncPeriodStats` / `syncDailyStats`
  call `notifyStatsChanged` (`server/src/lib/statsChanged.ts`); `standingsService` subscribes and
  clears. A lib-level signal rather than a direct import because `players → standings` would be a
  new ADR-015 violation. A generation counter stops a compute that was in flight during the clear
  from writing its pre-sync result back. Tests: `standingsCache.test.ts` (both fixes mutation-checked),
  `mlbStatsSyncNotifies.test.ts`, `statsChanged.test.ts`.
- **What is left: solution 2 (batch the per-period fan-out).** Cold computes are now rare (after each
  of ~5 daily syncs, plus the 120s TTL backstop) but each one is still ~1.3s. The "< 500ms" acceptance
  criterion is NOT met and only batching meets it. P3 because the every-120s capacity hit is gone.

### 2026-11-15 — Solution 2 done (batched season compute); closing

- **What changed.** `getSeasonStandingsUncached` no longer calls `computeTeamStatsFromDb` per
  period. `computeTeamStatsForPeriods` loads periods, then teams + rosters + PSP (one query each),
  then IL events + daily stats (one query each): at most 6 queries in 3 sequential stages for any
  number of periods (was ~6 per period + 1; 19 for the local 3-period league, ~43 for OGBA's 7).
  Each period is cut out of the batched rows with the per-period predicates (`overlapsPeriod`,
  `periodId`) and scored by the same pure `routeStatsSource` / `scorePeriod` that
  `computeTeamStatsFromDb` now uses, so the season and single-period views share one code path.
- **Tie-breakers added** (rosters `acquiredAt desc, id desc`; IL events `effDate asc, id asc`; daily
  `gameDate asc`). Before, Postgres returned tied rows in arbitrary order, which could move IP
  float sums by an ulp, pick the first-wins end owner among same-timestamp rows, and order a
  same-day IL_STASH/IL_ACTIVATE pair either way (stint closed vs open forever).
- **Equivalence evidence.** Local DB (leagues 5 and 6, periods 1–3 + pending 8): untouched old code
  vs new, deep-equal and JSON-identical for season and every period, 53/53 checks. Local data is
  thin (24 rosters, no releases, no IL events, no daily rows), so `standingsService.seasonBatch.test.ts`
  adds a WHERE-evaluating fake Prisma with 40 generated seasons (mid-period moves, trades, IL incl.
  same-day stash+activate, PSP-less period, IP in thirds); old code == new code on all 40 was checked
  during the work, batched == per-period is the committed assertion.
- **Timing.** Local DB has ~0 latency, so the win is in round-trips, not local ms: median of 5,
  connection_limit=1, old ~70–80ms vs new ~14–35ms (noisy machine); with 20ms injected per query,
  ~159ms vs ~94ms. The < 500ms-from-Railway target was NOT measured against prod (read-only local
  run only); follow-up: time a cold `getSeasonStandings(20)` against prod after deploy.
