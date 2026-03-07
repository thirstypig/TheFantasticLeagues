---
status: complete
priority: p1
issue_id: "037"
tags: [code-review, security, audit]
dependencies: []
---

# Archive Routes Missing ALL Audit Logging

## Problem Statement
The archive module has 21 write endpoints (import, sync, auto-match, recalculate, update team/player names, manual match) but zero `writeAuditLog()` calls. These endpoints perform destructive, admin-only operations on historical data with no audit trail.

## Findings
- **Source**: pattern-recognition-specialist, security-sentinel
- **Location**: `server/src/features/archive/routes.ts` — all POST/PATCH/DELETE endpoints
- **Impact**: Admin operations on archive data are invisible in audit log. No way to trace who imported/modified historical data.
- All other admin/commissioner modules already have audit logging

## Proposed Solutions

### Option A: Add writeAuditLog to all archive write endpoints
- Add audit calls to import-excel, sync, auto-match, archive-current, recalculate-all, update-team, update-player, manual-match endpoints
- Use consistent action names: `ARCHIVE_IMPORT`, `ARCHIVE_SYNC`, `ARCHIVE_MATCH`, etc.
- **Pros**: Full coverage, consistent with other modules
- **Cons**: ~10 audit calls to add
- **Effort**: Small
- **Risk**: Low (fire-and-forget pattern)

## Technical Details
- **Affected files**: `server/src/features/archive/routes.ts`
- **Pattern**: Follow existing `writeAuditLog({ userId: req.user!.id, action, resourceType, metadata })` pattern

## Acceptance Criteria
- [ ] All archive POST/PATCH/DELETE endpoints log to audit trail
- [ ] Action names are descriptive and consistent
- [ ] Metadata includes relevant context (year, team, player IDs)
