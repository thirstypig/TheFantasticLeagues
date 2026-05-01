---
status: pending
priority: p2
issue_id: "142"
tags: [code-review, data-migration, transactions, deployment]
dependencies: []
---

# `auto_resolve_slots` migration: audit pre-deploy values per league + document rollback SQL

## Problem Statement

`prisma/migrations/20260430000000_pr2_cuts_drop_displayorder_and_auto_resolve_flag/migration.sql:37-39` ran `DELETE FROM "LeagueRule" WHERE category='transactions' AND key='auto_resolve_slots'` against shared prod Supabase. The plan §0 deepening synthesis assumed all leagues either had it on or had no preference, but **no audit log captured each league's pre-migration value before the DELETE.**

Two operational gaps:

1. If any non-OGBA league had `auto_resolve_slots = "false"`, this migration silently flipped them to "auto-resolve always on" (gated only by the global `ENFORCE_ROSTER_RULES` env var). No way to recover the prior preference.
2. There's no documented rollback SQL for re-introducing the column + reseeding the LeagueRule rows if a regression appears.

The deployment-verification-agent produced a Go/No-Go checklist for this stack — capturing it as a runbook is the natural deliverable.

## Findings

- `prisma/migrations/20260430000000_pr2_cuts_drop_displayorder_and_auto_resolve_flag/migration.sql` — destructive `DELETE`
- No `docs/decisions.md` or runbook entry captures the pre-migration state
- The deployment-verification-agent produced the rollback SQL and verification queries (~1,200 words) — captured below

## Proposed Solutions

### Option 1: Audit + runbook in one pass (recommended)

1. Query Supabase for any audit/log table that may have captured the pre-migration row state. If absent, accept it's lost — but document the incident.
2. Add `docs/runbooks/auto_resolve_slots_rollback.md` with the verification SQL and recovery steps from the deployment-verification-agent's output.
3. Add a CLAUDE.md note: "`ENFORCE_ROSTER_RULES=true` triggers unconditional auto-resolve as of 2026-04-30 (PR #180); the per-league `auto_resolve_slots` rule has been retired."
4. Add a Slack message to the OGBA commish channel acknowledging the change in case anyone notices behavior shift.

**Effort:** Small (~1-2h). **Risk:** None — pure documentation + one-time audit.

## Recommended Action

Option 1.

## Technical Details

Verification SQL (run in prod Supabase):

```sql
SELECT column_name FROM information_schema.columns
 WHERE table_name = 'Roster' AND column_name = 'displayOrder';
-- Expected: 0 rows

SELECT COUNT(*) FROM "LeagueRule"
 WHERE category='transactions' AND key='auto_resolve_slots';
-- Expected: 0

SELECT indexname FROM pg_indexes
 WHERE indexname = 'AiInsight_type_leagueId_weekKey_idx';
-- Expected: 1 row
```

Rollback SQL (only if regression):

```sql
ALTER TABLE "Roster" ADD COLUMN "displayOrder" INTEGER;
CREATE INDEX "Roster_teamId_assignedPosition_displayOrder_idx"
  ON "Roster" ("teamId", "assignedPosition", "displayOrder");

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

DELETE FROM "_prisma_migrations"
 WHERE migration_name = '20260430000000_pr2_cuts_drop_displayorder_and_auto_resolve_flag';
```

## Acceptance Criteria

- [ ] `docs/runbooks/auto_resolve_slots_rollback.md` exists with verification + rollback SQL
- [ ] CLAUDE.md updated to clarify the `ENFORCE_ROSTER_RULES` semantics
- [ ] Audit query run; results documented (even if "no leagues affected" or "audit data unavailable")

## Resources

- Migration: `prisma/migrations/20260430000000_pr2_cuts_drop_displayorder_and_auto_resolve_flag/migration.sql`
- deployment-verification-agent output from /ce:review 2026-04-30
- `MEMORY.md` `roster_rules_feature.md` (the OGBA enforcement context)
- Todo #125 (broader migration hygiene runbook — companion)

## Work Log

### 2026-04-30 — Initial Discovery
- data-migration-expert + deployment-verification-agent both flagged during /ce:review re-run.
