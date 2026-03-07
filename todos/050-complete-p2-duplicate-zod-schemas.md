---
status: pending
priority: p2
issue_id: "050"
tags: [code-review, quality]
dependencies: []
---

# Duplicate Zod Schemas Across Admin and Commissioner Routes

## Problem Statement
`addMemberSchema` is defined identically in both `admin/routes.ts` and `commissioner/routes.ts`. Violates DRY — changes to one won't propagate to the other.

## Findings
- **TypeScript Reviewer**: M14
- **Pattern Recognition**: Medium severity
- **Architecture Strategist**: Confirmed, recommends shared location
- **Location**: `server/src/features/admin/routes.ts` line 24, `server/src/features/commissioner/routes.ts` line 29

## Proposed Solutions
### Option A: Extract to `server/src/lib/schemas.ts` (Recommended)
- **Effort**: Small | **Risk**: Low

## Acceptance Criteria
- [ ] Single `addMemberSchema` definition in shared location
- [ ] Both routes import from shared location
- [ ] No duplicate schema definitions remain

## Work Log
| Date | Action | Notes |
|------|--------|-------|
| 2026-03-06 | Created | Found by 3 review agents |
