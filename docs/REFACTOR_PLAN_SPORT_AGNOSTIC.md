---
title: Sport-Agnostic Refactoring Plan
date_started: 2026-06-22
status: in_progress
---

# Sport-Agnostic Refactoring Plan

## Goal

Refactor TFL from baseball-hardcoded to fully sport-agnostic (MLB, NFL, NBA) while keeping OGBA (current live league) running without interruption.

**Timeline:** 5–7 weeks (Phase 4 features ship after completion)

**Risk tolerance:** Zero impact to OGBA. All changes are backward compatible.

---

## Principles

### 1. **Backward Compatibility Always**
- **No breaking API changes** — All existing endpoints must continue working
- **No data migrations** — Use additive schema changes (add columns, don't remove)
- **No hardcoded defaults** — Default to MLB for existing leagues; new leagues pick sport
- **Existing tests pass unchanged** — Test suite must be green before and after each refactor

### 2. **Feature Module Isolation**
- Modules depend on **shared infrastructure** (lib/sports/), **not each other**
- Each module has a clear **contract** (Zod schemas, TypeScript interfaces)
- Refactoring one module doesn't require changes to dependent modules
- Tests for each module verify its contract; dependent modules mock the contract

### 3. **Incrementalism**
- Refactor one module at a time
- Merge to main after each module is complete + tested + verified against OGBA
- Ship live features (trades, payouts) only after all refactoring is done
- No feature branches longer than 1 week

---

## Refactoring Schedule

| Week | Phase | Modules | PR | Status |
|------|-------|---------|----|----|
| **1** | Infrastructure | Create sport configs (MLB, NFL, NBA) | #TBD | ⬜ |
| **1-2** | Critical Path #1 | refactor `positionToSlots()` → dispatch pattern | #TBD | ⬜ |
| **2** | Critical Path #2 | Standings service → category-agnostic ranking | #TBD | ⬜ |
| **3** | Critical Path #3 | Auction → load roster config from league | #TBD | ⬜ |
| **3-4** | Critical Path #4 | Matchups → load categories from ScoringSettings | #TBD | ⬜ |
| **4** | Critical Path #5 | Wire-list → parameterized ranking | #TBD | ⬜ |
| **5-6** | Secondary | Archive, Awards, AI, Players sync (provider pattern) | #TBD | ⬜ |
| **6-7** | Cleanup | Teams, Transactions, Roster, Keeper-Prep | #TBD | ⬜ |

**Milestone:** After week 4, Phase 4 features can be designed; after week 7, can ship.

---

## Week 1: Foundation (Infrastructure)

### Task 1.1: Create Sport Config System

**Goal:** Centralized configuration for each sport (MLB, NFL, NBA)

**Files to create:**

1. **`server/src/lib/sports/types.ts`** (new file)
```typescript
export interface SportConfig {
  sport: "MLB" | "NFL" | "NBA";
  positions: {
    all: string[]; // ["C", "1B", ..., "SP", "RP"] for MLB
    byRole: Record<string, string[]>; // { hitter: [...], pitcher: [...] } or { skill_pos, def, flex } for NFL
  };
  categories: {
    all: string[]; // ["R", "HR", "RBI", ...] for MLB
    hitter?: string[]; // MLB-specific split
    pitcher?: string[]; // MLB-specific split
  };
  roster: {
    slots: RosterSlotDef[];
    maxRosters?: number;
  };
  scoring: {
    defaultRules: ScoringRule[];
    format: "ROTO" | "POINTS" | "H2H"; // MLB=ROTO, NFL=POINTS, NBA=H2H/POINTS
  };
}

export interface RosterSlotDef {
  code: string; // "C", "1B", "2B", etc. for MLB; "QB", "RB", etc. for NFL
  name: string;
  eligible: string[]; // positions that qualify for this slot
  min?: number;
  max?: number;
}
```

2. **`server/src/lib/sports/mlb.ts`** (extract + enhance current baseball.ts)
```typescript
import { SportConfig } from "./types.js";

export const MLB_CONFIG: SportConfig = {
  sport: "MLB",
  positions: {
    all: ["C", "1B", "2B", "3B", "SS", "MI", "CM", "OF", "DH", "SP", "RP"],
    byRole: {
      hitter: ["C", "1B", "2B", "3B", "SS", "MI", "CM", "OF", "DH"],
      pitcher: ["SP", "RP"],
    },
  },
  categories: {
    all: ["R", "HR", "RBI", "SB", "AVG", "W", "SV", "K", "ERA", "WHIP"],
    hitter: ["R", "HR", "RBI", "SB", "AVG"],
    pitcher: ["W", "SV", "K", "ERA", "WHIP"],
  },
  roster: {
    slots: [
      { code: "C", name: "Catcher", eligible: ["C"], min: 1, max: 2 },
      { code: "1B", name: "First Base", eligible: ["1B"], min: 1, max: 1 },
      // ... rest of MLB slots
    ],
    maxRosters: 26,
  },
  scoring: {
    format: "ROTO",
    defaultRules: [
      { category: "R", pointsPerStat: 1 },
      { category: "HR", pointsPerStat: 1.5 },
      // ... rest of default scoring
    ],
  },
};

// Re-export current baseball utilities with sport parameter
export function positionToSlots(position: string, sport: "MLB" = "MLB"): string[] {
  const config = getSportConfig(sport);
  // ... dispatch based on sport
}
```

3. **`server/src/lib/sports/nfl.ts`** (stub for Phase 4)
```typescript
import { SportConfig } from "./types.js";

export const NFL_CONFIG: SportConfig = {
  sport: "NFL",
  positions: {
    all: ["QB", "RB", "WR", "TE", "OL", "K", "DEF"],
    byRole: {
      skill: ["QB", "RB", "WR", "TE"],
      def: ["K", "DEF"],
    },
  },
  categories: {
    all: ["pass_yd", "pass_td", "pass_int", "rush_yd", "rush_td", "rec", "rec_yd", "rec_td", "def_pts"],
  },
  roster: {
    slots: [
      { code: "QB", name: "Quarterback", eligible: ["QB"], min: 1, max: 1 },
      { code: "RB", name: "Running Back", eligible: ["RB"], min: 2, max: 2 },
      // ... rest of NFL roster
    ],
    maxRosters: 16,
  },
  scoring: {
    format: "POINTS",
    defaultRules: [
      { category: "pass_yd", pointsPerStat: 0.04 },
      // ... rest of default scoring
    ],
  },
};
```

4. **`server/src/lib/sports/nba.ts`** (stub for Phase 4)
```typescript
import { SportConfig } from "./types.js";

export const NBA_CONFIG: SportConfig = {
  sport: "NBA",
  positions: {
    all: ["PG", "SG", "SF", "PF", "C"],
    byRole: { all: ["PG", "SG", "SF", "PF", "C"] },
  },
  categories: {
    all: ["pts", "reb", "ast", "stl", "blk", "3pm", "fg%", "ft%", "to"],
  },
  roster: {
    slots: [
      { code: "PG", name: "Point Guard", eligible: ["PG"], min: 1, max: 1 },
      // ... rest of NBA roster
    ],
    maxRosters: 15,
  },
  scoring: {
    format: "H2H",
    defaultRules: [
      { category: "pts", pointsPerStat: 1 },
      // ... rest of default scoring
    ],
  },
};
```

5. **`server/src/lib/sports/index.ts`** (registry)
```typescript
import { SportConfig } from "./types.js";
import { MLB_CONFIG } from "./mlb.js";
import { NFL_CONFIG } from "./nfl.js";
import { NBA_CONFIG } from "./nba.js";

const CONFIG_BY_SPORT: Record<Sport, SportConfig> = {
  MLB: MLB_CONFIG,
  NFL: NFL_CONFIG,
  NBA: NBA_CONFIG,
};

export function getSportConfig(sport: Sport = "MLB"): SportConfig {
  return CONFIG_BY_SPORT[sport];
}

export function getPositionToSlots(sport: Sport = "MLB") {
  const config = getSportConfig(sport);
  return (position: string): string[] => {
    // Dispatch based on sport
    if (sport === "MLB") return mlbPositionToSlots(position);
    if (sport === "NFL") return nflPositionToSlots(position);
    if (sport === "NBA") return nbaPositionToSlots(position);
    return [];
  };
}

// ... export all sport-specific functions
```

**Verification:**
- ✓ All MLB config matches current hardcoded values
- ✓ NFL/NBA configs are placeholders (correct values added in Phase 4)
- ✓ No changes to existing functionality (all functions exported with same signatures)
- ✓ Tests pass: `npm run test` shows same count

**OGBA Impact:** ZERO — New infrastructure is unused until explicitly called

**Merge criteria:**
- ✓ New infrastructure in place
- ✓ MLB config matches current values exactly
- ✓ All tests pass
- ✓ No changes to existing routes/APIs

---

## Week 1-2: Critical Path #1 – positionToSlots() Dispatch

### Task 1.2: Refactor positionToSlots() → Sport-Aware Function

**Current (hardcoded):**
```typescript
// server/src/lib/sports/baseball.ts:20-31
export function positionToSlots(pos: string): string[] {
  const p = pos.trim().toUpperCase();
  if (p === "C") return ["C"];
  if (p === "1B") return ["1B", "CM"];
  // ... 8 more hardcoded positions
}
```

**Problem:** Called from 17+ sites; no sport parameter.

**Strategy:**
1. Add optional `sport` parameter to all call sites
2. Update function to dispatch to sport-specific logic
3. Keep old signature as default (sport="MLB") for backward compatibility

**Files to modify:**
- `server/src/lib/sports/baseball.ts` — Refactor function signature
- `server/src/features/standings/services/standingsService.ts` — Pass league.sport
- `server/src/features/roster/services/rosterService.ts` — Pass league.sport
- `server/src/features/wire-list/services/processorService.ts` — Pass league.sport
- `server/src/features/transactions/routes.ts` — Pass league.sport
- (10+ more call sites — see audit)

**New signature:**
```typescript
export function positionToSlots(pos: string, sport: Sport = "MLB"): string[] {
  const config = getSportConfig(sport);
  const position = pos.trim().toUpperCase();
  
  // Find matching position in config
  const slot = config.positions.all.find(p => p === position || aliases[sport]?.[position] === p);
  if (!slot) return [];
  
  // Return eligible slots for this position
  return config.roster.slots
    .filter(s => s.eligible.includes(slot))
    .map(s => s.code);
}
```

**Verification:**
- ✓ All 17+ call sites updated (grep for `positionToSlots(`)
- ✓ Function behaves identically for MLB (test against old values)
- ✓ Tests pass: old tests still green
- ✓ OGBA leagues default to MLB (sport parameter optional)

**OGBA Impact:** ZERO — Default behavior unchanged, all existing calls work

**Merge criteria:**
- ✓ All call sites updated
- ✓ Backward-compatible (default sport="MLB")
- ✓ Tests pass
- ✓ No new schema changes

---

## Week 2: Critical Path #2 – Standings Service (20–24 hours)

### Task 2.1: Load Categories from ScoringSettings

**Current (hardcoded):**
```typescript
// server/src/features/standings/services/standingsService.ts:25-34
export interface TeamStatRow {
  R: number; HR: number; RBI: number; SB: number; AVG: number;
  W: number; S: number; ERA: number; WHIP: number; K: number;
}
```

**Problem:**
- Categories hardcoded to 10 (MLB only)
- Cannot compute NFL (points format) or NBA standings
- No support for H2H or custom categories

**Strategy:**
1. Load categories from `league.scoringSettings`
2. Make TeamStatRow generic (map from category keys)
3. Keep MLB behavior as default

**New approach:**
```typescript
export async function computeTeamStats(
  leagueId: number,
  periodId: number
): Promise<Map<number, Record<string, number>>> {
  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  const settings = await prisma.scoringSettings.findUnique({ where: { leagueId } });
  
  // Load categories from settings (or default to sport config)
  const categories = settings?.categories ?? getSportConfig(league.sport).categories.all;
  
  // Compute stats generically
  const teamStats = new Map<number, Record<string, number>>();
  // ... compute logic that works for any category list
  
  return teamStats;
}
```

**Verification:**
- ✓ MLB standings identical to before (test against known values)
- ✓ Standings table dynamically shows correct columns (not hardcoded 10)
- ✓ Tests pass (regression + new test for custom categories)
- ✓ OGBA leagues use existing scoringSettings (no change needed)

**OGBA Impact:** ZERO — Standings computed identically, just using dynamic categories

**Merge criteria:**
- ✓ Backward compatible (ML defaults work)
- ✓ No schema changes
- ✓ All tests pass
- ✓ Standings UI verifies categories are dynamic (no hardcoded column names)

---

## Week 3: Critical Path #3 – Auction Roster Validation (18–22 hours)

### Task 3.1: Load Roster Config from League

**Current (hardcoded):**
```typescript
// server/src/features/auction/lib/auctionStateManager.ts:32-37
pitcher_count: 9,
batter_count: 14,
// ...rest of hardcoded roster config
```

**Problem:**
- Pitcher/batter counts hardcoded
- Cannot validate rosters for NFL/NBA
- No way to configure custom roster rules

**Strategy:**
1. Load roster config from `league.rosterConfig` or sport default
2. Validate picks against dynamic roster rules
3. Keep existing behavior for OGBA (use defaults)

**Verification:**
- ✓ OGBA auction validates with same pitcher/batter limits
- ✓ Roster matrix displays correct positions (from config, not hardcoded)
- ✓ Tests pass

**OGBA Impact:** ZERO — Validation uses same rules (from defaults or existing rosterConfig)

---

## Week 3-4: Critical Path #4 – Matchups Service (12 hours)

### Task 4.1: Load Categories from ScoringSettings

**Current (hardcoded):**
```typescript
const HITTING_CATS = ["R", "HR", "RBI", "SB", "AVG"];
const PITCHING_CATS = ["W", "SV", "K", "ERA", "WHIP"];
const INVERSE_STATS = new Set(["ERA", "WHIP"]);
```

**New approach:**
```typescript
export async function computeMatchup(
  leagueId: number,
  teamId1: number,
  teamId2: number,
  periodId: number
): Promise<MatchupScore> {
  const settings = await prisma.scoringSettings.findUnique({ where: { leagueId } });
  
  // Load categories and inverse rules from settings
  const categories = settings?.categories ?? getDefaultCategories(league.sport);
  const inverseStats = new Set(settings?.inverseCategories ?? []);
  
  // Score matchup using dynamic categories
  // ...
}
```

**Verification:**
- ✓ OGBA matchups score identically
- ✓ Inverse stat logic works for any category
- ✓ Tests pass

**OGBA Impact:** ZERO — Scoring uses same rules

---

## Week 4: Critical Path #5 – Wire-List Ranking (12–16 hours)

### Task 5.1: Parameterize Ranking Algorithm

**Current (hardcoded pitcher assumptions):**
```typescript
// server/src/features/wire-list/services/processorService.ts:65-75
if (isPitcher(player.position)) {
  scarcity = PITCHER_SCARCITY_MODIFIER;
} else {
  scarcity = HITTER_SCARCITY_MODIFIER;
}
```

**New approach:**
```typescript
export async function rankWaiverClaim(
  leagueId: number,
  playerId: number
): Promise<number> {
  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  const config = getSportConfig(league.sport);
  
  // Load sport-specific ranking rules
  const ranker = getWaiverRanker(league.sport);
  const rank = ranker.computeRank(player, positions, availability);
  
  return rank;
}
```

**Verification:**
- ✓ OGBA waiver ranking unchanged
- ✓ No pitcher/hitter checks (use position eligibility instead)
- ✓ Tests pass

**OGBA Impact:** ZERO — Ranking uses same logic

---

## Week 5-6: Secondary Refactoring (Lower Priority)

After critical path is complete, refactor secondary modules in parallel:
- **Awards service** (8–12h)
- **Players sync** (12–16h, provider pattern)
- **AI analysis** (12–16h)
- **Archive** (6–8h)

Each refactored independently; no blocker dependencies.

---

## Week 6-7: Cleanup & Verification

- **Teams & transactions** (10–14h) — Sport-aware slot filtering
- **Roster** (8–12h) — Sport-aware slot display
- **Keeper-prep** (4–6h) — Sport-agnostic keeper detection

---

## Testing Strategy (Prevent OGBA Regression)

### Unit Tests (Existing)
- All existing tests must pass after each refactor
- New tests for each sport-aware function
- Regression tests comparing old vs. new behavior on MLB data

### Integration Tests (New)
- Create test fixture for OGBA league (real data, not mocks)
- After each refactor, recompute standings/auction/matchups on OGBA data
- Compare results to known good values (stored as snapshots)
- Fail if any divergence (prevents silent regressions)

### Browser Verification (Weekly)
- Each week, manually test OGBA on staging
- Auction flow, draft, standings, wire-list, trades
- Ensure no UX regressions

### Regression Test Locations
```
server/src/features/[module]/__tests__/[module].regression.test.ts
```

Example:
```typescript
describe("Standings — OGBA Regression", () => {
  it("computes standings identically after refactoring", async () => {
    // Load OGBA league real data
    const ogba = await prisma.league.findUnique({ where: { id: 20 } });
    
    // Compute standings (new code)
    const newStandings = await computeTeamStats(ogba.id, periodId);
    
    // Compare to known good snapshot
    expect(newStandings).toEqual(OGBA_STANDINGS_SNAPSHOT);
  });
});
```

---

## Deployment Strategy (Safe Rollout)

### Per-Refactor Release
1. Merge refactored module to main
2. Deploy to staging Railway
3. Verify OGBA behavior on staging (no changes)
4. Deploy to production
5. Monitor logs for errors (none expected)
6. Move to next module

### Rollback Plan
- If OGBA shows regression, revert PR immediately
- Investigate root cause
- Fix in new PR before continuing

### Feature Flags (If Needed)
If a refactor is risky, use feature flag to gate new code:
```typescript
if (process.env.USE_SPORT_CONFIG_STANDINGS === "true") {
  // New code (sport-agnostic)
  return computeTeamStatsNew(leagueId, periodId);
} else {
  // Old code (MLB-hardcoded) — default for OGBA
  return computeTeamStatsOld(leagueId, periodId);
}
```

---

## Success Criteria

**After 7 weeks:**
- ✓ All 5 critical modules refactored
- ✓ OGBA still running identically (zero regressions)
- ✓ Codebase ready for Phase 4 features (trades, payouts)
- ✓ Infrastructure in place for NFL/NBA
- ✓ All tests green (2199+ tests)
- ✓ Documentation updated

**Then: Phase 4 Features (Trades, Payouts, etc.)**
- Built in clean, sport-agnostic architecture
- Ready to add NFL/NBA without major rework

---

## Communication Plan

**Weekly Standups:**
- Monday: Which module we're refactoring this week
- Friday: Status update on tests/regressions

**OGBA Notifications:**
- Each Friday: "Your league is still running perfectly, no changes to user-facing features"
- No surprises, full transparency

**Rollout Communication:**
- Before merging: "This refactoring doesn't change how OGBA works"
- After deploying: "Refactoring complete, all systems normal"

---

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| OGBA regression during refactor | CRITICAL | Regression tests, weekly browser verify, rollback plan |
| Schema migration fails | HIGH | Additive changes only, no data loss, test migrations locally first |
| Performance regression | MEDIUM | Benchmark critical paths (standings, draft) before & after |
| Test suite bloat | LOW | Clean up old tests, remove duplicates after refactor |
| Team context loss mid-refactor | MEDIUM | Clear documentation, each module self-contained, no deep dependencies |

---

## Summary

This plan ensures:
1. **OGBA never breaks** — Backward compatible, regression tests, weekly verify
2. **Feature module isolation** — Each module refactored independently
3. **Clean architecture** — Sport-agnostic infrastructure from day 1
4. **Incremental progress** — Ship after each module, not at the end
5. **Confidence** — Tests catch regressions; no surprises

After 7 weeks, Phase 4 features ship into a clean codebase. NFL/NBA launch doesn't require rework.

