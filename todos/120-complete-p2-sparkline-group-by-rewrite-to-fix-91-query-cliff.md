---
status: pending
priority: p2
issue_id: "120"
tags: [code-review, performance, dashboard, prisma]
dependencies: []
---

# Replace per-week sparkline `count()` loop with `GROUP BY date_trunc` (the deferred Solution 1)

## Problem Statement

PR #179 collapsed 91 sequential `weeklySparkline()` queries into one `Promise.all` block. Real wall-clock improvement is ~30-50%, NOT the implied 7×, because `DATABASE_URL` uses Supabase pooler with `connection_limit=1` (per `MEMORY.md` `supabase_railway_connection_setup.md`). Prisma serializes all queries through one TCP connection. `Promise.all` queues them at the pool layer.

For a 90-day window: 7 series × 13 weeks = 91 `count()` queries × ~50ms RTT ≈ **4.5s**. At the 30-week cap (full season view): 210 queries ≈ **10s**.

The TODO comment at `dashboardService.ts:205` already names the right fix: "replace per-week COUNT loop with a single `GROUP BY date_trunc`". One raw query per series → 7 total queries instead of 91 → ~350ms wall-clock.

This is a real scaling cliff — at 50 leagues × 8 admins × 5-min cache miss windows, every dashboard cold load blocks all other write traffic on the single pooler connection for ~5s.

## Findings

- `server/src/features/admin/services/dashboardService.ts:207-228, 410-466` — sparkline path
- `server/src/features/admin/services/dashboardService.ts:205` — existing TODO marker
- Per `MEMORY.md`, `connection_limit=1` is mandatory on Supabase free tier (IPv6-only direct conn forces pooler use)
- `Promise.all` win is real but bounded — pipelining + planner reuse only

## Proposed Solutions

### Option 1: Single `GROUP BY date_trunc` per series (recommended)

**Approach:** Replace `Array.from({length: weeks}, async (_, i) => prisma.user.count({...weekRange}))` with a single `$queryRaw`:
```ts
prisma.$queryRaw<{ week_start: Date; n: bigint }[]>`
  SELECT date_trunc('week', "createdAt") AS week_start, COUNT(*)::bigint AS n
  FROM "User"
  WHERE "createdAt" >= ${from}
  GROUP BY 1
  ORDER BY 1
`;
```
Then bucket-fill missing weeks in JS. 7 series × 1 query each = 7 queries.

**Pros:**
- ~10-20× wall-clock improvement (4.5s → ~350ms)
- Frees the single pooler connection for other concurrent traffic
- Aligns with the deferred-solution comment already in code

**Cons:**
- Each series is now hand-rolled SQL (loses Prisma where-clause types)
- 7 similar but distinct raw queries to maintain (one per model)

**Effort:** Medium (~1 day for all 7 series + tests)

**Risk:** Low — `$queryRaw` with parameterized inputs; no SQL injection vector

### Option 2: Materialize a `WeeklyMetrics` table; cron-populate

**Approach:** Daily cron computes per-week per-metric counts and stores them. Sparkline endpoint reads from the table. Eliminates compute on read entirely.

**Pros:**
- Lowest read latency
- Decouples dashboard from primary tables

**Cons:**
- Schema change + cron + invalidation logic
- Real-time data lags by up to 24h

**Effort:** Large (~2 days)

**Risk:** Medium

## Recommended Action

Option 1. The `GROUP BY` rewrite is the path the original author already named.

## Technical Details

**Affected files:**
- `server/src/features/admin/services/dashboardService.ts:410-466` — `weeklySparkline`, `weeklyActiveUsersSparkline`
- 7 raw queries (one per `SparklineModel`) — keep them in a `sparklineQueries.ts` sibling for clarity

**No schema changes for Option 1.**

## Acceptance Criteria

- [ ] Each sparkline series is 1 DB query, not N
- [ ] Cold dashboard load <1s for 30-week window (was ~10s)
- [ ] Bucket-fill correctly handles weeks with 0 events
- [ ] Existing dashboard tests pass

## Resources

- **Source:** Performance-oracle P1 #1 + P2 #2
- **Existing TODO:** `dashboardService.ts:205`
- **Memory:** `supabase_railway_connection_setup.md` — explains why parallelization is bounded

## Work Log

### 2026-04-30 — Initial Discovery
- **By:** /ce:review performance-oracle agent
- **Learnings:** PR #179's `Promise.all` win is real but smaller than the PR description claimed because `connection_limit=1` serializes all Prisma queries. The `GROUP BY` rewrite was correctly deferred but is still the right fix.
