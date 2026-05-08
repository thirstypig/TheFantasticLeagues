---
status: complete
priority: p3
issue_id: "148"
tags: [code-review, agent-native, simplicity, players, awards]
dependencies: []
---

## Resolution — 2026-05-07 (verification pass, doc-only close)

Re-audit found the three sub-items have all been overtaken by events or rest
on incorrect premises. Closing as **superseded**; the one still-actionable
slice (awards weekKey enumeration + regex tightening) is split out as todo
#179 because it lives in a different feature module.

**1. SP/RP YAGNI claim is incorrect.** The original todo asserted "no
consumers reference SP/RP" — verification disagrees:
- `client/src/features/teams/lib/toHubPlayer.ts:95-98` — `narrowSlot` runs
  `SlotCodeSchema.safeParse` over the raw `Roster.assignedPosition` string
  and explicitly relies on SP/RP being in the union (per its own doc:
  "The wire SlotCode includes structural slots (BN, IL) and the pitcher
  sub-codes (SP, RP) … the RosterHubPlayer.assignedSlot field accepts
  that full vocabulary").
- `client/src/features/teams/lib/__tests__/toHubPlayer.test.ts:215-221`
  asserts SP/RP pass through unchanged (the contract `narrowSlot`
  enforces).
- Test fixtures in `server/src/features/teams/__tests__/teamService.test.ts`
  (lines 196, 259), `server/src/features/commissioner/__tests__/bulkOperationsService.test.ts:89`,
  and `client/src/features/teams/__tests__/Team.IL.test.tsx:176` use
  `assignedPosition: "SP"` as realistic-shape fixtures.
- `server/src/features/teams/services/teamService.ts:6` lists SP/RP in
  `POS_ORDER`, and the position config table at
  `server/src/lib/sports/baseball.ts:181-182` registers them as canonical
  position codes.

The original code review missed this layer. Dropping SP/RP from
`SlotCodeSchema` would break the round-trip contract for
`Roster.assignedPosition` strings and require either coercion in
`narrowSlot` or a data migration to collapse stored "SP"/"RP" rows to
"P" — neither is yagni-safe at P3. **Decision: keep SP/RP.** The
"future leagues with split pitcher slots" comment remains accurate
(today OGBA aggregates to "P" for slot output but the DB layer accepts
the sub-codes for incoming roster data).

**2. "No client consumer of `/eligible-slots`" — redundant by design.**
The v3 client computes eligibility client-side from `Player.posList`
via `slotsFor()` (`client/src/lib/positionEligibility.ts:47`). Live
consumers:
- `client/src/features/teams/components/RosterHub/PositionEligibilityCell.tsx:76`
- `client/src/features/teams/hooks/useRosterHubDrag.tsx:221, 457`
- `client/src/features/transactions/components/SwapMode/SlotCell.tsx:60`

`positionToSlots()` is a pure function over `posList` — `posList` already
ships in the roster fetch (`getTeamRosterHub` per todo #145), so calling
`/eligible-slots` per-row would be a network round-trip for data the
client already has. The endpoint stays useful as the **agent-facing**
contract (per its docblock — "Lets agents and the v3 client ask 'which
slots is this player eligible for?' without re-implementing …") and is
exercised by the 6 server tests at
`server/src/features/players/__tests__/routes.test.ts:218-285`. No UI
wireup needed; the alleged gap is non-existent.

**3. Awards weekKey enumeration + regex tightening — split to #179.**
The todo cited `server/src/features/mlb-feed/awardsRoutes.ts:24-37` but
the awards feature has since been promoted to its own module at
`server/src/features/awards/routes.ts` (line 22 holds the same
`/^\d{4}-W\d{2}$/` regex). Both items are still actionable:
- regex accepts `0000-W00`/`9999-W99` (semantic but harmless — falls
  through to compute and returns empty). Tighten to a real season-year
  range + W01-W53.
- `availableWeeks` enumeration: `digestRoutes.ts:23-43` already does the
  exact pattern (`AiInsight` rows + currentWeekKey synthesis) for league
  digests; awards can mirror it.

These live outside the `players` and `RosterHub/` scope of the original
todo so they ship as a separate `awards` feature follow-up.

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
