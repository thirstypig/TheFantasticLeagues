---
priority: p3
issue_id: "335"
tags: [ui, standings]
dependencies: []
---

# Season page highlighted every cell when all teams tied a period

## Problem Statement
`Season.tsx` marked a cell 'best' when it equalled the period max, so an all-tie period painted every cell (mobile standings had the same bug, fixed in #518).

## Proposed Solution
`cellTier()`: no highlight when the period's best equals its worst; otherwise best = peak, ≥80% of best = strong.

## Acceptance Criteria
- [x] All-tie period shows no highlight (browser-verified: 24 tied cells, 0 highlighted).
- [x] Mixed period keeps peak/strong (unit tests).
- [x] `git mv` this todo from pending → complete.

## Work Log
- 2026-11-18: done — mixed-score highlighting is covered by unit tests only; local data has no non-tied period.
- 2026-11-18: filed.
