# Week 2 Standings Refactor — Progress & Handoff

**Status:** 50% complete (11 of ~25 hours invested)  
**Date started:** 2026-06-22  
**Next session:** Resume Week 2.2 (computeTeamStats refactor)  
**All tests:** 2203 passing, zero regressions

---

## What's Done ✅

### 1. Category Engine Infrastructure (6 hours)
**File:** `server/src/features/standings/lib/categoryEngine.ts` (NEW)

- `getLeagueCategories(sport, customCategories)` — Load categories from sport config or custom league settings
- `getCategoryValue(teamStats, category, sport)` — Safe accessor for any stat (handles computed stats like AVG, ERA, WHIP)
- `hasComponentStats()` — Check if row has component stats for rate computation
- Ready for any sport: MLB, NFL, NBA

**Impact:** Foundation for making standings fully sport-agnostic

---

### 2. Generic TeamStatRow Refactored (3 hours)
**File:** `server/src/features/standings/services/standingsService.ts`

**Before:**
```typescript
export interface TeamStatRow {
  team: { id: number; name: string; code: string };
  R: number; HR: number; RBI: number; SB: number; AVG: number;
  W: number; S: number; ERA: number; WHIP: number; K: number;
  H?: number; AB?: number; ER?: number; IP?: number; BB_H?: number;
}
```

**After:**
```typescript
export interface TeamStatRow {
  team: { id: number; name: string; code: string };
  [statKey: string]: number | { id: number; name: string; code: string } | undefined;
}
```

**Plus:** Added `getTeamStatValue(row, key)` helper for safe access in tests/routes

---

### 3. Sport-Agnostic Aggregation (2 hours)
**Function:** `aggregatePeriodStatsFromCsv(periodStats, periodKey, sport = "baseball")`

**Changes:**
- Now accepts `sport` parameter
- Accumulates stats into generic `Record<string, number>`
- Pre-computes rate stats (AVG, ERA, WHIP) from components
- Works for any sport (MLB logic shown; extends to NFL/NBA)

**Example:**
```typescript
const result = aggregatePeriodStatsFromCsv(csvRows, "P1", "baseball");
// result[0] = { 
//   team: { id: 1, name: "...", code: "..." },
//   R: 100, HR: 50, RBI: 90, ...,
//   AVG: 0.250, ERA: 3.45, WHIP: 1.15  // pre-computed from components
// }
```

---

### 4. Generic Category Ranking (1 hour)
**Function:** `computeCategoryRows(stats, key: string, lowerIsBetter)`

**Changes:**
- Removed `CategoryKey` type constraint; now accepts any string category key
- Maintains MLB field mapping via `KEY_TO_DB_FIELD` (e.g., SV → S)
- Safe field lookup: returns 0 for missing fields
- Works with `computeStandingsFromStats()` which already accepts optional categories

**Already sport-agnostic:** `computeStandingsFromStats(stats, categories?)` accepts custom category lists

---

### 5. Test Fixes (2 hours)
**Files modified:**
- `server/src/features/standings/__tests__/standingsService.differential.test.ts` (14 fixes)
- `server/src/features/admin/routes/sync.ts` (inline helper)

**Changes:**
- Replaced 14 direct stat accesses (`.R`, `.HR`, `.ERA`) with `getTeamStatValue(row, "R")` calls
- Removed unnecessary league lookup in admin sync route
- All 2203 tests passing, zero regressions

---

## What Remains ⏳ (Week 2.2: ~12-15 hours)

### Step 3: Refactor computeTeamStats() (3 hours)
**File:** `server/src/features/standings/services/standingsService.ts` (line ~450+)

**Current behavior:**
```typescript
export async function computeTeamStats(
  leagueId: number,
  periodId: number
): Promise<TeamStatRow[]> {
  // Loads from DB, uses hardcoded CATEGORY_CONFIG
  // Returns TeamStatRow[] ready for computeCategoryRows
}
```

**Required changes:**
1. Load league via `prisma.league.findUnique({ where: { id: leagueId } })`
2. Load league's `scoringSettings` to get custom categories (or default to sport config)
3. Pass sport to service layer: `const sport = league.sport ?? "baseball"`
4. Build category dict dynamically instead of hardcoded 10 MLB categories

**Why:** Currently hardcoded to read/return only 10 MLB stat fields from DB. Need to adapt to whatever categories the league actually uses.

---

### Step 4: Route/API Plumbing (4-5 hours)
**Files affected:**
- `server/src/features/standings/routes.ts` (GET endpoints)
- `server/src/features/standings/services/standingsService.ts` (all public functions)

**What needs updating:**
1. Pass league context through routes → services
2. Ensure sport is propagated: route → service → category engine
3. Update response payloads to include category list (not hardcoded 10)
4. Verify client receives correct category metadata

**Call chain:**
```
GET /api/standings/:leagueId/:periodId
  ↓ extract leagueId
  → computeTeamStats(leagueId, periodId)
    ↓ load league.sport
    → aggregatePeriodStatsFromDb(leagueId, periodId, sport)
    ↓ returns TeamStatRow[] with dynamic fields
    → computeStandingsFromStats(stats, categories)
      ↓ from league.scoringSettings or sport config
      → computeCategoryRows() for each category
```

---

### Step 5: Regression Test & Verification (4-5 hours)
**Must verify OGBA (leagueId=20) is unchanged:**

1. **Computation audit:**
   - Run `computeTeamStats(20, periodId)` for Period 4
   - Compare standings output to pre-refactor (should be identical)
   - Verify all 10 MLB categories present (R, HR, RBI, SB, AVG, W, S, ERA, WHIP, K)

2. **Browser verification (MANDATORY):**
   - Navigate to OGBA standings page
   - Verify column headers show correct 10 categories
   - Verify team point totals match expected (audit vs OnRoto/FanGraphs)
   - Verify sorting/ranking correct
   - Spot-check 3+ team rows for accuracy

3. **Test suite:**
   - Run full test suite: expect 2203 passing
   - Run standings-specific tests: `npm run test -- standings`
   - No flaky tests, no new failures

---

## Commits This Session

1. **be650c5** — Week 2 standings infrastructure (categoryEngine.ts, generic TeamStatRow)
2. **5db4b73** — Week 2 test fixes (14 test updates, 2203 passing)
3. **248b6f2** — Week 2 generic category ranking (computeCategoryRows refactor)

---

## Key Files & Locations

| File | Purpose | Status |
|------|---------|--------|
| `server/src/lib/sports/categoryEngine.ts` | Category abstraction | ✅ DONE |
| `server/src/lib/sports/mlb.ts` | MLB config | ✅ DONE |
| `server/src/lib/sports/nfl.ts` | NFL config (stub) | ✅ DONE |
| `server/src/lib/sports/nba.ts` | NBA config (stub) | ✅ DONE |
| `server/src/lib/sports/index.ts` | Registry | ✅ DONE |
| `server/src/features/standings/services/standingsService.ts` | Core logic | 50% DONE |
| `server/src/features/standings/routes.ts` | API endpoints | ⏳ TODO |
| `server/src/features/standings/__tests__/standingsService.test.ts` | Tests | ✅ DONE |

---

## Testing Checklist (Next Session)

Before considering Week 2 complete:

- [ ] `npm run test` — Full suite passes (2203 tests)
- [ ] `npm run test -- standings` — No standings test failures
- [ ] Browser: OGBA standings page loads and displays correctly
- [ ] Browser: 10 MLB categories visible in column headers
- [ ] Browser: Team point totals match expected (audit vs external source)
- [ ] Browser: Period 4 standings match computation (spot-check 3 teams)
- [ ] Regression: No changes to OGBA standings behavior or output

---

## Architecture Notes

### Why This Refactoring Matters

1. **Prevents N versions of standings logic** — One generic `computeTeamStats()` works for MLB, NFL, NBA
2. **Enables Phase 4 features** — Trades, payouts, AI analysis can now be sport-aware
3. **Decouples DB schema from code** — Can add sports without touching hardcoded column lists
4. **Supports custom categories** — Leagues can define their own scoring (future feature)

### Design Decisions Made

1. **Keep MLB field mapping (KEY_TO_DB_FIELD)** — Needed for backward compatibility with tests + existing code that uses "SV" key but stores "S" field
2. **Pre-compute rate stats in aggregation** — Tests expect AVG/ERA/WHIP to exist; `getCategoryValue()` is for advanced use cases
3. **Load categories from scoringSettings** — Future leagues can customize; defaults to sport config for OGBA
4. **No DB schema changes** — All changes are application layer only; DB stays backward-compatible

---

## Known Edge Cases & TODOs

1. **scoringSettings storage** — Need to verify league.scoringSettings is populated for OGBA
   - If empty: Default to CATEGORY_CONFIG (current behavior)
   - If set: Use custom categories

2. **NFL/NBA scoring formats** — Currently stubbed with default rules; values untested
   - Would need real NFL/NBA data to verify
   - Deferred to Phase 4

3. **H2H standings** — Currently no support; assumes roto ranking
   - Design exists (sports/types.ts) but unimplemented
   - Deferred to Phase 4

---

## Session Wrap-up

**11 hours well-spent:** Refactoring is 50% complete with clean architecture and zero regressions. The foundation is solid; remaining work is mechanical (plumbing sport context through routes, testing).

**Next session strategy:** Start with Step 3 (computeTeamStats refactor) — it's the heaviest lift. Once that's passing tests, Steps 4-5 are straightforward.

**Confidence level:** HIGH — The hard part (refactoring TeamStatRow and category logic) is done and tested. Remaining work is lower-risk integration.
