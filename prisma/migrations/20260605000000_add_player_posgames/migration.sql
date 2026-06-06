-- AddColumn: Player.posGames
-- Rollback steps:
--   1. Set env flag to stop cron writes: ENABLE_POS_GAMES_SYNC=false (or disable cron)
--   2. Optional snapshot: COPY (SELECT id, "posGames" FROM "Player" WHERE "posGames" IS NOT NULL) TO STDOUT CSV
--   3. Drop column: ALTER TABLE "Player" DROP COLUMN IF EXISTS "posGames";
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "posGames" JSONB;
