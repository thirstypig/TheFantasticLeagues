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
-- Both Trade and AiInsight are hot tables (writes from trade processing,
-- digest cron, and weekly insight generation), so we use CONCURRENTLY per
-- the migration hardening guidance in CLAUDE.md.
--
-- Idempotent: IF NOT EXISTS guards on both CREATE INDEX statements.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "AiInsight_leagueId_createdAt_idx"
  ON "AiInsight" ("leagueId", "createdAt" DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Trade_leagueId_createdAt_idx"
  ON "Trade" ("leagueId", "createdAt" DESC);

-- Rollback:
--   DROP INDEX CONCURRENTLY IF EXISTS "AiInsight_leagueId_createdAt_idx";
--   DROP INDEX CONCURRENTLY IF EXISTS "Trade_leagueId_createdAt_idx";
