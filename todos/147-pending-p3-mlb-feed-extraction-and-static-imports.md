---
status: pending
priority: p3
issue_id: "147"
tags: [code-review, architecture, mlb-feed, simplicity]
dependencies: []
---

# Continue `mlb-feed/routes.ts` extraction; convert digestService → awardsService to static import

## Problem Statement

Two related cleanups on `mlb-feed/`:

1. **`mlb-feed/routes.ts` is still 1,186 lines** post-`digestRoutes.ts` extraction (#178 was a partial split). Hosts player-news, scores, my-players-today, depth charts, RSS aggregation. Pattern is established; finishing it is mechanical.
2. **`digestService.ts:376-378` dynamic-imports `awardsService`** — was justified pre-extraction (avoiding circular deps), now that awardsService is a leaf the dynamic import is unnecessary indirection on the digest hot path.

## Findings

- `server/src/features/mlb-feed/routes.ts` (1,186 LOC)
- `server/src/features/mlb-feed/services/digestService.ts:376-378` — dynamic import
- After #133 (awards relocation), the digestService import becomes cross-feature and should be documented in CLAUDE.md

## Proposed Solutions

### Option 1: Split routes.ts + convert dynamic to static (recommended)

- `playerNewsRoutes.ts` — player-news + RSS
- `scoresRoutes.ts` — scores + my-players-today + schedule
- Mount each in `mlb-feed/index.ts` barrel
- Convert `digestService` import to static
- Update CLAUDE.md if #133 has shipped (cross-feature note)

**Effort:** Medium (~half day). **Risk:** Low — mechanical.

## Recommended Action

Option 1. Defer until after #133 lands so the cross-feature import is documented at the right granularity.

## Technical Details

- `server/src/features/mlb-feed/routes.ts` — split
- `server/src/features/mlb-feed/services/digestService.ts:376-378` — static import

## Acceptance Criteria

- [ ] `mlb-feed/routes.ts` ≤ 600 LOC
- [ ] `playerNewsRoutes.ts` and `scoresRoutes.ts` tested
- [ ] No dynamic imports remain in `digestService.ts`

## Resources

- Architecture + simplicity review under /ce:review 2026-04-30

## Work Log

### 2026-04-30 — Initial Discovery
- architecture-strategist + code-simplicity-reviewer flagged.
