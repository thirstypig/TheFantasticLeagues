---
status: complete
priority: p2
issue_id: "029"
tags: [code-review, patterns, duplication]
dependencies: []
---

# normStr/mustOneOf/normCode Duplicated Across Route Files

## Problem Statement
Helper functions `normStr`, `mustOneOf`, and `normCode` are duplicated in multiple route files instead of being imported from a shared utility.

## Findings
- **Source**: pattern-recognition-specialist
- **Location**: Found in at least 3 route files with identical implementations
- `server/src/lib/utils.ts` already has `norm` and `normCode` — these should be reused

## Proposed Solutions

### Option A: Consolidate into utils.ts
- Add `normStr` and `mustOneOf` to `server/src/lib/utils.ts`
- Replace all inline copies with imports
- **Pros**: Single source of truth, easy
- **Effort**: Small
- **Risk**: Low

## Acceptance Criteria
- [ ] All copies of normStr/mustOneOf/normCode removed from route files
- [ ] Shared versions exported from utils.ts
- [ ] All tests pass after consolidation

## Work Log
| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-05 | Created from code review | Found by pattern-recognition-specialist |
