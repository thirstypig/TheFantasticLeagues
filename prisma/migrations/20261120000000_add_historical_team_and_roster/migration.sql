-- Past-seasons archive rebuild (PR 2/4). Additive only: new enum + two new
-- tables; existing Historical* tables are untouched until the archive page
-- moves to the new data.

-- CreateEnum
CREATE TYPE "HistoricalRosterKind" AS ENUM ('SALARIES', 'DRAFT', 'PERIOD', 'FINAL');

-- CreateTable
CREATE TABLE "HistoricalTeam" (
    "id" SERIAL NOT NULL,
    "seasonId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerName" TEXT,
    "recordedPeriodPoints" DOUBLE PRECISION[],
    "recordedTotal" DOUBLE PRECISION,
    "note" TEXT,

    CONSTRAINT "HistoricalTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricalRosterEntry" (
    "id" SERIAL NOT NULL,
    "seasonId" INTEGER NOT NULL,
    "teamCode" TEXT NOT NULL,
    "kind" "HistoricalRosterKind" NOT NULL,
    "periodNumber" INTEGER,
    "slot" TEXT NOT NULL,
    "playerName" TEXT NOT NULL,
    "salary" INTEGER,
    "salaryNote" TEXT,
    "isKeeper" BOOLEAN NOT NULL DEFAULT false,
    "mlbId" TEXT,

    CONSTRAINT "HistoricalRosterEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HistoricalTeam_seasonId_code_key" ON "HistoricalTeam"("seasonId", "code");
CREATE INDEX "HistoricalTeam_seasonId_idx" ON "HistoricalTeam"("seasonId");
CREATE INDEX "HistoricalRosterEntry_seasonId_kind_periodNumber_idx" ON "HistoricalRosterEntry"("seasonId", "kind", "periodNumber");
CREATE INDEX "HistoricalRosterEntry_seasonId_teamCode_idx" ON "HistoricalRosterEntry"("seasonId", "teamCode");

-- AddForeignKey
ALTER TABLE "HistoricalTeam" ADD CONSTRAINT "HistoricalTeam_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "HistoricalSeason"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HistoricalRosterEntry" ADD CONSTRAINT "HistoricalRosterEntry_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "HistoricalSeason"("id") ON DELETE CASCADE ON UPDATE CASCADE;
