---
status: pending
priority: p1
issue_id: "157"
tags: [code-review, wire-list, security, races, correctness]
dependencies: []
---

# Wire List succeed/revert reducer race; uncaught P2002 leaks 500

## Problem Statement

The succeed/revert reducer reads `nextDrop` outside any transaction, then transitions the drop entry to `CONSUMED` inside a separate `$transaction`. Two concurrent succeeds for the same team observe the same `nextDrop` and race to claim it. The unique constraint on `WaiverAddEntry.consumedDropEntryId` does prevent data corruption, but the loser's update throws raw P2002 → unhandled → 500 with stack to the client (Security-P2-3 information disclosure) and an opaque error to the commissioner UI (no way to know "retry, the drop was consumed by a sibling add").

## Findings

`server/src/features/wire-list/processor.ts:425-481` — `succeedAdd`:
```ts
const nextDrop = await prisma.waiverDropEntry.findFirst({
  where: { teamId, status: "PENDING" },
  orderBy: { priority: "asc" },
}); // L~430 — outside tx
// ... validation ...
await prisma.$transaction(async (tx) => {           // L472
  await tx.waiverAddEntry.update({                  // throws P2002 if sibling won
    where: { id: addEntryId },
    data: { status: "SUCCEEDED", consumedDropEntryId: nextDrop.id },
  });
  await tx.waiverDropEntry.update({
    where: { id: nextDrop.id },
    data: { status: "CONSUMED" },
  });
});
```

`server/src/features/wire-list/processor.ts:583-595` — `revertAdd` has the symmetric race: reads the consumed drop, validates, then re-opens it; concurrent revert + succeed on a sibling add can collide.

Schema: `prisma/schema.prisma:~1000` — `consumedDropEntryId Int? @unique` is the constraint that throws P2002.

Routes: `server/src/features/wire-list/routes.ts` — no per-error translation; P2002 bubbles up through `asyncHandler` to the 500 path.

## Proposed Solutions

### Option 1: Single transaction with row-level lock + P2002 → 409 translation (recommended)
- Move the `nextDrop` read INSIDE the `$transaction`.
- Use `prisma.$queryRaw` with `SELECT ... FOR UPDATE` on the `WaiverDropEntry` row, OR use `pg_advisory_xact_lock(periodId)` for simpler coarse-grained serialization per period (the entire reducer is per-period anyway).
- Wrap the tx body in `try { ... } catch (e) { if (isPrismaP2002(e)) throw new ApiError(409, "DROP_RACE_LOST"); throw e; }`.
- Apply the same shape to `revertAdd`.

**Effort:** Medium (~3h). **Risk:** Low — coarsening to a per-period advisory lock has negligible throughput cost (commissioner-driven, ~1 req/sec peak).

### Option 2: Optimistic-concurrency token on WaiverDropEntry
Add a `version Int @default(0)` column; succeed reads version, succeeds with `where: { id, version }`. P2025 → 409. More schema churn, no advantage over Option 1 for this workload.

**Effort:** Medium-large (migration + schema + routes). **Risk:** Medium.

### Option 3: Status-CAS with updateMany
Replace the unique-constraint dance with `tx.waiverDropEntry.updateMany({ where: { id, status: "PENDING" }, data: { status: "CONSUMED" } })` and check `count === 1`. Still need to wrap in tx, still need P2002 mapping for the add side. Acceptable as a complement to Option 1.

**Effort:** Small. **Risk:** Low.

## Recommended Action

**Option 1**, with Option 3's status-CAS layered on top so both sides of the dual-update are guarded. Add a generic `mapPrismaError` helper in `wire-list/processor.ts` that translates P2002 / P2025 to the `WireListError` codes the routes already surface.

## Technical Details

Files:
- `server/src/features/wire-list/processor.ts:425-481, 583-595`
- `server/src/features/wire-list/routes.ts` — ensure error code passes through as 409, not 500.
- `server/src/features/wire-list/__tests__/` — new test: two concurrent `succeedAdd` against different add entries sharing the same nextDrop; assert exactly one returns 200, the other 409 `DROP_RACE_LOST`.

Advisory-lock key: `pg_advisory_xact_lock(hashtext('wire-list:' || periodId))` — periodId is short, hashtext gives 32-bit int.

## Acceptance Criteria

- [ ] `nextDrop` read happens inside `$transaction` after `pg_advisory_xact_lock`.
- [ ] P2002 from add update is caught and mapped to 409 `DROP_RACE_LOST`.
- [ ] `revertAdd` uses the same lock + mapping.
- [ ] No 500 in server logs for P2002 from the wire-list namespace.
- [ ] Test simulating two concurrent succeeds on sibling adds: deterministic 200/409 split.

## Work Log

_(empty — created during /ce:review on 2026-05-07)_

## Resources

- Wire List PRs: https://github.com/thirstypig/TheFantasticLeagues/pulls?q=wire-list+is%3Amerged
- `server/src/features/wire-list/processor.ts:425-481, 583-595`
- `prisma/schema.prisma:~1000` (`consumedDropEntryId @unique`)
- Memory: `supabase_railway_connection_setup.md` (advisory-lock cost on connection_limit=1 pooler is negligible but worth tracking).
