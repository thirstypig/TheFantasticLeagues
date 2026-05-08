---
status: pending
priority: p2
issue_id: "167"
tags: [code-review, wire-list, security, rate-limit]
dependencies: []
---

# Wire List: no per-user rate limit on add/reorder/drop mutation endpoints

## Problem Statement

The wire-list owner mutation endpoints (POST /adds, POST /drops, PATCH /adds/:id, PATCH /drops/:id, DELETE) are protected only by the global 300/min IP rate limit. An authenticated owner could submit ~300 adds/min, each triggering ~5 DB queries (player lookup, FA check, acquired check, priority aggregate, insert). That's a sustained ~25 qps from a single user — enough to elevate p99 latency for the rest of the league during peak claim windows.

## Findings

- `server/src/features/wire-list/routes.ts` — no `rateLimitPerUser` middleware applied to any of the mutation routes.
- `server/src/middleware/rateLimitPerUser.ts` exists and is the standard pattern used elsewhere.
- Per-add server work: FA assertion (`assertPlayerIsFA`), acquired-this-period check, priority aggregation, then insert. Each ~5 queries.

## Proposed Solutions

### Option 1: Apply existing `rateLimitPerUser` middleware (recommended)
Apply `rateLimitPerUser({ capacity: 30, refillPerMin: 30 })` to:
- `POST /api/wire-list/.../adds`
- `POST /api/wire-list/.../drops`
- `PATCH /api/wire-list/.../adds/:id`
- `PATCH /api/wire-list/.../drops/:id`
- `DELETE` equivalents

Caps a determined user at 30 mutations/min — well above any legitimate UI-driven flow (the picker takes seconds per action) and well below the cost ceiling.

**Effort:** Trivial (~30min). **Risk:** Low — rate-limit ceiling is generous.

### Option 2: Token bucket scoped to (userId, periodId)
Tighter — prevents one user from monopolizing one period's queue. Marginal benefit for typical league sizes.

**Effort:** Small. **Risk:** Low.

### Option 3: Defer; rely on global IP limit
Status quo. Insufficient for authenticated abuse.

## Recommended Action

**Option 1** with capacity 30/min. Standard pattern, immediate protection.

## Technical Details

- File: `server/src/features/wire-list/routes.ts`
- Middleware: `server/src/middleware/rateLimitPerUser.ts`
- Apply after `requireAuth`, before validation
- No schema changes

## Acceptance Criteria

- [ ] All wire-list mutation routes have `rateLimitPerUser` applied
- [ ] 31st mutation in a 60s window returns 429 with `Retry-After`
- [ ] Reorder (PATCH) uses same bucket as create
- [ ] Tests assert 429 after capacity exceeded

## Work Log

_(empty — created during /ce:review on 2026-05-07)_

## Resources

- `server/src/middleware/rateLimitPerUser.ts`
- `server/src/features/wire-list/routes.ts`
- Past PRs: https://github.com/thirstypig/TheFantasticLeagues/pulls?q=wire-list+is%3Amerged
