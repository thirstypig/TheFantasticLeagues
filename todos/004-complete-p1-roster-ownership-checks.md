---
status: complete
priority: p1
issue_id: "004"
tags: [code-review, security]
dependencies: []
---

# Roster Add/Delete Endpoints Missing Ownership Checks

## Problem Statement
`POST /api/roster/add-player` and `DELETE /api/roster/:id` have `requireAuth` but do not verify the authenticated user owns the team. Any authenticated user can add players to or delete roster entries from any team.

## Findings
- **Security Sentinel**: Rated MEDIUM — any user can manipulate any roster
- `add-player` has Zod validation but no ownership check on `teamCode`
- `delete` has no validation at all beyond `requireAuth`

## Proposed Solutions

### Option A: Add ownership verification
- For `add-player`: verify user owns the team matching `teamCode`
- For `delete`: look up the roster entry, verify user owns the associated team
- **Effort**: Small | **Risk**: Low

## Technical Details
- **Affected file**: `server/src/features/roster/routes.ts` (lines 21, 31)

## Acceptance Criteria
- [ ] `add-player` rejects requests where user doesn't own the team
- [ ] `delete` rejects requests where user doesn't own the roster entry's team
