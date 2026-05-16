---
status: pending
priority: p2
issue_id: "203"
tags: [code-review, standings, quality, consistency]
dependencies: []
---

# `statsMap.get(roster.player.id)` should use `roster.playerId` for consistency

## Problem Statement

In `computeWithPeriodStats`, the `statsMap` is keyed by `playerId`:
```typescript
const statsMap = new Map(periodStats.map(s => [s.playerId, s]));
```

But the lookup uses `roster.player.id` (the join result):
```typescript
const stats = statsMap.get(roster.player.id);
```

These are the same integer (`Roster.playerId` is a FK to `Player.id`), so there is no runtime bug. But every other lookup in this function uses `roster.playerId` directly. This inconsistency forces a reader to trace the Prisma join to verify correctness.

**File:** `server/src/features/standings/services/standingsService.ts` line ~594`

## Fix

```typescript
const stats = statsMap.get(roster.playerId);  // consistent with statsMap key
```

- **Effort:** 1 line
- **Risk:** None

## Acceptance Criteria
- [ ] `statsMap.get(roster.playerId)` in `computeWithPeriodStats`
- [ ] All tests pass

## Work Log
- 2026-05-15: Identified by TS reviewer during code review.
