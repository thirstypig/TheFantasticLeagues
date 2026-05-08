---
status: pending
priority: p1
issue_id: "135"
tags: [code-review, security, dos, input-validation, transactions, players]
dependencies: []
---

# DoS hardening: rate-cap eligible-slots/awards, bound transaction pagination, tighten mlbId regex

## Problem Statement

Three input-validation / DoS gaps surfaced in security review on the merged stack. None are confidentiality leaks; all are amplifiers under the `connection_limit=1` Supabase constraint:

1. **`GET /api/players/:mlbId/eligible-slots` and `GET /api/leagues/:leagueId/awards` have no per-user rate cap** beyond the global 300/min limiter. Both are designed to be hot-path (the v3 hub will eventually call eligible-slots per-row; awards is uncached). An authenticated user can saturate the only DB connection.
2. **`/api/transactions` GET trusts `take` and `skip` query params unbounded** (`server/src/features/transactions/routes.ts:94-118`). `?take=10000000` forces a 10M-row `findMany` attempt before Postgres aborts.
3. **`mlbId` accepted as `z.union([z.number(), z.string()]).optional()` without regex narrowing** (`transactions/routes.ts:83, 503`). `Number("1.5e10")` parses to `15000000000`; `Number("1e308")` to `Infinity`. Coercion before transaction starts can throw raw 500s.

## Findings

- `server/src/features/players/routes.ts:222-272` — eligible-slots, no per-user cap
- `server/src/features/mlb-feed/awardsRoutes.ts:26-61` — awards, no per-user cap or cache (cache is #119)
- `server/src/features/transactions/routes.ts:94-118` — `Number(req.query.take) || 50`, no upper bound
- `server/src/features/transactions/routes.ts:83, 503` — mlbId union schema without regex
- `connection_limit=1` per `supabase_railway_connection_setup.md` makes any unbounded query expensive

## Proposed Solutions

### Option 1: Targeted hardening (recommended)

Three small mechanical fixes:

1. Add a per-user rate-limit helper (e.g. token bucket keyed by `userId`) and apply 60/min on `/api/players/:mlbId/eligible-slots`, 30/min on `/api/leagues/:leagueId/awards`. (Awards getting a cache via #119 also helps.)
2. `transactions/routes.ts:94-118`: `const take = Math.min(Math.max(Number(req.query.take) || 50, 1), 200);` and bound `skip` similarly. Mirror `admin/audit-log` precedent.
3. Tighten the `mlbId` schema:
   ```ts
   z.union([
     z.number().int().positive().max(9_999_999),
     z.string().regex(/^\d+$/).transform(Number),
   ])
   ```

**Effort:** Small (~2h). **Risk:** Low.

### Option 2: Add a request-scoped rate-limit middleware factory and apply broadly

Larger investment but covers future endpoints.

**Effort:** Medium (~half day). **Risk:** Low.

## Recommended Action

Option 1. Get the three fixes in. Defer Option 2 to a separate "rate-limit middleware" effort if the per-endpoint sprinkles get tedious.

## Technical Details

- `server/src/features/players/routes.ts:222-272`
- `server/src/features/mlb-feed/awardsRoutes.ts:26-61`
- `server/src/features/transactions/routes.ts:83, 94-118, 503`
- New: tiny `server/src/middleware/rateLimitPerUser.ts` helper

## Acceptance Criteria

- [ ] Per-user rate cap on eligible-slots and awards
- [ ] `take`/`skip` bounded on `/api/transactions` GET
- [ ] `mlbId` schema rejects `1.5e10`/`Infinity`/`NaN`
- [ ] Tests for each: 429 returned past cap, 400 returned for over-limit `take`, 400 returned for malformed `mlbId`
- [ ] No regression on happy-path

## Resources

- Security review under /ce:review 2026-04-30
- `MEMORY.md` `supabase_railway_connection_setup.md`
- Todo #119 (awards caching — complementary)

## Work Log

### 2026-04-30 — Initial Discovery
- security-sentinel + performance-oracle both flagged during /ce:review re-run.
