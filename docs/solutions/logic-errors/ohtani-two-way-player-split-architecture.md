---
title: "Ohtani Two-Way Player Split — Separate Player Records Architecture"
problem_type: logic-error
severity: high
status: resolved
session: "Session 49"
date_resolved: "2026-03-29"
affected_modules:
  - server/src/lib/sportConfig.ts
  - server/src/features/players/services/statsService.ts
  - server/src/features/standings/services/standingsService.ts
  - prisma/schema.prisma (Player model)
tags:
  - two-way-player
  - ohtani
  - data-modeling
  - roster-management
  - position-eligibility
cross_references:
  - docs/solutions/logic-errors/hardcoded-season-year-constants.md
  - docs/solutions/ui-bugs/auction-ux-position-dropdown-ohtani-stats-api-migration.md
---

# Ohtani Two-Way Player Split

## Problem

Shohei Ohtani was stored as a single Player record (id=3, mlbId=660271) but owned by TWO fantasy teams simultaneously — as a Pitcher on Skunk Dogs and as a Hitter (DH) on Demolition Lumber Co.

The system used `TWO_WAY_PLAYERS` map + `expandTwoWayPlayers()`/`splitTwoWayStats()` to virtually duplicate him in player lists. This caused:

- **Stats confusion**: Standings computation needed special two-way logic to count only the correct stat group
- **Position ambiguity**: Single `posList="DH,P"` made position assignment unclear
- **Sync overwrites**: Daily `syncAllPlayers()` could wipe enriched position data
- **Trade/waiver ambiguity**: Processing didn't know which "version" was being moved
- **Client fragility**: 8+ pages needed to call expansion functions consistently

## Solution: Two Separate Player Records

Split Ohtani into physically separate database records:

| Field | Hitter | Pitcher |
|-------|--------|---------|
| `id` | 3 | 3191 |
| `name` | Shohei Ohtani (Hitter) | Shohei Ohtani (Pitcher) |
| `mlbId` | 660271 | 1660271 (derived: original + 1M) |
| `posPrimary` | DH | P |
| `posList` | DH | P |
| Owner | Demolition Lumber Co. (DH) | Skunk Dogs (P, keeper) |

### Key Design Decisions

**Derived MLB ID**: Pitcher uses `1660271` (original + 1,000,000). Avoids collisions with real MLB IDs. Daily sync ignores it since it doesn't exist in the MLB API.

**Empty TWO_WAY_PLAYERS Map**: The map is kept (for future two-way players) but emptied. All expansion code becomes a no-op for Ohtani.

```typescript
export const TWO_WAY_PLAYERS: ReadonlyMap<number, { hitterPos: string; name: string }> = new Map([
  // Empty — Ohtani split into separate player records
]);
```

**Separate Roster Entries**: Each team has a roster entry pointing to the correct player ID. No ambiguity in trades, waivers, or standings.

## Benefits

| Before (Virtual Expansion) | After (Separate Records) |
|---------------------------|-------------------------|
| Special two-way logic in standings | Standard stats computation |
| `expandTwoWayPlayers()` called on 8+ pages | No expansion needed |
| Position dropdown confusion | Each record has own `posList` |
| Sync could overwrite position data | Pitcher record not synced |
| Trade processing ambiguous | Clear player ID per roster entry |

## Caveats

1. **Daily sync skips pitcher Ohtani** — `syncAllPlayers()` won't find mlbId 1660271 in the MLB API. Pitcher stats must be managed via period sync (which uses playerId, not mlbId)
2. **MLB team changes** — If Ohtani is traded to a new MLB team, the pitcher record's `mlbTeam` field must be updated manually
3. **Future two-way players** — Use the same derived ID pattern (`1000000 + realMlbId`), create a second Player record, and optionally re-populate the `TWO_WAY_PLAYERS` map

## Prevention: Future Two-Way Players

1. Use derived ID pattern: `1000000 + mlbId`
2. Create separate Player record with role-specific `posPrimary` and `posList`
3. Create roster entries pointing to the correct player ID
4. Mark keeper status explicitly on the roster entry
5. Document in `sportConfig.ts` alongside `OHTANI_PITCHER_MLB_ID`

## Files Modified

- `server/src/lib/sportConfig.ts` — Emptied `TWO_WAY_PLAYERS`, added `OHTANI_PITCHER_MLB_ID`
- `server/src/features/players/__tests__/routes.test.ts` — Skipped 4 obsolete tests
- `server/src/features/players/__tests__/mlbSyncService.test.ts` — Skipped 3 obsolete tests
- Database: Created Player id=3191, updated Player id=3 name, updated roster entries
