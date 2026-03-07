---
status: pending
priority: p2
issue_id: "064"
tags: [code-review, security, quality]
dependencies: []
---

# Keeper-Prep Routes Missing Zod Validation and Audit Logging

## Problem Statement
The keeper-prep save endpoint uses manual validation instead of Zod schemas, and none of the keeper-prep write endpoints (populate, save, lock, unlock) have audit logging. This is inconsistent with the pattern established across all other route files.

## Findings
- **Pattern Recognition, Security Sentinel**: Both flagged missing Zod validation on `POST /commissioner/:leagueId/keeper-prep/save` (line 87)
- **Pattern Recognition**: Flagged missing audit logging on all 5 keeper-prep write endpoints
- Manual validation at line 87: `!Number.isFinite(Number(teamId))`, `!Array.isArray(keeperIds)` — should use Zod schema

## Proposed Solutions

### Option A: Add Zod schema + audit logging
- Create `keeperPrepSaveSchema` with `teamId` (number), `keeperIds` (number array), `force` (boolean optional)
- Add `writeAuditLog` calls to populate, save, lock, and unlock endpoints
- **Effort**: Small | **Risk**: Low

## Technical Details
- **Affected file**: `server/src/features/keeper-prep/routes.ts`

## Acceptance Criteria
- [ ] `POST /keeper-prep/save` uses `validateBody(keeperPrepSaveSchema)`
- [ ] All write endpoints call `writeAuditLog` after success
