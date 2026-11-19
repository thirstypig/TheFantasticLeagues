---
priority: p2
issue_id: "327"
tags: [ci, architecture]
dependencies: []
---

# ADR-015 feature-isolation check is not in CI

## Problem Statement
`scripts/check-feature-isolation.mjs` is not run by `.github/workflows/ci.yml` (verified 2026-11-18), so the ADR-015 ratchet is voluntary. Inbox change request C-002 / RISK-002. Memory notes un-baselined violations have reached main before.

## Proposed Solution
Add a CI step that runs the check and fails on new violations. Reconcile the baseline first so main is green.

## Acceptance Criteria
- [ ] CI runs the check on PRs and main.
- [ ] Baseline matches main; CI green.
- [ ] Resolve C-002 in `docs/_comments.json` with the PR link.
- [ ] `git mv` this todo from pending → complete.

## Work Log
- 2026-11-18: filed from the todo/design-review/open-items sweep.
