---
title: "feat: Yahoo-Style Roster Slot Management"
type: feat
status: active
date: 2026-03-25
---

# Yahoo-Style Roster Slot Management

## Overview

Replace the current free-form position assignment system with a Yahoo Fantasy Baseball-style slot-based roster management UI. Each roster has defined position slots (C x2, 1B, 2B, 3B, SS, MI, CM, OF x5, DH = 14 hitters + P x9 pitchers). Players can only be placed in slots they're eligible for. Visual indicators show slot fill status. Server validates all position assignments.

**Current state:** Positions are free-form strings. A team could have 3 SS players and 0 catchers with no warnings. No enforcement of slot limits outside the auction draft.

**Target state:** Slot-based roster display with eligibility enforcement, visual compliance indicators, and server-side validation — matching industry standard patterns from Yahoo/ESPN/Fantrax.

## Problem Statement / Motivation

1. **No roster compliance feedback** — owners have no way to know if their roster is "legal" (all required slots filled with eligible players)
2. **Position changes don't persist correctly on Draft Report** — positions shown don't match the auction source of truth
3. **No slot enforcement after draft** — trades, waivers, and add/drops create roster entries with no position assignment
4. **Commissioner has no visibility** into roster compliance across the league

## Industry Research Summary

All three major platforms (Yahoo, ESPN, Fantrax) use the same fundamental pattern:

| Pattern | Industry Standard |
|---------|------------------|
| **Layout** | Vertical list of position slots (not a spatial grid) |
| **Interaction** | Two-click (select player → select target slot) or dropdown |
| **Enforcement** | Prevent invalid moves (only show valid targets) |
| **Bench** | Any player can go to BN regardless of position |
| **Empty slots** | Allowed — you just miss stats from that slot |
| **Save behavior** | Auto-save on move (Yahoo/ESPN) |
| **Multi-position** | Show all eligible positions; user chooses which slot |
| **Eligibility once gained** | Never lost during the season |

**Key insight:** None of the platforms use drag-and-drop. All use click-based selection flows. None require a "valid" lineup — empty slots are permitted.

## Proposed Solution

### Phase 1: Slot-Based Display + Compliance Indicators (MVP)

Transform the Team page roster from a flat table into a slot-based vertical list. Add compliance indicators (green/amber/red). Make the Draft Report read-only but sourced from the same position data as the auction.

**Scope:**
- Team page: Slot-based roster display with position dropdowns
- Draft Report: Read-only, positions sourced from `Roster.assignedPosition` (matches auction)
- Auction page: No change (already working)
- Visual indicators: Green (slot filled + valid), Amber (slot empty), Red (invalid assignment)
- Server: Validate position eligibility on PATCH

### Phase 2: Auto-Assignment + Trade/Waiver Integration

Auto-assign positions when players enter rosters via trade, waiver, or auction. Add swap logic when moving a player displaces another.

### Phase 3: Lineup Lock + Scoring Integration (Future)

Per-player game-time locks. Only active-slot players contribute to scoring. Weekly lineup setting.

## Technical Approach

### Key Design Decisions

**Q1: Cosmetic or scoring?** → **Cosmetic for Phase 1.** All rostered players contribute to stats regardless of assigned slot. Scoring integration is Phase 3.

**Q2: Slot collision on PATCH?** → **Auto-displace to BN.** When Player B is moved to SS and Player A is already at SS, Player A's `assignedPosition` is set to `null` (bench).

**Q3: New acquisitions?** → **Default to BN (null).** Trades, waivers, and auction wins set `assignedPosition = null`. Owner must manually assign via Team page.

**Q4: Migration for existing data?** → **Auto-assign script.** Run a best-fit algorithm: keepers first by price desc, then auction picks by price desc. Overflow to BN.

### Architecture

#### Slot Configuration (Single Source of Truth)

```
LeagueRule (category="roster", key="roster_positions")
→ { "C": 2, "1B": 1, "2B": 1, "3B": 1, "SS": 1, "MI": 1, "CM": 1, "OF": 5, "DH": 1 }

LeagueRule (category="roster", key="pitcher_count")
→ 9

Bench slots = rosterSize - sum(hitter slots) - pitcherCount
           = 23 - 14 - 9 = 0 (OGBA default)
```

#### Server Validation (PATCH endpoint)

```
PATCH /api/teams/:teamId/roster/:rosterId
Body: { assignedPosition: "SS" | "BN" | null }

Validation:
1. Position must be in VALID_SLOTS = [...Object.keys(roster_positions), "P", "BN", null]
2. If position != "BN" and position != null:
   a. Player must be eligible: position ∈ allEligibleSlots(player.posList)
   b. Slot must have capacity: count(team roster where assignedPosition == position) < limit
   c. If slot is full, auto-displace: find current occupant, set their assignedPosition = null
3. Write assignedPosition to DB
```

#### New Utility Function

```typescript
// server/src/lib/sportConfig.ts + client/src/lib/sportConfig.ts
export function allEligibleSlots(posList: string): string[] {
  const slots = new Set<string>();
  for (const pos of posList.split(/[,/| ]+/).map(s => s.trim()).filter(Boolean)) {
    for (const s of positionToSlots(pos)) slots.add(s);
  }
  return Array.from(slots);
}
```

#### Slot-Based Roster UI (Team Page)

```
┌─────────┬────────────────────────┬─────┬──────────┐
│ SLOT    │ PLAYER                 │ MLB │ STATUS   │
├─────────┼────────────────────────┼─────┼──────────┤
│ C       │ Carson Kelly           │ CHC │ 🟢       │
│ C       │ Will Smith        K   │ LAD │ 🟢       │
│ 1B      │ Spencer Steer [▼1B/CM]│ CIN │ 🟢       │
│ 2B      │ Brandon Lowe    [▼2B] │ PIT │ 🟢       │
│ 3B      │ Austin Riley    [▼3B] │ ATL │ 🟢       │
│ SS      │ Mookie Betts K  [▼SS] │ LAD │ 🟢       │
│ MI      │ Konnor Griffin  [▼MI] │ PIT │ 🟢       │
│ CM      │ Max Muncy       [▼CM] │ LAD │ 🟢       │
│ OF      │ Victor Scott II       │ STL │ 🟢       │
│ OF      │ Juan Soto         K   │ NYM │ 🟢       │
│ OF      │ Andy Pages        K   │ LAD │ 🟢       │
│ OF      │ Alek Thomas           │ AZ  │ 🟢       │
│ OF      │ Ryan O'Hearn [▼OF/DH] │ PIT │ 🟢       │
│ DH      │ Gavin Sheets [▼OF/DH] │ SD  │ 🟢       │
│ ─────── │ ─────────── PITCHERS ─│─────│──────────│
│ P       │ Corbin Burnes         │ AZ  │ 🟢       │
│ P       │ Hunter Greene         │ CIN │ 🟢       │
│ ...     │ (7 more pitchers)     │     │ 🟢       │
│ ─────── │ ─────────── BENCH ────│─────│──────────│
│ BN      │ (empty)               │     │ ⚪       │
└─────────┴────────────────────────┴─────┴──────────┘
```

### Implementation Phases

#### Phase 1A: Fix Draft Report Positions (Quick Win)

**Goal:** Draft Report shows positions from `Roster.assignedPosition` (source of truth), matching what the auction page shows.

**Files:**
- `server/src/features/auction/routes.ts` — draft-report endpoint already sends `r.assignedPosition || r.player.posPrimary` (fixed in Session 48)
- `client/src/features/ai/pages/DraftReportPage.tsx` — make position display read-only (remove dropdown, just show the assigned position from auction)

**Effort:** 30 minutes

#### Phase 1B: Server-Side Position Validation

**Goal:** PATCH endpoint validates eligibility and slot capacity.

**Files:**
- `server/src/lib/sportConfig.ts` — add `allEligibleSlots(posList)` utility
- `client/src/lib/sportConfig.ts` — matching client-side utility
- `server/src/features/teams/routes.ts` — add validation to PATCH:
  1. Validate position value against known slots
  2. Check player eligibility via `allEligibleSlots`
  3. Check slot capacity from league rules
  4. Auto-displace if slot is full

**Effort:** 2-3 hours

#### Phase 1C: Slot-Based Team Page UI

**Goal:** Transform Team page from flat table to slot-based vertical list with compliance indicators.

**Files:**
- `client/src/features/teams/pages/Team.tsx` — rewrite roster display:
  1. Load `roster_positions` from league rules API
  2. Build slot template: expand `{"C": 2, "1B": 1, ...}` into ordered slot rows
  3. Match players to slots by `assignedPosition`
  4. Render unassigned players in BN section
  5. Show status indicators per slot (green filled, amber empty, red invalid)
  6. Position dropdown per player (filtered by eligibility)

**Effort:** 4-6 hours

#### Phase 1D: Auto-Assignment Migration Script

**Goal:** Populate `assignedPosition` for all existing active roster entries.

**Algorithm:**
1. Load all active roster entries per team, ordered by: keepers first, then price desc
2. Load `roster_positions` rule for the league
3. For each player, find the first available eligible slot
4. If no slot available, leave as BN (null)
5. Log all assignments and conflicts

**Files:**
- `server/src/scripts/auto-assign-positions.ts` — one-off migration script

**Effort:** 1-2 hours

### Phase 2: Auto-Assignment on Acquisition

**Goal:** When players enter rosters via trade/waiver/auction, auto-assign to best available slot.

**Files:**
- `server/src/features/trades/routes.ts` — after roster create, call `autoAssignSlot()`
- `server/src/features/waivers/routes.ts` — after roster create, call `autoAssignSlot()`
- `server/src/features/auction/routes.ts` — after finish lot, call `autoAssignSlot()`

**Shared utility:**
```typescript
// server/src/lib/rosterSlots.ts
export async function autoAssignSlot(tx: PrismaTransaction, rosterId: number, teamId: number, leagueId: number): Promise<string | null>
```

**Effort:** 3-4 hours

### Phase 3: Lineup Lock + Scoring (Future)

Out of scope for now. Would require:
- Per-player lock times from MLB schedule
- Standings pipeline changes (only count active-slot players)
- Daily lineup setting workflow

## System-Wide Impact

### Interaction Graph
- `PATCH /api/teams/:teamId/roster/:rosterId` → validates eligibility → checks slot capacity → auto-displaces → writes DB
- `autoAssignSlot()` called from trade processing, waiver processing, auction finish
- Team page reads `roster_positions` from league rules API + roster data from team details API

### Error Propagation
- Invalid position → 400 response with descriptive error ("Player not eligible for SS")
- Slot full → auto-displace to BN (no error, but response includes displacement info)
- Legacy invalid data → displayed with red indicator, owner can fix

### State Lifecycle Risks
- **Migration required** before UI is useful — all existing `assignedPosition = null` entries
- **Cron safe** — `syncAllPlayers` does not touch `assignedPosition` (it's on Roster, not Player)
- **Two-way players** — Ohtani has 2 roster entries, migration must handle correctly

### API Surface Parity
- Same `PATCH /api/teams/:teamId/roster/:rosterId` endpoint used by Auction, Team, Draft Report, Commissioner
- All surfaces use the same `positionToSlots` → `allEligibleSlots` pipeline

## Acceptance Criteria

### Phase 1A (Draft Report Fix)
- [ ] Draft Report roster shows positions matching auction page (read-only)
- [ ] No position dropdowns on Draft Report (read-only display)

### Phase 1B (Server Validation)
- [ ] PATCH rejects invalid position values (not in known slots)
- [ ] PATCH rejects ineligible positions (player not qualified)
- [ ] PATCH auto-displaces when slot is full
- [ ] `allEligibleSlots()` utility added to both server and client sportConfig

### Phase 1C (Slot-Based UI)
- [ ] Team page shows slot-based vertical list (not flat table)
- [ ] Green/amber/red indicators per slot
- [ ] Position dropdown only shows eligible slots with capacity
- [ ] Multi-position players can be moved between eligible slots
- [ ] BN section shows unassigned players
- [ ] Pitchers shown in P slots below hitters

### Phase 1D (Migration)
- [ ] Script populates `assignedPosition` for all active roster entries
- [ ] Keepers assigned first, then by price descending
- [ ] Overflow goes to BN (null)
- [ ] Script is idempotent (safe to re-run)

## Dependencies & Risks

| Risk | Mitigation |
|------|-----------|
| Migration script assigns wrong positions | Run in dry-run mode first, log all assignments for review |
| Two-way player edge case | Special handling: detect same playerId with 2 roster entries |
| Legacy data with invalid positions | Display with red indicator, don't block reads |
| Mobile UX for dropdowns | Use native `<select>` which renders as native picker on mobile |
| Performance of slot validation on PATCH | Single DB query for team roster + O(1) lookup |

## Sources & References

### Internal
- `server/src/lib/sportConfig.ts` — positionToSlots, POS_ORDER, DEFAULT_RULES
- `server/src/features/auction/routes.ts:264-327` — loadPositionLimits, checkPositionLimit (auction-only)
- `server/src/features/teams/routes.ts:303-331` — PATCH endpoint (currently no validation)
- `client/src/features/teams/pages/Team.tsx` — current Team page with new position dropdowns
- `server/src/scripts/normalize_positions.ts` — reference for historical position normalization

### External (Yahoo/ESPN/Fantrax Research)
- Yahoo: Roster Management Guide — vertical slot list, swap mode, auto-save
- ESPN: Setting Your Lineup — Move/Here two-click pattern, Quick Lineup auto-fill
- Fantrax: Submit button (manual mode), click-to-swap for same-position
- All platforms: Eligibility once gained is never lost during season
- All platforms: Empty slots allowed, no forced lineup validation
