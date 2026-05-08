---
status: pending
priority: p1
issue_id: "160"
tags: [code-review, wire-list, performance, supabase]
dependencies: []
---

# Wire List finalize: N+1 round-trips inside $transaction monopolize the only Supabase connection

## Problem Statement

The finalize path opens a `prisma.$transaction` and then loops over succeeded adds, issuing ~7 round-trips per add (roster.findFirst, roster.updateMany, roster.create, transactionEvent.create×2, waiverAddEntry.update, waiverDropEntry.update) plus a redundant `tx.player.findUnique` for already-loaded data. For a 12-team league with ~3 succeeded adds each that's ~290 sequential round-trips inside one transaction.

Combined with the Supabase free-tier pooler running at `connection_limit=1` (per memory `supabase_railway_connection_setup.md`), this transaction monopolizes the only DB connection for 15-25s, blocking every other write in the app — chat messages, lineup edits, trade proposals all stall. The transaction also approaches Postgres' default `idle_in_transaction_session_timeout`, putting finalize at risk of partial-completion timeout under load.

## Findings

`server/src/features/wire-list/processor.ts:221-313` — finalize transaction body, the for-loop over succeeded adds:

Round-trips per iteration (counted from current code):
1. `tx.roster.findFirst` (find drop target) — L~232
2. `tx.roster.updateMany` (release dropped) — L~250
3. `tx.player.findUnique` at L276 — **redundant**: `succeededAdds[].consumedDrop.player` is already loaded by the outer query at L~165.
4. `tx.roster.create` (add new) — L~285
5. `tx.transactionEvent.create` (DROP event) — L~295
6. `tx.transactionEvent.create` (ADD event) — L~305
7. `tx.waiverAddEntry.update` (mark processedAt) — L~310
8. `tx.waiverDropEntry.update` (mark processedAt) — L~312

12 teams × 3 adds × ~7 calls (after dropping #3) = 252 sequential calls. Outer setup adds ~5 more.

Outer query at L~165 already includes the player relation on `consumedDrop`, so #3 is wasted.

Outer query does NOT preload all drop rosters by `(teamId, playerId)`; the loop's per-iteration `roster.findFirst` could be replaced by an in-memory map.

`transactionEvent.create` per row could be `createMany` after the loop.

`waiverAddEntry.update` / `waiverDropEntry.update` per row could be two `updateMany` calls keyed by `id IN (...)` after the loop.

## Proposed Solutions

### Option 1: Preload + batch (recommended)
1. **Drop #3** entirely; use `consumedDrop.player` already on the outer fetch.
2. **Preload drop rosters** before the tx: one `prisma.roster.findMany({ where: { OR: succeededAdds.map(a => ({ teamId: a.teamId, playerId: a.consumedDrop.playerId, releasedAt: null })) } })` keyed into a `Map<\`${teamId}:${playerId}\`, Roster>`. Tx body looks up O(1).
3. **Batch TransactionEvents** into one `tx.transactionEvent.createMany` after the loop accumulates the event rows in memory.
4. **Batch processedAt** updates: one `tx.waiverAddEntry.updateMany({ where: { id: { in: addIds } }, data: { processedAt: now, status: "SUCCEEDED" } })` and same for drops.
5. **Keep** `roster.updateMany` and `roster.create` per-iteration (each has unique data; not easily batchable through Prisma without raw SQL — and these are the writes that matter for correctness).

Expected: ~290 calls → ~10. Wall-clock 15-25s → 1-2s. Connection held briefly enough that other writes don't queue noticeably.

**Effort:** Medium (~4-5h with tests). **Risk:** Low for #1, #3, #4 (pure batching). Medium for #2 (must preserve the per-iteration assertion that exactly one row was found — Map miss → throw, same as #156's count assertion).

### Option 2: Move TransactionEvents and processedAt updates OUTSIDE the transaction
After the tx commits, write the events. Faster, but if the post-tx step fails the activity log diverges from the roster state. Rejected.

### Option 3: Bump `connection_limit`
Memory `supabase_railway_connection_setup.md` already documents that free-tier pooler hard-caps to 1. Not actionable without a Supabase plan upgrade.

## Recommended Action

**Option 1.** Pure batching; matches #156's atomicity tightening (run them together).

## Technical Details

Files:
- `server/src/features/wire-list/processor.ts:165-313`
- Tests: assert call count via `vi.spyOn(tx.transactionEvent, "createMany")` and `tx.roster.findMany`; round-trip budget assertion (e.g., `expect(prismaCallCount).toBeLessThan(20)` for a 36-add fixture).

Verify on Supabase: run finalize on a synthetic league with 12 teams × 3 adds, check connection-pool wait-time histogram in Supabase logs before/after.

## Acceptance Criteria

- [ ] `tx.player.findUnique` at L276 removed; replaced with `consumedDrop.player`.
- [ ] All drop rosters preloaded in one `findMany` before the tx; lookup O(1) inside loop.
- [ ] All TransactionEvents written via single `createMany`.
- [ ] All `processedAt` flips written via two `updateMany` calls (one for adds, one for drops).
- [ ] Round-trip count for 36-add fixture ≤ 20.
- [ ] Existing finalize tests still pass.

## Work Log

_(empty — created during /ce:review on 2026-05-07)_

## Resources

- Wire List PRs: https://github.com/thirstypig/TheFantasticLeagues/pulls?q=wire-list+is%3Amerged
- `server/src/features/wire-list/processor.ts:165-313`
- Memory: `supabase_railway_connection_setup.md` (the connection_limit=1 constraint)
- Companion todo: #156 (atomicity) — ship together to avoid touching the same code twice.
