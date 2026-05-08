-- Wire List auto-lock cron query: WHERE status = 'PENDING' AND deadlineAt <= NOW()
-- Existing indexes on WaiverPeriod -- (leagueId), (status), (leagueId, deadlineAt) -- don't match
-- this predicate well; the cron has no leagueId filter, so it falls back to the low-cardinality
-- (status) btree. As historical PROCESSED rows accumulate, the planner may abandon the index for
-- a seq scan. A partial index on status='PENDING' stays tiny (~1 row per active league) because
-- rows leave the index automatically as their status flips out of PENDING.
--
-- NOTE: plain CREATE INDEX (NOT CONCURRENTLY) is intentional. Prisma wraps every migration in a
-- single transaction; CREATE INDEX CONCURRENTLY aborts with Postgres 25001 and freezes future
-- deploys via P3009. WaiverPeriod is far below the ~1M-row threshold where the brief AccessExclusiveLock
-- of a plain CREATE INDEX would matter -- see CLAUDE.md "Migrations" and
-- docs/solutions/deployment/railway-prisma-concurrent-index-p3009-block.md.
CREATE INDEX IF NOT EXISTS "WaiverPeriod_pending_deadline_idx"
  ON "WaiverPeriod"("deadlineAt")
  WHERE "status" = 'PENDING';
