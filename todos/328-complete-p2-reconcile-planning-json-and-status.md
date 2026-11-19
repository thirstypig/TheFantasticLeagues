---
priority: p2
issue_id: "328"
tags: [docs]
dependencies: []
---

# planning.json is months stale; generated status in CLAUDE.md/README still says In-Season 2026

## Problem Statement
`server/data/planning.json` is the canonical roadmap source (#424) but its entries stop in April–May 2026, so `/roadmap` and the generated "Current status" block are wrong. Inbox change request C-001. STATUS.md is also ~650 words against a 500-word target.

## Proposed Solution
Reconcile planning.json against shipped work (#415–#520), run `npm run docs:refresh`, and trim STATUS.md.

## Acceptance Criteria
- [x] planning.json reflects shipped phases.
- [x] Generated status no longer says In-Season 2026.
- [x] STATUS.md ≤500 words.
- [x] Resolve C-001 with the PR link.
- [x] `git mv` this todo from pending → complete.

## Work Log
- 2026-11-18: done — new first roadmap phase (off-season hardening), in-season phase marked done, Roster Hub done; 7 tasks marked done only where verified (prod has the session tables; www has sitemap/robots/OG/GA4; subscribe backend #415). Validated against the server Zod schema; /roadmap browser-verified locally. STATUS.md 719 → 433 words. Roadmap subtitle de-staled.
- 2026-11-18: filed from the todo/design-review/open-items sweep.
