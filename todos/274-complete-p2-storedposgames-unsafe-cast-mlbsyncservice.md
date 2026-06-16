---
status: pending
priority: p2
issue_id: 274
tags: [code-review, type-safety, posGames, cron]
dependencies: [272, 279]
---

## Problem Statement

`mlbSyncService.ts` casts `player.posGames` (typed as `Prisma.JsonValue`) to `Record<string, number> | null` with a raw `as` cast on line 482. This is asymmetric with the fix applied in PR #378's second commit (`1be6ce2`) to `teamService.ts`, which uses `isPosGamesRecord()` for the same field. The cast suppresses TypeScript's check but provides zero runtime validation — if the DB ever contains a non-object JSON value (string literal, array, nested object from a manual fixup), `JSON.stringify(storedPosGames)` operates on an incorrectly-assumed shape.

## Findings

From `server/src/features/players/services/mlbSyncService.ts`:
```typescript
// Line 482 — unsafe: Prisma.JsonValue could be string, boolean, array
const storedPosGames = player.posGames as Record<string, number> | null;
```

Vs `server/src/features/teams/services/teamService.ts` (already fixed):
```typescript
isPosGamesRecord(r.player.posGames) ? r.player.posGames : null
```

The practical risk is low today (only the cron writes to this column), but the asymmetry is a maintenance trap. `isPosGamesRecord` is currently private to `teamService.ts` (not exported), so `mlbSyncService.ts` can't import it — fixing this requires extracting the function to a shared location (see todo #279).

## Proposed Solutions

### Option A — Extract guard to shared lib and use in both files (Recommended)
1. Move `isPosGamesRecord` to `server/src/lib/jsonGuards.ts` (see todo #279)
2. Replace the cast in `mlbSyncService.ts`:
```typescript
import { isPosGamesRecord } from "../../lib/jsonGuards.js";
// ...
const storedPosGames = isPosGamesRecord(player.posGames) ? player.posGames : null;
```
**Pros:** Eliminates the asymmetry; uses the already-validated guard. **Effort:** Small. **Risk:** None.

### Option B — Inline equivalent guard in mlbSyncService.ts
Duplicate a one-liner guard without extracting:
```typescript
const storedPosGames = (player.posGames && typeof player.posGames === "object" && !Array.isArray(player.posGames))
  ? player.posGames as Record<string, number>
  : null;
```
**Pros:** No shared-lib refactor needed. **Cons:** Duplication; doesn't use the already-correct isPosGamesRecord. **Effort:** Trivial.

## Recommended Action

Option A, depends on todo #279 (extract isPosGamesRecord to lib). Acceptable to land as Option B first and migrate to Option A when #279 is done.

## Technical Details

- **File:** `server/src/features/players/services/mlbSyncService.ts` line 482
- **Dependency:** Ideally paired with #279 (isPosGamesRecord extraction)

## Acceptance Criteria

- [ ] `storedPosGames` uses runtime validation (not bare `as` cast)
- [ ] Result is `Record<string, number> | null` — null for invalid/non-object posGames
- [ ] Existing mlbSyncService tests still pass

## Work Log

### 2026-06-05 — Flagged by kieran-typescript-reviewer, security-sentinel, architecture-strategist (PR #378 review)
