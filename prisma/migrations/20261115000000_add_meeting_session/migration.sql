-- CreateTable
CREATE TABLE "MeetingSession" (
    "id" SERIAL NOT NULL,
    "leagueId" INTEGER NOT NULL,
    "periodId" INTEGER NOT NULL,
    "state" JSONB NOT NULL,
    "handedOffAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MeetingSession_leagueId_periodId_key" ON "MeetingSession"("leagueId", "periodId");

-- AddForeignKey
ALTER TABLE "MeetingSession" ADD CONSTRAINT "MeetingSession_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;
