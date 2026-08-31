-- The il_fee partial unique index treated reversal contra-entries as charges.
--
-- Original predicate:
--   WHERE type='il_fee' AND "voidedAt" IS NULL
-- A reversal row is written with type='il_fee' and voidedAt=NULL, so it OCCUPIES
-- the (teamId, periodId, playerId) slot. Any attempt to insert the corrected
-- charge for that same player then collides — and because the insert uses
-- `skipDuplicates`, the collision is swallowed with no error and the charge is
-- silently never written.
--
-- That is exactly what happened twice to Los Doyers / Will Smith / Period 6 on
-- 2026-08-31: the $15 was reversed, and the replacement $10 was dropped both
-- times while the reconcile reported success.
--
-- Only a CHARGE is unique per (team, period, player). A contra-entry is not a
-- charge — the same semantic distinction now applied in the `existing` query.
--
-- Narrowing a predicate can only ever index FEWER rows, so this cannot fail on
-- existing data; verified against prod beforehand (0 duplicate groups under the
-- new predicate, 23 rows total). Plain DROP/CREATE, never CONCURRENTLY inside a
-- Prisma migration — CONCURRENTLY fails there with PG 25001 and blocks every
-- future boot via P3009 (precedent: 2026-05-05, prod frozen 21h).

DROP INDEX IF EXISTS "finance_ledger_il_fee_active_uniq";

CREATE UNIQUE INDEX "finance_ledger_il_fee_active_uniq"
  ON "FinanceLedger" ("teamId", "periodId", "playerId")
  WHERE "type" = 'il_fee'
    AND "voidedAt" IS NULL
    AND "reversalOf" IS NULL
    AND "periodId" IS NOT NULL
    AND "playerId" IS NOT NULL;
