---
status: complete
priority: p2
issue_id: "232"
tags: [code-review, pr-359, typescript, transactions, shared-schemas]
dependencies: []
---

# Replace `CascadeMove` with shared `AppliedReassignment` + use `ClaimResponse` in CommissionerRosterTool

## Problem Statement

PR #359 introduced a `CascadeMove { playerName, oldSlot, newSlot }` interface in
`TransactionResultModal.tsx` that is a strict subset of the already-shared
`AppliedReassignment { rosterId, playerId, playerName, oldSlot, newSlot }` from
`shared/api/rosterMoves.ts:306`. All 4 caller sites pass full `AppliedReassignment[]`
into a field typed as `ReadonlyArray<CascadeMove>`; TS accepts via structural
width subtyping, which means a future rename in `AppliedReassignment` (e.g.
`playerName → name`) won't fail at the modal boundary.

Compounding it: `CommissionerRosterTool.tsx:220` called
`fetchJsonApi<{ appliedReassignments?: Array<{ playerId; playerName; oldSlot; newSlot }> }>`
— an inline ad-hoc shape that duplicated `ClaimResponse` AND dropped `rosterId`.
The two other commissioner drawer paths correctly used the typed `ilStash`/`ilActivate`
API wrappers.

## Resolution

- Added `claim(params)` wrapper to `client/src/features/transactions/api.ts` mirroring
  `ilStash`/`ilActivate`, returning the typed `ClaimResponse`.
- Replaced the inline `fetchJsonApi<>` call in `CommissionerRosterTool.handleAddDrop`
  with `claim()` — restores `rosterId` to the response, removes the duplicated
  shape, and gives the body request-side zod validation.
- In `TransactionResultModal.tsx`, deleted the `CascadeMove` interface entirely;
  `cascadeMoves` now accepts `ReadonlyArray<AppliedReassignment>` from
  `@shared/api/rosterMoves`.
- Changed cascade list key from `{i}` to `{m.playerId}` (now usable).
- Removed the 2 `as any[]` casts on `playersEnriched` added by PR #359 (lines 232
  and 300). `playersEnriched` is `PlayerSeasonStat[]` with enrichment fields; the
  raw type already has `.id`, `.name`, `.player_name`. Pre-existing `as any[]`
  sites elsewhere in the file left alone (out of scope; tracked by todo #116).

## Resources

- PR #359: `c451385`
- PR A (this fix): `chore/pr-359-cleanup-typing`
