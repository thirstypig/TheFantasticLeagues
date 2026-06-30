---
status: complete
priority: p3
issue_id: 296
tags: [code-review, tests, standings, coverage]
dependencies: []
---

## Problem Statement

The test titled "counts a two-way player's pitching to the pitcher slot and hitting elsewhere" (`fangraphs-audit.test.ts:99-110`) does not exercise the two-way branch. Its fixture uses a **non**-two-way pitcher (`mlbId: null` → `isTwoWay = false`; the comment even calls it a "control case"), so it just re-asserts what test #1 already covers (9 K credited to pitching). The genuinely untested logic — the `countHitting`/`countPitching` split when `isTwoWay === true` (a player in `TWO_WAY_PLAYERS` assigned as hitter vs pitcher) — has no coverage.

## Findings

- **File**: `server/src/scripts/__tests__/fangraphs-audit.test.ts:99-110`.
- **Severity**: P3 — coverage gap + misleading title, not a defect. Flagged by both code-simplicity-reviewer and kieran-typescript-reviewer.

## Proposed Solutions

### Option A (recommended) — make it a real two-way test
Use an `mlbId` that is in `TWO_WAY_PLAYERS`, assigned once as a hitter and once as a pitcher, and assert the hitting-only / pitching-only split (Ohtani-style). Covers the actual branch.
- **Effort**: Small. **Risk**: None.

### Option B — delete it
Remove as redundant with test #1.
- **Effort**: Trivial. **Cons**: leaves the two-way split untested.

## Recommended Action

(blank — triage)

## Acceptance Criteria

- [ ] Either a real two-way split test exists (Option A) or the redundant test is removed (Option B).
- [ ] Test title matches what it asserts.
- [ ] `git mv` this todo to complete.

## Work Log

- 2026-06-29: Filed from `/ce:review` (code-simplicity + kieran-typescript-reviewer, P3).
- 2026-06-29: RESOLVED (PR fix/review-followups). A "real" two-way test isn't possible — `TWO_WAY_PLAYERS` is intentionally EMPTY (Ohtani split into separate player records; "do NOT re-populate"). So the two-way split is inert by design. Rewrote the test to pin that actual current behavior: a non-two-way player gets BOTH hitting (R) and pitching (K) credited regardless of slot, with an accurate title + comment explaining why. Guards against a future two-way change silently altering audit totals. Audit tests green (5).
