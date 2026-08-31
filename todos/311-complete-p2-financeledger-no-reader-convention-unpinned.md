---
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

## Work Log

### 2026-08-31 — SHIPPED
- **`server/src/lib/financeLedger.ts`** is now the single sanctioned way to sum the ledger:
  `netBalance(rows)` (pure), plus `teamBalance` / `leagueBalances` wrappers. Modelled on
  `ilLogDrift.ts` — the arithmetic is a pure function tested with plain rows, no prisma mocking.
- **10 tests**, written first and watched failing. The load-bearing one pins the Los Doyers shape:
  a `+10` voided charge, its `−10` contra-entry, and a `+25` replacement must net to **25**. A
  `voidedAt IS NULL` implementation returns 15 and fails it, so the wrong reading cannot be
  reintroduced silently. `leagueBalances` also pins that a team with NO ledger rows still appears
  at 0 — omitting it reads as "still loading" on the commissioner's screen.
- **`voidedAt` semantics documented on the Prisma model** (comment only — no migration).
- **The ledger has a reader.** `GET /api/commissioner/:leagueId/balances` (shared zod schemas in
  `shared/api/commissioner.ts`) backs the Commissioner → Finances → **Balances** tab, which is no
  longer a "coming soon" stub. Ledger and Payouts remain stubs and now say so accurately.
- **Audited for ad-hoc summing: none exists.** `ilFeeService.ts:320`'s
  `voidedAt: null, reversalOf: null` filter was deliberately left alone — reconcile is asking a
  different question ("which charges are currently active?"), not computing a balance.

**Browser-verified** (staging, `OGBA Staging` league): the Balances tab renders all 10 teams,
sorted by name, each at $0. Only console error is an unrelated AdSense 403 on localhost.

**Verification gap, stated per CLAUDE.md:** staging has **zero** FinanceLedger rows, so the
void+reversal netting could not be exercised in the browser — only in the unit tests. Seeding a
temporary fixture was blocked by the auto-mode classifier (DB writes are gated even against
staging). The end-to-end wiring, the every-team-appears behaviour, and the render are verified;
the arithmetic on real rows is not. Running the tab against prod's real ledger would close it.

### 2026-08-31 — renamed to complete (PR #457 merged)
Shipped in PR #457 (`c969494`). The rename was missed at merge time — the work log landed but the
`git mv` did not, which is precisely the phantom-rename failure mode recorded in
`feedback_phantom_rename_in_agent_prompts`. Corrected here.
