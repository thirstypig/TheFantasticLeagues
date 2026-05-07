-- Waiver Wire List foundation, two-list model (PR #256).
-- Adds:
--   * 4 new enums (WaiverDropMode, WaiverPeriodStatus, WaiverAddOutcome, WaiverDropStatus)
--   * WaiverPeriod table — one row per league per waiver run
--   * WaiverAddEntry table — owner's ranked Add list, with outcome + consumed-Drop FK
--   * WaiverDropEntry table — owner's ranked Drop list, with mode + status
--
-- The legacy WaiverClaim table is NOT touched — it backs the existing
-- /api/waivers/process engine and remains in use until that engine is
-- retired.
--
-- Plain CREATE INDEX (NOT CONCURRENTLY) per CLAUDE.md migration policy
-- (corrected in PR #251) and the post-mortem at
-- docs/solutions/deployment/railway-prisma-concurrent-index-p3009-block.md.
-- All three tables start empty; the brief ShareLock during index build
-- is acceptable.

-- ─── Enums ───────────────────────────────────────────────────────────

CREATE TYPE "WaiverDropMode" AS ENUM ('RELEASE', 'IL_STASH');

CREATE TYPE "WaiverPeriodStatus" AS ENUM ('PENDING', 'LOCKED', 'PROCESSED', 'CANCELLED');

CREATE TYPE "WaiverAddOutcome" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'SKIPPED');

CREATE TYPE "WaiverDropStatus" AS ENUM ('PENDING', 'CONSUMED', 'UNUSED');

-- ─── WaiverPeriod table ──────────────────────────────────────────────

CREATE TABLE "WaiverPeriod" (
  "id"          SERIAL                NOT NULL,
  "leagueId"    INTEGER               NOT NULL,
  "deadlineAt"  TIMESTAMP(3)          NOT NULL,
  "lockedAt"    TIMESTAMP(3),
  "processedAt" TIMESTAMP(3),
  "status"      "WaiverPeriodStatus"  NOT NULL DEFAULT 'PENDING',
  "createdAt"   TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WaiverPeriod_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WaiverPeriod_leagueId_idx" ON "WaiverPeriod"("leagueId");
CREATE INDEX IF NOT EXISTS "WaiverPeriod_status_idx" ON "WaiverPeriod"("status");
CREATE INDEX IF NOT EXISTS "WaiverPeriod_leagueId_deadlineAt_idx" ON "WaiverPeriod"("leagueId", "deadlineAt");

ALTER TABLE "WaiverPeriod"
  ADD CONSTRAINT "WaiverPeriod_leagueId_fkey"
  FOREIGN KEY ("leagueId") REFERENCES "League"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── WaiverAddEntry table ────────────────────────────────────────────

CREATE TABLE "WaiverAddEntry" (
  "id"                  SERIAL              NOT NULL,
  "periodId"            INTEGER             NOT NULL,
  "teamId"              INTEGER             NOT NULL,
  "playerId"            INTEGER             NOT NULL,
  "priority"            INTEGER             NOT NULL,
  "outcome"             "WaiverAddOutcome"  NOT NULL DEFAULT 'PENDING',
  "consumedDropEntryId" INTEGER,
  "reason"              TEXT,
  "processedAt"         TIMESTAMP(3),
  "createdAt"           TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WaiverAddEntry_pkey" PRIMARY KEY ("id")
);

-- 1:1 — each drop entry can be consumed by at most one add entry
CREATE UNIQUE INDEX IF NOT EXISTS "WaiverAddEntry_consumedDropEntryId_key"
  ON "WaiverAddEntry"("consumedDropEntryId");

-- one entry per (period, team, priority) and per (period, team, playerId)
CREATE UNIQUE INDEX IF NOT EXISTS "WaiverAddEntry_periodId_teamId_priority_key"
  ON "WaiverAddEntry"("periodId", "teamId", "priority");
CREATE UNIQUE INDEX IF NOT EXISTS "WaiverAddEntry_periodId_teamId_playerId_key"
  ON "WaiverAddEntry"("periodId", "teamId", "playerId");

CREATE INDEX IF NOT EXISTS "WaiverAddEntry_teamId_idx" ON "WaiverAddEntry"("teamId");
CREATE INDEX IF NOT EXISTS "WaiverAddEntry_outcome_idx" ON "WaiverAddEntry"("outcome");

ALTER TABLE "WaiverAddEntry"
  ADD CONSTRAINT "WaiverAddEntry_periodId_fkey"
  FOREIGN KEY ("periodId") REFERENCES "WaiverPeriod"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WaiverAddEntry"
  ADD CONSTRAINT "WaiverAddEntry_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WaiverAddEntry"
  ADD CONSTRAINT "WaiverAddEntry_playerId_fkey"
  FOREIGN KEY ("playerId") REFERENCES "Player"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── WaiverDropEntry table ───────────────────────────────────────────

CREATE TABLE "WaiverDropEntry" (
  "id"          SERIAL              NOT NULL,
  "periodId"    INTEGER             NOT NULL,
  "teamId"      INTEGER             NOT NULL,
  "playerId"    INTEGER             NOT NULL,
  "priority"    INTEGER             NOT NULL,
  "dropMode"    "WaiverDropMode"    NOT NULL DEFAULT 'RELEASE',
  "status"      "WaiverDropStatus"  NOT NULL DEFAULT 'PENDING',
  "processedAt" TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WaiverDropEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WaiverDropEntry_periodId_teamId_priority_key"
  ON "WaiverDropEntry"("periodId", "teamId", "priority");
CREATE UNIQUE INDEX IF NOT EXISTS "WaiverDropEntry_periodId_teamId_playerId_key"
  ON "WaiverDropEntry"("periodId", "teamId", "playerId");

CREATE INDEX IF NOT EXISTS "WaiverDropEntry_teamId_idx" ON "WaiverDropEntry"("teamId");
CREATE INDEX IF NOT EXISTS "WaiverDropEntry_status_idx" ON "WaiverDropEntry"("status");

ALTER TABLE "WaiverDropEntry"
  ADD CONSTRAINT "WaiverDropEntry_periodId_fkey"
  FOREIGN KEY ("periodId") REFERENCES "WaiverPeriod"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WaiverDropEntry"
  ADD CONSTRAINT "WaiverDropEntry_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WaiverDropEntry"
  ADD CONSTRAINT "WaiverDropEntry_playerId_fkey"
  FOREIGN KEY ("playerId") REFERENCES "Player"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Cross-table FK: WaiverAddEntry.consumedDropEntryId → WaiverDropEntry ──

ALTER TABLE "WaiverAddEntry"
  ADD CONSTRAINT "WaiverAddEntry_consumedDropEntryId_fkey"
  FOREIGN KEY ("consumedDropEntryId") REFERENCES "WaiverDropEntry"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
