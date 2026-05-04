# Institutional Learnings: Roster Position Management in FBST

## Search Context
- **Feature/Task**: Understanding roster position management, eligibility, slot validation, and lineup setting decisions
- **Keywords Used**: position, eligibility, outfield mode, DH, MI, CI, positionToSlots, posList, syncPositionEligibility, two-way players
- **Files Scanned**: CLAUDE.md, FEEDBACK.md, sportConfig.ts, auction-ux-position-dropdown doc, ohtani-fix plan, roster-overhaul plan
- **Relevant Matches**: 5 documents with critical position management decisions

---

## Critical Patterns & Architectural Decisions

### 1. Position-to-Slot Mapping (Core Architecture)
- **File**: `server/src/lib/sportConfig.ts` (also mirrored in `client/src/lib/sportConfig.ts`)
- **Relevance**: Foundation for all position validation and dropdown generation
- **Key Insight**: Use `positionToSlots()` function — never hardcode position options. This ensures MI/CI/CM/OF eligibility is consistently applied everywhere.

**The Pattern:**
```typescript
export function positionToSlots(pos: string): string[] {
  const p = pos.trim().toUpperCase();
  if (p === "C") return ["C"];
  if (p === "1B") return ["1B", "CM"];      // Corner infield
  if (p === "2B") return ["2B", "MI"];      // Middle infield
  if (p === "3B") return ["3B", "CM"];      // Corner infield
  if (p === "SS") return ["SS", "MI"];      // Middle infield
  if (p === "LF" || p === "CF" || p === "RF" || p === "OF") return ["OF"];
  if (p === "DH") return ["DH"];
  if (p === "P" || p === "SP" || p === "RP" || p === "CL" || p === "TWP") return ["P"];
  return [];
}
```

**Lessons from Session 47-48:**
- **BEFORE**: Position dropdowns were built with hardcoded `['BN', 'UTIL', 'P']` fallbacks
- **AFTER**: All dropdowns now derive eligible slots from `positionToSlots()`
- **Fix location**: `auction/pages/AuctionComplete.tsx` and position dropdown components

### 2. Multi-Position Eligibility (posList vs posPrimary)
- **Severity**: HIGH
- **Relevance**: Essential for accurate player positioning

**The Pattern:**
```
Player.posPrimary = "SS"  // Primary MLB position
Player.posList = "SS,MI,2B"  // Eligible slots (from fielding stats with 20+ GP)
```

**Critical Fix from Session 48:**
- `syncAllPlayers()` was overwriting enriched `posList` with just `posPrimary`
- Solution: Only overwrite if `posList === posPrimary` (not enriched yet)

### 3. Two-Way Player Handling (Ohtani)
- **Severity**: CRITICAL
- **The Rule**: posList MUST include "P" for two-way players

**Two-Way Sync Pattern:**
```typescript
// syncAllPlayers(): set posList = "{hitterPos},P" for TWO_WAY_PLAYERS
// syncPositionEligibility(): add "P" to posList for TWO_WAY_PLAYERS
```

**Stats Display Rule:**
- Check `assignedPos` in the roster row:
  - If `assignedPos="P"`, show pitching stats (W, SV, K, ERA, WHIP)
  - If `assignedPos="DH"` or other hitter position, show hitting stats (R, HR, RBI, SB, AVG)

### 4. DH Eligibility (Non-Blanket Rule)
- **Severity**: HIGH
- **Fixed**: Session 47

**The OLD Pattern (Wrong):**
```typescript
if (!isPitcher) slots.add('DH');  // All hitters get DH — WRONG!
```

**The NEW Pattern (Correct):**
Only add DH if player has 20+ games at DH position (via fielding stats)

### 5. Outfield Position Mapping (Display vs Data)
- **Severity**: MEDIUM
- **Implemented**: Session 22

**The Pattern:**
```typescript
function mapPosition(pos: string, outfieldMode: 'OF' | 'CF/LF/RF'): string {
  if (outfieldMode === 'OF' && ['CF', 'LF', 'RF'].includes(pos)) {
    return 'OF';
  }
  return pos;
}
```

**Applied Everywhere:**
- Team page rosters
- Season standings matrix
- Home page roster preview
- PlayerDetailModal fielding section
- Draft Report roster display
- NOT in auction (auction uses actual MLB positions)

### 6. Position Change Persistence (Session 48 Bug Fix)
- **Severity**: HIGH
- **Fixed**: Session 48

**The Bug:**
- Position changes were saved to DB but didn't reflect in UI
- Caused by `AuctionResults` not passing `onRefresh` callback to `AuctionComplete`

**The Fix:**
```typescript
const [positionOverrides, setPositionOverrides] = useState<Record<string, string>>({});

const handlePositionChange = async (rosterId: string, newPos: string) => {
  setPositionOverrides(prev => ({ ...prev, [rosterId]: newPos }));
  await patchRosterPosition(rosterId, newPos);
  onRefresh?.();  // CRITICAL: refresh server state
};
```

### 7. Position Eligibility Sync (Daily Cron Job)
- **Severity**: CRITICAL (runs unsupervised daily)
- **Schedule**:
  - 12:00 UTC: `syncAllPlayers()` → `syncPositionEligibility()`
  - 13:00 UTC: `syncAllActivePeriods()`

**Critical Rules:**
1. `syncAllPlayers()` runs FIRST, preserves enriched posList
2. `syncPositionEligibility()` runs SECOND, enriches with multi-position data
3. **MUST preserve data**: syncAllPlayers only overwrites posList if it equals posPrimary
4. **20-game threshold**: Player qualifies for a position if 20+ games at that position
5. **Two-way special case**: Always add "P" to posList for TWO_WAY_PLAYERS

**Gotcha (Session 48):**
- If sync function not added to cron, it won't run
- `syncPositionEligibility()` was coded months earlier but never wired into cron
- Result: Multi-position eligibility wasn't updating

---

## Anti-Patterns & What NOT To Do

1. **❌ Hardcode position options in dropdowns**
   - Don't: `const slots = ['BN', 'UTIL', 'P'];`
   - Do: `const slots = positionToSlots(playerPos);`

2. **❌ Give all hitters DH eligibility**
   - Don't: `if (!isPitcher) slots.add('DH');`
   - Do: Let fielding stats sync determine DH eligibility (20+ games at DH)

3. **❌ Overwrite posList on daily sync if it's already enriched**
   - Don't: `posList = posPrimary;` (always)
   - Do: Only overwrite if `posList === posPrimary` (not enriched yet)

4. **❌ Display wrong stats for two-way players**
   - Don't: Always use `isPitcher` from Player record
   - Do: Check `assignedPos` from the roster row

5. **❌ Apply outfield mapping in position dropdowns**
   - Don't: Show "OF" as only option in `outfieldMode="OF"`
   - Do: Keep dropdowns showing actual positions; map at display time only

6. **❌ Forget to wire new sync functions into the cron**
   - Don't: Write function but never call it
   - Do: Add to `server/src/index.ts` cron schedule

7. **❌ Create controlled position inputs without a refresh callback**
   - Don't: `<select value={pos} onChange={...} />` without syncing server state
   - Do: Optimistic state + DB save + `onRefresh()` callback

---

## Code Locations

### Position Utilities
- `server/src/lib/sportConfig.ts` — `positionToSlots()`, position rules
- `client/src/lib/sportConfig.ts` — Mirrored utilities
- `server/src/lib/baseballUtils.ts` (client) — Position helpers

### Sync Logic
- `server/src/features/players/services/mlbSyncService.ts` — Sync functions
- `server/src/index.ts` — Cron schedule

### Two-Way Player Configuration
- `server/src/lib/sportConfig.ts` — `TWO_WAY_PLAYERS` map
- `server/src/features/players/services/statsService.ts` — `expandTwoWayPlayers()`

### Auction Components
- `client/src/features/auction/pages/AuctionComplete.tsx` — Position dropdown
- `client/src/features/auction/pages/AuctionResults.tsx` — Wrapper with onRefresh
- `client/src/features/auction/components/RosterGrid.tsx` — Position display

### Team/Roster Display
- `client/src/features/teams/pages/Team.tsx` — Roster with outfieldMode
- `client/src/components/shared/PlayerDetailModal.tsx` — Fielding stats

---

## Related Documents

- **Auction UX Fixes**: `docs/solutions/ui-bugs/auction-ux-position-dropdown-ohtani-stats-api-migration.md` — Full details of Session 47 position dropdown and two-way player fixes
- **Ohtani Fix Plan**: `docs/plans/2026-03-22-fix-ohtani-pitcher-eligibility-and-prospect-sync-plan.md` — Technical approach to two-way posList
- **Roster Overhaul Plan**: `docs/plans/2026-03-25-feat-roster-display-overhaul-plan.md` — Latest thinking on position display in auction complete
- **FEEDBACK.md Sessions 47-48**: Detailed execution notes on position fixes and sync preservation

---

## Test Coverage

- `server/src/lib/__tests__/baseballUtils.test.ts` — 32 tests covering `positionToSlots()`, `sortByPosition()`, position order
- `server/src/features/players/__tests__/mlbSyncService.test.ts` — Tests for sync logic including two-way player handling
- `server/src/features/auction/__tests__/routes.test.ts` — 23 tests including position limit enforcement
- `client/src/lib/__tests__/baseballUtils.test.ts` — Client-side position utilities

---

## Current Product Rules

- OGBA uses `P` for all pitchers. Do not expose separate fantasy roster slots for `SP` and `RP`.
- OGBA uses `OF` for outfield. Do not expose separate fantasy roster slots for `LF`, `CF`, and `RF`.
- OGBA uses `CM`, not `CI`, for corner-man.
- OGBA has 23 active slots and no bench. Adds, IL activations, and position moves must end in a legal full-roster assignment.
- Confirmation buttons for add/drop, IL stash, and IL activate should stay disabled until a server-backed preview confirms the roster rules are satisfied.
- The server-side full-roster matcher is the final authority; client-side eligibility display is guidance.

## Golden Rule

**Position eligibility is flexible, but roster legality is strict.** A player can be eligible at multiple positions, but every active OGBA roster change must resolve to exactly the legal slot mix. Use `positionToSlots()` and the shared slot schemas for display and hints, then let the server matcher approve or reject the final roster state.
