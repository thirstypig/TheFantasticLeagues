---
status: complete
priority: p2
issue_id: 268
tags: [code-review, posGames, cron, performance, database]
dependencies: [266]
---

## Problem Statement

PR #378's cron update writes `posGames` to the DB for every player with fielding data on every cron tick, even when the posGames values haven't changed since the last run. The skip guard `if (!posListChanged && !posGamesValue)` only skips players with NO fielding data. For ~1000 MLB players with fielding data, `posGamesValue` is always non-null after the first cron run — so all ~1000 players get a `prisma.player.update` call every day regardless of whether their fielding game counts changed.

## Findings

From `server/src/features/players/services/mlbSyncService.ts` (PR #378):
```typescript
const posGamesValue = fielding ? Object.fromEntries(fielding) : undefined;
const posListChanged = newPosList !== player.posList;

// This guard only skips players with NO fielding data
// Players WITH fielding data always write, even if posGames is identical
if (!posListChanged && !posGamesValue) {
  unchanged++;
  continue;
}
```

- Current baseline: ~5-50 `posList` updates per day (only when positions change)
- After PR #378 without fix: ~1000 `posGames` updates per day regardless
- Performance reviewer: "~1000 unnecessary prisma.player.update calls per day"
- Note: todo #266 handles the empty-`{}` subset of this problem; this todo handles the broader change-detection gap

## Proposed Solutions

### Option A — Compare posGames against stored value before writing (Recommended)
Requires `posGames: true` in the player select (already added in PR #378):
```typescript
const storedPosGames = player.posGames as Record<string, number> | null;
const posGamesChanged = posGamesValue !== undefined &&
  JSON.stringify(posGamesValue) !== JSON.stringify(storedPosGames);

if (!posListChanged && !posGamesChanged) {
  unchanged++;
  continue;
}
```
**Pros:** Eliminates ~1000 daily writes; idiomatic; JSON.stringify on small objects (<20 keys) is cheap. **Effort:** Small. **Risk:** Low.

### Option B — Hash-based comparison
Compute and store a sorted-key JSON hash string alongside posGames. Compare hashes to avoid full object comparison. **Pros:** O(1) compare if hash is stored. **Cons:** Extra column; over-engineered for a ~20-key object. **Effort:** Medium. **Risk:** Low.

## Recommended Action

Option A. The JSON.stringify comparison is sufficient for objects with ≤20 position keys.

## Technical Details

- **File:** `server/src/features/players/services/mlbSyncService.ts`
- **Dependency:** Todo #266 addresses the empty-`{}` case; both should be fixed together

## Acceptance Criteria

- [ ] Players whose posGames is identical to stored value are counted as `unchanged` and skipped
- [ ] Daily cron write count remains proportional to actual changes (typically <50/day)
- [ ] `cd server && npx tsc --noEmit` clean (zod false negative expected for shared imports)

## Work Log

### 2026-06-05 — Surfaced by performance-oracle during session review
