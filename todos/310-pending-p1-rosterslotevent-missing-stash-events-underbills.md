---
status: pending
priority: p1
issue_id: 310
tags: [il-fees, roster-rules, payouts, data-integrity, money]
dependencies: []
---

## Problem Statement
`RosterSlotEvent` — the log `ilFeeService.deriveAllStints` reads to bill IL fees — is **missing
opening `IL_STASH` rows** that exist in `TransactionEvent`. A stint with no open event is not
billable, so the fee is silently never charged. This is live under-billing, not a logging nit.

Observed in prod 2026-08-31 (league 20). The reconcile warns about each one on every run and
then ignores it:

| Player | RosterSlotEvent (drives billing) | TransactionEvent |
|---|---|---|
| Daniel Palencia (RGing, team 145) | `IL_ACTIVATE 2026-05-17` **only** | `IL_STASH 04-19` + `IL_ACTIVATE 05-17` |
| Logan Henderson (The Show, team 146) | `IL_ACTIVATE 2026-07-05` **only** | `IL_STASH 06-07` + `IL_ACTIVATE 07-05` |
| Mookie Betts (Los Doyers, team 147) | STASH 04-19, **STASH 04-23**, **ACTIVATE 04-23**, ACTIVATE 05-17 | STASH 04-19 + ACTIVATE 05-17 |

The warnings currently emitted — and swallowed:
```
teamId=145 playerId=1339 IL_ACTIVATE  "close event with no open stint — ignoring."
teamId=146 playerId=1075 IL_ACTIVATE  "close event with no open stint — ignoring."
teamId=147 playerId=1    IL_STASH     "IL_STASH while prior stint still open — auto-closing."
teamId=147 playerId=1    IL_ACTIVATE  "close event with no open stint — ignoring."
```

## 2026-08-31 UPDATE — scope is larger, and the cause is NOT a route

Running the drift check (`findIlLogDrift`, shipped with this todo) against prod found
**9 discrepancies, not 3** — manual inspection had missed two thirds of it:

| Missing from RosterSlotEvent (UNBILLABLE) | effDate |
|---|---|
| Daniel Palencia — RGing | 2026-04-19 |
| Logan Henderson — The Show | 2026-06-07 |
| **Quinn Priester — The Show** | 2026-04-19 |
| **Andrew Vaughn — Demolition** | 2026-04-19 |

| Present only in RosterSlotEvent (phantom billing rows) | effDate |
|---|---|
| Mookie Betts — Los Doyers | 04-23 STASH + 04-23 ACTIVATE |
| Andrew Vaughn — Demolition | 04-23 STASH + 04-23 ACTIVATE, 05-03 STASH |

**Vaughn matters most: he WAS billed (P2 and P3, $10 each) — but on the phantom rows, not on
his real 04-19 stint.** So an existing charge rests on events no transaction explains.

**Root cause is NOT a code path.** The rowHashes are hand-written:
- Palencia: `IL_STASH-correction-pa…` / *"IL stash (commissioner correction) — effective period 2 start"*
- Henderson: `IL-STASH-COMM-9a82a1de` / *"Commissioner stash — Logan Henderson to IL (6/7)"*

Neither matches the 3-way claim (`IL-STASH-CLAIM-<uuid>`) or `/il-stash` (`IL_STASH-<uuid>`). These
were **manual corrections written straight to TransactionEvent**, skipping the billing log — the
same family as the direct-DB period closes that caused P4's missing enqueue.

**A real latent code gap exists too, separately:** the 3-way claim
(`transactions/routes.ts:511`, the `ilStashPlayerId` branch) sets `assignedPosition="IL"` and
writes a TransactionEvent but **no RosterSlotEvent**. It did not cause these four, but it would
cause the same bug the first time someone stashes through it. Still worth fixing.

## Estimated financial impact — VERIFY BEFORE BILLING
Both missing stints align exactly to one period each, so each is one billable stint:
- **Palencia** 04-19 → 05-17 spans all of Period 2 (04-19 → 05-16). RGing has **no** P2 charge today.
- **Henderson** 06-07 → 07-05 spans all of Period 4 (06-07 → 07-04). The Show has one P4 charge
  today (Pagán, rank 1 $10); adding a second stint makes one of them rank 2, so P4 goes $10 → $25.

Rough exposure **+$10 to +$25**, but the rank interaction must be recomputed, not assumed —
`assignIlRanks` decides rank from concurrency, and adding a stint can reprice an existing one.
Do not bill from this estimate; re-run the dry run after the log is repaired.

## Proposed Solutions
1. **Root-cause the write path first.** Why does `TransactionEvent` have the stash and
   `RosterSlotEvent` not? Find the IL_STASH handler(s) and determine whether the two writes are in
   one transaction, whether one path writes only one log, or whether a backfill/import skipped it.
   Betts's spurious 04-23 pair suggests a second writer with different semantics.
2. **Stop swallowing the signal.** `deriveAllStints` logs `warn` and continues, which is why this
   hid for months. An orphaned close event means the billing log disagrees with the transaction
   log — that should surface (admin error buffer / the #299 dead-man's alert), not scroll past.
3. **Backfill the missing rows**, then re-run reconcile for the affected periods and verify.
4. **Add a drift check**: `TransactionEvent` IL rows and `RosterSlotEvent` rows must agree per
   (team, player, effDate, event). Any disagreement is a data-integrity alarm.

## Acceptance Criteria
- The write-path divergence is root-caused and fixed, with a test that would have caught it.
- Orphaned close events and duplicate stashes raise an alarm instead of a swallowed `warn`.
- The three known cases are repaired and reconcile re-run; per-team totals verified against the
  recomputed dry run (NOT against the estimate above).
- A drift check compares the two logs and alerts on disagreement.
- `git mv` this todo from pending → complete.

## Resources
- Found 2026-08-31 while repairing the Los Doyers Period 6 rank bug (PRs #442–#445).
- `server/src/features/transactions/services/ilFeeService.ts` → `deriveAllStints`
- Related: [[roster_rules_feature]], [[period_rollover_and_roster_backdate]]
