---
priority: p3
issue_id: "323"
tags: [ui, standings]
dependencies: []
---

# Hitting-only / pitching-only leagues show an empty half; "TOT" is unclear

## Problem Statement
Since Phase 3.5 (#513) a league may score only hitting or only pitching categories, but the UI still shows the empty tab/card. Separately, the mobile standings category tabs label their total column "TOT" (`client/src/mobile/pages/MobileStandings.tsx`). No effect on OGBA (scores both halves). Found in the 2026-11-18 design review.

## Proposed Solution
Hide the tab/card for a half with no categories. Rename the category-tab "TOT" to "PTS": "Hit pts" does not fit the 30px column without truncating team names; the footnote says "PTS = hitting/pitching points". The Period view keeps TOT (a season total).

## Acceptance Criteria
- [x] A subset league with no pitching cats shows no pitching tab/card (test).
- [x] OGBA unchanged.
- [x] Labels renamed; browser-verified.
- [x] `git mv` this todo from pending → complete.

## Work Log
- 2026-11-18: done — tabs hidden for an unscored half (opens on the scored one), Rules hides the empty card and the Format tile names the half; browser-verified on a local pitching-only league (phone + 1280px), rule restored.
- 2026-11-18: filed from the todo/design-review/open-items sweep.
