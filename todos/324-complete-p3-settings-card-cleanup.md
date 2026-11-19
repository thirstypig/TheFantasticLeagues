---
priority: p3
issue_id: "324"
tags: [ui, commissioner]
dependencies: []
---

# Settings card: repeated headers, "$1" wording, 50-IP minimum not marked as manual

## Problem Statement
The league Settings card repeats its card headers, writes the minimum bid awkwardly, and lists the 50-IP minimum without saying it is not auto-enforced (decided 2026-11-10: flag to commissioner, no auto-penalty). Found in the 2026-11-18 design review.

## Proposed Solution
Drop the duplicate headers, write the minimum bid as "$1", and add "not auto-enforced — commissioner checks" next to the 50-IP minimum.

## Acceptance Criteria
- [x] One header per card.
- [x] Minimum bid reads "$1".
- [x] 50-IP note present.
- [x] Browser-verified.
- [x] `git mv` this todo from pending → complete.

## Work Log
- 2026-11-18: done — one title per card, '$1'/'$400', 50-IP note; also removed the editor's repeated '✦ League Rules' eyebrow; browser-verified locally.
- 2026-11-18: filed from the todo/design-review/open-items sweep.
