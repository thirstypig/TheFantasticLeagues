---
status: pending
priority: p2
issue_id: 311
tags: [payouts, league-admin, database, testing]
dependencies: []
---

## Problem Statement
`FinanceLedger` is **write-only**. No API route exposes it, no client code reads it, and the
Commissioner → Finances tabs (`ledger`, `payouts`, `balances`) render *"Financial ledger, payout
calculator, and balance tracking — coming soon."* The only non-writing reference in the whole
codebase is a `deleteMany` on team deletion.

Consequence: **the summing convention was never pinned**, and the ledger's correction pattern only
balances under one of the two readings. When a row is corrected, reconcile marks the original
`voidedAt` **and** writes a negative `reversalOf` contra-entry:

| Reading | Los Doyers Period 6 | |
|---|---|---|
| sum **all** rows (voidedAt is an audit marker) | **$25** | ✓ correct |
| sum live rows only (`voidedAt IS NULL`) | $10 | ✗ double-removes the voided row |

Confirmed empirically 2026-08-31: append-only is the correct reading. Nothing encodes that
anywhere — no test, no helper, no comment on the model. The next person to write a balance query
has a 50% chance of writing the wrong one, and it will look plausible.

This already cost time: a `voidedAt: null` filter during the Los Doyers repair reported the ledger
as empty right after a successful $150 write, and separately made a repaired period read $10
instead of $25.

## Proposed Solutions
Add one `teamBalance(teamId)` / `leagueBalances(leagueId)` helper in `server/src/lib/` that is the
single sanctioned way to sum the ledger, with the append-only semantics documented on it and a test
that pins the void+reversal case explicitly (a corrected row must contribute its NET, not zero and
not double-negative). Wire the Commissioner Balances tab to it — the UI stub is already there.

Also worth a short comment on the `FinanceLedger` model itself: `voidedAt` marks a row superseded
for display/audit; it is NOT a filter for totals, because the reversal already cancels it.

## Acceptance Criteria
- A single documented balance helper exists; no ad-hoc `financeLedger.findMany` summing elsewhere.
- A test pins the void+reversal case: original + contra-entry must net to zero, and the replacement
  charge must count once.
- `voidedAt` semantics are documented on the Prisma model.
- Commissioner Balances tab reads real data (or the todo explicitly defers the UI and says so).
- `git mv` this todo from pending → complete.

## Resources
- Found 2026-08-31 during the Los Doyers Period 6 repair (PRs #442–#445).
- `client/src/features/commissioner/pages/Commissioner.tsx` — the "coming soon" stub
- Related: [[roster_rules_feature]]
