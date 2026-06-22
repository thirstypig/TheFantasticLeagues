-- Baseline TransactionEvent table
-- Migration: 20260420000000_baseline_transaction_event
--
-- Background: TransactionEvent was never created via migrations, but referenced
-- by roster_rules_foundation (20260421000000) and subsequent migrations.
-- Table exists in schema.prisma, but missing from migration chain. This causes
-- `prisma migrate deploy` against a fresh DB to fail on the first reference.
--
-- This migration is the missing CREATE TABLE, dated before the migrations that
-- depend on it (lexicographic ordering: 20260420 < 20260421). Fully guarded
-- with IF NOT EXISTS so it is a no-op against existing prod DBs.

-- ═══════════════════════════════════════════════════════════════
-- Table
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "TransactionEvent" (
  "id"              SERIAL       NOT NULL,
  "rowHash"         TEXT         NOT NULL,
  "leagueId"        INTEGER      NOT NULL,
  "season"          INTEGER      NOT NULL,
  "effDate"         TIMESTAMP(3),
  "submittedAt"     TIMESTAMP(3),
  "effDateRaw"      TEXT,
  "submittedRaw"    TEXT,
  "ogbaTeamName"    TEXT,
  "playerAliasRaw"  TEXT,
  "mlbTeamAbbr"     TEXT,
  "transactionRaw"  TEXT,
  "transactionType" TEXT,
  "toPosition"      TEXT,
  "teamId"          INTEGER,
  "playerId"        INTEGER,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TransactionEvent_pkey" PRIMARY KEY ("id")
);

-- ═══════════════════════════════════════════════════════════════
-- Unique constraint (idempotency key)
-- ═══════════════════════════════════════════════════════════════

CREATE UNIQUE INDEX IF NOT EXISTS "TransactionEvent_rowHash_key"
  ON "TransactionEvent"("rowHash");

-- ═══════════════════════════════════════════════════════════════
-- Indexes from schema.prisma
-- ═══════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS "TransactionEvent_leagueId_season_idx"
  ON "TransactionEvent"("leagueId", "season");
CREATE INDEX IF NOT EXISTS "TransactionEvent_teamId_idx"
  ON "TransactionEvent"("teamId");
CREATE INDEX IF NOT EXISTS "TransactionEvent_playerId_idx"
  ON "TransactionEvent"("playerId");
CREATE INDEX IF NOT EXISTS "TransactionEvent_submittedAt_idx"
  ON "TransactionEvent"("submittedAt");
CREATE INDEX IF NOT EXISTS "TransactionEvent_leagueId_submittedAt_idx"
  ON "TransactionEvent"("leagueId", "submittedAt");

-- ═══════════════════════════════════════════════════════════════
-- Indexes from roster-rules-foundation (20260421000000)
-- ═══════════════════════════════════════════════════════════════
-- Note: 20260421000000 tries to CREATE these indexes; they will become no-op
-- because of IF NOT EXISTS guards.

CREATE INDEX IF NOT EXISTS "TransactionEvent_leagueId_transactionType_effDate_idx"
  ON "TransactionEvent"("leagueId", "transactionType", "effDate");
CREATE INDEX IF NOT EXISTS "TransactionEvent_teamId_playerId_effDate_idx"
  ON "TransactionEvent"("teamId", "playerId", "effDate");

-- ═══════════════════════════════════════════════════════════════
-- Index from transaction_event_playerId_type_effdate_idx (20260516000000)
-- ═══════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS "TransactionEvent_playerId_transactionType_effDate_idx"
  ON "TransactionEvent"("playerId", "transactionType", "effDate");

-- ═══════════════════════════════════════════════════════════════
-- Foreign keys (cascade on delete for league, set null for team/player)
-- ═══════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TransactionEvent_leagueId_fkey'
  ) THEN
    ALTER TABLE "TransactionEvent"
      ADD CONSTRAINT "TransactionEvent_leagueId_fkey"
      FOREIGN KEY ("leagueId") REFERENCES "League"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TransactionEvent_teamId_fkey'
  ) THEN
    ALTER TABLE "TransactionEvent"
      ADD CONSTRAINT "TransactionEvent_teamId_fkey"
      FOREIGN KEY ("teamId") REFERENCES "Team"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TransactionEvent_playerId_fkey'
  ) THEN
    ALTER TABLE "TransactionEvent"
      ADD CONSTRAINT "TransactionEvent_playerId_fkey"
      FOREIGN KEY ("playerId") REFERENCES "Player"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
