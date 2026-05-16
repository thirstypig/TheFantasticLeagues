---
status: pending
priority: p1
issue_id: "196"
tags: [code-review, standings, formatting, client, duplication]
dependencies: []
---

# `fmt3Avg` in `base.ts` is a live copy, not a re-export — divergence risk

## Problem Statement

The IEEE 754 AVG rounding fix was applied to `client/src/lib/sports/baseball.ts` as the new canonical location. But `client/src/api/base.ts` still contains a **full independent definition** of `fmt3Avg` — it is NOT a re-export. It happens to have the same fixed formula today, but it is not linked to the canonical source.

`fmtRate` was correctly converted to a re-export (`export { fmtRate } from "../lib/sports/baseball"`). `fmt3Avg` was not.

Any future bug fix applied to `baseball.ts` will silently leave `base.ts` stale. Any consumer importing from `api/base` or `api/index` gets the shadow copy.

## Findings

- **File:** `client/src/api/base.ts` lines ~285–289
- `client/src/api/base.ts` exports: `fmt3Avg(h, ab)` — local definition, correct formula
- `client/src/lib/sports/baseball.ts` exports: `fmt3Avg(h, ab)` — canonical definition, same formula
- `client/src/api/__tests__/base.test.ts` tests the `base.ts` copy — those tests won't catch a drift if canonical is fixed
- `fmtRate` already properly re-exports from `baseball.ts` — `fmt3Avg` should match

## Proposed Solutions

### Option A — Replace definition with re-export (Recommended)
In `client/src/api/base.ts`, replace the local `fmt3Avg` function body with:
```typescript
export { fmt3Avg, fmtRate } from "../lib/sports/baseball";
```
Remove the now-duplicate `fmtRate` re-export line that's already there.
- **Pros:** Single source of truth; test coverage in `base.test.ts` still exercises the canonical implementation via the re-export
- **Effort:** 3 lines changed
- **Risk:** None — same runtime behavior

### Option B — Delete `fmt3Avg` from `base.ts` entirely and update all direct imports
Audit all files importing `fmt3Avg` from `api/base` and redirect them to `lib/sports/baseball`.
- **Pros:** Cleaner; eliminates the backwards-compat re-export
- **Cons:** More files to touch; requires grep audit
- **Effort:** Medium

## Recommended Action

Option A. One-line fix.

## Acceptance Criteria
- [ ] `base.ts` has no local definition of `fmt3Avg` — only a re-export from `../lib/sports/baseball`
- [ ] `base.test.ts` tests for `fmt3Avg` still pass (they will, re-exports are transparent)
- [ ] `tsc --noEmit` clean on client

## Work Log
- 2026-05-15: Identified by TS reviewer and Architecture reviewer. The fix applied `fmtRate` as a re-export but left `fmt3Avg` as a copy.
