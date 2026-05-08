---
status: complete
priority: p2
issue_id: "077"
tags: [code-review, security, data-integrity]
dependencies: []
---

# Vote read-modify-write race condition

## Problem Statement
The vote handler performs a read-modify-write on the JSON `data` field without any locking. Two simultaneous votes could cause one to be silently lost.

## Findings
- `server/src/features/mlb-feed/routes.ts:416-429`: reads `insight.data`, modifies `votes` in memory, writes back entire `data` object
- Low probability at current scale (~8 users per league, weekly cadence)

## Proposed Solutions

### Solution A: Wrap in Prisma $transaction (Recommended)
Use `prisma.$transaction()` to narrow the race window.
- **Pros**: Simple, reduces window significantly
- **Cons**: Does not fully eliminate race (READ COMMITTED default)
- **Effort**: Small
- **Risk**: Low

### Solution B: PostgreSQL jsonb_set
Use raw SQL `UPDATE ... SET data = jsonb_set(data, '{votes,<userId>}', '"yes"')` for atomic update.
- **Pros**: Fully atomic, no race
- **Cons**: Raw SQL, less portable
- **Effort**: Medium
- **Risk**: Low

## Technical Details
- **Affected files**: `server/src/features/mlb-feed/routes.ts`

## Acceptance Criteria
- [ ] Vote update wrapped in transaction or uses atomic JSON update
- [ ] Concurrent votes from different users are not lost

## Work Log
| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-24 | Created from security review | Low risk at current scale but worth fixing |
