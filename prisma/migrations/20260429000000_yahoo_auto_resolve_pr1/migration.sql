-- Yahoo-style roster moves — PR1 (server auto-resolve)
-- Plan: docs/plans/2026-04-29-yahoo-style-roster-moves-plan.md
--
-- Two additive changes:
--   1. Roster.displayOrder INTEGER NULL — needed by PR2's Swap Mode drag-
--      reorder UX. Added now (column unused in PR1) so migrations stay clean.
--      Null defaults to acquiredAt ordering at read time; no backfill.
--   2. LeagueRule(transactions.auto_resolve_slots) — gates the bipartite
--      matcher. Defaults 'true' for OGBA (leagueId 20), 'false' elsewhere.
--      Preserves backward compatibility for every other league.
--
-- All changes are additive; no existing rows mutated. Safe on a live DB.

-- ═══════════════════════════════════════════════════════════════
-- 1. Roster.displayOrder column + supporting index
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE "Roster"
  ADD COLUMN "displayOrder" INTEGER;

-- Index for fast ordered reads inside Swap Mode's per-position-group queries.
-- Three-column composite covers the Roster.findMany pattern of
-- WHERE teamId = ? AND assignedPosition = ? ORDER BY displayOrder.
CREATE INDEX "Roster_teamId_assignedPosition_displayOrder_idx"
  ON "Roster" ("teamId", "assignedPosition", "displayOrder");

-- ═══════════════════════════════════════════════════════════════
-- 2. LeagueRule(transactions.auto_resolve_slots)
-- ═══════════════════════════════════════════════════════════════
--
-- Default 'true' for OGBA (the production league running this PR), 'false'
-- for everyone else. The matcher fall-through path means flag-off leagues
-- behave exactly as before.
--
-- Idempotent at two levels: explicit WHERE NOT EXISTS below, plus the
-- @@unique([leagueId, category, key]) constraint on LeagueRule.

INSERT INTO "LeagueRule" ("leagueId", "category", "key", "value", "label", "isLocked", "createdAt", "updatedAt")
SELECT l.id,
       'transactions',
       'auto_resolve_slots',
       CASE WHEN l.id = 20 THEN 'true' ELSE 'false' END,
       'Auto-resolve slot conflicts on add/drop (Yahoo-style)',
       false,
       NOW(),
       NOW()
FROM "League" l
WHERE NOT EXISTS (
  SELECT 1 FROM "LeagueRule" r
  WHERE r."leagueId" = l.id
    AND r.category = 'transactions'
    AND r.key = 'auto_resolve_slots'
);

-- Rollback (manual):
--   DELETE FROM "LeagueRule" WHERE category = 'transactions' AND key = 'auto_resolve_slots';
--   DROP INDEX "Roster_teamId_assignedPosition_displayOrder_idx";
--   ALTER TABLE "Roster" DROP COLUMN "displayOrder";
