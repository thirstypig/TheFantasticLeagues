-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "LeagueInvite" (
    "id" SERIAL NOT NULL,
    "leagueId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "role" "LeagueRole" NOT NULL DEFAULT 'OWNER',
    "invitedBy" INTEGER NOT NULL,
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeagueInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeagueInvite_email_idx" ON "LeagueInvite"("email");

-- CreateIndex
CREATE INDEX "LeagueInvite_status_idx" ON "LeagueInvite"("status");

-- CreateIndex
CREATE UNIQUE INDEX "LeagueInvite_leagueId_email_key" ON "LeagueInvite"("leagueId", "email");

-- AddForeignKey
ALTER TABLE "LeagueInvite" ADD CONSTRAINT "LeagueInvite_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;
