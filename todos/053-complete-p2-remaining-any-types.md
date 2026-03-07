---
status: pending
priority: p2
issue_id: "053"
tags: [code-review, quality]
dependencies: []
---

# Remaining `any` Types in Archive Routes and DataService

## Problem Statement
Archive routes still have `as any` casts on Prisma queries and `any[]` for hitters/pitchers arrays. DataService has `any[]` for normalized stats fields. asyncHandler uses `Promise<any>`.

## Findings
- **TypeScript Reviewer**: T4, T5, T7
- **Pattern Recognition**: Confirmed `as any` in archive
- **Location**: `server/src/features/archive/routes.ts`, `server/src/features/players/services/dataService.ts`, `server/src/middleware/asyncHandler.ts`

## Proposed Solutions
### Option A: Replace with proper types
- Archive: define `HistoricalStatEntry` interface, remove `as any` casts
- DataService: type normalized stats arrays with `CsvPlayerRow[]`
- asyncHandler: change `Promise<any>` to `Promise<unknown>`
- **Effort**: Medium | **Risk**: Low

## Acceptance Criteria
- [ ] Zero `any` in archive routes
- [ ] DataService fields properly typed
- [ ] asyncHandler uses `Promise<unknown>`

## Work Log
| Date | Action | Notes |
|------|--------|-------|
| 2026-03-06 | Created | Found by kieran-typescript-reviewer |
