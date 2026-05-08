-- PR2 simplification cuts (plan #166 §0 deepening synthesis)
-- Plan: docs/plans/2026-04-29-yahoo-style-roster-moves-plan.md
-- Rollback runbook: docs/runbooks/auto_resolve_slots_rollback.md
--
-- The 10-agent deepening pass on PR2 cut ~40% of planned surface area. Two
-- pieces of state added in PR1 (#167) turned out to be unnecessary and are
-- removed here BEFORE PR2 wires the v3 design into Team.tsx, so the v3 work
-- doesn't have to thread through them:
--
--   1. Roster.displayOrder — added in 20260429000000 to support a Swap Mode
--      drag-reorder UX that PR2 no longer ships. The column is unused in
--      every code path (only present in the Prisma schema; no .ts/.tsx
--      reads or writes). Use Roster.acquiredAt as implicit order instead.
--
--   2. LeagueRule(transactions.auto_resolve_slots) — gated the bipartite
--      matcher per-league. After OGBA validation, auto-resolve becomes
--      unconditional for all leagues; the strict-pairwise legacy path is
--      removed in the same PR. The flag is now noise.
--
-- Both changes are additive-removals: dropping a never-read column and
-- deleting LeagueRule rows that no longer affect behavior. No data loss.

-- ═══════════════════════════════════════════════════════════════
-- 1. Drop Roster.displayOrder + supporting index
-- ═══════════════════════════════════════════════════════════════

DROP INDEX IF EXISTS "Roster_teamId_assignedPosition_displayOrder_idx";

ALTER TABLE "Roster" DROP COLUMN IF EXISTS "displayOrder";

-- ═══════════════════════════════════════════════════════════════
-- 2. Delete LeagueRule(transactions.auto_resolve_slots) rows
-- ═══════════════════════════════════════════════════════════════
--
-- Idempotent: zero rows on a fresh DB, one-row-per-league on existing DBs
-- that ran the 20260429000000 migration.

DELETE FROM "LeagueRule"
 WHERE category = 'transactions'
   AND key = 'auto_resolve_slots';
