---
status: pending
priority: p2
issue_id: 277
tags: [code-review, testing, posGames, cron]
dependencies: []
---

## Problem Statement

PR #378 adds significant new behavior to `syncPositionEligibility` (posGames write, change detection, empty-fielding guard) but no tests cover these paths. The existing 9 tests in `mlbSyncService.test.ts` cover `syncAllPlayers` team-change scenarios only. The Prisma `findMany` mock fixtures return `{ id, mlbId, posPrimary, posList }` without `posGames`, which means every test runs with `player.posGames = undefined` — the new change-detection code path is never exercised.

Per project memory (`feedback_test_fixtures.md`): "unit test mocks must mirror real API response shapes; fabricated fields mask production bugs."

## Findings

Missing test cases:
1. **First write**: `player.posGames = null` in DB, fielding data present → posGames written
2. **No-op skip**: `player.posGames = { "OF": 45 }` stored, same data from MLB API → `unchanged++`, no update
3. **Empty fielding guard**: `fielding.size === 0` → `posGamesValue = undefined`, update skipped
4. **posGames changed**: `player.posGames = { "OF": 30 }` stored, MLB API returns `{ "OF": 45 }` → posGames written
5. **Fixture drift**: All existing test fixtures omit `posGames` from the `player.findMany` mock return

Also: `teamService.test.ts` mock fixtures omit `posGames` from embedded player objects. `buildGamesByPos`'s real-data path (when `posGames` is present and valid) is never exercised.

## Proposed Solutions

### Option A — Add posGames to existing fixtures + add 4 new test cases
Update every `prisma.player.findMany.mockResolvedValue([...])` call in `mlbSyncService.test.ts` to include `posGames: null` (or a real value). Add 4 describe blocks for the new posGames write paths.

### Option B — New describe block in mlbSyncService.test.ts (Recommended)
Add a `describe("syncPositionEligibility — posGames write paths", ...)` block with all 4 cases, plus update existing fixture shapes.

## Technical Details

- **Files:** `server/src/features/players/__tests__/mlbSyncService.test.ts`, `server/src/features/teams/__tests__/teamService.test.ts`
- **Key assertion**: the `unchanged` counter increments when both `posListChanged` and `posGamesChanged` are false

## Acceptance Criteria

- [ ] mlbSyncService.test.ts fixtures include `posGames: null` (or appropriate value)
- [ ] Test for first posGames write (null → populated)
- [ ] Test for no-op skip (identical posGames → unchanged++)
- [ ] Test for empty fielding guard (fielding.size === 0 → no posGames write)
- [ ] teamService.ts buildGamesByPos real-data path covered by at least one test

## Work Log

### 2026-06-05 — Flagged by kieran-typescript-reviewer, architecture-strategist (PR #378 review)
