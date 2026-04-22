-- Roster Rules Enforcement — Phase 1 foundation
-- Plan: docs/plans/2026-04-21-feat-roster-rules-il-slots-and-fees-plan.md
--
-- Contents:
--   1. FinanceLedger: additive columns (periodId, playerId, voidedAt,
--      reversalOf, createdBy) + FKs + indexes + partial unique index
--      scoped to type='il_fee' AND voidedAt IS NULL.
--   2. RosterSlotEvent table + unique + indexes (append-only IL stint log)
--   3. OutboxEvent table + indexes (durable post-commit queue)
--   4. TransactionEvent indexes for stint derivation + backdate period lookups
--   5. Period composite index for backdate affected-period overlap scan
--   6. Idempotent backfill of `il.slot_count = 2` into every LeagueRule.
--
-- All schema changes are additive (nullable new columns, new tables, new
-- indexes) — safe on a live Postgres table. No behavior changes in
-- existing code paths from applying this migration alone.

-- ═══════════════════════════════════════════════════════════════
-- 1. FinanceLedger additions
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE "FinanceLedger"
  ADD COLUMN "periodId"   INTEGER,
  ADD COLUMN "playerId"   INTEGER,
  ADD COLUMN "voidedAt"   TIMESTAMP(3),
  ADD COLUMN "reversalOf" INTEGER,
  ADD COLUMN "createdBy"  INTEGER;

-- FKs with ON DELETE NO ACTION so a period/player/ledger-row delete never
-- silently erases an il_fee audit record (data-integrity review).
ALTER TABLE "FinanceLedger"
  ADD CONSTRAINT "FinanceLedger_periodId_fkey"
    FOREIGN KEY ("periodId") REFERENCES "Period"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "FinanceLedger"
  ADD CONSTRAINT "FinanceLedger_playerId_fkey"
    FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "FinanceLedger"
  ADD CONSTRAINT "FinanceLedger_reversalOf_fkey"
    FOREIGN KEY ("reversalOf") REFERENCES "FinanceLedger"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

CREATE INDEX "FinanceLedger_periodId_idx"          ON "FinanceLedger"("periodId");
CREATE INDEX "FinanceLedger_playerId_idx"          ON "FinanceLedger"("playerId");
CREATE INDEX "FinanceLedger_teamId_periodId_idx"   ON "FinanceLedger"("teamId", "periodId");

-- Partial unique index: idempotency for il_fee writes without interfering
-- with existing entry_fee / bonus / auction_adjust rows that legitimately
-- have null periodId/playerId. Prisma @@unique can't express WHERE clauses,
-- so this is SQL-only and must be preserved through future migrations.
CREATE UNIQUE INDEX "finance_ledger_il_fee_active_uniq"
  ON "FinanceLedger" ("teamId", "periodId", "playerId")
  WHERE "type" = 'il_fee' AND "voidedAt" IS NULL AND "periodId" IS NOT NULL AND "playerId" IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════
-- 2. RosterSlotEvent — append-only IL stint log
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE "RosterSlotEvent" (
  "id"                   SERIAL       PRIMARY KEY,
  "teamId"               INTEGER      NOT NULL,
  "playerId"             INTEGER      NOT NULL,
  "leagueId"             INTEGER      NOT NULL,
  "event"                TEXT         NOT NULL,
  "effDate"              TIMESTAMP(3) NOT NULL,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy"            INTEGER,
  "reason"               TEXT,
  "mlbStatusSnapshot"    TEXT,
  "mlbStatusFetchedAt"   TIMESTAMP(3),
  CONSTRAINT "RosterSlotEvent_teamId_fkey"
    FOREIGN KEY ("teamId")   REFERENCES "Team"("id")   ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RosterSlotEvent_playerId_fkey"
    FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RosterSlotEvent_leagueId_fkey"
    FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE  ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "RosterSlotEvent_teamId_playerId_effDate_event_key"
  ON "RosterSlotEvent"("teamId", "playerId", "effDate", "event");

CREATE INDEX "RosterSlotEvent_leagueId_effDate_idx"
  ON "RosterSlotEvent"("leagueId", "effDate");

CREATE INDEX "RosterSlotEvent_teamId_playerId_effDate_idx"
  ON "RosterSlotEvent"("teamId", "playerId", "effDate");

-- ═══════════════════════════════════════════════════════════════
-- 3. OutboxEvent — durable post-commit queue
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE "OutboxEvent" (
  "id"          SERIAL       PRIMARY KEY,
  "kind"        TEXT         NOT NULL,
  "payload"     JSONB        NOT NULL,
  "attempts"    INTEGER      NOT NULL DEFAULT 0,
  "lastError"   TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "OutboxEvent_completedAt_createdAt_idx" ON "OutboxEvent"("completedAt", "createdAt");
CREATE INDEX "OutboxEvent_kind_completedAt_idx"      ON "OutboxEvent"("kind", "completedAt");

-- ═══════════════════════════════════════════════════════════════
-- 4. TransactionEvent indexes — stint derivation + backdate perf
-- ═══════════════════════════════════════════════════════════════

CREATE INDEX "TransactionEvent_leagueId_transactionType_effDate_idx"
  ON "TransactionEvent"("leagueId", "transactionType", "effDate");

CREATE INDEX "TransactionEvent_teamId_playerId_effDate_idx"
  ON "TransactionEvent"("teamId", "playerId", "effDate");

-- ═══════════════════════════════════════════════════════════════
-- 5. Period composite index — backdate affected-period overlap scan
-- ═══════════════════════════════════════════════════════════════

CREATE INDEX "Period_leagueId_startDate_endDate_idx"
  ON "Period"("leagueId", "startDate", "endDate");

-- ═══════════════════════════════════════════════════════════════
-- 6. Backfill `il.slot_count = 2` into every league
-- ═══════════════════════════════════════════════════════════════
-- Idempotent — the existing @@unique([leagueId, category, key]) constraint
-- on LeagueRule means re-running this migration won't duplicate.
-- OGBA was charging $10 / $15 for IL slots 1 & 2 per the existing
-- il.il_slot_1_cost / il.il_slot_2_cost rules, implying 2 slots. That's
-- also the system-wide default; leagues can override via RulesEditor UI
-- once it exposes the field.

INSERT INTO "LeagueRule" ("leagueId", "category", "key", "value", "label", "isLocked", "createdAt", "updatedAt")
SELECT l.id, 'il', 'slot_count', '2', 'IL Slots per Team', false, NOW(), NOW()
FROM "League" l
WHERE NOT EXISTS (
  SELECT 1 FROM "LeagueRule" r
  WHERE r."leagueId" = l.id AND r.category = 'il' AND r.key = 'slot_count'
);
