---
status: pending
priority: p2
issue_id: "201"
tags: [code-review, standings, performance, database, index, migration]
dependencies: [200]
---

# Add composite index TransactionEvent(playerId, transactionType, effDate) for standings query

## Problem Statement

The new `ilEvents` query in `computeTeamStatsFromDb` filters by `playerId IN (...)`, `transactionType IN (...)`, and `effDate IS NOT NULL`. The existing indexes on `TransactionEvent` are:

- `@@index([leagueId, transactionType, effDate])` — leading column is `leagueId`, not filtered in this query
- `@@index([teamId, playerId, effDate])` — leading column is `teamId`, not filtered
- `@@index([playerId])` — single-column, helps with IN list but requires post-scan filter on type/date

Without a covering index, Postgres does a `playerId` index scan for each player in the IN list, then filters `transactionType` and `effDate` in memory. At OGBA scale (156 players) this is fine. At multi-league scale it degrades.

**File:** `prisma/schema.prisma` — `TransactionEvent` model

## Proposed Solution

Add to `prisma/schema.prisma`:
```prisma
@@index([playerId, transactionType, effDate])
```

Migration SQL (no `CONCURRENTLY` — Prisma wraps in a transaction):
```sql
CREATE INDEX IF NOT EXISTS "TransactionEvent_playerId_transactionType_effDate_idx"
  ON "TransactionEvent" ("playerId", "transactionType", "effDate");
```

- **Effort:** Small (one migration, one `prisma generate`)
- **Risk:** Low — additive index, no schema change

## Acceptance Criteria
- [ ] `prisma/schema.prisma` has `@@index([playerId, transactionType, effDate])` on `TransactionEvent`
- [ ] Migration runs cleanly on Railway (no `CONCURRENTLY`)
- [ ] `npx prisma migrate deploy` succeeds in CI

## Work Log
- 2026-05-15: Identified by Performance reviewer. Additive index to support the new ilEvents query pattern.
