---
status: pending
priority: p2
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
