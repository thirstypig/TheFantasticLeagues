# TFL Codebase Sport-Agnostic Design Audit
**Date:** 2026-06-22  
**Status:** PARTIAL (25–30% ready for NFL/NBA expansion)  
**Total Modules Audited:** 35  
**Overall Refactor Effort:** 42–56 hours across blocking issues + 49 hours for medium-priority modules = **~100 hours total**

---

## EXECUTIVE SUMMARY

The TFL codebase has good foundational support for multi-sport (Sport enum, league.sport field, ScoringSettings table). However, **5 critical blockers** prevent NFL/NBA expansion:

1. **positionToSlots()** — Single hardcoding point with 17+ call sites
2. **Standings Service** — ERA/WHIP hardcoded; no H2H or points-per-stat support
3. **Players Sync** — MLB-only data ingestion; no NFL/NBA provider
4. **Position Eligibility** — Baseball-only rules everywhere it's used
5. **Awards Service** — Cy Young/MVP weights and role detection tied to baseball stats

---

## COMPREHENSIVE AUDIT TABLE (ALL 35 MODULES)

| # | Module | Status | MLB Hardcoding | Sport-Aware? | Priority | Effort | Risk |
|---|--------|--------|---|---|---|---|---|
| **CRITICAL BLOCKERS** |
| 1 | leagues | READY | MINIMAL | ✓ Sport field in API | LOW | 0h | — |
| 2 | players | PARTIAL | HIGH: mlbSyncService, Ohtani override, TWO_WAY_PLAYERS, statsapi.mlb.com | — | **HIGH** | 8–12h | **BLOCKER** |
| 3 | roster | PARTIAL | MODERATE: positionToSlots hardcoded in eligibility checks | Delegates to helpers | **HIGH** | 10–14h | **BLOCKER** |
| 4 | standings | PARTIAL | **CRITICAL:** ERA/WHIP calc in 6 locations; roto-only | No H2H | **CRITICAL** | 16–20h | **BLOCKER** |
| 5 | scoring | READY | MINIMAL: missing baseball defaults | ✓ Sport dispatch exists | MEDIUM | 2–3h | BLOCKER |
| **HIGH-PRIORITY (Enable Multiple Modules)** |
| 6 | awards | NOT READY | **CRITICAL:** MVP/Cy Young weights, role detection (saves), MIN_IP/MIN_AB | — | **HIGH** | 10h | **BLOCKER** |
| 7 | matchups | NOT READY | **CRITICAL:** HITTING_CATS/PITCHING_CATS hardcoded; H2H only; isRateStat={AVG, ERA, WHIP} | — | **HIGH** | 12h | **BLOCKER** |
| 8 | commissioner | PARTIAL | HIGH: POS_FILTERS, SLOT_ORDER, IL-specific logic, position grouping | — | **HIGH** | 8h | HIGH |
| **MEDIUM-PRIORITY (Refactorable)** |
| 9 | admin | PARTIAL | MEDIUM: rule keys (hitting_stats, pitching_stats), pitcher/batter count | — | MEDIUM | 2h | MEDIUM |
| 10 | draft | PARTIAL | MEDIUM: POS_ORDER, POS_COLORS, UT fallback | — | MEDIUM | 4h | MEDIUM |
| 11 | trades | PARTIAL | MEDIUM: PITCHER_POS hardcoded, UT fallback, roster limit=23 | — | MEDIUM | 4h | MEDIUM |
| 12 | keeper-prep | PARTIAL | MEDIUM: mapPosition, outfieldMode logic, NL-specific messaging | ✓ Uses league.outfieldMode | MEDIUM | 5h | MEDIUM |
| 13 | ai | PARTIAL | MODERATE: isPitcher classification, hardcoded baseball terminology in prompts | — | MEDIUM | 6–8h | MEDIUM |
| 14 | wire-list | READY | MINIMAL | ✓ Sport-agnostic ranking | LOW | 0h | — |
| 15 | waivers | READY | MINIMAL | ✓ Sport-agnostic priority | LOW | 0h | — |
| 16 | transactions | PARTIAL | MODERATE: positionInherit, slotMatcher (depends on roster) | — | HIGH | 4–6h | HIGH |
| 17 | teams | READY | MINIMAL: isPitcher for counting only | ✓ Generic fields | LOW | 0h | — |
| **LOW-PRIORITY (Polish)** |
| 18 | watchlist | PARTIAL | LOW: position fallback, "FA"/"MLB" labels | ✓ Uses displayPos() | LOW | 3h | LOW |
| 19 | profiles | PARTIAL | LOW: MLB_TEAMS hardcoded list | ✓ Queries sport context | LOW | 2h | LOW |
| 20 | board | NOT_READY | HIGH: TradingBlock query only `posPrimary`; position rendering skips displayPos() | ✓ Pattern exists elsewhere | HIGH | 4–6h | HIGH |
| **FOUNDATIONAL (No Sport Dependency)** |
| 21 | auth | READY | NONE | — | LOW | 0h | — |
| 22 | chat | READY | NONE | — | LOW | 0h | — |
| 23 | franchises | READY | NONE | — | LOW | 0h | — |
| 24 | notifications | READY | NONE | — | LOW | 0h | — |
| 25 | profiles | READY (see #19) | — | — | — | — | — |
| 26 | reports | READY | NONE | — | LOW | 0h | — |
| 27 | sessions | READY | NONE | — | LOW | 0h | — |
| 28 | seasons | READY | NONE | — | LOW | 0h | — |
| 29 | franchises | READY | NONE | — | LOW | 0h | — |
| **SPORT-SPECIFIC (Correct By Design)** |
| 30 | mlb-feed | READY | EXPECTED: pitcher detection duplication; stat category mapping | ✓ MLB-specific module | MEDIUM | 4–6h (debt) | — |
| 31 | trading-block | READY | MINIMAL | ✓ Uses displayPos() | LOW | 0h | — |
| **PREVIEW (Phase 2 Mockups; Refactor Phase 3)** |
| 32 | nba | NOT_READY | HIGH: 7 hardcoded categories, no sport context binding | — | LOW (for Phase 2) | 2h (now) / 6–8h (Phase 3) | ACCEPTABLE |
| 33 | nfl | NOT_READY | MEDIUM: QB/RB/WR/TE positions, 18-week season | — | LOW (for Phase 2) | 2h (now) / 6–8h (Phase 3) | ACCEPTABLE |
| **TESTING & UTILITIES** |
| 34 | test | READY | LOW (fixtures only; helpers in baseball.ts) | ✓ Helpers properly abstracted | LOW | 3–4h (helpers) | — |
| 35 | archive | PARTIAL | HIGH: stat schema (23 positions, hitting/pitching split), pitcher/batter detection | — | HIGH | 12–15h | HIGH |
| 36 | periods | READY | MEDIUM (client-side category duplication) | ✓ Server uses CATEGORY_CONFIG | LOW-MEDIUM | 2–3h (debt) | LOW |

---

## 5 CRITICAL BLOCKERS (Must Fix Before Multi-Sport Launch)

### BLOCKER #1: positionToSlots() — Single Biggest Hardcoding Point
**Severity:** CRITICAL | **Effort:** 3–4 hours | **Usage:** 17+ call sites  
**Impact:** Prevents all position eligibility checks for NFL/NBA

**File Locations:**
- `/server/src/lib/sports/baseball.ts:20–31`
- `/client/src/lib/sports/baseball.ts:41–52`

**Current Code (Baseball-Only):**
```typescript
export function positionToSlots(pos: string): string[] {
  const p = pos.trim().toUpperCase();
  if (p === "C") return ["C"];
  if (p === "1B") return ["1B", "CM"];
  if (p === "2B") return ["2B", "MI"];
  if (p === "3B") return ["3B", "CM"];
  if (p === "SS") return ["SS", "MI"];
  if (p === "LF" || p === "CF" || p === "RF" || p === "OF") return ["OF"];
  if (p === "DH") return ["DH"];
  if (p === "P" || p === "SP" || p === "RP" || p === "CL" || p === "TWP") return ["P"];
  return [];
}
```

**Call Sites:**
- `roster/lib/positionInherit.ts:13` (roster eligibility math)
- `transactions/lib/slotMatcher.ts` (transaction validation)
- 15+ additional sites across roster, transactions, players modules

**Required Fix:**
```typescript
export function positionToSlots(pos: string, sport: Sport): string[] {
  switch (sport) {
    case "NFL":
      // QB→[FLEX], RB→[RB, FLEX], WR→[WR, FLEX], TE→[TE, FLEX], K→[K], DEF→[DEF]
    case "NBA":
      // PG→[PG, UTIL], SG→[SG, UTIL], SF→[SF, UTIL], PF→[PF, UTIL], C→[C, UTIL]
    case "MLB":
    default:
      // Current baseball logic
  }
}
```

**Dispatch Pattern Needed:** Add sport parameter to all 17+ call sites.

---

### BLOCKER #2: Standings Service — ERA/WHIP Hardcoding & Roto-Only Architecture
**Severity:** CRITICAL | **Effort:** 16–20 hours  
**Impact:** No H2H scoring, no points-per-stat support, no NFL/NBA standings

**File:** `/server/src/features/standings/services/standingsService.ts`

**Hardcoding Locations:**
- Lines 280–302: ERA/WHIP calculation for pitchers
- Lines 528–558: Merge logic with hardcoded ERA/WHIP
- Lines 651–652, 755–756: 4 additional ERA/WHIP calculations

**Example Code:**
```typescript
// Line 280-302
const ERA = team.IP > 0 ? (team.ER / team.IP) * 9 : 0;
const WHIP = team.IP > 0 ? team.BB_H / team.IP : 0;

// Category calculation assumes exactly these 10 categories
standings.push({
  teamId: team.id,
  R: team.R,
  HR: team.HR,
  RBI: team.RBI,
  SB: team.SB,
  AVG: team.AB > 0 ? team.H / team.AB : 0,
  W: team.W,
  SV: team.SV,
  K: team.K,
  ERA: ERA,
  WHIP: WHIP,
  // ... roto-only logic continues
});
```

**Type Signature Issues:**
```typescript
interface Standing {
  // Hardcoded baseball categories
  ERA: number;
  WHIP: number;
  R: number;
  HR: number;
  // ...
}
```

**Required Fixes:**
1. Read `league.sport` before computing standings
2. Fetch league's `ScoringSettings.rules` (already stored)
3. Replace hardcoded category list with league rule keys
4. Abstract rate stat calculation (AVG, ERA, WHIP) into sport-specific modules
5. Create separate H2H matchup calculator (currently missing; only roto supported)
6. Refactor Standing interface to use flexible key-value structure

---

### BLOCKER #3: Players Sync — MLB-Only Data Ingestion
**Severity:** HIGH | **Effort:** 12–16 hours  
**Impact:** Cannot add NFL/NBA player data to database

**File:** `/server/src/features/players/services/mlbSyncService.ts`

**Hardcoding:**
- Lines 35–46: Ohtani (ID 660271) DH override
- Lines 96–99: buildPosList uses TWO_WAY_PLAYERS (MLB-specific)
- All API calls to `statsapi.mlb.com` (no provider abstraction)

**Example Code:**
```typescript
// Line 35-46
function resolvePosition(mlbId: number, posAbbr: string): string {
  const override = POSITION_OVERRIDES.get(mlbId);
  if (override && (posAbbr === "TWP" || posAbbr === "Y")) {
    return override;  // Only works for MLB ID 660271 (Ohtani)
  }
  return posAbbr;
}

// All data comes from MLB Stats API
const response = await fetch(`https://statsapi.mlb.com/api/v1/...`);
```

**Required Fixes:**
1. Create `SyncService` interface with `syncAllPlayers(season, sport)` method
2. Implement `MlbSyncService`, `NflSyncService`, `NbaSyncService` subclasses
3. Integrate with Sleeper.app API (NFL), ESPN API (NBA)
4. Handle sport-specific position overrides in separate registries
5. Create position builder factory per sport

---

### BLOCKER #4: Position Eligibility — Baseball-Only Rules Everywhere
**Severity:** HIGH | **Effort:** 4–6 hours (depends on BLOCKER #1)  
**Impact:** Position eligibility checks fail for NFL/NBA

**Files:**
- `roster/lib/positionInherit.ts:23–30` (isEligibleForSlot)
- `transactions/lib/slotMatcher.ts` (all slot matching)

**Example Code (positionInherit.ts):**
```typescript
export function isEligibleForSlot(
  posList: string[],
  slot: string,
): boolean {
  const slots = posList.flatMap(pos => positionToSlots(pos)); // BLOCKER #1
  return slots.includes(slot);
}
```

**Required Fix:** Dispatch `getSlotsForPosition(pos, sport)` with NFL/NBA rules.

---

### BLOCKER #5: Baseball Scoring Defaults Missing
**Severity:** MEDIUM | **Effort:** 2–3 hours  
**Impact:** New MLB leagues won't get default scoring rules

**File:** `/server/src/services/scoringEngine.ts:386–476`

**Current Code:**
```typescript
export function getDefaultScoringRules(sport: Sport): ScoringRuleInput[] {
  if (sport === "NFL") {
    return [{ category: "PASS_YDS", points: 0.04 }, ...];
  }
  else if (sport === "NBA") {
    return [{ category: "PTS", points: 1 }, ...];
  }
  return [];  // MISSING BASEBALL DEFAULTS
}
```

**Impact:** New OGBA leagues created after June 2026 won't have scoring defaults (workaround: use LeagueRule table, but not ideal).

**Required Fix:**
```typescript
export function getDefaultScoringRules(sport: Sport): ScoringRuleInput[] {
  if (sport === "NFL") { /* ... */ }
  else if (sport === "NBA") { /* ... */ }
  else if (sport === "MLB") {
    return [
      { category: "R", points: 1 },
      { category: "HR", points: 4 },
      { category: "RBI", points: 1 },
      { category: "SB", points: 2 },
      { category: "AVG", points: 100 }, // per-point scale
      { category: "W", points: 7 },
      { category: "SV", points: 5 },
      { category: "K", points: 1 },
      { category: "ERA", points: -100 }, // inverse
      { category: "WHIP", points: -100 }, // inverse
    ];
  }
  return [];
}
```

---

## HIGH-PRIORITY SECONDARY BLOCKERS (Cascade Impact)

### BLOCKER #6: Awards Service — Cy Young/MVP Weights & Role Detection
**Severity:** HIGH | **Effort:** 10 hours  
**Impact:** Cannot calculate NFL awards (no Cy Young equivalent), NBA awards (different stat sets)

**File:** `/server/src/features/awards/services/awardsService.ts`

**Hardcoding:**
- Lines 57–95: MVP weights (OPS, HR, OBP, RBI, R, SB) + Cy Young weights (ERA, WHIP, K, K9, IP, W, L, HR_A, BB9, SV)
- Lines 39–42: Qualification constants (MIN_IP_FOR_CY_YOUNG=20, MIN_AB_FOR_MVP=50, MIN_GS_FOR_STARTER=3)
- Lines 280–291: MVP stats object {AB, H, HR, RBI, R, SB, BB, TB, SO, AVG, OBP, SLG, OPS}
- Lines 364–373: Cy Young stats object {W, L, K, SV, IP, ERA, WHIP, K9, BB9, HR_A}
- Lines 351–352: Pitcher role detection (isRelief = p.sv > 0) — assumes Saves stat

**Required Fixes:**
1. Create `AwardType` → `Sport` → `StatWeights` registry
2. Implement sport-specific role detection (NFL: QB/Pass catcher/Rusher; NBA: Guard/Wing/Big; MLB: Starter/Reliever/Batter)
3. Parameterize qualification minimums
4. Build award scoring as table-driven formula (not hardcoded weights)

---

### BLOCKER #7: Matchups Service — Hardcoded HITTING_CATS/PITCHING_CATS
**Severity:** HIGH | **Effort:** 12 hours  
**Impact:** H2H scoring doesn't work for NFL/NBA; no points-per-stat support

**File:** `/server/src/features/matchups/services/matchupScoring.ts`

**Hardcoding:**
- Lines 23–25:
  ```typescript
  const HITTING_CATS = ["R", "HR", "RBI", "SB", "AVG"];
  const PITCHING_CATS = ["W", "SV", "K", "ERA", "WHIP"];
  const INVERSE_CATS = { ERA: true, WHIP: true };
  ```
- Lines 30–71: H2H scoring assumes exactly 5+5 split
- Lines 49–54: Inverse stat logic with IP zero-handling
- `/routes.ts:144`: Default point values {R:1, HR:4, RBI:1, SB:2, W:7, SV:5, K:1}
- `/client/pages/Matchup.tsx:33–34`: isRateStat={AVG, ERA, WHIP}

**Required Fixes:**
1. Replace hardcoded category lists with league's ScoringSettings
2. Support arbitrary category count (NFL: ~15+ per position; NBA: 9 core + 3 position-specific)
3. Abstract inverse stat logic (currently hardcoded for ERA/WHIP)
4. Make rate stat detection sport-aware (NBA has FG%, 3P%, FT%; NFL has none typically)

---

## SECONDARY MODULES (Medium Effort, Cascading Fixes)

### Commissioner — IL-Specific Logic & Position Filters
**Severity:** HIGH | **Effort:** 8 hours

**File:** `/client/src/features/commissioner/components/CommissionerRosterTool.tsx`

**Hardcoding:**
- Lines 14–16: POS_FILTERS=['ALL','C','1B','2B','3B','SS','MI','CM','OF','DH','P'], SLOT_ORDER includes SP, RP, BN, IL
- Lines 50–51: Position grouping (LF/CF/RF→OF, SP/RP/CL/TWP→P)
- Lines 676–718: UI labels "IL Management", "Place on IL", "MLB IL", "Stash" (MLB-only)
- `/routes.ts:818–825`: IL slot exemption logic

**Required Fixes:**
1. Make POS_FILTERS and SLOT_ORDER sport-aware
2. Replace IL (Injured List) with generic "Reserve" slot; add IR/PUP for NFL, no special handling for NBA
3. Create sport-specific position grouping registry

---

### Board — Position Query & Display Inconsistency
**Severity:** HIGH | **Effort:** 4–6 hours

**File:** `/server/src/features/board/routes.ts:134, 151`

**Issue:** TradingBlock query hardcoded to `posPrimary` only; client rendering skips `displayPos()` wrapper used elsewhere.

**Risk:** Will render NFL raw codes (QB, RB, WR) unlabeled when trading-block fixes display logic.

---

### Archive — Stat Schema & Position Set Hardcoding
**Severity:** HIGH | **Effort:** 12–15 hours

**File:** `/server/src/features/archive/`

**Hardcoding:**
- `archiveImportService.ts:304`: 23-position array hardcoded
- `archiveStatsService.ts:117–135`: sport-breaking if NBA added (no FG%, 3P%)
- `archiveStatsService.ts:75`: Strength calculation combines hitting+pitching stats (incompatible with NBA)
- Stat schema assumes hitting (AB/H/R/HR/RBI/SB/AVG/GS) + pitching (W/SV/K/IP/ER/ERA/WHIP/SO)

---

## MEDIUM-PRIORITY MODULES (3–5 Hour Fixes)

| Module | Issue | File | Effort |
|--------|-------|------|--------|
| **admin** | Rule keys (hitting_stats, pitching_stats), pitcher/batter count fields | `services/adminService.ts` | 2h |
| **draft** | POS_ORDER, POS_COLORS hardcoded to baseball | `draftService.ts`, `DraftBoard.tsx` | 4h |
| **trades** | PITCHER_POS, UT fallback, roster limit=23 | `lib/tradeSummary.ts` | 4h |
| **keeper-prep** | mapPosition, outfieldMode logic, NL-specific UI | `keeperPrepService.ts` | 5h |
| **ai** | isPitcher classification, hardcoded baseball terminology | `draftReportCardService.ts` | 6–8h |
| **watchlist** | Position fallback to UT, "FA"/"MLB" labels | `WatchlistPage.tsx` | 3h |
| **profiles** | MLB_TEAMS hardcoded list | `ProfilePage.tsx` | 2h |
| **mlb-feed** | Pitcher detection + stat mapping duplication (debt only; module is correct MLB-specific) | `digestRoutes.ts`, `scoresRoutes.ts` | 4–6h (debt) |
| **periods** | Client-side category config duplication | `CategoryStandingsView.tsx` | 2–3h |

---

## READY MODULES (0 Effort Required)

These modules have no baseball hardcoding or properly delegate to sport-aware functions:

- auth, chat, franchises, notifications, reports, sessions, seasons, teams, wire-list, waivers, test (helpers only), trading-block, leagues (mostly ready; check sport field usage)

---

## REFACTOR ROADMAP

### Phase 1: Foundation (8–12 hours) — CRITICAL PATH
1. Add baseball defaults to `getDefaultScoringRules()` (**2–3h**)
2. Make `positionToSlots()` sport-aware with dispatch (**3–4h**)
3. Update position eligibility to use dispatch (**4–5h**)

### Phase 2: Standings & Scoring (16–20 hours) — UNBLOCKS MOST MODULES
4. Refactor standings service to read ScoringSettings, support H2H and points-per-stat (**16–20h**)

### Phase 3: Data Ingestion (12–16 hours)
5. Add sport parameter to player sync; integrate NFL/NBA data providers (**12–16h**)

### Phase 4: Awards & Matchups (22 hours) — HIGH-VALUE
6. Redesign awards service as sport→award→stat mapping (**10h**)
7. Refactor matchups to be sport-agnostic (**12h**)

### Phase 5: Secondary Modules (25 hours)
8. Commissioner, Board, Archive, trades, draft, keeper-prep, admin, watchlist, profiles, ai, mlb-feed debt cleanup

### Phase 6: Phase 3 Preview Integration (6–8 hours)
9. Bind nba/nfl to live league context (separate Phase 3 task)

**Total: ~100 hours across all work**  
**Critical Path: Phases 1–4 (~50–60 hours) must complete before NFL/NBA can launch**

---

## RISK ASSESSMENT

| Dimension | Status | MLB Ready | NFL Ready | NBA Ready | Blocker? |
|-----------|--------|-----------|-----------|-----------|----------|
| League table sport column | ✓ | ✓ | ✓ | ✓ | NO |
| Scoring engine defaults | ⚠️ | ✗ | ✓ | ✓ | YES |
| Player sync | ✗ | ✗ | ✗ | ✗ | YES |
| Position eligibility | ✗ | ✓ | ✗ | ✗ | YES |
| Standings calculation | ✗ | ✓ | ✗ | ✗ | YES |
| Roster rules | ✗ | ✓ | ✗ | ✗ | YES |
| H2H scoring | ✗ | ✗ | ✗ | ✗ | YES |
| Awards calculation | ✗ | ✓ | ✗ | ✗ | YES |
| Position display | ⚠️ | ✓ | ⚠️ | ⚠️ | NO |
| AI analysis | ⚠️ | ⚠️ | ⚠️ | ⚠️ | NO |

**Current Readiness:**
- **MLB:** 95% ready (only missing baseball defaults, minor cleanups)
- **NFL:** 5% ready (all 5 blockers prevent launch)
- **NBA:** 5% ready (all 5 blockers prevent launch)

---

## QUICK REFERENCE: FILE LOCATIONS BY PRIORITY

### MUST TOUCH (Blockers)
- `/server/src/lib/sports/baseball.ts` — positionToSlots() (BLOCKER #1)
- `/server/src/features/standings/services/standingsService.ts` — ERA/WHIP hardcoding (BLOCKER #2)
- `/server/src/features/players/services/mlbSyncService.ts` — MLB-only sync (BLOCKER #3)
- `/server/src/services/scoringEngine.ts` — missing baseball defaults (BLOCKER #5)
- `/server/src/features/awards/services/awardsService.ts` — Cy Young/MVP weights (BLOCKER #6)
- `/server/src/features/matchups/services/matchupScoring.ts` — hardcoded categories (BLOCKER #7)

### SHOULD TOUCH (Cascading)
- `/client/src/features/commissioner/components/CommissionerRosterTool.tsx` — IL logic & filters
- `/server/src/features/board/routes.ts` — position query hardcoding
- `/server/src/features/archive/` — stat schema & position set

### NICE TO HAVE (Cleanup)
- `/client/src/features/profiles/ProfilePage.tsx` — MLB_TEAMS list
- `/client/src/features/watchlist/WatchlistPage.tsx` — "FA"/"MLB" labels
- `/server/src/features/draft/` — position colors
- `/server/src/features/keeper-prep/` — outfield mode logic

---

## SPORT-READY PATTERNS (Already Implemented — Good Examples)

✓ **Sport Registry** — `/server/src/lib/sports/index.ts` with `getSportConfig(sport)` dispatch  
✓ **SportConfig Type System** — `/server/src/lib/sports/types.ts` with generic interface  
✓ **League Sport Storage** — Prisma: `League.sport` enum (MLB, NFL, NBA)  
✓ **ScoringSettings Table** — Generic scoring rules per league (already exists)  
✓ **Scoring Engine Dispatch** — `getDefaultScoringRules(sport)` structure (ready for baseball addition)  
✓ **LeagueRule Fallback** — Generic rule key-value store for customization  
✓ **Position Display Abstraction** — `displayPos()` function in trading-block, used correctly in some places  
✓ **Sport-Agnostic Helpers** — wire-list, waivers, teams use generic field names  

These patterns should be extended to the blocker modules.

---

## CONCLUSION

**TFL has solid foundational architecture for multi-sport support.** The 5 critical blockers are concentrated in a few high-impact services (standings, positions, players, awards, matchups). Once these are refactored, the remaining modules will follow naturally.

**Recommended next step:** Schedule a 2–3 hour architecture meeting to design the sport dispatch patterns for blockers #1–5, then allocate ~50 hours for implementation across two sprints.

