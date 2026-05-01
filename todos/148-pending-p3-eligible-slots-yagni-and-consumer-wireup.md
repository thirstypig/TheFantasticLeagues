---
status: pending
priority: p3
issue_id: "148"
tags: [code-review, agent-native, simplicity, players, awards]
dependencies: []
---

# Eligible-slots polish: drop SP/RP, wire one client consumer, add awards weekKey enumeration

## Problem Statement

Three small follow-ups on PR #181 / awards endpoints:

1. **YAGNI: `SlotCodeSchema` includes SP, RP, CM, MI** (`shared/api/rosterMoves.ts:23-38`). Docblock admits SP and RP are aggregated to "P" in OGBA and only kept "so future leagues with split pitcher slots can use the same schema." There is no second league. CM/MI are OGBA-specific composites (keep). Drop SP and RP until a real consumer exists.
2. **No client consumer of `/api/players/:mlbId/eligible-slots`** — endpoint and schema are well-tested but no UI calls it. The next session should wire it up so the schema gets exercised against real UI needs (e.g., `RosterRowV3.tsx` show-eligibility affordance).
3. **Awards endpoint accepts `weekKey=YYYY-WNN` but offers no enumeration.** Agents asking "what weeks have an MVP race?" hit guess-and-check. Add either `availableWeeks` to the response or a `GET /api/leagues/:leagueId/awards/weeks` endpoint.

Bonus: weekKey regex `/^\d{4}-W\d{2}$/` accepts `0000-W00` / `9999-W99` (semantic but harmless — falls through to compute and returns empty). Tighten as part of the same pass.

## Findings

- `shared/api/rosterMoves.ts:23-38` — SP/RP YAGNI
- No client file references `/eligible-slots`
- `server/src/features/mlb-feed/awardsRoutes.ts:24-37` — weekKey regex too permissive

## Proposed Solutions

### Option 1: Combined polish PR (recommended)

- Drop SP, RP from `SlotCodeSchema`
- Add `client/src/features/teams/api.ts:getEligibleSlots(playerId, leagueId)`
- Wire one call from `RosterRowV3.tsx` (e.g., on hover / on click of position chip)
- Tighten weekKey regex; add `GET /awards/weeks`

**Effort:** Small (~3-4h). **Risk:** Low.

## Recommended Action

Option 1.

## Technical Details

- `shared/api/rosterMoves.ts` — schema cleanup
- `client/src/features/teams/api.ts` — new function
- `client/src/features/teams/components/RosterHub/RosterRowV3.tsx` — consumer
- `server/src/features/mlb-feed/awardsRoutes.ts` — regex + new sub-route

## Acceptance Criteria

- [ ] SP/RP removed from `SlotCodeSchema` (no consumers reference them)
- [ ] At least one UI call site exercises `/eligible-slots`
- [ ] Awards endpoint exposes valid weeks (response field or sub-route)
- [ ] weekKey regex rejects `0000-W00`-style nonsense

## Resources

- Simplicity + agent-native review under /ce:review 2026-04-30

## Work Log

### 2026-04-30 — Initial Discovery
- code-simplicity-reviewer + agent-native-reviewer both flagged.
