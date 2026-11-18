---
priority: p3
issue_id: "319"
tags: [ai, scoring]
dependencies: []
---

# Weekly digest stats line never shows saves

## Problem Statement
`server/src/features/mlb-feed/services/digestService.ts` (~line 323) builds each team's `statsLine` from a
hardcoded hitting/pitching list and looks up `"S"`, while the category ranks it reads are keyed `"SV"`. So saves
never appear in the digest's stats line. This predates Phase 3.5 (found in its final review, 2026-11-17). It is AI
prompt text only; no standings number depends on it. It was left out of the Phase 3.5 PR on purpose, because that
PR's gate is "OGBA output does not change", and this fix would change OGBA's digest text.

## Proposed Solution
Build the stats line from the league's categories (`getLeagueCategories`), reading each value by category key
(`SV`), and drop the local list.

## Acceptance Criteria
- [ ] A digest for a league that scores saves includes SV in the stats line (test with real `computeCategoryRows`).
- [ ] A subset league's stats line shows only its categories.
- [ ] `git mv` this todo from pending → complete.
