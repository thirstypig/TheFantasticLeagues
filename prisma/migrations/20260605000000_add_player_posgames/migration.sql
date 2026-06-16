-- AddColumn: Player.posGames
-- Rollback runbook: docs/runbooks/20260605000000_add_player_posgames_rollback.md
-- Rollback steps:
--   1. Stop cron writes — deploy a build that removes the posGamesChanged block in
--      mlbSyncService.ts, OR disable the 12:00 UTC cron in server/src/index.ts.
--      (There is NO ENABLE_POS_GAMES_SYNC env flag — setting one has no effect.)
--   2. Optional snapshot: COPY (SELECT id, "posGames" FROM "Player" WHERE "posGames" IS NOT NULL) TO STDOUT CSV
--   3. Drop column: ALTER TABLE "Player" DROP COLUMN IF EXISTS "posGames";
--   4. Delete migration record: DELETE FROM "_prisma_migrations" WHERE migration_name = '20260605000000_add_player_posgames';
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "posGames" JSONB;
