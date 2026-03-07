---
status: pending
priority: p1
issue_id: "046"
tags: [code-review, security]
dependencies: []
---

# Trade Accept/Reject Missing Authorization Check

## Problem Statement
`POST /api/trades/:id/accept` and `POST /api/trades/:id/reject` only check `requireAuth` but do NOT verify the requesting user owns a team involved in the trade. Any authenticated user can accept or reject any pending trade.

## Findings
- **Security Sentinel**: Classified as Medium severity (M3)
- **Agent-Native Reviewer**: Confirmed as Action Parity concern
- **Architecture Strategist**: Confirmed missing ownership check
- **Location**: `server/src/features/trades/routes.ts` lines ~89-154

## Proposed Solutions

### Option A: Inline isTeamOwner check (Recommended)
After fetching the trade, verify `req.user!.id` owns either the proposer team or one of the recipient teams via `isTeamOwner()`. Admins bypass.
- **Pros**: Simple, follows existing roster ownership pattern
- **Cons**: Slightly more DB queries per request
- **Effort**: Small
- **Risk**: Low

### Option B: requireTeamOwner middleware
Extract trade party verification into middleware.
- **Pros**: Reusable, middleware-chain consistent
- **Cons**: Requires fetching trade in middleware AND handler (double query)
- **Effort**: Medium
- **Risk**: Low

## Technical Details
- **Affected files**: `server/src/features/trades/routes.ts`
- **Components**: Trade accept, Trade reject endpoints

## Acceptance Criteria
- [ ] Accept endpoint verifies user owns a team in the trade
- [ ] Reject endpoint verifies user owns a team in the trade
- [ ] Admins can accept/reject any trade
- [ ] Non-party users receive 403
- [ ] Tests added for ownership verification

## Work Log
| Date | Action | Notes |
|------|--------|-------|
| 2026-03-06 | Created | Found by security-sentinel agent |

## Resources
- PR #13: security/p0-fixes branch
