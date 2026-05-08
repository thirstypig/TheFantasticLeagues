-- Baseline migration: AiInsight table + 4-col composite unique
--
-- Background: AiInsight was created via `prisma db push` against the shared
-- Supabase database before migrations were the canonical schema source for
-- this table. Every subsequent migration that touches AiInsight (the 3-col
-- index in 20260430000000_aiinsight_3col_index, the (leagueId, createdAt)
-- index in 20260504000000_ai_history_indexes) implicitly assumed the table
-- already existed. That works in prod (table exists) but breaks any fresh
-- DB spin-up: `prisma migrate deploy` against an empty Postgres fails on
-- the first AiInsight reference with "relation does not exist".
--
-- This migration is the missing CREATE TABLE. It is dated BEFORE the index
-- migrations that depend on it (lexicographic ordering: 20260330 < 20260430)
-- and is fully guarded with IF NOT EXISTS so it is a no-op against the
-- existing prod DB. Closes todo #125.
--
-- This migration adds NO new schema — every column, index, FK, and unique
-- constraint here was already present in prod. The shape is copied from
-- prisma/schema.prisma (model AiInsight) as of 2026-05-07.

-- ═══════════════════════════════════════════════════════════════
-- Table
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "AiInsight" (
  "id"        SERIAL       NOT NULL,
  "type"      TEXT         NOT NULL,
  "leagueId"  INTEGER      NOT NULL,
  "teamId"    INTEGER      NOT NULL,
  "weekKey"   TEXT         NOT NULL,
  "data"      JSONB        NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AiInsight_pkey" PRIMARY KEY ("id")
);

-- ═══════════════════════════════════════════════════════════════
-- Foreign keys (cascade on parent delete — matches schema.prisma)
-- ═══════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AiInsight_leagueId_fkey'
  ) THEN
    ALTER TABLE "AiInsight"
      ADD CONSTRAINT "AiInsight_leagueId_fkey"
      FOREIGN KEY ("leagueId") REFERENCES "League"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AiInsight_teamId_fkey'
  ) THEN
    ALTER TABLE "AiInsight"
      ADD CONSTRAINT "AiInsight_teamId_fkey"
      FOREIGN KEY ("teamId") REFERENCES "Team"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- Indexes
-- ═══════════════════════════════════════════════════════════════
--
-- The 3-col (type, leagueId, weekKey) and (leagueId, createdAt DESC)
-- indexes are added by their own migrations (20260430 and 20260504); we do
-- NOT duplicate them here so each migration owns the index it created.

CREATE UNIQUE INDEX IF NOT EXISTS "AiInsight_type_leagueId_teamId_weekKey_key"
  ON "AiInsight" ("type", "leagueId", "teamId", "weekKey");

CREATE INDEX IF NOT EXISTS "AiInsight_teamId_idx"
  ON "AiInsight" ("teamId");

CREATE INDEX IF NOT EXISTS "AiInsight_leagueId_idx"
  ON "AiInsight" ("leagueId");

CREATE INDEX IF NOT EXISTS "AiInsight_leagueId_type_idx"
  ON "AiInsight" ("leagueId", "type");

-- Rollback:
--   DROP TABLE IF EXISTS "AiInsight" CASCADE;
-- (Only safe on a fresh DB; in prod the table predates this migration so a
--  rollback would orphan production data. See docs/runbooks/baseline_aiinsight_rollback.md.)
