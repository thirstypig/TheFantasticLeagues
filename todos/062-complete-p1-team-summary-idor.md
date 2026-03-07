---
status: pending
priority: p1
issue_id: "062"
tags: [code-review, security]
dependencies: []
---

# Team Summary Endpoint Lacks League Scoping (IDOR)

## Problem Statement
`GET /api/teams/:id/summary` allows any authenticated user to view the full summary (roster, stats, budget) of any team in any league by guessing or enumerating team IDs. This is an IDOR vulnerability. The `GET /api/teams` list endpoint correctly scopes results to the user's leagues, but the detail endpoint does not verify league membership.

## Findings
- **Security Sentinel**: Identified as Medium severity, Medium exploitability
- `server/src/features/teams/routes.ts` line 57: no league membership or ownership check
- Any authenticated user can access any team's full data by ID

## Proposed Solutions

### Option A: Add league membership check after fetching team
- After fetching the team, look up its `leagueId` and verify the requesting user is a member
- Skip check for admins
- **Effort**: Small | **Risk**: Low

### Option B: Add requireLeagueMember middleware
- Modify the route to accept leagueId as a query param and use `requireLeagueMember`
- **Effort**: Medium | **Risk**: Low (requires client-side changes to pass leagueId)

## Technical Details
- **Affected file**: `server/src/features/teams/routes.ts`

## Acceptance Criteria
- [ ] Non-member users receive 403 when requesting a team from a league they don't belong to
- [ ] Admin users can still access any team
- [ ] League members can view teams in their league
