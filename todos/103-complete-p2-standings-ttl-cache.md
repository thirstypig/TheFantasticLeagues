---
status: complete
priority: p2
issue_id: "103"
tags: [code-review, performance, security, standings, caching]
dependencies: []
---

# Add in-memory TTL cache for getSeasonStandings

## Problem Statement

`getSeasonStandings(leagueId)` fires 30+ DB queries per invocation (1 for periods, then per period: 3-5 for rosters/stats/coverage). Three separate endpoints call it:

1. `GET /api/standings/season` (authenticated)
2. `GET /api/reports/:leagueId` (authenticated)
3. `GET /api/public/leagues/:slug/standings` (unauthenticated!)

Stats only change on cron syncs (12:00 + 13:00 UTC daily) and manual admin syncs. Every other call returns identical results. The public endpoint is especially concerning — no auth barrier means crawlers/bots can hammer this computation.

## Findings

### Agent: performance-oracle
- OPT-1: No caching on standings computation. ~30 queries x 10-30ms = 300-900ms per call. A 2-minute TTL cache would serve all concurrent viewers at near-zero cost.
- OPT-2: Public standings has no rate limiting or caching. Bots could cause resource exhaustion.

### Agent: security-sentinel
- L4: No per-endpoint rate limiting on public endpoints. Global 300/min limit is too generous for computation-heavy unauthenticated endpoints.

## Proposed Solutions

### Solution 1: In-memory TTL cache on getSeasonStandings (recommended)
```typescript
const standingsCache = new Map<number, { data: SeasonStandingsResult; expiry: number }>();
const CACHE_TTL = 120_000; // 2 minutes

export async function getSeasonStandings(leagueId: number) {
  const cached = standingsCache.get(leagueId);
  if (cached && cached.expiry > Date.now()) return cached.data;
  const result = await computeSeasonStandings(leagueId);
  standingsCache.set(leagueId, { data: result, expiry: Date.now() + CACHE_TTL });
  return result;
}
```

- **Pros**: Eliminates ~98% of redundant DB queries. Simple, no dependencies. Auto-expires.
- **Cons**: Stale data for up to 2 minutes after a sync. Cache per-process (not shared across workers).
- **Effort**: Small (~15 min)
- **Risk**: Low — read-only cache, worst case is 2-minute staleness.

### Solution 2: Cache-Control response header on public endpoint
Add `res.set("Cache-Control", "public, max-age=120")` to the public standings response. Let Cloudflare/CDN cache.

- **Pros**: Zero server-side complexity. CDN handles caching.
- **Cons**: Only helps the public endpoint; authenticated endpoints still recompute. Requires Cloudflare config verification.
- **Effort**: Trivial (~5 min)
- **Risk**: Low

### Solution 3: Both (recommended as combined approach)
Server-side TTL cache (Solution 1) + CDN cache header (Solution 2).

- **Effort**: Small (~20 min)
- **Risk**: Low

## Recommended Action

Solution 3.

## Acceptance Criteria

- [ ] `getSeasonStandings` checks in-memory cache before computing
- [ ] Cache TTL is 2 minutes
- [ ] Public standings endpoint returns `Cache-Control: public, max-age=120`
- [ ] Cache is invalidated when admin triggers manual sync (optional, nice-to-have)
- [ ] Repeated calls within TTL return cached result (verify with log/timestamp)

## Work Log

- **2026-04-16** (Session 67 `/ce:review`): Flagged by performance-oracle (OPT-1/OPT-2) and security-sentinel (L4).

## Resources

- `server/src/features/standings/services/standingsService.ts:600-647` (getSeasonStandings)
- `server/src/routes/public.ts:51-88` (public endpoint)
- `server/src/features/reports/services/reportBuilder.ts:129` (report consumer)
