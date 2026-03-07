---
status: pending
priority: p2
issue_id: "066"
tags: [code-review, quality]
dependencies: []
---

# Auth Routes Still Use Manual try/catch Instead of asyncHandler

## Problem Statement
`handleGetMe` and `handleDevLogin` in `server/src/features/auth/routes.ts` still use manual try/catch blocks instead of `asyncHandler`. This is the only route file that retains manual error handling after the asyncHandler migration.

## Findings
- **Pattern Recognition**: Flagged as the only route file not using asyncHandler for its primary handlers
- The handlers are wired directly: `router.get("/me", handleGetMe)` instead of `router.get("/me", asyncHandler(handleGetMe))`
- handleDevLogin returns specific 400/500 for business logic errors which could be preserved with asyncHandler + explicit catches

## Proposed Solutions

### Option A: Wrap in asyncHandler, keep business-logic catches
- Wrap both handlers in asyncHandler
- Keep inner try/catch only where specific error codes (400, 500) are returned for business logic
- **Effort**: Small | **Risk**: Low

## Technical Details
- **Affected file**: `server/src/features/auth/routes.ts`

## Acceptance Criteria
- [ ] Both handlers wrapped in asyncHandler
- [ ] Unhandled errors forwarded to global error handler
- [ ] Business-logic error responses preserved
