---
status: complete
priority: p2
issue_id: "018"
tags: [code-review, quality]
dependencies: []
---

# Remove 174 Lines of Dead Code in admin/routes.ts

## Problem Statement
`server/src/features/admin/routes.ts` has duplicate route definitions. Lines 40-151 and 235-259 both define `POST /admin/league`. Lines 162-216 and 266-286 both define `POST /admin/league/:leagueId/members`. Express uses the LAST registered handler, making the first definitions (174 lines) unreachable dead code.

## Findings
- **Pattern Recognition**: Found during route registration analysis
- Dead code sections:
  - Lines 40-151: First `POST /admin/league` (dead)
  - Lines 162-216: First `POST /admin/league/:leagueId/members` (dead)

## Proposed Solutions

### Option A: Delete the first (dead) definitions (Recommended)
Remove lines 40-216 (the dead route handlers). Keep the active definitions at lines 235+.

**Pros**: Removes 174 lines of unreachable code. Eliminates confusion.
**Cons**: Need to verify the active definitions have all needed functionality.
**Effort**: Small (30 min)
**Risk**: Low — code is already unreachable

## Acceptance Criteria
- [ ] No duplicate route definitions in admin/routes.ts
- [ ] Active route handlers retain full functionality
- [ ] Tests pass

## Work Log
- 2026-03-06: Created from code review synthesis
