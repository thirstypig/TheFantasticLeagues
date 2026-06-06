---
status: complete
priority: p2
issue_id: 265
tags: [code-review, migration, database, posGames]
dependencies: []
---

## Problem Statement

The migration `20260605000000_add_player_posgames/migration.sql` uses `ALTER TABLE "Player" ADD COLUMN "posGames" JSONB` without an `IF NOT EXISTS` guard. The project's own prior migration `20260430120000_player_mlb_status/migration.sql` used `ADD COLUMN IF NOT EXISTS` for the `mlbStatus` column — this migration deviates from that established convention. Without the guard, any operator who manually marks the migration as rolled-back and reruns `prisma migrate deploy` will get a Postgres error "column already exists" rather than a safe no-op.

## Findings

Current migration SQL:
```sql
-- AddColumn: Player.posGames
-- Rollback: ALTER TABLE "Player" DROP COLUMN "posGames";
ALTER TABLE "Player" ADD COLUMN "posGames" JSONB;
```

Precedent in `prisma/migrations/20260430120000_player_mlb_status/migration.sql`:
```sql
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "mlbStatus" TEXT;
```

The data migration reviewer also flagged the rollback comment as incomplete: once the `syncPositionEligibility` cron has run and populated `posGames` data, `DROP COLUMN` permanently destroys that data with no documented recovery path.

## Proposed Solutions

### Option A — Add IF NOT EXISTS + document rollback steps (Recommended)
```sql
-- AddColumn: Player.posGames
-- Rollback steps:
--   1. Set env flag to stop cron writes: ENABLE_POS_GAMES_SYNC=false
--   2. Optional: snapshot data: COPY (SELECT id, "posGames" FROM "Player" WHERE "posGames" IS NOT NULL) TO STDOUT CSV
--   3. Drop column: ALTER TABLE "Player" DROP COLUMN IF EXISTS "posGames";
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "posGames" JSONB;
```
**Pros:** Idempotent; matches project convention; complete rollback documentation. **Effort:** Trivial. **Risk:** None.

## Recommended Action

Option A. Two-line change. Match the established `IF NOT EXISTS` convention and add rollback documentation.

## Technical Details

- **File:** `prisma/migrations/20260605000000_add_player_posgames/migration.sql`
- Project constraint: DO NOT use `CREATE INDEX CONCURRENTLY` in Prisma migrations (PG 25001 error in transactions)
- Note: `ADD COLUMN IF NOT EXISTS` is NOT using CONCURRENTLY — it is safe in transactions

## Acceptance Criteria

- [ ] Migration uses `ADD COLUMN IF NOT EXISTS`
- [ ] Rollback steps documented in migration header comment
- [ ] Migration remains idempotent if applied twice

## Work Log

### 2026-06-05 — Surfaced by data-integrity-guardian during session review
