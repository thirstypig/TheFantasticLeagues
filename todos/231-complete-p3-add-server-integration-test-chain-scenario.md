---
status: pending
priority: p3
issue_id: 231
tags: [code-review, testing, architecture, transactions]
---

# Add Server Integration Test for Multi-Hop Chain Claim Scenario

## Problem Statement

PR #349's motivating scenario — adding a 2B player by moving Tatis from 2B→OF (freeing the 2B slot for the incoming player), then dropping a pure-OF player — has no corresponding integration test in `server/src/__tests__/integration/transaction-claims.test.ts`.

The server's `resolveLineup` bipartite matcher handles multi-hop chains by construction (Hopcroft-Karp finds the globally optimal assignment), but there is no test asserting that this specific 3-player chain scenario returns `ok: true`. A regression in the matcher's greedy seeding or incumbent-placement logic would go undetected.

## Proposed Solution

Add a test to `transaction-claims.test.ts` (or a new `chain-claim.test.ts`) that:

1. Creates a test roster with:
   - Player A assigned to 2B, eligible for 2B + OF (Tatis-like)
   - Player B assigned to OF, eligible for OF only (the "chain drop" target)
2. Adds an FA with `positions = "2B"` (needs 2B slot)
3. Calls `resolveLineup` / the claim handler with `dropPlayerId = Player B's ID`
4. Asserts `ok: true` and that `appliedReassignments` includes `Player A → OF`

This test documents the server-side chain resolution contract and protects against matcher regressions.

## Acceptance Criteria
- [ ] Integration test added exercising the 2-player chain scenario (A moves 2B→OF, drop B from OF)
- [ ] Test asserts `ok: true` and `appliedReassignments` includes the chain move
- [ ] (Stretch) Add a 3-player chain test (A → B → C → drop D)
- [ ] Test runs in CI
