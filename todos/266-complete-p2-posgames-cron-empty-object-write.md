---
status: complete
priority: p2
issue_id: 266
tags: [code-review, posGames, cron, database, performance]
dependencies: []
---

## Problem Statement

In `syncPositionEligibility` (PR #378), the cron computes `posGamesValue = fielding ? Object.fromEntries(fielding) : undefined`. When `fielding` is an empty `Map` (player appears in MLB API fielding endpoint but has zero games at every position — e.g. a 40-man roster player who hasn't played yet this season), `Object.fromEntries(new Map())` produces `{}`. This empty object is truthy, so `!posGamesValue` is false, and the DB update fires writing `posGames: {}` on every cron tick. This has two problems: (1) unnecessary daily writes for all players with empty fielding maps, and (2) corrupts the NULL semantics — `posGames IS NOT NULL` would incorrectly include players where the cron ran but found no real data.

## Findings

From `server/src/features/players/services/mlbSyncService.ts` (PR #378):
```typescript
const posGamesValue = fielding ? Object.fromEntries(fielding) : undefined;
const posListChanged = newPosList !== player.posList;

if (!posListChanged && !posGamesValue) {
  unchanged++;
  continue;
}
```
- `fielding` is a `Map<string, number>` from `extractFieldingPositions(mp)`.
- `extractFieldingPositions` initializes an empty Map and only adds entries when `pos && games > 0`.
- A player with no fielding splits this season returns an empty Map.
- `Object.fromEntries(emptyMap)` = `{}` which is truthy — skips the `unchanged` guard.
- Performance reviewer: "~1000 unnecessary prisma.player.update calls per day" for this scenario.
- Also: no change detection — players whose posGames IS identical to the stored value get rewritten every tick.

## Proposed Solutions

### Option A — Guard empty Map + compare against stored value (Recommended)
```typescript
const posGamesValue = fielding && fielding.size > 0
  ? Object.fromEntries(fielding)
  : undefined;

const posListChanged = newPosList !== player.posList;
// Only write posGames if it differs from stored value
const storedPosGames = player.posGames as Record<string, number> | null;
const posGamesChanged = posGamesValue !== undefined &&
  JSON.stringify(posGamesValue) !== JSON.stringify(storedPosGames);

if (!posListChanged && !posGamesChanged) {
  unchanged++;
  continue;
}
```
**Pros:** Eliminates empty-object writes; prevents daily write amplification; correct NULL semantics. **Cons:** `JSON.stringify` comparison on small objects is cheap but slightly more work per player. **Effort:** Small. **Risk:** Low.

### Option B — Guard empty Map only (partial fix)
```typescript
const posGamesValue = fielding && fielding.size > 0
  ? Object.fromEntries(fielding)
  : undefined;
```
**Pros:** Eliminates empty-object writes and NULL corruption. **Cons:** Still writes on every tick when posGames hasn't changed. **Effort:** Trivial. **Risk:** None.

## Recommended Action

Option A for completeness. Option B is acceptable for an initial fix if Option A feels premature.

## Technical Details

- **File:** `server/src/features/players/services/mlbSyncService.ts` — posGamesValue computation area
- The `player` select already includes `posGames: true` in PR #378's cron update — just use `player.posGames` for comparison

## Acceptance Criteria

- [ ] Empty `fielding` Map produces `undefined` posGamesValue (not `{}`)
- [ ] Players with unchanged posGames are counted as `unchanged` and skipped
- [ ] `posGames IS NOT NULL` in DB correctly means "cron has populated real data" not "cron ran and found nothing"

## Work Log

### 2026-06-05 — Surfaced by performance-oracle, kieran-typescript-reviewer, and data-integrity-guardian
