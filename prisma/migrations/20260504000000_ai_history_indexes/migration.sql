-- AI Insights History: composite (leagueId, createdAt DESC) indexes on the
-- two stores merged by GET /api/ai/insights/history (todo #155).
--
-- The endpoint takes ~ceil(limit/2)+5 rows from each side ordered by
-- createdAt DESC scoped to a single league. Without this index the query
-- planner does a leagueId scan followed by an in-memory sort. Adding the
-- composite turns both into index-only top-N reads.
--
-- For Trade we cannot create a partial index (Prisma schema limitation), so
-- we index (leagueId, createdAt) over the full row set and rely on the
-- runtime WHERE clause `aiAnalysis IS NOT NULL` to prune. The vast majority
-- of trade rows accumulate aiAnalysis post-processing, so the index is
-- still highly selective for the merge query's hot path.
--
-- Originally written with CREATE INDEX CONCURRENTLY, but Prisma's
-- migrate-deploy wraps every migration in a transaction and
-- CONCURRENTLY cannot run inside one (Postgres error 25001). The
-- prior version blocked every Railway deploy until rolled back.
--
-- AiInsight and Trade are NOT in CLAUDE.md's "high-write" list
-- (Roster, PlayerStatsPeriod, TransactionEvent — those genuinely
-- need CONCURRENTLY). AiInsight is explicitly low-write; OGBA's
-- Trade volume is a few rows per week. The brief ShareLock during
-- a non-concurrent CREATE INDEX is acceptable here.
--
-- Idempotent: IF NOT EXISTS guards on both CREATE INDEX statements.

CREATE INDEX IF NOT EXISTS "AiInsight_leagueId_createdAt_idx"
  ON "AiInsight" ("leagueId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "Trade_leagueId_createdAt_idx"
  ON "Trade" ("leagueId", "createdAt" DESC);

-- Rollback:
--   DROP INDEX IF EXISTS "AiInsight_leagueId_createdAt_idx";
--   DROP INDEX IF EXISTS "Trade_leagueId_createdAt_idx";
