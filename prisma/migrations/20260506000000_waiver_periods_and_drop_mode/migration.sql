-- Waiver Wire List foundation (PR #254).
-- Adds:
--   * WaiverDropMode enum (RELEASE | IL_STASH)
--   * WaiverPeriodStatus enum (PENDING | LOCKED | PROCESSED | CANCELLED)
--   * WaiverPeriod table — one row per league per waiver run
--   * WaiverClaim.dropMode column (default RELEASE → preserves old behavior)
--   * WaiverClaim.periodId FK column (nullable — pre-Wire-List rows aren't tied to a period)
--   * Indexes on WaiverPeriod and on the new periodId column
--
-- Plain CREATE INDEX (NOT CONCURRENTLY) per CLAUDE.md migration policy and
-- the post-mortem at docs/solutions/deployment/railway-prisma-concurrent-index-p3009-block.md.
-- Tables here are <50k rows; the brief ShareLock during index build is acceptable.

-- ─── Enums ───────────────────────────────────────────────────────────

CREATE TYPE "WaiverDropMode" AS ENUM ('RELEASE', 'IL_STASH');

CREATE TYPE "WaiverPeriodStatus" AS ENUM ('PENDING', 'LOCKED', 'PROCESSED', 'CANCELLED');

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

-- ─── WaiverClaim alterations ─────────────────────────────────────────

ALTER TABLE "WaiverClaim"
  ADD COLUMN IF NOT EXISTS "periodId" INTEGER,
  ADD COLUMN IF NOT EXISTS "dropMode" "WaiverDropMode" NOT NULL DEFAULT 'RELEASE';

CREATE INDEX IF NOT EXISTS "WaiverClaim_periodId_idx" ON "WaiverClaim"("periodId");

ALTER TABLE "WaiverClaim"
  ADD CONSTRAINT "WaiverClaim_periodId_fkey"
  FOREIGN KEY ("periodId") REFERENCES "WaiverPeriod"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
