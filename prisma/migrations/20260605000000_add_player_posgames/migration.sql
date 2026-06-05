-- AddColumn: Player.posGames
-- Rollback: ALTER TABLE "Player" DROP COLUMN "posGames";
ALTER TABLE "Player" ADD COLUMN "posGames" JSONB;
