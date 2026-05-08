---
status: complete
priority: p3
issue_id: "087"
tags: [code-review, architecture, maintainability]
dependencies: []
---

# Extract keeper identification to shared constant/predicate

## Problem Statement
Keeper identification via `source === "prior_season"` is used in 4+ places across the codebase. No shared constant or predicate exists.

## Proposed Solutions
Extract `KEEPER_SOURCE = "prior_season"` and `isKeeperRoster(r)` predicate to a shared location (e.g., `server/src/lib/sportConfig.ts`).
- **Effort**: Small

## Technical Details
- **Affected files**: `server/src/lib/sportConfig.ts`, `server/src/features/mlb-feed/routes.ts`, `server/src/features/auction/routes.ts`, `server/src/features/keeper-prep/services/keeperPrepService.ts`, `server/src/features/commissioner/services/CommissionerService.ts`

## Work Log
| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-24 | Created from architecture review | Convention well-established but fragile |
