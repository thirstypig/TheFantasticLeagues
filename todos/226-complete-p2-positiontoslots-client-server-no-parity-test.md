---
status: pending
priority: p2
issue_id: 226
tags: [code-review, architecture, testing, transactions]
---

# positionToSlots Client/Server Divergence Has No CI Parity Test

## Problem Statement

`positionToSlots` (the function that maps position strings like `"2B"`, `"SS"` to `Set<SlotCode>`) exists in two separate files with no shared implementation:

- Client: `client/src/lib/positionEligibility.ts` → used by `slotsFor()` in `filteredDropCandidates` BFS
- Server: `server/src/features/transactions/lib/slotMatcher.ts` → used by `resolveLineup()` bipartite matcher

The `slotMatcher.ts` comment even acknowledges: "Copied (not cross-imported) per PR1 spec." They are currently byte-identical, but there is no CI test asserting this. If someone adds a new position token (e.g. new OF variant, DH expansion) to one file and not the other, the client BFS will surface different drop candidates than the server matcher will accept — silently.

This gap is made more load-bearing by PR #349: the BFS now represents substantial eligibility reasoning on the client side, not just a trivial display filter. The client-server contract is now deeper.

## Findings

Affected files:
- `client/src/lib/positionEligibility.ts` — `slotsFor()` + `positionToSlots()`
- `server/src/features/transactions/lib/slotMatcher.ts` — local `slotsFor()` + `positionToSlots()` copy

Correct long-term fix: move `positionToSlots` to `shared/api/` (the `shared/api/playerSeasonStats.ts` precedent shows cross-side imports work in this monorepo). Short-term fix: add a parity test.

## Proposed Solutions

### Option A: Move positionToSlots to shared/api/ (Recommended long-term)
Create `shared/api/positionEligibility.ts`, export `positionToSlots` and `slotsFor`. Both client and server import from there.
- Effort: Medium (update all import sites)
- Risk: Low — but requires confirming `shared/api/` is importable from both sides (PR #213 fixed ESM packaging)

### Option B: Add parity test (Recommended near-term)
Add a test in `client/src/__tests__/positionEligibility.parity.test.ts` that imports both implementations and asserts identical output for all known position tokens.
- Effort: Small
- Risk: None — read-only test, no behavioral change

### Option C: Leave as-is (Not recommended)
Risk accumulates as position token set grows.

## Acceptance Criteria
- [ ] Either: both sides import from a single `shared/api/positionEligibility.ts`, OR
- [ ] A CI test exists that asserts both implementations return identical results for all known position tokens
- [ ] No behavior change to either the client filter or server matcher
