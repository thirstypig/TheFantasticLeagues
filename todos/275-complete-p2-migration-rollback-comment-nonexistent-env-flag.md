---
status: pending
priority: p2
issue_id: 275
tags: [code-review, migration, documentation, rollback]
dependencies: []
---

## Problem Statement

The rollback comment in `prisma/migrations/20260605000000_add_player_posgames/migration.sql` references `ENABLE_POS_GAMES_SYNC=false` as the way to stop cron writes before dropping the column. This env var does not exist anywhere in the codebase — `mlbSyncService.ts` and `server/src/index.ts` do not check it. An operator following the rollback procedure under pressure will set this flag in Railway env vars, observe no effect, and then drop the column while the cron is still actively writing to it.

## Findings

From `prisma/migrations/20260605000000_add_player_posgames/migration.sql`:
```sql
-- Rollback steps:
--   1. Set env flag to stop cron writes: ENABLE_POS_GAMES_SYNC=false (or disable cron)
```

Searched `server/src/features/players/services/mlbSyncService.ts` and `server/src/index.ts` — no reference to `ENABLE_POS_GAMES_SYNC`. The cron at 12:00 UTC unconditionally calls `syncPositionEligibility()`.

Architecture-strategist noted: "A rollback performed under pressure with a non-functional step 1 is a real risk."

## Proposed Solutions

### Option A — Correct the rollback comment (Recommended)
Replace the inaccurate step with the actual mechanism:
```sql
-- Rollback steps:
--   1. Stop cron writes — either:
--      a. Deploy a build that removes the posGames write from mlbSyncService.ts
--         (comment out the posGamesChanged block and prisma update spread), OR
--      b. Disable the 12:00 UTC cron block entirely in server/src/index.ts
--   2. Recommended: snapshot before drop:
--      COPY (SELECT id, "posGames" FROM "Player" WHERE "posGames" IS NOT NULL) TO STDOUT CSV
--   3. Drop column: ALTER TABLE "Player" DROP COLUMN IF EXISTS "posGames";
```

### Option B — Wire the env flag for real
Add `ENABLE_POS_GAMES_SYNC` check in `mlbSyncService.ts`:
```typescript
if (process.env.ENABLE_POS_GAMES_SYNC === "false") {
  logger.info("posGames sync disabled via ENABLE_POS_GAMES_SYNC");
  return { updated, unchanged, total: players.length, errors };
}
```
**Cons:** Adds a feature flag for a column that is unlikely to be rolled back. Over-engineered for this situation.

## Recommended Action

Option A — correct the comment. The column is low-risk; a proper feature flag is overkill. The corrected comment gives operators an accurate path under pressure.

## Technical Details

- **File:** `prisma/migrations/20260605000000_add_player_posgames/migration.sql` lines 1–5

## Acceptance Criteria

- [ ] Rollback step 1 accurately describes how to stop cron writes before dropping the column
- [ ] No reference to `ENABLE_POS_GAMES_SYNC` unless the env var is actually wired

## Work Log

### 2026-06-05 — Flagged by architecture-strategist, data-migration-expert (PR #378 review)
