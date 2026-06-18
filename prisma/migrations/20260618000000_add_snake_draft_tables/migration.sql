-- CreateTable
CREATE TABLE "SnakeDraftSession" (
    "id" SERIAL NOT NULL,
    "leagueId" INTEGER NOT NULL,
    "state" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SnakeDraftSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftPick" (
    "id" SERIAL NOT NULL,
    "leagueId" INTEGER NOT NULL,
    "round" INTEGER NOT NULL,
    "pickNum" INTEGER NOT NULL,
    "teamId" INTEGER NOT NULL,
    "playerId" INTEGER,
    "pickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isAutoPick" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DraftPick_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SnakeDraftSession_leagueId_key" ON "SnakeDraftSession"("leagueId");

-- CreateIndex
CREATE UNIQUE INDEX "DraftPick_leagueId_round_pickNum_key" ON "DraftPick"("leagueId", "round", "pickNum");

-- CreateIndex
CREATE INDEX "DraftPick_leagueId_idx" ON "DraftPick"("leagueId");

-- CreateIndex
CREATE INDEX "DraftPick_teamId_idx" ON "DraftPick"("teamId");

-- AddForeignKey
ALTER TABLE "SnakeDraftSession" ADD CONSTRAINT "SnakeDraftSession_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPick" ADD CONSTRAINT "DraftPick_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPick" ADD CONSTRAINT "DraftPick_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPick" ADD CONSTRAINT "DraftPick_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;
