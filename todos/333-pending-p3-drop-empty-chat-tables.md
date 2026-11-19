---
priority: p3
issue_id: "333"
tags: [database, cleanup]
dependencies: []
---

# Drop the empty ChatMessage and ChatReadCursor tables

## Problem Statement
Chat code was deleted in #525. The `ChatMessage` and `ChatReadCursor` Prisma models remain, with relations on League and User. Both tables had 0 rows in prod on 2026-11-18 (read-only check).

## Proposed Solution
One migration that drops both tables and removes the models and relation fields. Plain `DROP TABLE` (never CONCURRENTLY); re-check row counts in prod right before merging. Watch the deploy for P3009.

## Acceptance Criteria
- [ ] Prod row counts re-checked at 0 before merge.
- [ ] Migration drops both tables; schema models and relations removed; tsc + tests green.
- [ ] Railway deploy SUCCESS and `/api/health` reports the merge SHA.
- [ ] `git mv` this todo from pending → complete.

## Work Log
- 2026-11-18: filed.
