-- Archive player check (PR 3/4): one row per name per team per archived
-- season, the MLB player it resolves to, and a person's decision on the ones
-- the rules could not settle.
--
-- Also drops HistoricalRosterEntry.mlbId. It was added in the previous
-- migration as a placeholder and never written (0 of 15,709 rows in prod on
-- 2026-11-21); the new table is the single source of truth for player identity.
-- Nothing at runtime reads HistoricalRosterEntry yet (only the loader script).

-- CreateEnum
CREATE TYPE "HistoricalMatchStatus" AS ENUM ('VERIFIED', 'SUGGESTED', 'FLAGGED', 'OPEN');

-- CreateEnum
CREATE TYPE "HistoricalMatchDecision" AS ENUM ('PICK', 'EXCEPTION', 'WRONG', 'NONE');

-- AlterTable
ALTER TABLE "HistoricalRosterEntry" DROP COLUMN "mlbId";

-- CreateTable
CREATE TABLE "HistoricalPlayerMatch" (
    "id" SERIAL NOT NULL,
    "seasonId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "teamCode" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "names" TEXT[],
    "slots" TEXT[],
    "seenIn" TEXT[],
    "status" "HistoricalMatchStatus" NOT NULL,
    "autoMlbId" INTEGER,
    "autoName" TEXT,
    "detail" JSONB NOT NULL,
    "decision" "HistoricalMatchDecision",
    "decidedById" INTEGER,
    "decidedAt" TIMESTAMP(3),
    "mlbId" INTEGER,
    "mlbName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HistoricalPlayerMatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HistoricalPlayerMatch_seasonId_status_idx" ON "HistoricalPlayerMatch"("seasonId", "status");

-- CreateIndex
CREATE INDEX "HistoricalPlayerMatch_decidedById_idx" ON "HistoricalPlayerMatch"("decidedById");

-- CreateIndex
CREATE UNIQUE INDEX "HistoricalPlayerMatch_seasonId_key_key" ON "HistoricalPlayerMatch"("seasonId", "key");

-- AddForeignKey
ALTER TABLE "HistoricalPlayerMatch" ADD CONSTRAINT "HistoricalPlayerMatch_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "HistoricalSeason"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricalPlayerMatch" ADD CONSTRAINT "HistoricalPlayerMatch_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
