---
priority: p3
issue_id: "330"
tags: [docs]
dependencies: []
---

# Docs inbox: 9 open questions/requests besides C-001/C-002

## Problem Statement
`docs/INBOX.md` has open items from 2026-07-23: C-003 (glossary: wire list vs waivers — waivers are retired since #466; franchise vs team), C-004 (is VITE_POSTHOG_KEY set in Railway prod?), C-006, C-007, C-008 (chat REST router dead?), C-009 (todo status: filename vs frontmatter), C-010, C-011.

## Proposed Solution
Answer each in its doc, resolve in `docs/_comments.json` with a link, regenerate the inbox. C-004 is a read-only Railway variable check.

## Acceptance Criteria
- [ ] Every listed item resolved or explicitly deferred with a reason.
- [ ] `node scripts/sync-inbox.mjs` shows the new count.
- [ ] `git mv` this todo from pending → complete.

## Work Log
- 2026-11-18: filed from the todo/design-review/open-items sweep.
