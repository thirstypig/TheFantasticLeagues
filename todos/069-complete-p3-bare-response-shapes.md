---
status: pending
priority: p3
issue_id: "069"
tags: [code-review, quality]
dependencies: []
---

# Bare Response Shapes on Stats, Player Detail, and Roster Endpoints

## Problem Statement
Several endpoints return bare arrays or objects instead of wrapping in a keyed object. This is inconsistent with the pattern established by other endpoints (`{ teams }`, `{ trades }`, `{ players }`, etc.) and prevents adding metadata fields later.

## Findings
- **Agent-Native Reviewer, Pattern Recognition**: Both flagged inconsistent response shapes
- `GET /api/player-season-stats` — returns raw array
- `GET /api/player-period-stats` — returns raw array
- `GET /api/auction-values` — returns raw array
- `GET /api/players/:mlbId` — returns bare player object (list endpoint returns `{ players }`)
- `GET /api/roster/:teamCode` — returns bare array
- `GET /api/roster/year/:year` — returns bare array

## Proposed Solutions

### Option A: Wrap all responses in objects
- `{ stats }` for season/period stats, `{ values }` for auction values
- `{ player }` for single player, `{ roster }` for roster endpoints
- Update corresponding client API types
- **Effort**: Medium | **Risk**: Low (client changes needed)

## Technical Details
- **Affected files**: server/src/index.ts, server/src/features/players/routes.ts, server/src/features/roster/routes.ts, client API files

## Acceptance Criteria
- [ ] All list endpoints return wrapped arrays
- [ ] Client API types updated to match
