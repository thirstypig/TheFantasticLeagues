---
status: complete
priority: p2
issue_id: "082"
tags: [code-review, quality, ux]
dependencies: []
---

# Empty catch block in vote handler — no user feedback on error

## Problem Statement
`Home.tsx` line 501: `} catch {} finally { setVoting(false); }` silently swallows all errors from the vote POST. The user gets no feedback if voting fails.

## Proposed Solutions
Add a toast notification: `catch (e) { toast("Vote failed", "error"); }`. The app already uses `useToast` (imported on line 8).
- **Effort**: Small (1-line change)

## Technical Details
- **Affected files**: `client/src/pages/Home.tsx`

## Acceptance Criteria
- [ ] Failed vote shows toast error
- [ ] Successful vote behavior unchanged

## Work Log
| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-24 | Created from TypeScript + security review | |
