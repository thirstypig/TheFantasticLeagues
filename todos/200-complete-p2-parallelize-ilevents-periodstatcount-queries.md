---
status: pending
priority: p2
issue_id: "200"
tags: [code-review, standings, performance, database]
dependencies: []
---

# Parallelize `ilEvents` + `periodStatCount` queries in `computeTeamStatsFromDb`

## Problem Statement

In `computeTeamStatsFromDb`, the `ilEvents` query (step 3) and `playerStatsPeriod.count` (step 4) are currently sequential despite having no data dependency on each other. Both can run after step 2 (rosters). Running them sequentially adds one unnecessary DB roundtrip to every standings computation.

**File:** `server/src/features/standings/services/standingsService.ts` lines ~411–430

## Proposed Solution

```typescript
const [ilEvents, periodStatCount] = await Promise.all([
  prisma.transactionEvent.findMany({
    where: {
      playerId: { in: rosterPlayerIds },
      transactionType: { in: ["IL_STASH", "IL_ACTIVATE"] },
      effDate: { not: null },
    },
    select: { playerId: true, transactionType: true, effDate: true },
    orderBy: { effDate: "asc" },
  }),
  prisma.playerStatsPeriod.count({ where: { periodId } }),
]);
```

- **Effort:** Small (wrap in `Promise.all`, destructure)
- **Risk:** None — pure parallel reads, no ordering dependency

## Acceptance Criteria
- [ ] `ilEvents` and `periodStatCount` fetched via `Promise.all`
- [ ] `computeTeamStatsFromDb` has 4 sequential DB roundtrips instead of 5
- [ ] All standing tests still pass

## Work Log
- 2026-05-15: Identified by Performance reviewer.
