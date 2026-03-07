---
status: pending
priority: p2
issue_id: "063"
tags: [code-review, performance]
dependencies: []
---

# Missing Database Indexes on Roster and Team Tables

## Problem Statement
Several frequently queried columns lack database indexes, which will cause full table scans as data grows. The standings, auction, and roster queries all filter on these columns.

## Findings
- **Performance Oracle**: Identified missing indexes on key lookup columns
- `Roster` table: missing indexes on `teamId`, `playerId`, composite `teamId+releasedAt`
- `Team` table: missing indexes on `leagueId`, `ownerUserId`
- These columns are used in WHERE/JOIN clauses by standings, auction refreshTeams, and roster queries

## Proposed Solutions

### Option A: Add Prisma migration with indexes
- Create a new Prisma migration adding the missing indexes
- `@@index([teamId])`, `@@index([playerId])`, `@@index([teamId, releasedAt])` on Roster
- `@@index([leagueId])`, `@@index([ownerUserId])` on Team
- **Effort**: Small | **Risk**: Low (additive, no schema change)

## Technical Details
- **Affected files**: `prisma/schema.prisma`, new migration file

## Acceptance Criteria
- [ ] Indexes added to Prisma schema
- [ ] Migration runs without errors
- [ ] Queries using these columns show improved performance
