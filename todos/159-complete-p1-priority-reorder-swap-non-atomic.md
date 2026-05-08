---
status: complete
priority: p1
issue_id: "159"
tags: [code-review, wire-list, atomicity, ux, performance]
dependencies: []
---

# Wire List: priority reorder swap is non-atomic across siblings

## Problem Statement

The owner-side ▲/▼ reorder buttons issue 3 sequential PATCH calls per click (a→temp prio, b→a's old prio, a→b's old prio) plus a full reload. If the second PATCH 500s (network blip, Supabase pooler queue), the period is left with a phantom slot at priority `max+100` — the row exists but UI doesn't show it cleanly, and the owner has no recovery path beyond manual intervention.

UX cost is also significant: top-to-bottom reorder on a 10-row list = 9 nudges × 800ms (3× round-trip) = ~7.2s of pending state with optimistic updates flickering. Owners give up mid-reorder and re-submit waivers.

## Findings

`client/src/features/wire-list/pages/WireListOwnerPage.tsx:126-141` — add-list swap:
```ts
async function moveAddUp(idx: number) {
  const a = adds[idx], b = adds[idx-1];
  await patchAddEntry(a.id, { priority: TEMP_HIGH });        // 1
  await patchAddEntry(b.id, { priority: a.priority });       // 2 — failure mode here
  await patchAddEntry(a.id, { priority: b.priority });       // 3
  await reload();
}
```

`client/src/features/wire-list/pages/WireListOwnerPage.tsx:143-158` — drop-list swap: identical shape.

Server: `server/src/features/wire-list/routes.ts:298-371` — PATCH entry, no awareness of "I am part of a swap"; each call is independent.

Schema: `prisma/schema.prisma` — `WaiverAddEntry` has `@@unique([periodId, teamId, priority])`. The TEMP_HIGH dance exists solely to dodge that constraint.

## Proposed Solutions

### Option 1: Server-side atomic reorder endpoint (recommended)
Add `POST /api/wire-list/periods/:periodId/reorder` accepting:
```ts
{ kind: "ADD" | "DROP", teamId: number, orderedIds: number[] }
```

Implementation:
```ts
await prisma.$transaction(async (tx) => {
  // Phase 1: write all rows to negative temps to dodge the unique constraint.
  await Promise.all(orderedIds.map((id, i) =>
    tx.waiverAddEntry.update({ where: { id }, data: { priority: -(i + 1) } })));
  // Phase 2: write final priorities.
  await Promise.all(orderedIds.map((id, i) =>
    tx.waiverAddEntry.update({ where: { id }, data: { priority: (i + 1) * 10 } })));
});
```

Wrap with the same `pg_advisory_xact_lock(periodId)` from #158.

Client: replace both `moveAddUp/Down` and `moveDropUp/Down` with one optimistic-update call. Reload on failure only.

**Effort:** Medium (~4h with tests). **Risk:** Low — strict improvement, no schema change.

### Option 2: Client batch with `Promise.all`
Issue all 3 PATCHes in parallel. Faster but doesn't fix atomicity (any one failing leaves inconsistent state) and Prisma will reject the parallel writes against the unique constraint anyway.

**Effort:** Trivial. **Risk:** High — does not solve.

### Option 3: Drop the unique constraint, store as `decimal` priority
Eliminates the temp-priority dance. Larger schema change; reorder still requires multiple writes.

**Effort:** Large. **Risk:** Medium.

## Recommended Action

**Option 1.** Single endpoint, single transaction, two-pass technique to dodge the unique constraint, owner UI calls it once per drag/click.

## Technical Details

Files:
- New: `server/src/features/wire-list/routes.ts` — add `POST /periods/:periodId/reorder` handler.
- New: `server/src/features/wire-list/processor.ts` — extract `reorderEntries(tx, kind, teamId, orderedIds)`.
- Edit: `client/src/features/wire-list/pages/WireListOwnerPage.tsx:126-158` — replace 4 swap functions with two calls to a new `reorderAdds(orderedIds)` / `reorderDrops(orderedIds)` API helper.
- Edit: `client/src/features/wire-list/api.ts` — add the API helper.

Tests:
- Server: assert atomicity via mid-tx error injection (mock the second `update` to throw); confirm rollback leaves original priorities.
- Server: assert two concurrent reorders for the same team serialize cleanly via the advisory lock.
- Client: optimistic update reverts on 500.

## Acceptance Criteria

- [ ] New `POST /periods/:periodId/reorder` endpoint accepts `{ kind, teamId, orderedIds }` and rewrites all priorities in a single transaction.
- [ ] Two-pass technique used (negative temps then final values) — no `TEMP_HIGH` constants leak to the client.
- [ ] Both `WireListOwnerPage` swap functions replaced with single optimistic call.
- [ ] Reorder shares the periodId advisory lock with #158 cron path.
- [ ] Failed reorder leaves original priorities intact (rollback test).

## Work Log

_(empty — created during /ce:review on 2026-05-07)_

## Resources

- Wire List PRs: https://github.com/thirstypig/TheFantasticLeagues/pulls?q=wire-list+is%3Amerged
- `client/src/features/wire-list/pages/WireListOwnerPage.tsx:126-158`
- `server/src/features/wire-list/routes.ts:298-371`
- `prisma/schema.prisma` — `WaiverAddEntry @@unique([periodId, teamId, priority])`
- Memory: `feedback_partial_browser_verification.md` (verify both add and drop paths in browser)
