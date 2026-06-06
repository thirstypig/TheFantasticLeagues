---
status: pending
priority: p2
issue_id: 276
tags: [code-review, migration, documentation, rollback]
dependencies: [275]
---

## Problem Statement

CLAUDE.md convention: "Destructive migrations need a rollback runbook at `docs/runbooks/<migration_name>_rollback.md`." The `20260605000000_add_player_posgames` migration includes `ALTER TABLE "Player" DROP COLUMN IF EXISTS "posGames"` as its rollback step — this is a destructive operation. No runbook file exists at `docs/runbooks/20260605000000_add_player_posgames_rollback.md`.

## Proposed Solutions

Create `docs/runbooks/20260605000000_add_player_posgames_rollback.md` following the template at `docs/runbooks/_template_rollback.md`. Include:
1. Pre-rollback: stop cron writes (correct procedure from todo #275)
2. Optional: snapshot posGames data
3. Drop column SQL
4. Delete `_prisma_migrations` row
5. Post-rollback verification

## Acceptance Criteria

- [ ] `docs/runbooks/20260605000000_add_player_posgames_rollback.md` exists
- [ ] Follows `docs/runbooks/_template_rollback.md` structure
- [ ] Rollback procedure is accurate (matches the corrected steps from #275)
- [ ] Migration SQL comment references the runbook file

## Work Log

### 2026-06-05 — Flagged by data-migration-expert (PR #378 review)
