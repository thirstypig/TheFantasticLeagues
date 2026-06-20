-- Migration: Add Phase 3 Scoring Engine (H2HMatchup, ScoringSettings, StatLine, RosterConfig)
-- Date: 2026-06-20
-- Purpose: Support NFL/NBA H2H scoring with configurable rules and weekly stat tracking

-- ════════════════════════════════════════════════════════════════════════════════
-- Step 1: Add new enums
-- ════════════════════════════════════════════════════════════════════════════════

CREATE TYPE "ScoringType" AS ENUM ('POINTS', 'CATEGORIES');
CREATE TYPE "H2HMatchupStatus" AS ENUM ('SCHEDULED', 'LIVE', 'FINAL');

-- ════════════════════════════════════════════════════════════════════════════════
-- Step 2: Create ScoringSettings table
-- ════════════════════════════════════════════════════════════════════════════════

CREATE TABLE "ScoringSettings" (
  "id" SERIAL NOT NULL,
  "leagueId" INTEGER NOT NULL,
  "sport" "Sport" NOT NULL,
  "scoringType" "ScoringType" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ScoringSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScoringSettings_leagueId_key" ON "ScoringSettings"("leagueId");
CREATE INDEX "ScoringSettings_leagueId_sport_idx" ON "ScoringSettings"("leagueId", "sport");

ALTER TABLE "ScoringSettings" ADD CONSTRAINT "ScoringSettings_leagueId_fkey"
  FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE;

-- ════════════════════════════════════════════════════════════════════════════════
-- Step 3: Create ScoringRule table
-- ════════════════════════════════════════════════════════════════════════════════

CREATE TABLE "ScoringRule" (
  "id" SERIAL NOT NULL,
  "scoringSettingsId" INTEGER NOT NULL,
  "statKey" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "pointValue" DOUBLE PRECISION NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isCustom" BOOLEAN NOT NULL DEFAULT false,

  CONSTRAINT "ScoringRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScoringRule_scoringSettingsId_statKey_key" ON "ScoringRule"("scoringSettingsId", "statKey");
CREATE INDEX "ScoringRule_scoringSettingsId_idx" ON "ScoringRule"("scoringSettingsId");
CREATE INDEX "ScoringRule_isActive_idx" ON "ScoringRule"("isActive");

ALTER TABLE "ScoringRule" ADD CONSTRAINT "ScoringRule_scoringSettingsId_fkey"
  FOREIGN KEY ("scoringSettingsId") REFERENCES "ScoringSettings"("id") ON DELETE CASCADE;

-- ════════════════════════════════════════════════════════════════════════════════
-- Step 4: Create RosterConfig table
-- ════════════════════════════════════════════════════════════════════════════════

CREATE TABLE "RosterConfig" (
  "id" SERIAL NOT NULL,
  "leagueId" INTEGER NOT NULL,
  "sport" "Sport" NOT NULL,
  "slots" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RosterConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RosterConfig_leagueId_key" ON "RosterConfig"("leagueId");
CREATE INDEX "RosterConfig_leagueId_sport_idx" ON "RosterConfig"("leagueId", "sport");

ALTER TABLE "RosterConfig" ADD CONSTRAINT "RosterConfig_leagueId_fkey"
  FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE;

-- ════════════════════════════════════════════════════════════════════════════════
-- Step 5: Create H2HMatchup table (sport-agnostic, replaces old Matchup for NFL/NBA)
-- ════════════════════════════════════════════════════════════════════════════════

CREATE TABLE "H2HMatchup" (
  "id" SERIAL NOT NULL,
  "leagueId" INTEGER NOT NULL,
  "sport" "Sport" NOT NULL,
  "week" INTEGER NOT NULL,
  "season" TEXT NOT NULL,
  "homeTeamId" INTEGER NOT NULL,
  "awayTeamId" INTEGER NOT NULL,
  "homeScore" DOUBLE PRECISION,
  "awayScore" DOUBLE PRECISION,
  "status" "H2HMatchupStatus" NOT NULL DEFAULT 'SCHEDULED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "H2HMatchup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "H2HMatchup_leagueId_sport_week_season_homeTeamId_awayTeamId_key"
  ON "H2HMatchup"("leagueId", "sport", "week", "season", "homeTeamId", "awayTeamId");
CREATE INDEX "H2HMatchup_leagueId_sport_week_season_idx" ON "H2HMatchup"("leagueId", "sport", "week", "season");
CREATE INDEX "H2HMatchup_homeTeamId_idx" ON "H2HMatchup"("homeTeamId");
CREATE INDEX "H2HMatchup_awayTeamId_idx" ON "H2HMatchup"("awayTeamId");
CREATE INDEX "H2HMatchup_status_idx" ON "H2HMatchup"("status");

ALTER TABLE "H2HMatchup" ADD CONSTRAINT "H2HMatchup_leagueId_fkey"
  FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE;
ALTER TABLE "H2HMatchup" ADD CONSTRAINT "H2HMatchup_homeTeamId_fkey"
  FOREIGN KEY ("homeTeamId") REFERENCES "Team"("id") ON DELETE CASCADE;
ALTER TABLE "H2HMatchup" ADD CONSTRAINT "H2HMatchup_awayTeamId_fkey"
  FOREIGN KEY ("awayTeamId") REFERENCES "Team"("id") ON DELETE CASCADE;

-- ════════════════════════════════════════════════════════════════════════════════
-- Step 6: Create StatLine table (per-player per-week stats)
-- ════════════════════════════════════════════════════════════════════════════════

CREATE TABLE "StatLine" (
  "id" SERIAL NOT NULL,
  "h2hMatchupId" INTEGER NOT NULL,
  "playerId" INTEGER NOT NULL,
  "teamId" INTEGER NOT NULL,
  "week" INTEGER NOT NULL,
  "season" TEXT NOT NULL,
  "sport" "Sport" NOT NULL,
  "stats" JSONB NOT NULL,
  "fantasyPoints" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StatLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StatLine_h2hMatchupId_playerId_key" ON "StatLine"("h2hMatchupId", "playerId");
CREATE INDEX "StatLine_h2hMatchupId_idx" ON "StatLine"("h2hMatchupId");
CREATE INDEX "StatLine_playerId_idx" ON "StatLine"("playerId");
CREATE INDEX "StatLine_teamId_idx" ON "StatLine"("teamId");
CREATE INDEX "StatLine_week_season_sport_idx" ON "StatLine"("week", "season", "sport");

ALTER TABLE "StatLine" ADD CONSTRAINT "StatLine_h2hMatchupId_fkey"
  FOREIGN KEY ("h2hMatchupId") REFERENCES "H2HMatchup"("id") ON DELETE CASCADE;
ALTER TABLE "StatLine" ADD CONSTRAINT "StatLine_playerId_fkey"
  FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE;
ALTER TABLE "StatLine" ADD CONSTRAINT "StatLine_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE;

-- ════════════════════════════════════════════════════════════════════════════════
-- Step 7: Add relations to League table
-- ════════════════════════════════════════════════════════════════════════════════

-- No new columns needed; relations are defined in Prisma schema only

-- ════════════════════════════════════════════════════════════════════════════════
-- Step 8: Add relations to Team table
-- ════════════════════════════════════════════════════════════════════════════════

-- No new columns needed; relations are defined in Prisma schema only

-- ════════════════════════════════════════════════════════════════════════════════
-- Step 9: Add relations to Player table
-- ════════════════════════════════════════════════════════════════════════════════

-- No new columns needed; relations are defined in Prisma schema only

-- ════════════════════════════════════════════════════════════════════════════════
-- Note: Existing Matchup model UNCHANGED (MLB-only, kept for backwards compatibility)
-- ════════════════════════════════════════════════════════════════════════════════
