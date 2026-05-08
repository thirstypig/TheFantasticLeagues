---
status: complete
priority: p2
issue_id: "168"
tags: [code-review, wire-list, tests, reducer]
dependencies: []
---

# Wire List: reducer state machine has zero test coverage; only Zod schemas tested

## Problem Statement

`server/src/features/wire-list/__tests__/processor.test.ts` is ~100 LOC and covers Zod schema validation only. The 655-LOC reducer (`processor.ts`) — consume/free, revert, finalize transaction, auto-lock cron — has no direct test coverage. This is the riskiest surface in the feature and the last place we want to rely on production for regression detection.

The state machine's invariants are non-obvious (priority-2 drop consumption on second add, revert returning drop to PENDING, finalize-blocked when adds remain pending) and any drift will surface as roster corruption.

## Findings

- `server/src/features/wire-list/__tests__/processor.test.ts` — 100 LOC, Zod-only
- Untested behaviors:
  - `succeed` then `revert` returns the consumed drop to `PENDING`
  - `succeed` of a second add consumes the priority-2 drop (not priority-1 again)
  - `succeed` when no drop is `PENDING` returns 409 `NO_DROP_AVAILABLE`
  - `finalize` with any add still `PENDING` returns 409 `FINALIZE_BLOCKED`
  - `finalize` happy path commits roster + 2 TransactionEvents in one transaction
  - Auto-lock cron flips PENDING→LOCKED past `deadlineAt` only

Per project memory `feedback_test_addrops_full_cleanup.md`, any test mutation against the prod-shared DB must reverse BOTH the Roster row AND delete the TransactionEvent rows within the same test.

## Proposed Solutions

### Option 1: Add reducer state-machine tests against a test DB (recommended)
Add tests in `processor.test.ts` covering the six scenarios above. Use the existing integration-test DB pattern (mock Prisma if it covers, else use the integration test DB scaffolding from `__tests__/integration/`).

**Effort:** Medium (~4h, including fixtures). **Risk:** Low.

### Option 2: Test only via routes layer (HTTP-level)
Less invasive but slower; conflates reducer bugs with route bugs.

**Effort:** Medium. **Risk:** Low but weaker signal.

### Option 3: Defer until `processorService` extraction (todo #174)
Tests become much easier once the reducer is extracted from the route handler. Pair with #174.

**Effort:** None now. **Risk:** Continued zero-coverage on the riskiest surface.

## Recommended Action

**Option 3 + Option 1**: do #174 first if scheduled in the same window, then add the six tests. If #174 slips, do Option 1 directly against current code.

## Technical Details

- File: `server/src/features/wire-list/__tests__/processor.test.ts`
- Test DB cleanup must reverse Roster + TransactionEvent rows (memory `feedback_test_addrops_full_cleanup.md`)
- Mirrors `server/src/__tests__/integration/waiver-roster.test.ts` pattern

## Acceptance Criteria

- [ ] Test: succeed-then-revert returns drop to PENDING
- [ ] Test: succeed of second add consumes priority-2 drop
- [ ] Test: succeed-when-no-pending-drop returns 409 NO_DROP_AVAILABLE
- [ ] Test: finalize-with-pending-add returns 409 FINALIZE_BLOCKED
- [ ] Test: finalize happy-path creates Roster + 2 TransactionEvents in same transaction
- [ ] Test: auto-lock flips PENDING→LOCKED only past `deadlineAt`
- [ ] All test cleanup reverses Roster + TransactionEvent

## Work Log

_(empty — created during /ce:review on 2026-05-07)_

## Resources

- Project memory: `feedback_test_addrops_full_cleanup.md`
- File: `server/src/features/wire-list/processor.ts`
- Pattern: `server/src/__tests__/integration/waiver-roster.test.ts`
- Related: todo #174 (processorService extraction)
