---
status: pending
priority: p1
issue_id: 272
tags: [code-review, posGames, cron, performance, correctness]
dependencies: [268]
---

## Problem Statement

The `posGamesChanged` diff guard in `syncPositionEligibility` (`mlbSyncService.ts`) uses `JSON.stringify` to compare the incoming posGames object against the stored DB value. However, `JSON.stringify` serializes keys in insertion order, while PostgreSQL JSONB normalizes key order **alphabetically** on storage. This means `JSON.stringify({ OF: 45, "1B": 3 })` (MLB API insertion order) never equals `JSON.stringify({ "1B": 3, OF: 45 })` (Postgres alphabetical), even when the data is identical.

**Consequence**: The guard fires on every cron tick for every player with multi-position fielding data, defeating the entire purpose of todo #268's optimization. All ~1000 position-eligible players get a `prisma.player.update` call daily regardless of actual change.

## Findings

From `server/src/features/players/services/mlbSyncService.ts`:
```typescript
// Line 483-484 — key order is NOT canonical
const posGamesChanged = posGamesValue !== undefined &&
  JSON.stringify(posGamesValue) !== JSON.stringify(storedPosGames);
```

- `posGamesValue` = `Object.fromEntries(fielding)` — Map insertion order (MLB API response order)
- `storedPosGames` = read from Postgres JSONB — always alphabetically sorted by Postgres
- Any multi-position player (e.g. `{OF: 45, "1B": 3}` vs `{"1B": 3, OF: 45}`) triggers a false-positive diff

Confirmed independently by performance-oracle, code-simplicity-reviewer, and security-sentinel agents. The code comment at line 480 explicitly states the intent is to "avoid ~1000 daily no-op writes" — the implementation does not achieve this.

Note: This does NOT cause data corruption — the writes are idempotent. The bug's impact is purely performance (unnecessary DB writes) and logic-incorrectness (the optimization doesn't work).

## Proposed Solutions

### Option A — Sort keys before JSON.stringify (Recommended)
```typescript
function canonicalPosGames(o: Record<string, number> | null | undefined): string {
  if (!o) return "null";
  return JSON.stringify(
    Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)))
  );
}

const posGamesChanged = posGamesValue !== undefined &&
  canonicalPosGames(posGamesValue) !== canonicalPosGames(storedPosGames);
```
**Pros:** Correct, cheap (small objects), explicit intent. **Effort:** Trivial. **Risk:** None.

### Option B — Entry-by-entry shallow comparison
```typescript
const posGamesChanged = posGamesValue !== undefined && (
  storedPosGames === null ||
  Object.keys(posGamesValue).length !== Object.keys(storedPosGames).length ||
  Object.entries(posGamesValue).some(([k, v]) => storedPosGames[k] !== v)
);
```
**Pros:** No string allocation. **Cons:** More verbose, same edge-case coverage. **Effort:** Trivial. **Risk:** None.

## Recommended Action

Option A. The helper is self-documenting and can be inlined or extracted. Apply to the branch before the first cron run against the populated column.

## Technical Details

- **File:** `server/src/features/players/services/mlbSyncService.ts` lines 483–484
- **Root cause:** PostgreSQL JSONB normalizes key insertion order alphabetically; JS objects do not
- **Precedent:** todo #268 was marked complete but its fix is ineffective without this correction

## Acceptance Criteria

- [ ] `posGamesChanged` comparison uses key-order-normalized strings or entry-by-entry comparison
- [ ] Two objects with identical key-value pairs but different insertion order produce `posGamesChanged = false`
- [ ] `cd server && npx tsc --noEmit` clean (zod false-negative expected for shared imports)

## Work Log

### 2026-06-05 — Flagged by performance-oracle, code-simplicity-reviewer, security-sentinel (PR #378 review)
