---
status: complete
priority: p1
issue_id: "025"
tags: [code-review, security, idor]
dependencies: []
---

# Trade Proposal IDOR — proposerTeamId Not Verified Against LeagueId

## Problem Statement
In `server/src/features/trades/routes.ts`, the POST `/propose` endpoint accepts `proposerTeamId` and `targetTeamId` from the request body but does not verify that these teams actually belong to the same league (or the authenticated user's league). An attacker could propose trades involving teams from other leagues.

## Findings
- **Source**: security-sentinel agent
- **Location**: `server/src/features/trades/routes.ts` — POST `/propose`
- **Severity**: HIGH — allows cross-league data manipulation
- The endpoint uses `requireAuth` but does not check league membership or team ownership

## Proposed Solutions

### Option A: Add requireLeagueMember + ownership check
- Verify `proposerTeamId` belongs to the authenticated user
- Verify both teams belong to the same league
- **Pros**: Comprehensive protection
- **Cons**: Requires 2 DB lookups
- **Effort**: Small
- **Risk**: Low

### Option B: Add a single Prisma query with joins
- Query team + league membership in one call
- **Pros**: Single DB hit
- **Cons**: More complex query
- **Effort**: Small
- **Risk**: Low

## Recommended Action
Option A — straightforward and readable.

## Technical Details
- **Affected files**: `server/src/features/trades/routes.ts`
- **Related**: Todo 004 (roster ownership checks), Todo 020 (extract ownership helpers)

## Acceptance Criteria
- [ ] proposerTeamId verified to belong to authenticated user
- [ ] Both teams verified to belong to same league
- [ ] Returns 403 if ownership/membership check fails
- [ ] Test covers cross-league trade rejection

## Work Log
| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-05 | Created from code review | Found by security-sentinel agent |

## Resources
- PR branch: `security/p0-fixes`
