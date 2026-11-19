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
- [x] grep finds no import of `features/chat` before deleting.
- [x] Both directories and the commented-out lines removed; client + server tsc and tests green.
- [x] Feature-isolation baseline updated if it listed chat imports.
- [x] `git mv` this todo from pending → complete.

## Work Log
- 2026-11-18: done — deleted server/src/features/chat, client/src/features/chat and the uncalled no-op server/src/lib/chatUtils.ts (postSystemChatMessage had zero callers), plus the commented-out lines in index.ts/App.tsx. Kept the /chat → /board redirect. Baseline had no chat imports. Module counts in CLAUDE.md/feature-modules.md set to measured values (33 server, 26 shared). ChatMessage/ChatReadCursor tables are EMPTY in prod (0 rows, read-only check) but left in the schema: dropping them needs a migration and gets its own PR. Browser: /chat lands on League Board, /api/chat 404, server healthy.
- 2026-11-18: filed while answering inbox C-008.
