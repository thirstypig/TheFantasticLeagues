# Rollback Runbook — `<migration_name>` (PR #<n>, YYYY-MM-DD)

Migration: `prisma/migrations/<timestamp>_<migration_name>/`

> Copy this file to `docs/runbooks/<migration_name>_rollback.md` whenever a
> migration includes a destructive operation (DROP COLUMN, DROP TABLE, DROP
> INDEX, DELETE rows, type narrowing, NOT NULL on existing column, etc).
> Reference it from a comment at the top of the migration SQL.

This runbook covers post-deploy verification and rollback for the migration
that:
1. <one-line summary of destructive op #1>
2. <one-line summary of destructive op #2>

## Pre-flight: confirm current state

```sql
-- Verify the destructive change actually applied
-- (e.g. column dropped, rows deleted, NOT NULL set)
<paste verification queries here>

-- Migration recorded as finished
SELECT migration_name, finished_at FROM "_prisma_migrations"
 WHERE migration_name = '<timestamp>_<migration_name>';
-- Expected: 1 row, finished_at NOT NULL
```

## Rollback decision tree

### Path A: Code-only revert (preferred when feasible)

Use when: the migration is fine, but downstream code that depended on the
new state has a bug.

1. `git revert` the offending PR(s) on `main`
2. Push; Railway auto-deploys
3. The DB change **stays applied** — older code paths must tolerate the new
   schema (this is why two-phase column drops matter; see CLAUDE.md
   "Database → Migrations").
4. Re-run pre-flight queries to confirm DB unchanged.

### Path B: Full migration rollback (only if the schema change itself caused harm)

There is no Prisma "down" migration. To reinstate prior state:

```sql
-- Step 1: undo the schema change
<inverse SQL — recreate dropped columns / re-insert deleted rows / etc>
--
-- For DROP COLUMN: the dropped data is unrecoverable unless you have a
-- pre-migration backup. Document this explicitly.
--
-- For DELETE rows: re-INSERT from a backup or from a deterministic
-- regeneration query. Document the source.

-- Step 2: mark the prisma migration as rolled back
DELETE FROM "_prisma_migrations"
 WHERE migration_name = '<timestamp>_<migration_name>';
```

Then `git revert` the migration's PR on `main` so future
`prisma migrate deploy` runs stay consistent.

**Note:** call out any data that is unrecoverable (column drops with no
backup, deleted rows with no source-of-truth) so an operator knows what
they are accepting.

## Audit gap acknowledgement

<one paragraph: what live state was lost / not captured pre-migration, and
which leagues / users / rows could be affected. If none, say so.>

## Related references

- Migration: `prisma/migrations/<timestamp>_<migration_name>/migration.sql`
- Prior migration that introduced the affected schema: `<...>`
- CLAUDE.md "Database → Migrations" section
- Todo #<n> (this runbook's source)
- Linked feature memory: `<MEMORY.md slug, if applicable>`
