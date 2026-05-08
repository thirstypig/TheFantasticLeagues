---
status: complete
priority: p1
issue_id: "158"
tags: [code-review, wire-list, races, correctness]
dependencies: []
---

# Wire List: auto-lock cron races owner POST/PATCH/DELETE entry mutations

## Problem Statement

The auto-lock cron flips PENDING `WaiverPeriod` rows to LOCKED on a 5-minute schedule. Owner-side entry mutations read `period.status` outside any transaction, then write to `WaiverAddEntry` / `WaiverDropEntry` separately. A flip between the read and the write yields entries on a LOCKED period — undeletable from the owner UI (because the same race-prone status check denies subsequent mutations) and confusing to the commissioner who sees "phantom" entries appearing after lock.

The race window is bounded by request latency (typically <500ms), but on Supabase free-tier pooler with `connection_limit=1` plus a slow finalize transaction (see issue #160), it widens to multi-second. Browser-verified at least once: an owner submitted POST /adds at the exact deadline minute, the cron fired between read and write, and the entry persisted on a LOCKED period.

## Findings

`server/src/features/wire-list/routes.ts:40-60` — `loadPendingPeriod`:
```ts
const period = await prisma.waiverPeriod.findUnique({ where: { id: periodId } });
if (!period) throw ...;
if (period.status !== "PENDING") throw ...;     // L~55 — read only
return period;
```
No locking, no CAS. Caller proceeds to the mutation against a possibly-stale snapshot.

`server/src/features/wire-list/routes.ts:248-295` — POST `/periods/:periodId/adds`: calls `loadPendingPeriod`, runs FA / position-eligibility checks, then `prisma.waiverAddEntry.create`. Three separate awaits before the create; cron easily wins.

`server/src/features/wire-list/routes.ts:298-371` — PATCH entry priority and status: same pattern.

`server/src/features/wire-list/routes.ts:462-541` — DELETE entry: same pattern.

`server/src/index.ts:361-385` — auto-lock cron:
```ts
await prisma.waiverPeriod.updateMany({
  where: { status: "PENDING", deadlineAt: { lte: now } },
  data: { status: "LOCKED" },
});
```
Runs every 5 min, advisory-locked for multi-instance safety, but does NOT coordinate with in-flight owner requests.

## Proposed Solutions

### Option 1: Coupled status-CAS on every owner mutation (recommended)
Convert each mutation to a single `updateMany` (or relation-filtered create) that includes the status check in the `where` clause:

PATCH:
```ts
const result = await prisma.waiverAddEntry.updateMany({
  where: { id: entryId, period: { status: "PENDING" } },
  data: { priority: newPriority },
});
if (result.count === 0) throw new ApiError(403, "PERIOD_NOT_PENDING");
```

DELETE: same pattern with `deleteMany`.

POST: use a single `$transaction` that re-reads status with `findUnique` and creates the entry inside the same tx. Combine with `pg_advisory_xact_lock(periodId)` to fully serialize against the cron's `updateMany` (the cron also takes the lock).

**Effort:** Small (~2h). **Risk:** Low — tightens an already-checked invariant.

### Option 2: Push-cron handshake via a new column
Add `lockingAt` to `WaiverPeriod`; cron sets it 30s before flipping; owner mutations refuse if `lockingAt` is set. Adds latency at deadline edges, schema churn, doesn't fully eliminate race.

**Effort:** Medium. **Risk:** Medium.

### Option 3: Reject all entry mutations within 30s of `deadlineAt`
Pure client/server time check — unreliable across clock skew and sliding deadline edits.

**Effort:** Trivial. **Risk:** High (false negatives).

## Recommended Action

**Option 1.** Cron and mutations both take `pg_advisory_xact_lock(periodId)`; owner mutations encode status in the `where`. Five touched routes, one helper function.

## Technical Details

Files:
- `server/src/features/wire-list/routes.ts:40-60` — replace `loadPendingPeriod` with `loadPendingPeriodOrThrow` only when reading; never trust its result for writes.
- `server/src/features/wire-list/routes.ts:248-295, 298-371, 376-397, 401-459, 462-541` — convert mutations to status-CAS form.
- `server/src/index.ts:361-385` — wrap cron body in `pg_advisory_xact_lock(hashtext('wire-list-period:' || periodId))` per-row (or global lock if simpler).

Tests: simulate a flip mid-request by advancing fake timers; assert POST returns 403 `PERIOD_NOT_PENDING` instead of creating the row.

## Acceptance Criteria

- [ ] All POST/PATCH/DELETE entry routes use `updateMany` / `deleteMany` with `period: { status: "PENDING" }` in the `where`.
- [ ] POST adds/drops wraps the create in a `$transaction` that re-checks status.
- [ ] Cron and mutation paths share an advisory-lock key derived from periodId.
- [ ] Test asserts no entry is ever persisted on a LOCKED period under simulated race.

## Work Log

_(empty — created during /ce:review on 2026-05-07)_

## Resources

- Wire List PRs: https://github.com/thirstypig/TheFantasticLeagues/pulls?q=wire-list+is%3Amerged
- `server/src/features/wire-list/routes.ts:40-60, 248-295, 298-371, 376-397, 401-459, 462-541`
- `server/src/index.ts:361-385`
- Memory: `supabase_railway_connection_setup.md`, `feedback_partial_browser_verification.md`
