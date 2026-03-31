---
title: "feat: Season-to-Date Stats, Team G/IP Columns, Insights Projection, Test Season"
type: feat
status: active
date: 2026-03-31
---

# Season-to-Date Stats, Team G/IP Columns, Insights Projection, Test Season

## Overview

Four related improvements to standings, team pages, AI insights, and testing infrastructure:

1. **Category tables show season-to-date stats** alongside period stats
2. **Team page adds Games (G) for hitters and confirms IP for pitchers**
3. **Weekly Insights adds a 4th "Week Ahead" projection box**
4. **Test season creation** for verifying waiver/trade flows with date-aware stats

## Phase 1: Category Tables — Season-to-Date Stats

### Problem
The Period view's category tables (R, HR, RBI, SB, AVG, W, SV, K, ERA, WHIP) only show stats for the selected period. Users can't see how a team's period performance relates to their season total. For example, "Skunk Dogs have 45 R this period, but how many total this season?"

### Server Changes

**File:** `server/src/features/standings/routes.ts` (lines 44-121)

Add season-to-date computation to the `period-category-standings` endpoint:

- [ ] After computing `teamStats` for the selected period, also compute season-to-date stats
- [ ] Fetch all period IDs where `startDate <= selectedPeriod.endDate` (all periods up to and including selected)
- [ ] For each prior period, call `computeTeamStatsFromDb(leagueId, pid)` and aggregate counting stats (R, HR, RBI, SB, W, S, K) by summing, rate stats (AVG, ERA, WHIP) by recomputing from components (H/AB, ER*9/IP, BB_H/IP)
- [ ] Add `seasonValue` field to each category row in the response
- [ ] Performance: cache completed period stats (they never change) — only recompute active period

**Response shape change:**
```typescript
// Each category row adds:
{ teamId, teamName, teamCode, value, seasonValue, rank, points, pointsDelta }
//                                    ^^^^^^^^^^^^ NEW
```

### Client Changes

**File:** `client/src/components/shared/StatsTables.tsx` (lines 34-313)

- [ ] Add `seasonStat?: number` to `CategoryPeriodRow` interface (line 34)
- [ ] In `CategoryPeriodTable` (line 253), add a "Season" column header after the period stat column
- [ ] Render `seasonStat` with the same formatting as `periodStat` (use `formatStatForCategory`)

**File:** `client/src/features/periods/pages/Season.tsx` (line 214)

- [ ] Map `seasonStat: toNum(row.seasonValue)` when transforming API response to `CategoryPeriodRow`

### Acceptance Criteria
- [ ] Each category table shows both period and season-to-date values
- [ ] Rate stats (AVG, ERA, WHIP) correctly recomputed from season components (not averaged)
- [ ] Season-to-date for Period 1 equals the period value (only one period)

---

## Phase 2: Team Page — Games (G) Column for Hitters

### Problem
Hitters table has no Games Played (G) column. Users want to see how many games each player has appeared in.

### Server Changes

**File:** `server/src/features/players/services/statsService.ts` (lines 16-56)

- [ ] Add `G: number` to `SeasonStatEntry` type
- [ ] In `parseSeasonStats()`, capture `split.gamesPlayed` from MLB API hitting response

**File:** `server/src/features/players/routes.ts` (lines 351-369)

- [ ] Add `G: ss?.G ?? 0` to the stat object in `/player-season-stats` endpoint

### Client Changes

**File:** `client/src/features/teams/pages/Team.tsx`

- [ ] Hitters table (line ~573): Add `<Th align="center">G</Th>` column header after POS
- [ ] Hitter rows (line ~666): Add `<Td>` showing `asNum(p?.G)` or `numFromAny(p, "G", "gamesPlayed")`
- [ ] Hitter totals row: Sum G across all hitters
- [ ] IP column for pitchers already exists (line 734) — no change needed

### Acceptance Criteria
- [ ] Hitters table shows G column with games played count
- [ ] Pitchers table continues to show IP (already working)
- [ ] Totals row includes G sum for hitters

---

## Phase 3: Weekly Insights — "Week Ahead" Projection Box

### Problem
Current insights are backward-looking (what happened). Users want forward-looking projections: who's trending, what to watch next week, hot takes.

### Server Changes

**File:** `server/src/services/aiAnalysisService.ts` (lines 1068-1083)

- [ ] Change "exactly 3" to "exactly 4" in prompt
- [ ] Add 4th insight instruction:
  ```
  4. **Week Ahead** — Project what to expect next week. Which players are trending up/down?
  What category matchups look favorable? One bold prediction or hot take about this team's
  trajectory. Be specific — name players and stats.
  ```
- [ ] Add `"Week Ahead"` to the allowed categories list (line 1083)

### Client Changes

**File:** `client/src/features/teams/pages/Team.tsx` (line ~433)

- [ ] The `md:grid-cols-2` grid already handles 4 items as a clean 2x2. No layout change needed.
- [ ] Optionally style the "Week Ahead" card differently (e.g., dashed border or subtle accent) to visually distinguish projections from observations

### Acceptance Criteria
- [ ] Weekly Insights shows 4 cards in a 2x2 grid
- [ ] 4th card has "Week Ahead" category with forward-looking content
- [ ] No mentions of auction prices or budget in any insight

---

## Phase 4: Test Season for Waiver/Trade Verification

### Problem
The date-aware stats attribution system (PlayerStatsDaily, nextDayEffective) was built but never tested end-to-end with actual trades and waivers. We need a test environment.

### Approach
Create a **2027 test season** on the existing league (2026 is the live season). This avoids touching live data.

### Steps

- [ ] **Create 2027 season** via Commissioner panel or API:
  ```bash
  POST /api/seasons { leagueId: 1, year: 2027 }
  ```
- [ ] **Create 2 short test periods** (1-2 days each):
  ```bash
  POST /api/periods { leagueId: 1, seasonId: <id>, name: "Test P1", startDate: "2026-04-01", endDate: "2026-04-02" }
  POST /api/periods { leagueId: 1, seasonId: <id>, name: "Test P2", startDate: "2026-04-03", endDate: "2026-04-04" }
  ```
- [ ] **Transition** SETUP → DRAFT → IN_SEASON via Season Manager
- [ ] **Run daily stats backfill** for the test period dates
- [ ] **Execute test trade** mid-period via Commissioner Trade Tool — trade a player between two teams
- [ ] **Verify stats split**: check that the traded player's stats are attributed to the correct team based on `nextDayEffective()` dates
- [ ] **Process a waiver claim** — submit a FAAB bid, process waivers, verify roster changes use next-day dates
- [ ] **Check standings**: Period standings should reflect correct stats per team based on roster ownership dates
- [ ] **Check team page**: Period roster view should show traded players with "Traded" badge

### Verification Queries
```sql
-- Check roster entries with next-day effective dates
SELECT r.id, p.name, t.name as team, r."acquiredAt", r."releasedAt", r.source
FROM "Roster" r JOIN "Player" p ON r."playerId" = p.id JOIN "Team" t ON r."teamId" = t.id
WHERE t."leagueId" = 1 AND r.source LIKE 'TRADE%'
ORDER BY r."acquiredAt" DESC LIMIT 10;

-- Check daily stats for test period
SELECT COUNT(*), MIN("gameDate"), MAX("gameDate")
FROM "PlayerStatsDaily"
WHERE "gameDate" BETWEEN '2026-04-01' AND '2026-04-04';
```

### Acceptance Criteria
- [ ] Trade mid-period: old team keeps pre-trade stats, new team gets post-trade stats
- [ ] Waiver claim: next-day effective dates on acquiredAt/releasedAt
- [ ] Period standings compute correctly with date-aware attribution
- [ ] Period roster view shows all players who were on team during that period
- [ ] Can cleanly delete test season after verification

---

## Implementation Order

| Phase | Effort | Dependencies |
|-------|--------|--------------|
| 3: Insights projection | Small (prompt + category change) | None |
| 2: Team G column | Small (server stat capture + client column) | None |
| 1: Season-to-date stats | Medium (server aggregation + client column) | None |
| 4: Test season | Medium (manual setup + verification) | Phases 1-3 deployed |

Phases 1-3 can be implemented in parallel. Phase 4 should run after all code changes are deployed.

## Key Files

| Feature | Server Files | Client Files |
|---------|-------------|--------------|
| Season-to-date | `standings/routes.ts`, `standings/services/standingsService.ts` | `shared/StatsTables.tsx`, `periods/pages/Season.tsx` |
| Team G/IP | `players/services/statsService.ts`, `players/routes.ts` | `teams/pages/Team.tsx` |
| Insights projection | `services/aiAnalysisService.ts` | `teams/pages/Team.tsx` |
| Test season | `seasons/services/seasonService.ts`, `periods/routes.ts` | Commissioner UI |
