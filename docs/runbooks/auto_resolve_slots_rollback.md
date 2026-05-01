# Rollback Runbook — `auto_resolve_slots` migration (PR #180, 2026-04-30)

Migration: `prisma/migrations/20260430000000_pr2_cuts_drop_displayorder_and_auto_resolve_flag/`

This runbook covers post-deploy verification and rollback for the migration that:
1. Dropped the `Roster.displayOrder` column + supporting index
2. Deleted all `LeagueRule(transactions.auto_resolve_slots)` rows
3. Made auto-resolve unconditional (gated only by `ENFORCE_ROSTER_RULES` env var)

## Pre-flight: confirm current state

```sql
-- Column should be gone
SELECT column_name FROM information_schema.columns
 WHERE table_name = 'Roster' AND column_name = 'displayOrder';
-- Expected: 0 rows

-- LeagueRule entries should be gone
SELECT COUNT(*) FROM "LeagueRule"
 WHERE category = 'transactions' AND key = 'auto_resolve_slots';
-- Expected: 0

-- Migration should be applied
SELECT migration_name, finished_at FROM "_prisma_migrations"
 WHERE migration_name = '20260430000000_pr2_cuts_drop_displayorder_and_auto_resolve_flag';
-- Expected: 1 row, finished_at NOT NULL
```

## Rollback decision tree

### Path A: Code-only revert (preferred, almost always sufficient)

Use when: the migration itself is fine, but downstream code that depended on unconditional auto-resolve has a bug.

1. `git revert` the offending PR(s) (#180–#185 in reverse order as needed) on `main`
2. Push; Railway auto-deploys
3. The dropped `Roster.displayOrder` column **stays dropped** — the older code never read it, so reverting code is safe without DB action
4. Re-run pre-flight queries to confirm DB unchanged

### Path B: Full migration rollback (only if column drop itself caused harm)

Use when: extremely unlikely scenario where the absence of `displayOrder` or `auto_resolve_slots` actually breaks something we missed.

There is no Prisma "down" migration. To reinstate state:

```sql
-- Step 1: re-add the column (NULL for all rows — original semantics)
ALTER TABLE "Roster" ADD COLUMN "displayOrder" INTEGER;
CREATE INDEX "Roster_teamId_assignedPosition_displayOrder_idx"
  ON "Roster" ("teamId", "assignedPosition", "displayOrder");

-- Step 2: re-seed LeagueRule rows (matches PR1 migration semantics)
INSERT INTO "LeagueRule" ("leagueId","category","key","value","label","isLocked","createdAt","updatedAt")
SELECT l.id, 'transactions', 'auto_resolve_slots',
       CASE WHEN l.id = 20 THEN 'true' ELSE 'false' END,
       'Auto-resolve slot conflicts on add/drop (Yahoo-style)',
       false, NOW(), NOW()
FROM "League" l
WHERE NOT EXISTS (
  SELECT 1 FROM "LeagueRule" r
  WHERE r."leagueId" = l.id AND r.category='transactions' AND r.key='auto_resolve_slots'
);

-- Step 3: mark the prisma migration as rolled back
DELETE FROM "_prisma_migrations"
 WHERE migration_name = '20260430000000_pr2_cuts_drop_displayorder_and_auto_resolve_flag';
```

Then `git revert` PR #180 on `main` so future `prisma migrate deploy` runs stay consistent.

**Note:** `displayOrder` values are unrecoverable — column had no live writes pre-drop, so it's restored as all-NULL (matches its original behavior).

## Audit gap acknowledgement

The migration ran against shared prod Supabase with no audit log capturing each league's pre-migration `auto_resolve_slots` value. If a non-OGBA league had set the flag to `false`, that preference is lost — they're now on unconditional auto-resolve (gated by `ENFORCE_ROSTER_RULES`).

OGBA was the only validated league at the time of this migration. Other leagues using the platform should be notified if they notice behavior changes.

## Related references

- Migration: `prisma/migrations/20260430000000_pr2_cuts_drop_displayorder_and_auto_resolve_flag/migration.sql`
- Prior migration that introduced the flag: `prisma/migrations/20260429000000_yahoo_auto_resolve_pr1/migration.sql`
- CLAUDE.md "Migrations" section
- Todo #142 (this runbook's source)
- `MEMORY.md` `roster_rules_feature.md` (OGBA enforcement context)
