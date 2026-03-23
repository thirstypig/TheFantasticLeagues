---
title: "fix: Ohtani pitcher eligibility + trigger prospect sync"
type: fix
status: active
date: 2026-03-22
---

# Fix Ohtani Pitcher Eligibility + Trigger AAA Prospect Sync

## Overview

Two issues preventing correct auction/roster behavior:

1. **Ohtani not selectable as P** — DB has single Player record with `posPrimary=DH, posList=DH`. The roster UI's eligibility check reads `posList` to determine valid slots, so P is never offered. His Skunk Dogs roster entries have `assignedPos=P` (set by commissioner), but the dropdown won't let owners select P because `posList` doesn't include it.

2. **Minor league players not visible** — `syncAAARosters()` was merged (PR #82) but never executed. The admin endpoint exists but hasn't been called.

## Problem Statement

### Ohtani

The two-way player architecture works like this:
- **DB**: Single `Player` row (id=3, mlbId=660271, posPrimary=DH, posList=DH)
- **API**: `expandTwoWayPlayers()` in `statsService.ts` creates two virtual rows (DH + P) for player lists
- **Roster**: 4 entries exist — 2 on SKD (one DH, one P), 2 on DLC (both DH)
- **Position validation**: `TeamRosterManager.tsx:195` splits `posList` by `,`/`/` to determine eligible slots

The gap: `expandTwoWayPlayers()` handles display, but `posList` in the DB is never updated to include "P". The position eligibility sync (`syncPositionEligibility`) won't fix this because pitching stats are in the `pitching` stat group, not `fielding`.

### Prospects

The `POST /api/admin/sync-prospects` endpoint exists and works (tested via unit tests). It just needs to be called after deployment. The server must be running on port 4010.

## Proposed Solution

### Fix 1: Two-Way Player posList Update

Update `syncAllPlayers()` and `syncPositionEligibility()` to set `posList="DH,P"` for players in the `TWO_WAY_PLAYERS` map. This is the minimal change that makes the existing eligibility system work correctly for two-way players.

**Option A (Recommended): Patch during syncAllPlayers** — When upserting a player found in `TWO_WAY_PLAYERS`, always set `posList` to `"{hitterPos},P"`.

**Option B: Patch during syncPositionEligibility** — After computing fielding-based eligibility, check if the player is in `TWO_WAY_PLAYERS` and add "P" to their posList.

**Option C: Both** — Apply in both sync paths for resilience. Either sync alone produces the correct result.

**Recommendation: Option C** — Costs almost nothing and ensures correctness regardless of which sync runs first.

### Fix 2: Trigger Prospect Sync

Call the existing endpoint:
```bash
curl -X POST http://localhost:4010/api/admin/sync-prospects \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"season": 2026}'
```

No code changes needed — just execution.

## Acceptance Criteria

- [ ] Ohtani's `posList` is `"DH,P"` after running `syncAllPlayers` or `syncPositionEligibility`
- [ ] Position dropdown in TeamRosterManager shows P as valid for Ohtani
- [ ] Ohtani's pitcher row displays pitching stats (W, SV, K, ERA, WHIP)
- [ ] `syncAllPlayers()` sets `posList="{hitterPos},P"` for all TWO_WAY_PLAYERS entries
- [ ] `syncPositionEligibility()` adds "P" to posList for TWO_WAY_PLAYERS entries
- [ ] AAA prospects visible in player pool after running sync-prospects endpoint
- [ ] Existing tests still pass; new tests cover two-way posList logic
- [ ] Player count increases from ~1,652 to ~2,500+ after AAA sync

## Technical Considerations

### Files to Modify

| File | Change |
|------|--------|
| `server/src/features/players/services/mlbSyncService.ts` | `syncAllPlayers()`: set posList for TWO_WAY_PLAYERS on create AND update |
| `server/src/features/players/services/mlbSyncService.ts` | `syncPositionEligibility()`: after computing eligible set, add "P" for TWO_WAY_PLAYERS |
| `server/src/features/players/__tests__/mlbSyncService.test.ts` | Add test cases for two-way posList in both sync functions |

### No Changes Needed

- `expandTwoWayPlayers()` — already works correctly for display
- `TeamRosterManager.tsx` — already reads `posList` correctly; fix is in the data
- `positionToSlots()` — already maps "P" → ["P"] and "DH" → ["DH"]
- Client normalization — `normalizeTwoWayRow()` already handles two-way display
- Prospect sync code — already merged and tested, just needs execution

### Edge Cases

- **Future two-way players**: Adding a new player to `TWO_WAY_PLAYERS` map automatically gets them the dual posList during next sync
- **Ohtani traded**: His `mlbTeam` updates via `syncAllPlayers()`, posList stays "DH,P"
- **Ohtani injury (no pitching)**: posList should still be "DH,P" — eligibility is based on designation, not current-season activity

## Implementation Steps

### Phase 1: Code Changes (~15 min)

- [ ] In `syncAllPlayers()`: when creating or updating a player in TWO_WAY_PLAYERS, set `posList` to `"{hitterPos},P"` instead of just `hitterPos`
- [ ] In `syncPositionEligibility()`: after building the eligible set, check TWO_WAY_PLAYERS and add "P" if present
- [ ] Add 2-3 test cases covering two-way posList logic

### Phase 2: Verify (~5 min)

- [ ] Run full test suite
- [ ] TypeScript check

### Phase 3: Execute Syncs (~5 min)

- [ ] Start local server on port 4010
- [ ] Call `POST /api/admin/sync-mlb-players` (updates Ohtani's posList)
- [ ] Call `POST /api/admin/sync-prospects` (adds AAA players)
- [ ] Call `POST /api/admin/sync-position-eligibility` (updates all players' posList from fielding)
- [ ] Verify Ohtani posList = "DH,P"
- [ ] Verify player count increased
- [ ] Verify UI shows P option for Ohtani on Skunk Dogs roster

## Sources

- `server/src/features/players/services/statsService.ts:180-202` — expandTwoWayPlayers()
- `server/src/lib/sportConfig.ts:114-126` — TWO_WAY_PLAYERS constant
- `client/src/features/teams/components/TeamRosterManager.tsx:195` — position eligibility check
- `server/src/features/players/services/mlbSyncService.ts` — syncAllPlayers, syncPositionEligibility
- Memory: [project_ohtani_two_way.md](../../.claude/projects/-Users-jameschang-Projects-fbst/memory/project_ohtani_two_way.md)
