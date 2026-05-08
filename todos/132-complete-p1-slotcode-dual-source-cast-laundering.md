---
status: pending
priority: p1
issue_id: "132"
tags: [code-review, type-safety, drift, shared-api, teams]
dependencies: []
---

# SlotCode has two parallel definitions; toHubPlayer casts launder unknown values past the enum

## Problem Statement

Two issues on the same Zod `SlotCode` enum that PR #181 just shipped:

1. **Dual-source:** `shared/api/rosterMoves.ts:23–38` defines a `SlotCodeSchema` enum, AND `client/src/lib/sports/baseball.ts` defines a parallel `SLOT_CODES` runtime array. `client/src/features/teams/components/RosterHub/types.ts:11` imports the latter. So `RosterHubPlayer.assignedSlot` (driven by `lib/sports/baseball.ts`) and `EligibleSlotsResponse.eligibleSlots` (driven by Zod) are structurally identical but nominally different. The compiler will not catch a future drift (someone adding "UTIL" to one side).

2. **Cast laundering in `toHubPlayer`:** `client/src/features/teams/lib/toHubPlayer.ts:76,80` does:
   ```ts
   gamesPlayedByPosition: p.gamesByPos as RosterHubPlayer["gamesPlayedByPosition"],
   assignedSlot: (slot === "IL" ? "IL" : slot) as RosterHubPlayer["assignedSlot"],
   ```
   The whole point of the SlotCode enum is to make unknown strings a runtime error. The cast lets any string the server returns slip through unchecked. The 17 toHubPlayer tests don't exercise the unknown-slot case because the cast hides it.

## Findings

- `shared/api/rosterMoves.ts:23–38` — `SlotCodeSchema = z.enum([...])`
- `client/src/lib/sports/baseball.ts` — separate `SLOT_CODES` array
- `client/src/features/teams/components/RosterHub/types.ts:11` — imports from `lib/positionEligibility` which imports from `lib/sports/baseball.ts`
- `client/src/features/teams/lib/toHubPlayer.ts:76,80` — casts launder strings into `SlotCode`

## Proposed Solutions

### Option 1: Make Zod the single source; derive runtime arrays from `.options` (recommended)

`shared/api/rosterMoves.ts` exports `SlotCodeSchema` AND `export const SLOT_CODES = SlotCodeSchema.options`. Both `lib/positionEligibility` and `lib/sports/baseball.ts` re-export from there. Then in `toHubPlayer`, validate via `SlotCodeSchema.safeParse(slot)` and fall back to `"BN"` on miss.

**Effort:** Small (~1h). **Risk:** Low — schema is additive.

### Option 2: Remove `lib/sports/baseball.ts:SLOT_CODES`; force everyone through Zod

Stronger but touches more files. May surface other ad-hoc consumers.

**Effort:** Medium (~2h). **Risk:** Low.

## Recommended Action

Option 1.

## Technical Details

- `shared/api/rosterMoves.ts` — add re-export
- `client/src/lib/sports/baseball.ts` — delete duplicate
- `client/src/features/teams/lib/toHubPlayer.ts:76,80` — replace casts with `safeParse` fallbacks
- `client/src/features/teams/lib/__tests__/toHubPlayer.test.ts` — add tests for unknown slot strings

## Acceptance Criteria

- [ ] Single `SLOT_CODES` constant in the codebase (Zod-derived)
- [ ] `toHubPlayer` rejects unknown slot strings (falls back to BN)
- [ ] New unit tests covering unknown slot input
- [ ] `tsc --noEmit` clean

## Resources

- `docs/solutions/logic-errors/under-declared-ts-type-hid-server-fields.md`
- PR #181 (the schema introduction)
- PR #185 (toHubPlayer extraction)

## Work Log

### 2026-04-30 — Initial Discovery
- kieran-typescript-reviewer flagged dual-source + cast laundering during /ce:review.
