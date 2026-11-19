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
- [x] Decision recorded.
- [x] Branch built into a PR or deleted locally and on origin.
- [x] C-005 resolved.
- [x] `git mv` this todo from pending → complete.

## Work Log
- 2026-11-18: James chose to park it. Spec (rev 2, 9e1bdfd3 — the local-only reviewed version) copied to main as DOC-044 (status deprecated, parked note); PRD-001 notes it is parked; branch deleted locally and on origin. C-005 was already resolved (moot).
- 2026-11-18: filed from the todo/design-review/open-items sweep.
