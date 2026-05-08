---
status: pending
priority: p1
issue_id: "134"
tags: [code-review, performance, standings, side-effects-on-get]
dependencies: []
---

# `GET /period-category-standings` runs N upserts inside a $transaction on every request

## Problem Statement

`server/src/features/standings/routes.ts:185-191` — the route handler for the period category standings GET endpoint runs `prisma.$transaction(teamStats.map(... upsert ...))` to persist current snapshots. For OGBA's 8 teams that's 8 upserts inside a transaction on every standings page load.

Two problems:

1. **GETs should not write.** Side effects on read break HTTP caching semantics and make the endpoint hard to reason about.
2. **Connection pool pressure.** Production runs `connection_limit=1` against Supabase. The 8-statement transaction holds the only connection for the duration of all 8 round trips. Every concurrent standings page view serializes.

## Findings

- `server/src/features/standings/routes.ts:185-191` — the upsert cluster
- Daily `syncAllActivePeriods` at 13:00 UTC already persists stats; this in-request snapshot is redundant
- Behavior was not introduced by this stack but is adjacent to PR #176's correctness fix and the v3 hub now drives more standings traffic

## Proposed Solutions

### Option 1: Move snapshot persistence to the daily cron (recommended)

The snapshots produced here can be derived from data the cron already writes. Drop the in-request upserts; ensure the cron covers the relevant `TeamStatsPeriod` rows.

**Effort:** Small (~1-2h, depending on cron coverage audit). **Risk:** Low — verify the cron writes the same rows.

### Option 2: Fire-and-forget background job

Keep the same writes but emit an async job after the response is sent. Pattern matches existing fire-and-forget AI analysis.

**Effort:** Small. **Risk:** Low.

### Option 3: Make the GET pure; add a separate `POST /standings/snapshot` admin endpoint

Decouple concerns; admins can force-snapshot on demand.

**Effort:** Medium. **Risk:** Low.

## Recommended Action

Option 1, after confirming the daily cron persists what's needed. Falls back to Option 2 if there's a real-time freshness requirement.

## Technical Details

- `server/src/features/standings/routes.ts:185-191`
- `server/src/features/seasons/services/seasonService` — verify cron coverage
- Production constraint: `connection_limit=1` per `supabase_railway_connection_setup.md`

## Acceptance Criteria

- [ ] GET endpoint contains no writes
- [ ] Standings page load latency improves (measure before/after)
- [ ] No regression in displayed snapshot freshness
- [ ] Test added: route handler does not call `$transaction` on the read path

## Resources

- Performance review under /ce:review 2026-04-30
- `MEMORY.md` `supabase_railway_connection_setup.md`

## Work Log

### 2026-04-30 — Initial Discovery
- performance-oracle flagged during /ce:review re-run.
