---
status: complete
priority: p2
issue_id: "233"
tags: [code-review, pr-359, dead-code, transactions, cleanup]
dependencies: []
---

# Delete dead `formatReassignmentsToast` helper + tests + stale mock stubs

## Problem Statement

PR #359 replaced the toast-based reassignment-confirmation UX with the modal in
all 4 caller sites, but left the `formatReassignmentsToast` helper, its 6 unit
tests, and two leftover `vi.mock` stubs in panel tests that no longer import
the helper.

## Resolution

- Removed `formatReassignmentsToast` from `client/src/features/transactions/api.ts`.
- Removed the `formatReassignmentsToast` import from
  `client/src/features/transactions/__tests__/api.test.ts`.
- Deleted the `describe("formatReassignmentsToast", …)` block (6 tests, ~75 LOC).
- Removed the stale `vi.mock` entries from
  `RosterMovesTab/__tests__/{PlaceOnIlPanel,ActivateFromIlPanel}.test.tsx`.
- Verified no remaining references via `grep -r formatReassignmentsToast client/`
  (post-edit) returns nothing.

Net: ~90 LOC + 6 tests retired. Affected suites (170 tests across transactions
and commissioner modules) still green.

## Resources

- PR #359: `c451385`
- PR A (this fix): `chore/pr-359-cleanup-typing`
