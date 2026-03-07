---
status: complete
priority: p3
issue_id: "032"
tags: [code-review, simplicity]
dependencies: []
---

# Remove Re-Export Shims for Shared Components

## Problem Statement
When PlayerDetailModal and StatsTables were moved to `client/src/components/`, re-export shims were left at the original feature locations. These add indirection without benefit — callers should import directly from the shared location.

## Findings
- **Source**: code-simplicity-reviewer
- **Location**:
  - `client/src/features/players/components/PlayerDetailModal.tsx` (re-export shim)
  - `client/src/features/standings/components/StatsTables.tsx` (re-export shim)

## Proposed Solutions

### Option A: Update all imports and delete shims
- Change all imports to `../../components/PlayerDetailModal` etc.
- Delete the shim files
- **Effort**: Small
- **Risk**: Low

## Acceptance Criteria
- [ ] All imports point to shared component location
- [ ] Shim files deleted
- [ ] TypeScript compiles clean

## Work Log
| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-05 | Created from code review | Found by code-simplicity-reviewer |
