---
status: complete
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
- **2026-04-30**: Shipped on `feat/agent-native-extended-stats-and-awards`. Both endpoints now return the full extended-field set:
  - `GET /api/player-season-stats` — `parseSeasonStats` in `statsService.ts` now reads `baseOnBalls/hitByPitch/sacFlies/totalBases/doubles/triples/strikeOuts/obp/slg/ops` (batting) and `losses/gamesStarted/strikeoutsPer9Inn/walksPer9Inn/homeRuns/battersFaced` (pitching) from the MLB API; the route mapper threads them onto each row.
  - `GET /api/player-period-stats` — route mapper now exposes the existing `PlayerStatsPeriod` columns (BB/HBP/SF/TB/DBL/TPL/SO/OBP/SLG/OPS + L/GS/QS/K9/BB9/HR_A/BF) on every row.
  - Updated `shared/api/playerSeasonStats.ts` Zod schema with the new optional fields so the contract is enforced at compile time on both sides.
  - Tests: contract test in `server/src/features/players/__tests__/routes.test.ts` asserts every extended field is present (and numeric) on each season-stats and period-stats row.
  - Client risk audit: every consumer (`features/players/api.ts`, `pages/HomeLegacy.tsx`, `features/teams/pages/Teams.tsx`) reads typed fields by name rather than enumerating keys, so adding fields is non-breaking.
