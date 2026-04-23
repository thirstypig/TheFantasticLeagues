-- Add `transactions.owner_self_serve` LeagueRule row for every existing league.
-- Plan: docs/plans/2026-04-23-roster-moves-unified-redesign-plan.md (section 7).
--
-- Safety:
--   - Purely additive. No existing rows read or modified.
--   - Idempotent at two levels: explicit WHERE NOT EXISTS below, plus the
--     @@unique([leagueId, category, key]) constraint on LeagueRule that
--     would block a duplicate if the WHERE clause somehow missed.
--   - Default value 'false' preserves commissioner-only behavior for every
--     existing league — zero user-visible change when the middleware that
--     reads this rule first ships.
--
-- Non-migration work in the same PR that must ship alongside:
--   - server/src/lib/sports/baseball.ts: add this rule to DEFAULT_RULES so
--     newly-created leagues get the row on first rule seed.
--   - server/src/features/commissioner/services/CommissionerService.ts:
--     eager-seed DEFAULT_RULES inside createLeague so the lazy-seed path
--     (which fires only when someone first opens the Rules editor) is not
--     the sole guarantee.
--
-- Rollback:
--   DELETE FROM "LeagueRule" WHERE category = 'transactions' AND key = 'owner_self_serve';
--   Safe — no foreign keys point at LeagueRule rows, and the middleware
--   fails closed on missing row so deletion simply reverts behavior to
--   commissioner-only (which is what pre-this-rule behavior was anyway).

INSERT INTO "LeagueRule" ("leagueId", "category", "key", "value", "label", "isLocked", "createdAt", "updatedAt")
SELECT l.id, 'transactions', 'owner_self_serve', 'false',
       'Owner self-serve roster moves', false, NOW(), NOW()
FROM "League" l
WHERE NOT EXISTS (
  SELECT 1 FROM "LeagueRule" r
  WHERE r."leagueId" = l.id
    AND r.category = 'transactions'
    AND r.key = 'owner_self_serve'
);
