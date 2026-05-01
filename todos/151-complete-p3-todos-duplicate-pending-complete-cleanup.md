---
status: pending
priority: p3
issue_id: "151"
tags: [code-review, cleanup, todos]
dependencies: []
---

# Delete duplicate `*-pending-*` and `*-complete-*` files in `todos/`

## Problem Statement

PRs #178 and #179 broke the `git mv` rename pattern other todos in the batch (#085, #088, #093, etc.) used. They added the `*-complete-*` versions of the files but didn't delete the `*-pending-*` originals. Three pairs coexist on disk:

- `todos/113-complete-p2-dashboard-cleanup-sweep.md` + `113-pending-p2-dashboard-cleanup-sweep.md`
- `todos/114-complete-p2-expose-extended-stats-in-api.md` + `114-pending-p2-expose-extended-stats-in-api.md`
- `todos/115-complete-p2-standalone-awards-endpoint.md` + `115-pending-p2-standalone-awards-endpoint.md`

Note: `docs/plans/` and `docs/solutions/` files are protected pipeline artifacts and out of scope. The duplicates here are in `todos/` only.

## Findings

- `ls todos/` confirms three duplicate pairs

## Proposed Solutions

### Option 1: Delete the three `*-pending-*` files (recommended)

The `*-complete-*` versions are the up-to-date ones; the `pending` versions are stale.

**Effort:** Trivial (~5 min). **Risk:** None.

## Recommended Action

Option 1.

## Technical Details

- `todos/113-pending-p2-dashboard-cleanup-sweep.md`
- `todos/114-pending-p2-expose-extended-stats-in-api.md`
- `todos/115-pending-p2-standalone-awards-endpoint.md`

## Acceptance Criteria

- [ ] No duplicate `pending`/`complete` pairs remain in `todos/`
- [ ] `git status` clean after delete

## Resources

- Simplicity review under /ce:review 2026-04-30

## Work Log

### 2026-04-30 — Initial Discovery
- code-simplicity-reviewer flagged duplicate pairs.
