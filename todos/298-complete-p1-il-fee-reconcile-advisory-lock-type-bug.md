---
status: complete
priority: p1
issue_id: 298
tags: [outbox, il-fees, roster-rules, payouts, bug, postgres, advisory-lock]
dependencies: []
---

## Problem Statement
`OutboxEvent` rows id=1 (P2/period 36, stuck since 2026-06-03) and id=2 (P3/period 37, since 2026-06-08), both `kind=IL_FEE_RECONCILE`, `attempts=5` (retries exhausted), fail every attempt with Postgres `42883: function pg_advisory_xact_lock(integer, bigint) does not exist`. IL-fee reconciliation for two closed periods has **never run**. Money-adjacent (OGBA has entry fees + payouts). Found via the 2026-07-02 staleness audit — no stat audit could catch it. Full evidence: `docs/reports/pipeline-staleness-audit-2026-07-02.md` Finding 1.

## Proposed Solutions
Cast the advisory-lock args to a matching overload (`pg_advisory_xact_lock($1::int, $2::int)` or a single `bigint` key). BEFORE re-running: read the IL_FEE_RECONCILE handler, confirm idempotency, and determine whether P2/P3 IL fees were actually left unassessed (financial impact currently UNKNOWN). Do not reset `attempts`/re-enqueue until impact is understood.

## Acceptance Criteria
- Root-cause the exact lock call site; fix the type mismatch with a unit/integration test that would have caught 42883.
- Document (in the todo Resolution) whether P2/P3 fees were missing and what the corrective action was.
- Re-run reconcile for periods 36 & 37; verify `completedAt` set and fees correct; reverse nothing silently.
- `git mv` this todo from pending → complete.

## Resolution — 2026-08-31

**Closed.** All acceptance criteria met.

- **Root cause fixed** in PR #411 (2026-07-03): `hashtext()` returns `int4` while Prisma bound
  `periodId` as `int8`, so `pg_advisory_xact_lock(integer, bigint)` matched no overload (42883).
  Fixed with `periodId::int` + `$executeRaw`, plus a real-Postgres regression test wired into the
  `db-integration` CI job.
- **Financial impact documented and settled.** IL fees had never been assessed for OGBA. Billed
  2026-08-31: **P2 $30 + P3 $70 + P4 $50 = $150**, verified row-by-row in `FinanceLedger`.
  P4 turned out never to have been *enqueued* at all — see #310's sibling gap, fixed by the
  sweeper in PR #445.
- **Periods 36 & 37 re-run and `completedAt` set.** Outbox rows 1 and 2 had exhausted their retry
  budget (`attempts=5`) before the July fix landed, and nothing could reset them — the drainer
  selects `attempts < MAX_ATTEMPTS`, so they were invisible forever. `requeueOutboxEvent`
  (PR #445) reset them; the drainer completed both within one second, the idempotent reconcile
  correctly changed nothing, and the grand total stayed $225.
- **Nothing reversed silently.** Every write was verified against the rows, not the return value.

**Final state:** all 6 periods dry-run at `added=0 voided=0`; outbox has 0 exhausted and 0 pending
events; ledger totals — Demolition $40 · Dodger Dawgs $40 · Los Doyers $35 · Diamond Kings $30 ·
RGing $30 · The Show $30 · Skunk Dogs $20 = **$225**.

**Four bugs were found *because* this was finally executed**, all shipped the same day:
- #442 — simultaneous IL stashes both billed at the slot-2 rate (rank tie-break)
- #443 — insert-before-void; reversal contra-entries re-read as charges
- #444 — reversals squatted the partial unique index; `added` reported intent, not the real count
- #445 — periods closed outside the app never enqueue; exhausted outbox events never alarm

Spun out and still open: **#310** (RosterSlotEvent missing IL_STASH rows → under-billing, P1) and
**#311** (FinanceLedger has no reader; append-only convention unpinned, P2).
