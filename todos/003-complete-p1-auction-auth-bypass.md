---
status: complete
priority: p1
issue_id: "003"
tags: [code-review, security]
dependencies: []
---

# Auction Nominate/Bid Endpoints Accept Arbitrary Team IDs

## Problem Statement
`POST /api/auction/nominate` and `POST /api/auction/bid` use `requireAuth` but do NOT verify that the authenticated user owns `nominatorTeamId` or `bidderTeamId`. Any authenticated user can nominate/bid on behalf of any team.

## Findings
- **Security Sentinel**: Rated HIGH — exploitable by any authenticated user
- Both endpoints also lack Zod input validation (no `validateBody()`)
- Could corrupt in-memory auction state with invalid types

## Proposed Solutions

### Option A: Add ownership check + Zod validation
- Add `requireTeamOwner` or inline ownership check for team IDs
- Add Zod schemas for both endpoints (validate amounts, IDs)
- **Effort**: Medium | **Risk**: Low

## Technical Details
- **Affected file**: `server/src/features/auction/routes.ts` (lines 185, 232)

## Acceptance Criteria
- [ ] `/nominate` verifies user owns `nominatorTeamId`
- [ ] `/bid` verifies user owns `bidderTeamId`
- [ ] Both endpoints have Zod schema validation
- [ ] Tests cover unauthorized team ID rejection
