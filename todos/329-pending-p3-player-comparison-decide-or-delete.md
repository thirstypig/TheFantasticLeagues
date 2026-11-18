---
priority: p3
issue_id: "329"
tags: [product, decision]
dependencies: []
---

# Player comparison branch waits on two scope calls

## Problem Statement
`feat/player-comparison` (local + origin) holds a reviewed spec (rev2) awaiting James's sign-off on two scope calls. Inbox question C-005 (build /compare before P1 bugs?) is stale: those todos are complete.

## Proposed Solution
James decides: sign off and build, or delete the branch.

## Acceptance Criteria
- [ ] Decision recorded.
- [ ] Branch built into a PR or deleted locally and on origin.
- [ ] C-005 resolved.
- [ ] `git mv` this todo from pending → complete.

## Work Log
- 2026-11-18: filed from the todo/design-review/open-items sweep.
