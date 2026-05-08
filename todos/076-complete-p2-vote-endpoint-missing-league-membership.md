---
status: complete
priority: p2
issue_id: "076"
tags: [code-review, security, authorization]
dependencies: []
---

# Missing requireLeagueMember on vote endpoint

## Problem Statement
`POST /api/mlb/league-digest/vote` uses `requireAuth` and `validateBody` but does NOT use `requireLeagueMember("leagueId")`. Any authenticated user can vote on any league's digest by supplying an arbitrary leagueId. The GET endpoint correctly includes `requireLeagueMember`.

## Findings
- `server/src/features/mlb-feed/routes.ts:411`: missing `requireLeagueMember("leagueId")`
- Compare with GET endpoint at line 287 which correctly uses it
- Impact: poll manipulation (not data corruption), but violates authorization model

## Proposed Solutions

### Solution A: Add requireLeagueMember (Recommended)
One-line fix: add `requireLeagueMember("leagueId")` after `validateBody(voteSchema)`.
- **Pros**: Consistent with GET endpoint, follows middleware ordering convention
- **Cons**: None
- **Effort**: Small (1 line)
- **Risk**: None

## Technical Details
- **Affected files**: `server/src/features/mlb-feed/routes.ts`

## Acceptance Criteria
- [ ] `requireLeagueMember("leagueId")` added to vote POST middleware chain
- [ ] Middleware order: requireAuth → validateBody → requireLeagueMember → asyncHandler

## Work Log
| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-24 | Created from security review | Compare with GET endpoint pattern |
