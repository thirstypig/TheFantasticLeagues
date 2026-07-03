---
status: pending
priority: p1
issue_id: 300
tags: [schema, freshness, standings, psp, migration, observability]
dependencies: []
---

## Problem Statement
`PlayerStatsPeriod`, `PlayerStatsDaily`, `TeamStatsPeriod` have no `updatedAt`/`syncedAt` column, so staleness is unqueryable except via expensive cross-referential joins. Root reason the June 2026 boundary-freeze bug hid for 7 weeks. Evidence: `docs/reports/pipeline-staleness-audit-2026-07-02.md` Finding 3.

## Proposed Solutions
Add `syncedAt DateTime @updatedAt` to `PlayerStatsPeriod` (and ideally `TeamStatsPeriod`). Migration must be a plain additive column (no CONCURRENTLY inside the Prisma migration — see the P3009 precedent). Then a trivial alarm becomes possible: "active-period PSP rows whose syncedAt < now-24h". Wire that alarm into the #299 alerting.

## Acceptance Criteria
- `syncedAt` present on PlayerStatsPeriod (+ TeamStatsPeriod); backfilled/defaulted safely; migration verified against a prod-shaped DB.
- A detection query "stale active-period PSP" runs off the new column.
- `git mv` this todo from pending → complete.
