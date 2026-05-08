---
status: complete
priority: p2
issue_id: "080"
tags: [code-review, simplicity, dead-code]
dependencies: []
---

# Unused nonKeepers variable in mlb-feed/routes.ts

## Problem Statement
`nonKeepers` is computed on line 346 but never referenced. Dead code that allocates an array per team on every digest generation.

## Proposed Solutions
Delete line 346. One-line fix.

## Technical Details
- **Affected files**: `server/src/features/mlb-feed/routes.ts`

## Acceptance Criteria
- [ ] `nonKeepers` line removed
- [ ] Tests pass

## Work Log
| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-24 | Created — flagged by all 5 review agents | |
