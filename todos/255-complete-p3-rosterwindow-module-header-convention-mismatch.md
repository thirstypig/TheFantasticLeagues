---
status: pending
priority: p3
issue_id: 255
tags: [code-review, documentation, rosterWindow]
dependencies: []
---

## Problem Statement

`rosterWindow.ts` line 6–8 declares a module-level convention stating all windows are half-open `[acquiredAt, releasedAt)` — meaning `releasedAt` is always exclusive. But `overlapsPeriod` uses `releasedAt >= period.startDate` (inclusive on the lower period boundary), which flatly contradicts this. The function JSDoc correctly documents this as intentional, but the module header remains misleading for anyone who reads top-down.

## Findings

From kieran-typescript-reviewer:
- Module header at lines 6–8: declares `[acquiredAt, releasedAt)` half-open convention
- `overlapsPeriod` line 160: uses `releasedAt >= period.startDate` (inclusive — player released on period day 1 counts as overlapping)
- `ownedOn` line 179: uses `releasedAt > date` (strict exclusive — matches the module convention)
- `clampToPeriod`: uses `releasedAt < period.endDate` (strict exclusive on the upper end — consistent)
- Result: three predicates have three different `releasedAt` boundary semantics (>=, >, <)

## Proposed Solutions

**Option A — Narrow the module header to apply only to mutation helpers (Recommended)**

Update the module header to say the `[acquiredAt, releasedAt)` convention applies to the mutation-time helpers (`assertNoOwnershipConflict` etc.) and note that the stats-attribution section below has distinct boundary semantics documented per-function.

Effort: Tiny | Risk: None

## Technical Details

Affected files:
- `server/src/lib/rosterWindow.ts` lines 6–8 (comment only, no logic change)

## Acceptance Criteria

- [ ] Module header no longer implies a single `releasedAt` exclusivity rule for the entire module
- [ ] Each of the three stats-attribution predicates retains its own JSDoc boundary description (already present)

## Work Log

2026-06-04 — Surfaced by kieran-typescript-reviewer and code-simplicity-reviewer. Documentation-only fix.
