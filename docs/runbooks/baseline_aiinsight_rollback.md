# Rollback Runbook — `baseline_aiinsight_table` migration (todo #125, 2026-05-07)

Migration: `prisma/migrations/20260330000000_baseline_aiinsight_table/`

Adds the missing `CREATE TABLE "AiInsight"` to the migrations history so a
fresh DB can run `prisma migrate deploy` end-to-end. **Idempotent against
prod** — every statement is guarded with `IF NOT EXISTS` (table, indexes,
unique key) or wrapped in a `pg_constraint` existence check (FKs).

## Why a rollback is rarely needed

This migration adds **no new schema in prod**. The `AiInsight` table, its
4-col unique key, its `(leagueId)`, `(teamId)`, and `(leagueId, type)`
indexes, and both FKs already exist via the original `prisma db push`. The
only effect against the live Supabase DB is recording a new row in
`_prisma_migrations`. Effective change set on prod: zero schema, one
metadata row.

## Pre-flight: confirm post-migration state

```sql
-- Table exists
SELECT to_regclass('"AiInsight"');
-- Expected: AiInsight (not NULL)

-- 4-col unique still in place
SELECT indexname FROM pg_indexes
 WHERE tablename = 'AiInsight'
   AND indexname = 'AiInsight_type_leagueId_teamId_weekKey_key';
-- Expected: 1 row

-- Both FKs still in place
SELECT conname FROM pg_constraint
 WHERE conrelid = '"AiInsight"'::regclass
   AND contype = 'f'
 ORDER BY conname;
-- Expected: AiInsight_leagueId_fkey, AiInsight_teamId_fkey

-- Migration recorded
SELECT migration_name, finished_at FROM "_prisma_migrations"
 WHERE migration_name = '20260330000000_baseline_aiinsight_table';
-- Expected: 1 row, finished_at NOT NULL
```

## Rollback decision tree

### Path A: Mark migration unapplied (preferred — no schema change)

Use when: the migration recorded but downstream code expects it to NOT be
in the history. This is the only realistic rollback case for a baseline.

```sql
DELETE FROM "_prisma_migrations"
 WHERE migration_name = '20260330000000_baseline_aiinsight_table';
```

Then `git revert` the PR that added the migration. Do NOT drop the table
— it predates this migration in prod and contains live AI history.

### Path B: Full table drop (FRESH DB ONLY — never run in prod)

Use when: rolling back a fresh-spin-up dev environment that has no AI
history yet. **Never on prod.** The `CASCADE` would orphan FKs from any
table that references AiInsight.

```sql
DROP TABLE IF EXISTS "AiInsight" CASCADE;
DELETE FROM "_prisma_migrations"
 WHERE migration_name = '20260330000000_baseline_aiinsight_table';
```

## Audit gap acknowledgement

This migration was hand-written from `prisma/schema.prisma` (commit at the
time of authorship) and the existing prod table introspected via Supabase.
If schema.prisma drifted between draft and merge, the baseline could
under- or over-specify a column that exists in prod. Verify by running
`pg_dump --schema-only -t AiInsight` against prod and diffing against the
migration SQL before merging the PR.

## Related references

- Migration: `prisma/migrations/20260330000000_baseline_aiinsight_table/migration.sql`
- Dependent migrations that assumed the table existed:
  - `prisma/migrations/20260430000000_aiinsight_3col_index/migration.sql`
  - `prisma/migrations/20260504000000_ai_history_indexes/migration.sql`
- Schema source of truth: `prisma/schema.prisma` (`model AiInsight`)
- CLAUDE.md "Database → Migrations" section
- Todo #125 (this runbook's source — Migration hardening / baseline / 2-phase column drop convention)
