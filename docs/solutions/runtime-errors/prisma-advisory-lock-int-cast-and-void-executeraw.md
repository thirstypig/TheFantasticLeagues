---
title: "Prisma pg_advisory_xact_lock silently dead: int/bigint cast (42883) + void return needs $executeRaw (P2010)"
problem_type: runtime_error
component: "transactions/ilFeeService, lib/outboxDrainer"
symptoms:
  - "OutboxEvent kind=IL_FEE_RECONCILE stuck with attempts=5, never completing"
  - "Postgres 42883: function pg_advisory_xact_lock(integer, bigint) does not exist"
  - "Prisma P2010: Failed to deserialize column of type 'void' (after the 42883 cast fix)"
  - "IL fees never assessed for OGBA (empty il_fee FinanceLedger despite billable stints)"
  - "Green unit suite the whole time — the failing SQL was mocked"
date_solved: "2026-07-03"
session: "pipeline staleness audit → IL-fee reconcile fix"
related_pr: 411
related_todos: [298, 299]
tags:
  - prisma
  - postgres
  - advisory-lock
  - pg_advisory_xact_lock
  - queryRaw
  - executeRaw
  - 42883
  - P2010
  - void-deserialize
  - hashtext
  - int4-int8
  - outbox
  - il-fees
  - silent-failure
  - mocked-test-false-confidence
---

## Symptom

The `IL_FEE_RECONCILE` outbox handler had been **dead for ~30 days**. Two
`OutboxEvent` rows (OGBA Period 2 & 3) sat at `attempts=5` (retries exhausted),
each failing with:

```
Postgres 42883: function pg_advisory_xact_lock(integer, bigint) does not exist
```

Consequence: IL fees were **never assessed** for the league — the reconcile is
the sole writer of `il_fee` FinanceLedger rows, so the ledger was empty despite
real billable IL stints (~$100 across P2/P3). Nothing alerted; the unit suite
was green the entire time. Discovered only by the pipeline staleness audit's
OutboxEvent-backlog query (see `docs/reports/pipeline-staleness-audit-2026-07-02.md`).

## Investigation

The bug was **two bugs stacked on one line**, revealed one at a time:

1. The 42883 error pointed at the advisory-lock call in
   `ilFeeService.reconcileIlFeesForPeriod`:
   ```ts
   await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('il_fee_reconcile'), ${periodId})`;
   ```
2. Adding a `::int` cast fixed 42883 — and immediately surfaced a **second**
   error that had been masked (Postgres errored on the bad signature *before*
   returning, so the return type never mattered):
   ```
   Prisma P2010: Failed to deserialize column of type 'void'
   ```
3. Critically, **neither error was reachable from the unit test.** The unit
   suite mocks `$queryRaw` to return `[]`, so the SQL never executes. The bugs
   only appeared when the reconcile ran against **real Postgres** (a read-only
   `dryRun` against prod).

## Root cause

**Bug 1 — argument type mismatch (42883).** `hashtext()` returns `int4`.
Prisma binds a JS `number` as `int8` (`bigint`). So the call resolved to
`pg_advisory_xact_lock(integer, bigint)` — a signature that does not exist.
The two-argument overload is `pg_advisory_xact_lock(int4, int4)`, so the second
arg must be cast to `int`.

**Bug 2 — void return can't be deserialized (P2010).** The *blocking*
`pg_advisory_xact_lock(...)` returns **`void`**. Prisma's `$queryRaw`
deserializes result columns and cannot handle a `void` column. (The repo's
*other* advisory-lock sites use the `pg_try_advisory_xact_lock(...)` variant,
which returns **`boolean`** — that's why `$queryRaw<{ locked: boolean }[]>`
works there but not for the blocking form.)

## Fix

Cast the arg to `int` **and** use `$executeRaw` (which executes the statement
and returns an affected-row count without deserializing result columns):

```ts
// before — two bugs:
await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('il_fee_reconcile'), ${periodId})`;

// after:
await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('il_fee_reconcile'), ${periodId}::int)`;
```

## Prevention

### Prisma advisory-lock decision rule
| Function | Returns | Prisma call |
|---|---|---|
| `pg_advisory_xact_lock` / `pg_advisory_lock` (blocking) | `void` | **`$executeRaw`** |
| `pg_try_advisory_xact_lock` / `pg_try_advisory_lock` | `boolean` | `$queryRaw<{ locked: boolean }[]>` |

And: when the 2-arg form is keyed by `hashtext('...')` (int4) + an id, **cast
the id to `::int`** — Prisma binds JS numbers as `int8`, which won't match the
`(int4, int4)` overload.

### A mocked `$queryRaw`/`$executeRaw` unit test gives FALSE confidence for SQL-execution bugs
This is the load-bearing lesson. `ilFeeService.test.ts` mocked `$queryRaw` to
return `[]`, so it exercised every branch **except the SQL that was broken**.
A green unit suite therefore proved nothing about 42883/P2010. Any code whose
correctness depends on the database actually *executing* a statement (advisory
locks, raw SQL, `ON CONFLICT`, generated columns, triggers) needs a
**real-Postgres integration test**, not a mock.

Regression added: `ilFeeService.integration.test.ts` (gated by
`test-support/dbSafety.ts` fail-closed guard, runs in CI's `db-integration`
job). It calls the real reconcile against Postgres and asserts it resolves —
red on either bug, green on the fix. **The test was also wired into the CI job
explicitly**; the `db-integration` step previously ran only the draft test, so
a new integration file would otherwise never execute (a dead regression guard).

### Silent failure is the real severity multiplier
The advisory-lock bug was a one-line typo; the *damage* came from 30 days of
invisibility. The outbox worker retried 5×, logged to an in-memory buffer wiped
on restart, and then gave up — **no persisted "last run", no alert**. Verify
with the detection query that found it:
```sql
SELECT kind, COUNT(*), MIN("createdAt") AS oldest FROM "OutboxEvent"
WHERE "completedAt" IS NULL AND "createdAt" < now() - interval '1 hour' GROUP BY kind;
```
Durable job-run tracking + alerting is tracked as todo #299.

### Preview before writing money
The fix also made `dryRun` return the exact per-team/player fee breakdown
(`ReconcilePreviewRow[]`), so a financial reconcile can be previewed and
approved before any ledger write. Two unit tests guard its rate-selection and
reversal-sign logic.

## Related
- `docs/reports/pipeline-staleness-audit-2026-07-02.md` — the audit that found this (Finding 1); todos #298 (this fix) + #299 (alerting).
- `docs/solutions/runtime-errors/prisma-client-stale-after-migration.md` — adjacent Prisma runtime pitfall.
- `docs/solutions/runtime-errors/mixed-zod-versions-mcp-sdk-tool-registration.md` — same shape of trap: a defect only reproducible in a real environment (CI/real-PG), invisible to the local/mocked path.
- `docs/solutions/integration-issues/mlb-statsapi-sync-hasstats-filter-drops-er-rbi.md` — another "green tests, wrong data" case where mocks hid the real behavior.
