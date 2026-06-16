---
status: pending
priority: p3
issue_id: 279
tags: [code-review, architecture, type-safety, posGames]
dependencies: []
---

## Problem Statement

`isPosGamesRecord` in `teamService.ts` is a file-private function that validates `Prisma.JsonValue` for the `Player.posGames` field. It is needed in both `teamService.ts` (read path) and `mlbSyncService.ts` (write path, see #274), but it cannot be imported by `mlbSyncService.ts` because it is not exported. The pattern for cross-cutting validators in this codebase is `server/src/lib/` (see `ilSlotGuard.ts`, `rosterWindow.ts`).

## Proposed Solutions

1. Create `server/src/lib/jsonGuards.ts` (or add to `server/src/lib/utils.ts`):
```typescript
/** Runtime guard: Prisma JsonValue → Record<string, number>. */
export function isPosGamesRecord(v: unknown): v is Record<string, number> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  return Object.values(v as Record<string, unknown>).every(
    (val) => typeof val === "number" && Number.isFinite(val),
  );
}
```
2. Import in both `teamService.ts` and `mlbSyncService.ts`
3. Remove the file-private copy from `teamService.ts`

## Technical Details

- **New file:** `server/src/lib/jsonGuards.ts`
- **Effort:** Small
- **Enables:** #274 (mlbSyncService unsafe cast fix)

## Acceptance Criteria

- [ ] `isPosGamesRecord` exported from `server/src/lib/jsonGuards.ts`
- [ ] Both `teamService.ts` and `mlbSyncService.ts` import from the shared location
- [ ] No duplicate copies remain

## Work Log

### 2026-06-05 — Flagged by architecture-strategist, kieran-typescript-reviewer (PR #378 review)
