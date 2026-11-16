---
priority: p2
issue_id: "315"
tags: [payouts, league-admin, commissioner, meeting]
dependencies: []
---

# Void a meeting overtime fee from the commissioner Money tools

## Problem Statement

The live meeting (DOC-042) charges an overtime fee when a turn runs past its clock and the
`meeting.overtime_fee` rule is on ($1 or $5). The fee is written as a `FinanceLedger` row
(`type: "meeting_overtime"`) in the same request that ends the turn, including when the
commissioner skips a turn that has already gone over.

There is no way to undo that fee in the app. A wrong charge (the commissioner was slow to tap
Skip, the clock ran during a dispute, a mis-tap) can only be fixed by a hand-written DB write,
which needs James (prod writes are blocked for agents).

The design spec used to promise "The commissioner can void it through the existing Money tools".
Those tools don't exist. The spec and the Rules screen were corrected on 2026-11-15 (final
review fix wave, I3) to say a fee can't be undone in the app yet; this todo is the follow-up.

## Evidence

- `FinanceLedger` is append-only. A correction stamps `voidedAt` on the original row **and**
  appends a negated contra-entry with `reversalOf` = the original id (`prisma/schema.prisma`,
  comments near `voidedAt` / `reversalOf`). Totals sum every row (`server/src/lib/financeLedger.ts`,
  todo #311); `voidedAt` is never a filter.
- Writers today: `server/src/features/transactions/services/ilFeeService.ts` (IL fees, and the only
  code that voids: void + reversal during reconcile) and `server/src/features/meeting/routes.ts`
  (`tx.financeLedger.create` for `meeting_overtime`, ~line 181). No route voids a row.
- Reader: `GET /api/commissioner/:leagueId/balances` (`server/src/features/commissioner/routes.ts`)
  via `leagueBalances`.
- The Commissioner → Finances "Ledger" sub-tab is a stub:
  `client/src/features/commissioner/pages/Commissioner.tsx:1724-1727` renders
  "Financial ledger and payout calculator — coming soon."

## Proposed Solutions

1. Server: `POST /api/commissioner/:leagueId/ledger/:entryId/void` (commissioner or admin), in one
   transaction: load the row (must belong to the league, must not already be voided, must not itself
   be a reversal), stamp `voidedAt`, append the contra-entry (`amount: -row.amount`,
   `reversalOf: row.id`, same `teamId` / `periodId` / `type`, reason "Void of ledger #N by
   commissioner"), and write an audit-log entry. Put the void+reversal pair in
   `server/src/lib/financeLedger.ts` so ilFeeService can reuse it later.
2. Server: `GET /api/commissioner/:leagueId/ledger?type=meeting_overtime` listing rows with their
   void state, so the client doesn't sum or filter on its own.
3. Client: replace the Ledger stub with a list of fee rows (team, period, amount, reason, date) and a
   "Void" button per live row behind `ConfirmSheet` (irreversible-action confirm; no other modal).
   Start with `meeting_overtime` only; IL fees keep their reconcile path.
4. Remove the "A fee can't be undone in the app yet." sub-line on the Rules screen
   (`RulesPage.tsx`, "Penalty for going over") and update DOC-042's Turn flow sentence.

## Acceptance Criteria

- [ ] A commissioner can void a `meeting_overtime` row from Commissioner → Finances; an owner can't
      (403), and a row from another league 404s.
- [ ] Voiding writes exactly two changes in one transaction: `voidedAt` on the original and a
      negated `reversalOf` row; voiding twice is refused (409) and writes nothing.
- [ ] After a void, `leagueBalances` for that team drops by the fee amount (test pins net, not
      double-removed), and the test asserts on the Prisma write args, not just a mocked result.
- [ ] The Ledger tab no longer says "coming soon"; the void button is 44px, behind ConfirmSheet.
- [ ] The Rules sub-line and the DOC-042 sentence are updated in the same PR.
- [ ] Browser-verified on staging/local; any test fee written to a shared DB is reversed.

## Work Log

- 2026-11-15: Created from the live meeting final review (I3).
