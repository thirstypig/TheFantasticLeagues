---
status: pending
priority: p2
issue_id: "114"
tags: [code-review, agent-native, api]
dependencies: []
---

# Extended stats (OBP, SLG, OPS) stored but not returned by any API

## Problem Statement

The sync pipeline stores OBP, SLG, OPS (and 13 other extended fields) in `PlayerStatsPeriod`, but neither `GET /api/player-season-stats` nor `GET /api/player-period-stats` includes them in the response. The data exists in the DB but is invisible to both the UI and agents.

## Proposed Solutions

Add `OBP, SLG, OPS` (and optionally BB, TB, SO, L, GS, K9, BB9, HR_A, BF) to the response mapper in `server/src/features/players/routes.ts` for both season-stats and period-stats endpoints. The data is already fetched by Prisma — only the response mapping needs updating.

- **Effort**: Small (~15 min)

## Work Log
- **2026-04-18**: Flagged by agent-native-reviewer.
