---
status: complete
priority: p2
issue_id: "016"
tags: [code-review, security]
dependencies: []
---

# Unauthenticated Endpoints Exposing League Data

## Problem Statement
Several GET endpoints serve data without requiring authentication, exposing player catalogs, period schedules, stats, and auction values to anonymous users.

## Findings
- **Security Sentinel, Pattern Recognition**: Both flagged these endpoints
- Unprotected endpoints:
  - `GET /api/players` — `server/src/features/players/routes.ts:16` (full player catalog)
  - `GET /api/players/:mlbId` — `server/src/features/players/routes.ts:48` (individual player details)
  - `GET /api/periods` — `server/src/features/periods/routes.ts:8` (period schedule)
  - `GET /api/player-season-stats` — `server/src/index.ts:158` (inline route)
  - `GET /api/player-period-stats` — `server/src/index.ts:162` (inline route)
  - `GET /api/auction-values` — `server/src/index.ts:166` (inline route)
- Note: `leagues/:id` and `leagues/:id/rosters` intentionally allow unauthenticated access for public leagues (inline visibility check)

## Proposed Solutions

### Option A: Add requireAuth to all data endpoints (Recommended)
Add `requireAuth` middleware to all 6 endpoints listed above.

**Pros**: Consistent with all other data endpoints. Prevents info disclosure.
**Cons**: Breaks any unauthenticated access patterns (unlikely for a fantasy league app).
**Effort**: Small (30 min)
**Risk**: Low

### Option B: Leave players/periods public, protect stats
Some data (player names, period dates) could be considered public. Only protect the strategic data.

**Pros**: Minimal change.
**Cons**: Inconsistent auth pattern.
**Effort**: Small
**Risk**: Low

## Acceptance Criteria
- [ ] All listed endpoints require `requireAuth`
- [ ] Inline routes in `index.ts` moved to proper feature modules or protected in place
- [ ] Tests pass

## Work Log
- 2026-03-06: Created from code review synthesis
