---
title: "Waiver Priority Order Bug — Missing leagueId + Wrong Sort Logic"
date: 2026-04-01
tags:
  - waiver-claims
  - standings-data
  - sorting-logic
  - league-context
  - silent-default
severity: medium
module: transactions / waivers
symptom: "Waiver priority page showed all teams at 'POS 999'; order did not reflect standings"
root_cause: "Missing leagueId param defaulted to archived league; sort used wrong field and direction"
resolution_type: data-binding + sort-logic
affected_files:
  - client/src/features/transactions/pages/ActivityPage.tsx
  - client/src/features/transactions/components/ActivityWaiversTab.tsx
related_features:
  - standings
  - teams
  - waivers
commit: 536ba21
---

# Waiver Priority Order Bug — Missing leagueId + Wrong Sort Logic

## Problem Symptom

The Waiver Priority tab on the Activity page showed incorrect team ordering:
- All teams displayed **"POS 999"** (rank was always 999/unset)
- Teams were not sorted by standings performance
- The worst-performing team (who should get first waiver pick) was not at the top

## Investigation Steps

1. **Identified symptom**: Waiver priority displayed "POS 999" for all teams
2. **Traced data flow**: `ActivityPage.tsx` calls `getSeasonStandings()` → passes data to `ActivityWaiversTab` → component computes sort order
3. **Verified league context**: App has League 1 (archived 2025) and League 20 (active 2026). The standings fetch was silently using League 1
4. **Checked database**: Confirmed standings data existed for League 20 but fetch defaulted to League 1 (empty/stale data)
5. **Reviewed sort logic**: Discovered secondary issue — sort direction was descending (highest rank first) instead of ascending by points (lowest points = worst team = first pick)
6. **Examined field names**: Found inconsistency between `rank` (always 999 when unset) vs `totalPoints` (the actual computed score)

## Root Cause Analysis

### Root Cause 1: Missing League Context Parameter

```tsx
// BEFORE — no leagueId passed, defaults to league 1 (archived)
getSeasonStandings()
```

The function signature `getSeasonStandings(leagueId?: number)` allows optional leagueId with a silent default to `1`. In `ActivityPage.tsx`, the call omitted the argument entirely, causing it to fetch from the archived 2025 league instead of the active 2026 league.

### Root Cause 2: Wrong Sort Field and Direction

```tsx
// BEFORE — sorts by rank (always 999) descending
const teamsWithRank = teams.map((t) => {
  const s = standingMap.get(t.id);
  return { ...t, rank: s?.rank || 999, points: s?.points || 0 };
});
return teamsWithRank.sort((a, b) => b.rank - a.rank);
```

Two problems:
1. Used `rank` field (always 999 because standings data was from wrong league)
2. Even with correct data, sorting `b.rank - a.rank` (descending) puts the **best** team first — opposite of waiver rules where the **worst** team picks first

## Working Solution

### Fix 1: Pass League Context

```tsx
// AFTER — passes currentLeagueId from LeagueContext
getSeasonStandings(currentLeagueId)
```

### Fix 2: Correct Sort Logic

```tsx
// AFTER — sort by totalPoints ascending (worst team first)
const teamsWithPoints = teams.map((t) => {
  const s = standingMap.get(t.id);
  return { ...t, rank: 0, points: s?.totalPoints || s?.points || 0 };
});

// Sort ASC: fewest points = worst team = first waiver pick
teamsWithPoints.sort((a, b) => a.points - b.points);

// Assign display rank separately (for showing "#N in standings")
const byPointsDesc = [...teamsWithPoints].sort((a, b) => b.points - a.points);
byPointsDesc.forEach((t, i) => { t.rank = i + 1; });

return teamsWithPoints;
```

### UI Improvements

- Added "YOU" badge with accent left border on current user's team
- Changed display from "POS 999" to "#N in standings" format
- Removed "No Owner" text from team rows
- Added "Updated" timestamp and explanatory footer

## Prevention Strategies

### 1. Make leagueId Required on League-Scoped APIs

The `getSeasonStandings(leagueId?: number)` optional parameter with silent default to `1` is dangerous in a multi-league app. This same anti-pattern exists in:
- `getPlayerSeasonStats()` — defaults `leagueId ?? 1`
- `getPlayerPeriodStats()` — defaults `leagueId ?? 1`
- `getPeriodCategoryStandings()` — defaults `leagueId || 1`

**Recommended**: Make `leagueId: number` required (not optional) on all league-scoped API functions. The `LeagueContext` always provides it.

### 2. Never Sort by Unset/Default Fields

Fields like `rank` that default to 999 when unset should never be used as sort keys. Always sort by the computed value (`totalPoints`) and derive display rank separately.

### 3. Document Sort Direction with Business Rules

```tsx
// BUSINESS RULE: Waiver priority = inverse standings
// Fewest totalPoints = worst team = first waiver pick
teamsWithPoints.sort((a, b) => a.points - b.points); // ASC
```

### 4. Test Cases That Would Catch This

- **Multi-league test**: Verify `getSeasonStandings(20)` returns League 20 data, not League 1
- **Sort direction test**: Verify waiver order puts lowest-scoring team at index 0
- **Missing param test**: Verify `getSeasonStandings()` without leagueId throws (or returns correct active league)

## Verification Steps

1. Check browser network tab: `GET /api/standings/season?leagueId=20` returns non-empty standings
2. Verify waiver order: lowest-scoring team appears first
3. Verify "YOU" badge appears on current user's team
4. Reload page and confirm order persists
5. If applicable, verify across leagues (each league shows its own waiver order)

## Related Documentation

- [Trade Reversal Ghost Roster Double-Counting](./trade-reversal-ghost-roster-double-counting.md) — similar pattern where standings computation silently fails with wrong data dependencies
- [Trading Block and Waiver Position Fix Plan](../../plans/2026-04-01-feat-trading-block-and-waiver-position-fix-plan.md) — session plan documenting the same leagueId missing pattern in `proposeTrade()`
- FEEDBACK.md Session 54 — documents this fix alongside the Trading Block + Watchlist backend work
