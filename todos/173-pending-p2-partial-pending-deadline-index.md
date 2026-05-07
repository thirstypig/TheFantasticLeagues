---
status: pending
priority: p2
issue_id: "173"
tags: [code-review, wire-list, performance, prisma]
dependencies: []
---

# Wire List: missing partial-on-PENDING composite index for auto-lock cron predicate

## Problem Statement

The auto-lock cron query is `WHERE status='PENDING' AND deadlineAt <= NOW()`, scanning the entire `WaiverPeriod` table every 5 minutes. Existing indexes are `(leagueId)`, `(status)`, `(leagueId, deadlineAt)` — none match this predicate well. Once historical PROCESSED periods accumulate (~500+ rows), the planner may abandon the low-cardinality `(status)` btree and seq-scan instead. A partial index on `WHERE status='PENDING'` is exactly the right primitive: it auto-vacuums to near-zero rows as periods transition out of PENDING, so the index stays tiny.

## Findings

- Auto-lock cron query: `WHERE status='PENDING' AND deadlineAt <= NOW()` (every 5 min)
- Existing indexes on `WaiverPeriod`: `(leagueId)`, `(status)`, `(leagueId, deadlineAt)`
- No leagueId predicate in the cron query → falls back to `(status)` btree which is low-cardinality
- Today the table is small enough that planner choice is cheap; this is preventive

## Proposed Solutions

### Option 1: Partial index on PENDING + deadlineAt (recommended)

```sql
CREATE INDEX "WaiverPeriod_pending_deadline_idx"
  ON "WaiverPeriod"("deadlineAt")
  WHERE "status" = 'PENDING';
```

Rows leave the index automatically as their status flips. Index stays at ~12 entries (one per active league period).

**Effort:** Trivial (one migration file). **Risk:** Low.

**Critical:** per project memory `feedback_prisma_migrate_concurrently.md` and `CLAUDE.md` policy — **do NOT use `CONCURRENTLY`**. Prisma wraps migrations in a transaction; `CREATE INDEX CONCURRENTLY` aborts with PG 25001 and freezes future deploys with P3009. Plain `CREATE INDEX IF NOT EXISTS` is correct here — table size is well under 1M rows.

### Option 2: Two-step out-of-band CONCURRENTLY pattern
Documented in `docs/solutions/deployment/railway-prisma-concurrent-index-p3009-block.md`. Overkill for this table size.

**Effort:** Higher. **Risk:** Higher.

### Option 3: Defer
Re-evaluate when WaiverPeriod row count exceeds ~10k.

## Recommended Action

**Option 1.** New migration directory `prisma/migrations/<unique-timestamp>_wire_list_pending_deadline_partial_idx/`.

## Technical Details

- New migration: `prisma/migrations/<unique-timestamp>_wire_list_pending_deadline_partial_idx/migration.sql`
- SQL: `CREATE INDEX IF NOT EXISTS "WaiverPeriod_pending_deadline_idx" ON "WaiverPeriod"("deadlineAt") WHERE "status" = 'PENDING';`
- Update `prisma/schema.prisma` — Prisma supports partial indexes via `@@index([deadlineAt], where: ...)` only in some preview features; if not supported, mark schema with comment and rely on raw SQL migration.
- Per CLAUDE.md: unique timestamp required (no collisions with same-day migrations)
- Per CLAUDE.md: use `IF NOT EXISTS` for idempotency
- No rollback runbook needed (additive, non-destructive)

## Acceptance Criteria

- [ ] New migration applies cleanly on Railway (no P3009)
- [ ] `EXPLAIN` on the cron query shows the partial index used
- [ ] CI grep for `CONCURRENTLY` passes (no occurrence)
- [ ] Migration timestamp is unique vs. all sibling migrations

## Work Log

_(empty — created during /ce:review on 2026-05-07)_

## Resources

- Project memory: `feedback_prisma_migrate_concurrently.md`
- `docs/solutions/deployment/railway-prisma-concurrent-index-p3009-block.md`
- File: `server/src/index.ts:361-384` (cron query)
- `prisma/schema.prisma` (WaiverPeriod model)
