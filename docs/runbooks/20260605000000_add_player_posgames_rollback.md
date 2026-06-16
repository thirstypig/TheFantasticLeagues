# Rollback Runbook — `add_player_posgames` (PR #378, 2026-06-05)

Migration: `prisma/migrations/20260605000000_add_player_posgames/`

This runbook covers rollback for the migration that adds `Player.posGames JSONB`,
a nullable column populated by the daily MLB Stats API cron at 12:00 UTC.

## Pre-flight: confirm current state

```sql
-- Verify the column exists
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'Player' AND column_name = 'posGames';
-- Expected: 1 row, data_type = 'jsonb'

-- Check how many rows have data (helps assess snapshot value)
SELECT COUNT(*) FROM "Player" WHERE "posGames" IS NOT NULL;

-- Migration recorded as finished
SELECT migration_name, finished_at FROM "_prisma_migrations"
 WHERE migration_name = '20260605000000_add_player_posgames';
-- Expected: 1 row, finished_at NOT NULL
```

## Rollback decision tree

### Path A: Code-only revert (preferred — column stays)

Use when: the cron is writing bad data or the column causes unexpected issues,
but you don't need to reclaim storage.

1. Deploy a build that removes the `posGamesChanged` block in
   `server/src/features/players/services/mlbSyncService.ts` (comment out the
   block starting at `const posGamesValue =`).
2. Push; Railway auto-deploys. The column stays in Postgres — no data lost.
3. Optionally null out existing data:
   ```sql
   UPDATE "Player" SET "posGames" = NULL WHERE "posGames" IS NOT NULL;
   ```

### Path B: Full migration rollback (only if the column itself must be removed)

**Important:** Dropping the column permanently destroys all posGames data.
There is no automatic backup — run the snapshot step first.

#### Step 1: Stop cron writes

Do **one** of the following before dropping the column:

**Option 1 — Deploy a code build** (recommended):
Remove or comment out the `posGamesChanged` block in `mlbSyncService.ts`, deploy,
and wait for Railway to confirm the new build is live.

**Option 2 — Disable the cron block** in `server/src/index.ts`:
Comment out the `syncPositionEligibility` cron call, deploy, confirm live.

> ⚠️ There is **NO** `ENABLE_POS_GAMES_SYNC` environment variable. Setting one
> in Railway will have no effect. The cron runs unconditionally until the code changes.

#### Step 2 (Optional but recommended): Snapshot posGames data

```sql
COPY (
  SELECT id, "posGames"
  FROM "Player"
  WHERE "posGames" IS NOT NULL
) TO STDOUT CSV HEADER;
```

Save output to `posGames_snapshot_<date>.csv` before proceeding.

#### Step 3: Drop the column

```sql
ALTER TABLE "Player" DROP COLUMN IF EXISTS "posGames";
```

#### Step 4: Remove the migration record

```sql
DELETE FROM "_prisma_migrations"
 WHERE migration_name = '20260605000000_add_player_posgames';
```

Then `git revert` the migration's PR (#378) on `main` so future
`prisma migrate deploy` runs stay consistent.

#### Step 5: Post-rollback verification

```sql
-- Column should no longer exist
SELECT column_name FROM information_schema.columns
WHERE table_name = 'Player' AND column_name = 'posGames';
-- Expected: 0 rows

-- Migration record should be gone
SELECT * FROM "_prisma_migrations"
 WHERE migration_name = '20260605000000_add_player_posgames';
-- Expected: 0 rows
```

## Audit gap acknowledgement

`Player.posGames` is populated by the daily 12:00 UTC cron. Any data written
between the last cron run and the rollback is lost if the column is dropped
without a snapshot. No user-facing transactions depend on this column —
it is a read-only enrichment field used for position eligibility display.
Leagues and fantasy standings are not affected by a rollback.

## Related references

- Migration: `prisma/migrations/20260605000000_add_player_posgames/migration.sql`
- cron write path: `server/src/features/players/services/mlbSyncService.ts` — `syncPositionEligibility()`
- CLAUDE.md "Database → Migrations" section
- Todo #276 (this runbook's source)
