-- AiInsight: 3-column composite index on (type, leagueId, weekKey).
--
-- The existing 4-col @@unique([type, leagueId, teamId, weekKey]) supports
-- (type, leagueId) prefix lookups but cannot directly serve queries that
-- filter by (type, leagueId, weekKey) without `teamId` — Postgres can use
-- the prefix and then index-filter, but with a wide weekly digest table
-- a tighter 3-col index is cheaper. Three call sites benefit:
--   * mlb-feed/services/digestService — weekly digest dedup lookup
--   * services/aiAnalysisService — same shape, league-scoped
--   * reports/services/reportBuilder — type+leagueId+weekKey roll-up
--
-- Issue: todos/086 (P3 perf — small footprint, but trivial to ship).
-- Additive only — does not drop or modify any existing index.

CREATE INDEX "AiInsight_type_leagueId_weekKey_idx"
  ON "AiInsight" ("type", "leagueId", "weekKey");

-- Rollback:
--   DROP INDEX "AiInsight_type_leagueId_weekKey_idx";
