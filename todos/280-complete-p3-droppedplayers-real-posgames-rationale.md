---
status: pending
priority: p3
issue_id: 280
tags: [code-review, architecture, posGames, teamService]
dependencies: []
---

## Problem Statement

`teamService.ts` line 228 passes real `posGames` data to `buildGamesByPos` for `droppedPlayers`. The dropped-players list is a historical log (showing `releasedAt`). Real GP data reflects the player's current MLB totals at the time of the hub request — NOT their GP at the time they were on the roster. A player dropped in April could show a full-season GP count in September, which could mislead users about why the player was dropped.

Architecture reviewer flagged this as an undocumented product decision.

## Proposed Solutions

### Option A — Pass null for dropped players (Recommended)
```typescript
// droppedRows.map (teamService.ts ~line 228)
gamesByPos: TeamService.buildGamesByPos(r.player.posPrimary, r.player.posList, null),
```
Uses the synthetic fallback consistently for historical entries. Avoids misleading current-state data for past roster entries.

### Option B — Document the decision explicitly
Add a JSDoc comment explaining why current-state GP is intentionally shown for dropped players (e.g., for scouting purposes in waiver wire context).

## Acceptance Criteria

- [ ] Either: droppedPlayers passes `null` as posGames to buildGamesByPos, OR a JSDoc comment documents the deliberate product decision to show current-state GP for dropped players

## Work Log

### 2026-06-05 — Flagged by architecture-strategist (PR #378 review)
