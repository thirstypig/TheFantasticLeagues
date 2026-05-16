-- Adds a covering index for the standings `ilEvents` query in computeTeamStatsFromDb:
--   WHERE playerId IN (...) AND transactionType IN ('IL_STASH','IL_ACTIVATE') AND effDate IS NOT NULL
-- The existing @@index([playerId]) helps with the IN list but requires a post-scan filter
-- on transactionType and effDate. This composite index makes the seek precise.
-- Plain CREATE INDEX (no CONCURRENTLY) — safe inside a Prisma migration transaction.
CREATE INDEX IF NOT EXISTS "TransactionEvent_playerId_transactionType_effDate_idx"
  ON "TransactionEvent" ("playerId", "transactionType", "effDate");
