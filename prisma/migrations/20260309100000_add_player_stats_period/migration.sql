-- CreateTable
CREATE TABLE "PlayerStatsPeriod" (
    "id" SERIAL NOT NULL,
    "playerId" INTEGER NOT NULL,
    "periodId" INTEGER NOT NULL,
    "AB" INTEGER NOT NULL DEFAULT 0,
    "H" INTEGER NOT NULL DEFAULT 0,
    "R" INTEGER NOT NULL DEFAULT 0,
    "HR" INTEGER NOT NULL DEFAULT 0,
    "RBI" INTEGER NOT NULL DEFAULT 0,
    "SB" INTEGER NOT NULL DEFAULT 0,
    "W" INTEGER NOT NULL DEFAULT 0,
    "SV" INTEGER NOT NULL DEFAULT 0,
    "K" INTEGER NOT NULL DEFAULT 0,
    "IP" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ER" INTEGER NOT NULL DEFAULT 0,
    "BB_H" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PlayerStatsPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlayerStatsPeriod_periodId_idx" ON "PlayerStatsPeriod"("periodId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerStatsPeriod_playerId_periodId_key" ON "PlayerStatsPeriod"("playerId", "periodId");

-- AddForeignKey
ALTER TABLE "PlayerStatsPeriod" ADD CONSTRAINT "PlayerStatsPeriod_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerStatsPeriod" ADD CONSTRAINT "PlayerStatsPeriod_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "Period"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
