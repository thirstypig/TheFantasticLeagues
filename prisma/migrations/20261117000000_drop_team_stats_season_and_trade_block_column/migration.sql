-- Todo #304: finish the trade-block move and drop two dead stores.
--
-- Every statement is idempotent (IF [NOT] EXISTS / ON CONFLICT / guarded DO block),
-- so a partial apply or a database that already has some of this can never raise
-- 42P07/42710 and freeze deploys with P3009.

-- 1. TradingBlock was created outside the migration chain (prod has it; a fresh
--    database built from migrations would not). Create it only where missing.
CREATE TABLE IF NOT EXISTS "TradingBlock" (
    "id" SERIAL NOT NULL,
    "teamId" INTEGER NOT NULL,
    "playerId" INTEGER NOT NULL,
    "askingFor" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TradingBlock_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TradingBlock_teamId_playerId_key" ON "TradingBlock"("teamId", "playerId");
CREATE INDEX IF NOT EXISTS "TradingBlock_teamId_idx" ON "TradingBlock"("teamId");
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TradingBlock_teamId_fkey') THEN
        ALTER TABLE "TradingBlock" ADD CONSTRAINT "TradingBlock_teamId_fkey"
            FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TradingBlock_playerId_fkey') THEN
        ALTER TABLE "TradingBlock" ADD CONSTRAINT "TradingBlock_playerId_fkey"
            FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- 2. Until #500 the team-page trade block lived in Team.tradeBlockPlayerIds; #500
--    switched reads to TradingBlock without copying it over. Copy every entry whose
--    player is still on that team's active roster (the old POST only ever stored
--    those), keeping any existing row (and its askingFor note) untouched.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'Team' AND column_name = 'tradeBlockPlayerIds'
    ) THEN
        INSERT INTO "TradingBlock" ("teamId", "playerId")
        SELECT DISTINCT ids."teamId", ids."playerId"
        FROM (
            SELECT t."id" AS "teamId",
                   CASE WHEN e.value ~ '^[0-9]{1,9}$' THEN e.value::int END AS "playerId"
            FROM "Team" t
            CROSS JOIN LATERAL jsonb_array_elements_text(
                CASE WHEN jsonb_typeof(t."tradeBlockPlayerIds"::jsonb) = 'array'
                     THEN t."tradeBlockPlayerIds"::jsonb ELSE '[]'::jsonb END
            ) AS e(value)
        ) ids
        JOIN "Roster" r
          ON r."teamId" = ids."teamId"
         AND r."playerId" = ids."playerId"
         AND r."releasedAt" IS NULL
        ON CONFLICT ("teamId", "playerId") DO NOTHING;
    END IF;
END $$;

-- 3. Drop the dead stores. TeamStatsSeason has been read by nothing since season
--    totals moved to period aggregation; the column is unread since #500.
DROP TABLE IF EXISTS "TeamStatsSeason";
ALTER TABLE "Team" DROP COLUMN IF EXISTS "tradeBlockPlayerIds";
