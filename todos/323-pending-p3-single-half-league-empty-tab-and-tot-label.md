---
priority: p3
issue_id: "323"
tags: [ui, standings]
dependencies: []
---

# Hitting-only / pitching-only leagues show an empty half; "TOT" is unclear

## Problem Statement
Since Phase 3.5 (#513) a league may score only hitting or only pitching categories, but the UI still shows the empty tab/card. Separately, the roster table total row reads "TOT" (`RosterHubV3.tsx:238`). No effect on OGBA (scores both halves). Found in the 2026-11-18 design review.

## Proposed Solution
Hide the tab/card for a half with no categories. Rename "TOT" to "Hit pts" / "Pitch pts".

## Acceptance Criteria
- [ ] A subset league with no pitching cats shows no pitching tab/card (test).
- [ ] OGBA unchanged.
- [ ] Labels renamed; browser-verified.
- [ ] `git mv` this todo from pending → complete.

## Work Log
- 2026-11-18: filed from the todo/design-review/open-items sweep.
