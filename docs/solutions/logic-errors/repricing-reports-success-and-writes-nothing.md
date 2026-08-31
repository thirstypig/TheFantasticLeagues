---
title: "A repricing that reports success and writes nothing — the same conflation hid in three places, and the return value lied about all of them"
slug: repricing-reports-success-and-writes-nothing
category: logic-errors
created: 2026-08-31
component: ilFeeService, FinanceLedger, reconcile
problem_type: silent-write-loss / money
symptom: "reconcileIlFeesForPeriod returns {added: 1} and the ledger is unchanged. Run it again: {added: 1}, still unchanged. The fee is never charged and nothing errors."
root_cause: "A reversal contra-entry is written as type='il_fee' with voidedAt NULL, making it indistinguishable from a charge in three places: the `existing` query, the partial unique index, and the insert ordering. `createMany({skipDuplicates: true})` then swallowed the collision, and `added: toAdd.length` reported intent rather than the count the database actually took."
related_modules: transactions, commissioner, standings
prs: [442, 443, 444]
tags: il-fees, financeledger, prisma, postgres, silent-data-loss, money
---

# A repricing that reports success and writes nothing

## Symptom

Correcting an IL fee — void the wrong amount, write the right one — reported
success and changed nothing:

```
{"leagueId":20,"periodId":40,"added":1,"voided":1,"unchanged":2,"dryRun":false}
```

The `$15` was reversed. The replacement `$10` was **never written**. No error, no
warning, no failed transaction. The dry run had predicted exactly this shape, so
the output looked like confirmation.

It happened **three times in a row**, across two code fixes, before the real
cause was found. Each run left the team further from correct: after the first,
Los Doyers' Period 6 netted `$0` where it should have been `$25`.

## What was tried, and why each attempt failed

**Attempt 1 — assume it worked.** The return value said `added: 1`. Only
querying `FinanceLedger` directly showed the row absent. *Lesson that recurred
all day: check the rows, not the summary.*

**Attempt 2 (PR #443) — fix the ordering.** `createMany` ran **before** the void
loop, so the new row collided with the row about to be voided. Voiding first
frees the index slot. Correct, necessary — and **still didn't write the row**.

**Attempt 3 (PR #443) — exclude reversals from `existing`.** Reversal rows are
`type='il_fee'` with `voidedAt: NULL`, so the next reconcile read a `-$15`
contra-entry as a live charge, judged it the wrong amount, and voided *it* — a
reversal-of-a-reversal cascade. Also correct, also necessary, and the row **still
didn't land.**

Three attempts, three different manifestations. That was the signal: not three
bugs, one conflation appearing wherever the system had to tell a charge from a
contra-entry.

## Root cause

The partial unique index treats a reversal as a charge:

```sql
CREATE UNIQUE INDEX finance_ledger_il_fee_active_uniq
  ON "FinanceLedger" ("teamId","periodId","playerId")
  WHERE type = 'il_fee' AND "voidedAt" IS NULL;   -- a reversal matches this
```

A reversal is written with `type='il_fee'` and `voidedAt: NULL`, so it
**occupies the `(teamId, periodId, playerId)` slot**. The replacement charge
collided with *the reversal of the row it was replacing*:

```
live index-occupying rows for (team 147, period 40, Will Smith 1640):
  id=24  $-15  reversalOf=5   <- occupies the unique slot
```

And the collision was silent because of this:

```ts
await tx.financeLedger.createMany({
  data: toAdd.map(...),
  skipDuplicates: true,   // turns a unique violation into a no-op
});
```

Without `skipDuplicates`, Postgres raises a unique violation and the transaction
rolls back **loudly**. With it, the row is dropped and execution continues.

The second defect is what made all of this invisible:

```ts
added: toAdd.length,   // intent, not reality
```

`createMany` returns `{ count }` and it was discarded. Both prod runs reported
`added: 1` while inserting nothing.

## The fix

Four changes, three PRs:

**1. Void before add** (#443) — frees the index slot before the insert:

```ts
for (const row of toVoid) { /* set voidedAt, write contra-entry */ }
if (toAdd.length > 0) { await tx.financeLedger.createMany({ ... }); }
```

**2. Exclude contra-entries from `existing`** (#443) — a reversal is not a charge:

```ts
where: { type: "il_fee", periodId, voidedAt: null, reversalOf: null },
```

**3. Narrow the index the same way** (#444, migration
`20260831120000_il_fee_uniq_excludes_reversals`):

```sql
WHERE type = 'il_fee' AND "voidedAt" IS NULL AND "reversalOf" IS NULL
  AND "periodId" IS NOT NULL AND "playerId" IS NOT NULL;
```

Narrowing a predicate indexes strictly fewer rows, so it cannot fail on existing
data. Verify first anyway: `0` duplicate groups under the new predicate.

**4. Make the return value honest** (#444) — a short insert now throws:

```ts
const res = await tx.financeLedger.createMany({ ... });
actuallyAdded = res?.count ?? 0;
if (actuallyAdded < toAdd.length) {
  throw new Error(`insert lost ${toAdd.length - actuallyAdded} of ${toAdd.length} row(s) ...`);
}
```

**With guard 4 alone, both earlier runs would have failed loudly instead of
silently under-billing.** It is the cheapest of the four and the one that
converts every future variant of this from silent to noisy.

## Why the tests didn't catch it

The fixture lied about the shape of the real API:

```ts
createMany: vi.fn().mockResolvedValue({ count: 0 }),   // hardcoded
```

Prisma returns the **actual inserted count**. A mock returning a constant is
exactly what lets a discarded return value go unnoticed — the same precedent as
the AddDropPanel mocks. Now:

```ts
createMany: vi.fn(async (args: any) => ({ count: args?.data?.length ?? 0 })),
```

A harder limitation, stated rather than papered over: **the unit suite cannot
reproduce the silent swallow at all.** The mocked `createMany` has no unique
index, so the collision never happens and the "writes the corrected amount"
assertion passes either way. The real pin is an **ordering** assertion — `update`
invoked before `createMany` — plus an end-to-end test against real Postgres in
the `db-integration` job.

**The dry run was structurally incapable of catching any of it.** It computes
intent and returns before touching the database, so it never exercises the index
— the exact layer where all three failures lived. "Dry run looked right"
reassured twice while the money went unbilled.

## Prevention

- **Never let `skipDuplicates` guard a write whose success you then report.** It
  converts a constraint violation into a silent no-op. Either drop it and let
  Postgres raise, or check the returned count and fail on a short insert.
- **Report what the database did, not what you asked it to do.** `added:
  toAdd.length` is a lie the moment any insert can be skipped.
- **A contra-entry is not a charge.** If a ledger has reversal rows, every place
  that answers "what is currently charged" must exclude them — the query, the
  uniqueness constraint, and any dedup key. Fixing one and not the others is how
  this took three attempts.
- **When three fixes each reveal the same bug somewhere new, stop fixing and ask
  what the system is conflating.** Facets, not bugs.
- **Verify money writes against the rows.** Every wrong conclusion in this
  incident — twice "it worked" when nothing was written, once "nothing was
  written" when $150 had been (a case-sensitive `type` filter) — came from
  trusting a summary instead of querying the ledger.

## Related

- [`stale-psp-outside-5-day-reconcile-window.md`](../integration-issues/stale-psp-outside-5-day-reconcile-window.md)
  — the sibling "nothing re-checks this" failure in the stats reconciler.
- [`html-parser-silent-row-drop-passes-its-own-tests.md`](../integration-issues/html-parser-silent-row-drop-passes-its-own-tests.md)
  — same family: a silent drop that every test written for it approved.
- [`current-state-field-used-as-historical-predicate.md`](./current-state-field-used-as-historical-predicate.md)
  — another case of one field answering two different questions.
- Todo #298 (IL fees never assessed) and #310 (RosterSlotEvent missing stashes) —
  this was found while executing the first and led to the second.
