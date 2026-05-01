---
status: pending
priority: p3
issue_id: "125"
tags: [code-review, db, migrations, hardening]
dependencies: []
---

# Migration hardening — AiInsight baseline + #180 rollback doc + 2-phase column-drop convention

## Problem Statement

Three coupled migration-discipline gaps surfaced in review:

**1. AiInsight has no committed CREATE TABLE migration.** The table and its 4-col `@@unique([type, leagueId, teamId, weekKey])` exist via `prisma db push` against shared Supabase, not via the migrations dir. PR #176's `CREATE INDEX` works in prod (table exists) but `prisma migrate deploy` against a fresh DB will fail with "relation does not exist." Anyone trying to reproduce locally hits this.

**2. PR #180 has no documented rollback for the LeagueRule row deletion.** `DELETE FROM LeagueRule WHERE category='transactions' AND key='auto_resolve_slots'` is irreversible without backup. Supabase free-tier point-in-time recovery may or may not cover the window.

**3. Column-drop coupled with code-removal in same PR creates deploy-overlap risk.** PR #180 dropped `Roster.displayOrder` AND removed every reader in one PR. During Railway's blue-green deploy overlap (~10-30s), the OLD container's PR #1-built Prisma client still includes `displayOrder` in default selects → `ALTER TABLE DROP COLUMN` already ran → Roster reads from old container 500. Practically harmless this time (Roster wasn't accessed via Prisma during that exact window in prod) but the convention is a foot-gun.

## Findings

- `prisma/migrations/` — no `*_aiinsight_*` directory predating today's PR #176
- `prisma/migrations/20260430000000_pr2_cuts_drop_displayorder_and_auto_resolve_flag/migration.sql` — irreversible deletes, no ROLLBACK.md sibling
- `MEMORY.md` `deploy_host.md` — Railway runs `prisma migrate deploy` on boot
- Migration timestamps colliding (both PR #176 and #180 use `20260430000000`) — works today (different tables, alphabetic suffix sort) but a third same-day migration could expose ordering ambiguity

## Proposed Solutions

### Option 1: Three-piece hardening PR (recommended)

**Approach:**
1. **Baseline migration:** Add `prisma/migrations/20260330000000_baseline_aiinsight_table/migration.sql` that does `CREATE TABLE IF NOT EXISTS "AiInsight" (...)` with the full pre-existing shape + `CREATE UNIQUE INDEX IF NOT EXISTS "AiInsight_type_leagueId_teamId_weekKey_key" ...`. `IF NOT EXISTS` guards mean prod no-ops (table already exists). Use a date BEFORE today's migrations so it sorts first.
2. **ROLLBACK doc:** Add `prisma/migrations/20260430000000_pr2_cuts_drop_displayorder_and_auto_resolve_flag/ROLLBACK.md` with the inverse SQL to recreate `LeagueRule(transactions.auto_resolve_slots)` rows for OGBA + any other affected leagues. Cross-link from migration.sql comment.
3. **CLAUDE.md convention update:** Add a 1-paragraph note to "Database" section: *"Two-phase migrations for column drops where code paths are also removed: ship dead-code-removal first, run column-drop migration second (next deploy). Same-day migrations must use distinct timestamps to make ordering self-documenting."*

**Pros:**
- Closes 3 gaps in ~1 hour
- Makes migration discipline visible in repo
- Future fresh-DB spinups work

**Cons:**
- Baseline migration adds 1 file with 80+ lines of CREATE TABLE SQL

**Effort:** Small-Medium (~1 hour)

**Risk:** Low — `IF NOT EXISTS` is idempotent

## Recommended Action

Option 1.

## Technical Details

**Affected files:**
- `prisma/migrations/20260330000000_baseline_aiinsight_table/migration.sql` (new)
- `prisma/migrations/20260430000000_pr2_cuts_drop_displayorder_and_auto_resolve_flag/ROLLBACK.md` (new)
- `prisma/migrations/20260430000000_pr2_cuts_drop_displayorder_and_auto_resolve_flag/migration.sql` (add comment pointing to ROLLBACK.md)
- `CLAUDE.md` Database section (add convention paragraph)

## Acceptance Criteria

- [ ] Fresh Postgres + `prisma migrate deploy` runs without error end-to-end
- [ ] ROLLBACK.md SQL produces the original LeagueRule rows when applied
- [ ] CLAUDE.md "Database" section includes 2-phase convention

## Resources

- **Source:** Data-migration-expert P3 #4, #8 + security-sentinel P3 + architecture-strategist P2 #migration-timing

## Work Log

### 2026-04-30 — Initial Discovery
- **By:** /ce:review data-migration-expert agent
- **Learnings:** Hand-written SQL discipline is good (per `MEMORY.md` shared-DB note) but the migrations directory should be runnable end-to-end on a fresh DB. `prisma db push` work has bypassed this.
