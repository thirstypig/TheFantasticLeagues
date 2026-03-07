---
status: pending
priority: p2
issue_id: "054"
tags: [code-review, quality]
dependencies: []
---

# Inner try/catch in asyncHandler Routes Masks 500 Errors as 400

## Problem Statement
Several commissioner/admin routes wrap handlers in `asyncHandler()` but keep an inner `try/catch` that returns 400 for ALL errors. This means genuine 500 errors (DB connection failures, etc.) are incorrectly returned as 400 "business logic" errors.

## Findings
- **TypeScript Reviewer**: M15 — mixed error handling patterns
- **Architecture Strategist**: Confirmed inconsistency, recommends convention
- **Pattern Recognition**: Medium severity
- **Location**: `server/src/features/commissioner/routes.ts` (7 handlers), `server/src/features/admin/routes.ts` (2 handlers), `server/src/features/keeper-prep/routes.ts` (2 handlers)

## Proposed Solutions
### Option A: Catch only specific error types (Recommended)
Create a `ValidationError` class. Inner catch only catches `ValidationError`, re-throws everything else for asyncHandler/global handler.
- **Effort**: Medium | **Risk**: Low

### Option B: Remove inner try/catch, let services throw typed errors
Services throw `ValidationError` for business logic. Global error handler maps `ValidationError` → 400, unknown → 500.
- **Effort**: Medium | **Risk**: Medium (requires service layer changes)

## Acceptance Criteria
- [ ] DB connection errors return 500, not 400
- [ ] Business logic errors (invalid team name, etc.) still return 400
- [ ] Convention documented in CLAUDE.md

## Work Log
| Date | Action | Notes |
|------|--------|-------|
| 2026-03-06 | Created | Found by 3 review agents |
