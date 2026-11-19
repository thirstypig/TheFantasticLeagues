---
priority: p3
issue_id: "332"
tags: [cleanup]
dependencies: []
---

# Delete the retired chat feature's code

## Problem Statement
Chat was retired in favour of the League Board (32500218). `server/src/index.ts` keeps only
commented-out imports and mounts, and nothing imports `server/src/features/chat/` or
`client/src/features/chat/` (grep, 2026-11-18). Answered inbox question C-008.

## Proposed Solution
Delete both directories and the commented-out lines in `index.ts`. Check the
feature-isolation baseline and any tests that reference chat. Drop the `ChatMessage`-style
tables only in a separate, deliberate migration, if they exist and are empty in prod.

## Acceptance Criteria
- [ ] grep finds no import of `features/chat` before deleting.
- [ ] Both directories and the commented-out lines removed; client + server tsc and tests green.
- [ ] Feature-isolation baseline updated if it listed chat imports.
- [ ] `git mv` this todo from pending → complete.

## Work Log
- 2026-11-18: filed while answering inbox C-008.
