---
status: complete
priority: p1
issue_id: 273
tags: [code-review, migration, database, deployment, railway]
dependencies: []
---

## Problem Statement

PR #378's test plan says "Railway deploy picks up migration `20260605000000_add_player_posgames` cleanly (migration marked applied via `migrate resolve`)." Before merging, this claim must be verified: if `migrate resolve --applied` was run from the wrong directory or without the correct `--schema` path, the migration row may be absent from `_prisma_migrations` in prod. When Railway boots, `prisma migrate deploy` will attempt to execute the `ALTER TABLE` — which succeeds because `IF NOT EXISTS` makes it idempotent, but the row will be logged as a NEW apply (not the resolved one), muddying the audit trail.

## Findings

From data-migration-expert review:
- `railway.json` start command: `prisma migrate deploy --schema ../prisma/schema.prisma`
- If `migrate resolve` was run without matching `--schema` flag, it may have written to a different migrations table or simply failed silently
- The `IF NOT EXISTS` guard prevents a breaking error, but the audit trail would be wrong

## Proposed Solutions

### Option A — Pre-merge SQL verification (Recommended)
Run this against prod Supabase before merging:

```sql
SELECT migration_name, started_at, finished_at, applied_steps_count, logs
FROM _prisma_migrations
WHERE migration_name = '20260605000000_add_player_posgames';
```

**Expected:** Exactly one row, `finished_at` non-null, `applied_steps_count >= 1`, `logs` null.

Also verify the column physically exists:
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'Player' AND column_name = 'posGames';
```
**Expected:** One row, `data_type = 'jsonb'`, `is_nullable = 'YES'`.

**If migration row missing:** Run `npx prisma migrate resolve --applied 20260605000000_add_player_posgames --schema ../prisma/schema.prisma` from the `server/` directory.

## Recommended Action

Option A — run both queries before merge, check results. This is a 2-minute verification.

## Technical Details

- **Prod DB:** Supabase (shared with dev) — connect via Supabase dashboard or local `.env` `DATABASE_URL`
- **Correct resolve command:** `cd server && npx prisma migrate resolve --applied 20260605000000_add_player_posgames --schema ../prisma/schema.prisma`

## Acceptance Criteria

- [ ] `_prisma_migrations` row exists for `20260605000000_add_player_posgames` with `finished_at` non-null
- [ ] `Player.posGames` column exists as JSONB, nullable
- [ ] Both verifications documented in PR #378 checklist before merge

## Work Log

### 2026-06-05 — Flagged by data-migration-expert (PR #378 review)
