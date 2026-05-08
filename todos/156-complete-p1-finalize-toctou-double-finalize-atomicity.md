---
status: pending
priority: p1
issue_id: "156"
tags: [code-review, wire-list, correctness, races, finalize]
dependencies: []
---

# Wire List finalize: TOCTOU + double-finalize race + atomicity gap

## Problem Statement

The wire-list finalize flow has three coupled correctness defects: (1) blocker re-validation runs OUTSIDE the `prisma.$transaction`, (2) the period-status check is also outside the tx, (3) `tx.roster.updateMany` matching zero rows fails silently while the matching `tx.roster.create` proceeds — yielding a ghost add to a player who is already on another roster.

State can mutate between the blocker scan and the tx body: a trade can flip the add target to another roster between L181 and L221, turning what was a clean PLAYER_NOT_FA blocker into a silent ghost-add. Two commissioners clicking finalize simultaneously both pass `period.status !== "LOCKED"` at L149 outside any tx, both open `$transaction`, the second only fails AFTER duplicate roster mutations + TransactionEvents have been written.

## Findings

`server/src/features/wire-list/processor.ts:149` — period status check outside any transaction:
```ts
if (period.status !== "LOCKED") throw new Error("PERIOD_NOT_LOCKED");
```

`server/src/features/wire-list/processor.ts:181-215` — blocker re-validation pass runs against `prisma` (not `tx`) before the transaction is opened. Reads roster ownership / position-eligibility state that other writers can mutate concurrently (trades, IL stash, manual roster edits).

`server/src/features/wire-list/processor.ts:221` — `prisma.$transaction(async (tx) => { ... })` opens here, AFTER blocker scan.

`server/src/features/wire-list/processor.ts:~245` — inside the tx:
```ts
await tx.roster.updateMany({
  where: { teamId, playerId: dropPlayerId, releasedAt: null },
  data: { releasedAt: now },
});
await tx.roster.create({ data: { teamId, playerId: addPlayerId, ... } });
```
`updateMany` returns `{ count: 0 }` silently when the drop target was already moved off this roster between blocker scan and tx — no error, but the add still fires, producing a ghost row.

## Proposed Solutions

### Option 1: Move blocker pass into the transaction + atomic period-status CAS (recommended)
- Open `prisma.$transaction` first.
- First statement: `tx.waiverPeriod.update({ where: { id: periodId, status: "LOCKED" }, data: { status: "PROCESSING" } })`. If another finalize already ran, Prisma throws P2025 — translate to a 409 `ALREADY_FINALIZED`.
- Move the entire blocker re-validation pass (currently L181-215) INSIDE the tx, querying `tx.*` only.
- Assert `updateMany.count === 1` for every drop; `count === 0` → throw INSIDE the tx so it rolls back the matching add, the TransactionEvent rows, and the entry-status updates atomically.

**Effort:** Medium (~3-4h with tests). **Risk:** Low — strict tightening of an already-transactional path; no schema changes.

### Option 2: Advisory lock per-period
Wrap finalize in `pg_advisory_xact_lock(period.id)` to serialize. Easier to write, but does not fix the silent `updateMany.count === 0` ghost-add — still need that assertion.

**Effort:** Small. **Risk:** Medium — masks symptom, leaves underlying gap.

### Option 3: Schema-level guard + RETURNING
Replace `updateMany` with raw SQL `UPDATE ... RETURNING id` and require exactly one row. Combine with Option 1's tx-scoped CAS.

**Effort:** Medium. **Risk:** Low.

## Recommended Action

**Option 1 + the count assertion from Option 3.** Single transaction, status CAS as the first write, blocker pass tx-scoped, every drop's `updateMany.count` checked.

## Technical Details

Affected file: `server/src/features/wire-list/processor.ts`. Status enum needs a `PROCESSING` value (or reuse `LOCKED`→`FINALIZED` as a single CAS — simpler if downstream consumers don't care about an in-flight state).

Test additions:
- Concurrent finalize: spawn two `Promise.all` finalize calls; assert exactly one succeeds, the other returns 409.
- Mid-finalize trade: between blocker pass and tx, mutate roster directly in DB; assert tx aborts with no roster create.

## Acceptance Criteria

- [ ] Period status transition is the first write inside `$transaction` and uses CAS (`where: { status: "LOCKED" }`).
- [ ] Blocker re-validation queries use `tx`, not `prisma`.
- [ ] Every `tx.roster.updateMany` for a drop asserts `count === 1`; mismatch throws and rolls back the tx.
- [ ] Concurrent finalize test: only one TransactionEvent row written, the other call returns 409 `ALREADY_FINALIZED`.
- [ ] No ghost-add rows after a mid-finalize roster mutation in tests.

## Work Log

_(empty — created during /ce:review on 2026-05-07)_

## Resources

- Wire List PR range: https://github.com/thirstypig/TheFantasticLeagues/pulls?q=wire-list+is%3Amerged
- `server/src/features/wire-list/processor.ts:149,181-215,221`
- Memory: `feedback_test_addrops_full_cleanup.md` (test cleanup discipline when this lands)
- Prior atomicity precedent: legacy waivers processor in `server/src/features/waivers/routes.ts`
