---
priority: p3
issue_id: "322"
tags: [ui, mobile, rules]
dependencies: []
---

# Mobile Rules: scoring buried under the 9-tile overview; NL-only not stated

## Problem Statement
On mobile, the scoring section sits below the 9-tile overview, and the page doesn't say "NL players only" (desktop RulesPage does). Found in the 2026-11-18 design review.

## Proposed Solution
Move scoring above the overview on the mobile Rules twin and show the NL-only line when the league setting is on.

## Acceptance Criteria
- [ ] Scoring is the first section on mobile Rules.
- [ ] "NL players only" shows when the setting is on, hidden when off (test both).
- [ ] Browser-verified at 390px.
- [ ] `git mv` this todo from pending → complete.

## Work Log
- 2026-11-18: filed from the todo/design-review/open-items sweep.
