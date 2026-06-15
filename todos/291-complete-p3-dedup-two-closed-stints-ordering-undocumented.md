---
status: pending
priority: p3
issue_id: 291
tags: [code-review, quality, roster, teams]
dependencies: []
---

## Problem Statement

The server-side dedup block in `GET /api/teams/:id/period-roster` (`routes.ts` lines 460–467) has a documented invariant for the active-row case (prefer `releasedAt === null`) but does not document its behavior when a player has **two closed stints with no active row** (drop-and-reacquire-and-drop scenario).

In that case, the dedup keeps the **last row in iteration order** (which is `acquiredAt: asc`, so the most recently acquired stint wins). This is correct behavior — the later stint is more relevant for historical audit — but it is an implicit invariant that a future reader cannot derive from the comment alone.

The comment currently reads:
> "prefer the active row (releasedAt === null) so drop-and-reacquire shows the current stint"

It does not mention what happens when there is no active row.

## Findings

- **File**: `server/src/features/teams/routes.ts`, lines 460–467
- **Severity**: P3 — the behavior is correct; only the documentation is incomplete
- **Practical likelihood**: Rare (two drops of the same player in one period), but OGBA's wire-list system does allow this

## Proposed Solution

Add one sentence to the dedup comment:

```ts
// Deduplicate multiple stints of the same player within the period —
// prefer the active row (releasedAt === null) so drop-and-reacquire shows
// the current stint. Stats are per-player (one PSP row), so collapsing
// stints loses nothing. When all stints are closed, the last-acquired
// stint wins (rows are ordered acquiredAt: asc).
```

- **Effort**: Trivial
- **Risk**: None

## Acceptance Criteria

- [ ] Dedup block comment documents the two-closed-stints ordering behavior
- [ ] `git mv` this todo to complete

## Work Log

- **2026-06-13**: Created via code review of PR #400 (TypeScript reviewer P3, architecture P3-A). Behavior is correct; documentation is the gap.
