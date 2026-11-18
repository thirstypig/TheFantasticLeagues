---
priority: p2
issue_id: "320"
tags: [ui, standings]
dependencies: []
---

# Season page: no legend for gold cells; "Δ LAST" is unexplained

## Problem Statement
On `/season` (`client/src/features/periods/pages/Season.tsx:233`) the gold period-winner cells have no legend, and the "Δ LAST" column header doesn't say what it compares to. Owners look at this page more than any other. Found in the 2026-11-18 design review.

## Proposed Solution
Add a one-line legend under the table (gold = won that period). Relabel "Δ LAST" to "vs P{n}" using the previous period's number.

## Acceptance Criteria
- [x] Legend renders on desktop and mobile Season.
- [x] Header reads "vs P6" (or whichever period came before), driven by data, not hardcoded.
- [x] Browser-verified on prod or local.
- [x] `git mv` this todo from pending → complete.

## Work Log
- 2026-11-18: done — legend under the matrix + header 'vs P7' (data-driven); browser-verified locally at desktop width.
- 2026-11-18: filed from the todo/design-review/open-items sweep.
