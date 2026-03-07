---
status: pending
priority: p3
issue_id: "059"
tags: [code-review, quality]
dependencies: []
---

# Inline League Membership Checks Should Use requireLeagueMember Middleware

## Problem Statement
Several routes duplicate inline league membership verification instead of using the existing `requireLeagueMember()` middleware: auction GET /state, teams GET /, leagues GET /:id and /:id/rosters.

## Findings
- **Pattern Recognition**: Medium severity duplication
- **Location**: `auction/routes.ts` line 195, `teams/routes.ts` line 26, `leagues/routes.ts` lines 74, 115

## Proposed Solutions
### Option A: Replace inline checks with requireLeagueMember middleware
- **Effort**: Small | **Risk**: Low

## Acceptance Criteria
- [ ] Inline membership checks replaced with middleware where applicable
- [ ] Routes still handle public league access correctly

## Work Log
| Date | Action | Notes |
|------|--------|-------|
| 2026-03-06 | Created | Found by pattern-recognition-specialist |
