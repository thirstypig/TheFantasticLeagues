---
status: complete
priority: p2
issue_id: "079"
tags: [code-review, quality, react]
dependencies: []
---

# IIFE pattern in Home.tsx vote buttons — extract to component level

## Problem Statement
The vote handler uses an IIFE inside JSX (lines 490-533) which is not idiomatic React. `handleVote` only depends on values already in component scope. The IIFE re-creates the function on every render and reduces readability.

## Proposed Solutions

### Solution A: Lift handleVote to component scope (Recommended)
Move `handleVote` to a regular async function at component level. Derive `myVote` as a const above the return.
- **Effort**: Small (-4 lines net, readability win)

### Solution B: Extract DigestVotePoll sub-component
Create a small `<DigestVotePoll>` component for the entire vote section.
- **Effort**: Medium (more separation but adds a new component)

## Technical Details
- **Affected files**: `client/src/pages/Home.tsx`

## Acceptance Criteria
- [ ] IIFE removed
- [ ] handleVote is a regular function in component scope
- [ ] Vote functionality unchanged

## Work Log
| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-24 | Created from TypeScript + simplicity review | |
