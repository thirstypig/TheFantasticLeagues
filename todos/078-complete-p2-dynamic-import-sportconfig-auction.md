---
status: complete
priority: p2
issue_id: "078"
tags: [code-review, performance, simplicity]
dependencies: []
---

# Dynamic import of sportConfig in auction/routes (already statically imported)

## Problem Statement
`auction/routes.ts:1777` uses `await import("../../lib/sportConfig.js")` for `isPitcher`, but line 11 already statically imports from the same module. This creates unnecessary async overhead per request.

## Proposed Solutions

### Solution A: Add isPitcher to existing static import (Recommended)
Change line 11 to include `isPitcher as isPitcherPos` and remove the dynamic import.
- **Effort**: Small (2-line change)

## Technical Details
- **Affected files**: `server/src/features/auction/routes.ts`

## Acceptance Criteria
- [ ] `isPitcher` added to static import on line 11
- [ ] Dynamic import on line 1777 removed
- [ ] Tests pass

## Work Log
| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-24 | Created from performance + simplicity review | Module already statically imported |
