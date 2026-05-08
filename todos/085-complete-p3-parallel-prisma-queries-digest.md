---
status: complete
priority: p3
issue_id: "085"
tags: [code-review, performance]
dependencies: []
---

# Parallel Prisma queries in digest generation path

## Problem Statement
The digest generation endpoint runs 4 sequential Prisma queries (league, teams, recent rosters, previous digest). Queries 1, 2, and 4 are independent and could run in parallel with `Promise.all`.

## Proposed Solutions
Wrap independent queries in `Promise.all([...])`. Query 3 (recent rosters) depends on team IDs so stays sequential.
- **Effort**: Small
- **Impact**: Saves 10-40ms per digest generation (dwarfed by LLM call time)

## Technical Details
- **Affected files**: `server/src/features/mlb-feed/routes.ts`

## Work Log
| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-24 | Created from performance review | Low impact since LLM call dominates |
