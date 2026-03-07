---
status: pending
priority: p2
issue_id: "052"
tags: [code-review, security]
dependencies: []
---

# Audit Log Coverage Gaps on Mutating Endpoints

## Problem Statement
Several mutating endpoints lack `writeAuditLog()` calls: roster add-player, roster delete, trade proposals, trade accept/reject, keeper selections.

## Findings
- **Architecture Strategist**: Identified 5+ endpoints without audit logging
- **Location**: `server/src/features/roster/routes.ts`, `server/src/features/trades/routes.ts`, `server/src/features/leagues/routes.ts`

## Proposed Solutions
### Option A: Add writeAuditLog to missing endpoints (Recommended)
- **Effort**: Small | **Risk**: Low

## Acceptance Criteria
- [ ] `writeAuditLog` on roster add-player and delete
- [ ] `writeAuditLog` on trade propose, accept, reject
- [ ] `writeAuditLog` on keeper selection save

## Work Log
| Date | Action | Notes |
|------|--------|-------|
| 2026-03-06 | Created | Found by architecture-strategist |
