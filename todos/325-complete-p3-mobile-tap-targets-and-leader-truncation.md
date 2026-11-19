---
priority: p3
issue_id: "325"
tags: [ui, mobile, accessibility]
dependencies: []
---

# Mobile standings: ~25px header tap targets; category-leader cards truncate names

## Problem Statement
Mobile standings column headers are 22–42px wide (#520), under the 44px tap-target guideline, and the category-leader cards cut off team names. Found in the 2026-11-18 design review.

## Proposed Solution
Make the sortable header hit area taller/wider than its visual width (padding or pseudo-element), without widening columns. Let leader cards wrap to two lines.

## Acceptance Criteria
- [x] Header hit area ≥44px in at least one dimension, no layout overflow at 390px.
- [x] Longest team name ("Demolition Lumber Co.") readable in leader cards.
- [x] Browser-verified at 390px.
- [x] `git mv` this todo from pending → complete.

## Work Log
- 2026-11-18: done — MSortHeader minHeight 44; leader names wrap; verified at 390px (all headers 44px tall, no overflow, names complete).
- 2026-11-18: filed from the todo/design-review/open-items sweep.
