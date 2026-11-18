---
priority: p3
issue_id: "321"
tags: [ui, rules]
dependencies: []
---

# Rules page: abbreviated category chips, no lower-is-better hint, missing "P 9" roster chip

## Problem Statement
The Rules page (`client/src/features/commissioner/pages/RulesPage.tsx`) shows category chips as abbreviations (R, HR…), doesn't mark ERA/WHIP as lower-is-better, and the roster-slot chips leave out "P 9". Found in the 2026-11-18 design review.

## Proposed Solution
Spell out chips (Runs, Home Runs…) with the abbreviation kept; add a "lower is better" mark on ERA and WHIP; render the pitcher slot chip from the league's roster config.

## Acceptance Criteria
- [ ] Chips show full names.
- [ ] ERA/WHIP marked lower-is-better.
- [ ] Roster chips include every configured slot, including P 9.
- [ ] Browser-verified.
- [ ] `git mv` this todo from pending → complete.

## Work Log
- 2026-11-18: filed from the todo/design-review/open-items sweep.
