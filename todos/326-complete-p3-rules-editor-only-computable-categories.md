---
priority: p3
issue_id: "326"
tags: [rules, scoring]
dependencies: []
---

# Rules editor offers 20 categories but only 10 can be scored

## Problem Statement
The Rules category editor offers 20 categories; the scoring engine computes 10 (`SCORABLE_HITTING_CATS` / `SCORABLE_PITCHING_CATS`). Picking any of the other 10 silently scores nothing. No OGBA impact. Parked Phase 3.5 minors ride along: editor chips when both halves are empty, the once-per-league warning, and `SCORABLE_KEYS` possibly unused (confirm with grep before deleting).

## Proposed Solution
Restrict the editor to the 10 scorable categories. Handle the three minors in the same PR.

## Acceptance Criteria
- [x] Editor lists only scorable categories (test).
- [x] Both-halves-empty state handled.
- [x] `SCORABLE_KEYS` removed or its caller found.
- [x] `git mv` this todo from pending → complete.

## Work Log
- 2026-11-18: main item was ALREADY DONE in #513 — the editor lists only SCORABLE_HITTING_CATS/SCORABLE_PITCHING_CATS and the server rejects anything else (CommissionerService.assertValidRuleValue). The '20 categories' note in memory was stale. Done here: Settings shows 'No categories picked, so standings score all 10.' when both lists are [] (browser-verified locally, rules restored); deleted unused SCORABLE_KEYS (server) and the old 20-item HITTING_CATS/PITCHING_CATS (client). The once-per-league warning is intended (process-lifetime dedupe of a log line) — no change.
- 2026-11-18: filed from the todo/design-review/open-items sweep.
