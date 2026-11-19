---
priority: p3
issue_id: "334"
tags: [ui]
dependencies: []
---

# Settings section icons were invisible on the light theme

## Problem Statement
RulesEditor drew section icons with a fixed `brightness(0) invert(1)` filter, so they were white on the light paper theme.

## Proposed Solution
Draw them as a CSS mask filled with `var(--am-text-muted)`, which follows the theme.

## Acceptance Criteria
- [x] Icons visible in light and dark (browser-verified both).
- [x] Unit test pins mask + theme colour, no filter.
- [x] `git mv` this todo from pending → complete.

## Work Log
- 2026-11-18: done — `categoryIconStyle()` mask; verified locally: light rgb(94,87,71), dark rgb(200,185,178).
- 2026-11-18: filed.
