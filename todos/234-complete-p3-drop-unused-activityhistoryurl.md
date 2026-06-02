---
status: complete
priority: p3
issue_id: "234"
tags: [code-review, pr-359, yagni, transactions, cleanup]
dependencies: []
---

# Drop unused `activityHistoryUrl` from `TransactionResultModal`

## Problem Statement

`TransactionResult.activityHistoryUrl` was added with optional Link rendering,
but zero callers pass it. The field, the conditional, the `<Link>`, the `<span />`
placeholder, and the `react-router-dom` import only existed for a hypothetical
future feature.

## Resolution

- Dropped `activityHistoryUrl` from the `TransactionResult` interface.
- Removed the conditional Link rendering and `<span />` placeholder; footer now
  renders only the OK button (right-aligned via `flex justifyContent: flex-end`).
- Removed the `react-router-dom` `Link` import — modal no longer depends on routing.
- ~20 LOC saved.

When a real consumer needs the activity-link affordance, the right home is the
`useTransactionResultFlow` hook (todo #236), not the modal itself.

## Resources

- PR #359: `c451385`
- PR A (this fix): `chore/pr-359-cleanup-typing`
