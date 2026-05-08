---
status: complete
priority: p2
issue_id: "139"
tags: [code-review, performance, transactions]
dependencies: []
---

# Transactions handlers serialize 6+ awaits inside `$transaction` while holding the only Supabase connection

## Problem Statement

`server/src/features/transactions/routes.ts:225-385, 630-755, 893-989` — claim, il-stash, il-activate each run up to 6-9 sequential awaits inside `$transaction`:

1. SELECT FOR UPDATE
2. roster.findFirst (re-lock)
3. assertIlSlotAvailable / assertNoGhostIl
4. assertNoOwnershipConflict
5. roster.update / create
6. loadSlotCapacities (LeagueRule reads)
7. buildCandidatesForTeam (roster + players reads)
8. Optional verifyEligibilityUnchanged
9. transactionEvent.create × 2-4

With `connection_limit=1`, the transaction holds the lone connection for ~300ms per happy-path claim. Concurrent claims serialize completely on the wire, not just on row locks.

## Findings

- Three handlers, each with the same shape
- Several reads inside the tx are independent and could run via `Promise.all`
- `getLeagueRules` cache passed `client as any` (`autoResolveLineup.ts:45`) — verify cache hits work when `client` is a `Prisma.TransactionClient`; if not, the route is re-querying LeagueRule

## Proposed Solutions

### Option 1: Parallelize independent reads inside each tx (recommended)

```ts
const [slotCapacities, candidates] = await Promise.all([
  loadSlotCapacities(tx, leagueId),
  buildCandidatesForTeam(tx, teamId),
]);
```

Cuts wall time on tx by ~30-40%. No behavior change.

**Effort:** Small (~2h, three handlers). **Risk:** Low — independent reads, no ordering dependency.

### Option 2: Move non-locking reads outside the tx

Smaller-scope alternative: `loadLeagueRosterCap` and `loadSlotCapacities` likely don't need to be inside the row-lock. Pre-read, pass values into the tx.

**Effort:** Small. **Risk:** Low — verify nothing inside the tx mutates the rules.

## Recommended Action

Option 1 first (mechanical). Option 2 as a follow-up audit if profiling shows the LeagueRule reads dominate.

## Technical Details

- `server/src/features/transactions/routes.ts:225-385, 630-755, 893-989`
- `server/src/features/transactions/lib/autoResolveLineup.ts:42-45` — verify `getLeagueRules` cache works with tx client; remove `as any`

## Acceptance Criteria

- [ ] Each handler has a `Promise.all` parallelizing independent reads
- [ ] Tx duration measured before/after; ≥25% reduction on happy path
- [ ] Existing transaction tests pass; one new test exercises the parallel path
- [ ] `client as any` cast removed from `autoResolveLineup.ts:45`

## Resources

- Performance review under /ce:review 2026-04-30

## Work Log

### 2026-04-30 — Initial Discovery
- performance-oracle flagged during /ce:review re-run.
