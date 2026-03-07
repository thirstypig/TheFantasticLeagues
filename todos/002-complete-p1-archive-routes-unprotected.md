---
status: complete
priority: p1
issue_id: "002"
tags: [code-review, security]
dependencies: []
---

# Archive and Roster Import Routes Missing Auth Middleware

## Problem Statement
9 write endpoints in `server/src/features/archive/routes.ts` and 1 in `server/src/features/roster/rosterImport-routes.ts` lack `requireAuth` middleware, violating the CLAUDE.md convention that ALL write endpoints MUST use `requireAuth`.

## Findings
- **Pattern Recognition**: Found 9 unprotected archive POST/PUT/PATCH endpoints
- **Security Sentinel**: Confirmed roster import POST also unprotected
- Endpoints include: import-excel, sync, recalculate, auto-match, archive-current, team updates, stat patches

## Proposed Solutions

### Option A: Add requireAuth/requireAdmin to all write endpoints
- Archive routes are admin operations — use `requireAdmin`
- Roster import should use `requireAuth` at minimum
- **Effort**: Small | **Risk**: Low

## Technical Details
- **Affected files**: `server/src/features/archive/routes.ts`, `server/src/features/roster/rosterImport-routes.ts`

## Acceptance Criteria
- [ ] All POST/PUT/PATCH/DELETE archive endpoints have `requireAdmin`
- [ ] Roster import endpoint has `requireAuth`
- [ ] No write endpoint in the codebase lacks auth middleware
