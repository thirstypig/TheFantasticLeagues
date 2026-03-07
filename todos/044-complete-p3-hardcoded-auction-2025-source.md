---
status: complete
priority: p3
issue_id: "044"
tags: [code-review, quality]
dependencies: []
---

# Hardcoded `auction_2025` Source String

## Problem Statement
`server/src/features/auction/routes.ts:308` and `commissioner/routes.ts:657` hardcode `auction_2025` and `year: 2025`. Should derive from league season.

## Findings
- **Source**: kieran-typescript-reviewer, agent-native-reviewer
- **Fix**: Use `league.season` or `currentLeague.season` instead

## Acceptance Criteria
- [ ] Auction source derived from league season: `auction_${league.season}`
- [ ] Commissioner end-auction uses league.season for year
