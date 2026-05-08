---
status: complete
priority: p2
issue_id: "170"
tags: [code-review, wire-list, simplicity, dedup]
dependencies: []
---

# Wire List: outcome handlers triplicate guards; /fail and /skip are byte-identical

## Problem Statement

The four outcome handlers (`/succeed`, `/fail`, `/skip`, `/revert`) each re-implement "must be LOCKED period, must be PENDING entry (or NOT for revert)" guards inline, and `/fail` and `/skip` are byte-for-byte identical except for the literal string and audit action. Auth checks (commissioner-or-admin assertion) are also re-implemented inline at three sites instead of using a single helper. Cumulatively that's ~80 LOC of duplicated logic — every site is its own potential drift surface.

## Findings

**Duplicated guards (4×):**
- `server/src/features/wire-list/processor.ts:390-401` (`/succeed`)
- `processor.ts:506-511` (`/fail`)
- `processor.ts:539-544` (`/skip`)
- `processor.ts:570-581` (`/revert`)

**Identical handlers:** `/fail` (L495-526) and `/skip` (L528-559) differ only in `"FAILED"`/`"SKIPPED"` literal + audit action string.

**Inline auth checks:**
- `processor.ts:100-106`, `:141-147`, `:622-628` — re-implement membership lookup inline
- Only `loadAddEntryAsCommissioner` is factored

## Proposed Solutions

### Option 1: Three small helpers (recommended)
- `ensureLockedPeriodAndPendingEntry(periodId, entryId): { period, entry }` — used by `/succeed`, `/fail`, `/skip` and the inverse for `/revert`
- `recordTerminalOutcome(outcome: "FAILED" | "SKIPPED")` — single body parametrized over outcome
- `assertCommissionerForPeriod(periodIdParam)` — replace three inline auth checks

Net ~80 LOC reduction; one place to harden each invariant.

**Effort:** Small (~2h). **Risk:** Low if paired with reducer tests (todo #168).

### Option 2: Extract full reducer service (todo #174)
Larger refactor; this todo becomes a subset of that one.

**Effort:** Medium. **Risk:** Low (pairs with tests).

### Option 3: Leave as-is
Drift continues; the next "add a new outcome" PR has 4 places to remember.

## Recommended Action

**Option 1** if shipped standalone. **Roll into Option 2** if todo #174 is scheduled in the same window.

## Technical Details

- File: `server/src/features/wire-list/processor.ts`
- Pair with todo #168 (reducer tests) — without tests, dedup risks regressions
- No schema or behavior change

## Acceptance Criteria

- [ ] `/fail` and `/skip` share a single parameterized handler
- [ ] Period+entry guard helper used by all three terminal-outcome routes
- [ ] Commissioner auth helper used by all three commissioner endpoints (no inline `prisma.leagueMembership.findFirst`)
- [ ] Existing tests pass; no observable behavior change

## Work Log

_(empty — created during /ce:review on 2026-05-07)_

## Resources

- File: `server/src/features/wire-list/processor.ts`
- Related: todo #168 (reducer tests), todo #174 (processorService extraction)
