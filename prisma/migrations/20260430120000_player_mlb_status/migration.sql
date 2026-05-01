-- Player.mlbStatus — raw MLB statsapi roster status string ("Active",
-- "Injured 10-Day", "Injured 60-Day", "Restricted", …). Verbatim per
-- direction-lock IL #1.
--
-- Adding a nullable column is non-blocking on Postgres (no table rewrite,
-- no full lock); safe without `CONCURRENTLY`. No index — sparse string
-- column, queries scan but it's fine for current scale (~3K rows).
--
-- `IF NOT EXISTS` guard for idempotency per migration hygiene rules.

ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "mlbStatus" TEXT;
