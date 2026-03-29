---
title: "Season Stats Showing Wrong Year (2025 Instead of 2026)"
problem_type: logic-error
severity: high
status: resolved
session: "Session 49"
date_resolved: "2026-03-29"
affected_modules:
  - server/src/features/players/services/statsService.ts
  - client/src/features/players/api.ts
  - server/src/features/mlb-feed/routes.ts
tags:
  - date-logic
  - timezone
  - season-boundary
  - hardcoded-constants
  - mlb-api
---

# Season Stats Showing Wrong Year (2025 Instead of 2026)

## Problem Symptom

After the 2026 MLB season started on March 25, multiple pages continued showing 2025 stats:
- **Players page**: Season stats showed last year's totals
- **Player detail modal**: "Positions" section showed 2025 fielding data (last year's games played)
- **Real-Time Stats**: Games from "tonight" (Pacific time) showed as having no data after 5 PM PT

## Root Cause

Three separate date/season logic bugs, each with a different root cause:

### Bug 1: Hardcoded `LAST_SEASON = 2025`

**File**: `server/src/features/players/services/statsService.ts`

```typescript
// WRONG: Never updates between years
const LAST_SEASON = 2025;
```

The `getLastSeasonStats()` function fetched 2025 data from the MLB API with a 30-day cache. When the 2026 season started, the endpoint continued serving 2025 stats.

### Bug 2: Month Logic Error in `lastCompletedSeason()`

**File**: `client/src/features/players/api.ts`

```typescript
// WRONG: March is month 2 (0-indexed), so month < 3 is TRUE in March
function lastCompletedSeason(): number {
  const now = new Date();
  const year = now.getFullYear();
  return now.getMonth() < 3 ? year - 1 : year;
  // March 26, 2026 → getMonth() = 2 → 2 < 3 → returns 2025!
}
```

Used for fielding stats API call, so the position eligibility modal showed 2025 positions and games played.

### Bug 3: UTC Timezone for Game Dates

**File**: `server/src/features/mlb-feed/routes.ts`

```typescript
// WRONG: UTC flips to tomorrow at 5 PM Pacific
function todayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}
```

At 5 PM Pacific (midnight UTC), `toISOString()` returned tomorrow's date. Games from "tonight" showed no data because the MLB API was queried for the wrong date.

## Solution

### Fix 1: Dynamic Current Season with Short Cache

```typescript
// CORRECT: Always fetches current year with 2-hour cache
const CURRENT_SEASON = new Date().getFullYear();
const CURRENT_SEASON_TTL = 2 * 3600; // 2 hours (live data changes daily)

export async function getCurrentSeasonStats(): Promise<Map<string, SeasonStatEntry>> {
  // Fetches current year stats from MLB API
  const url = `${MLB_BASE}/people?personIds=${ids}&hydrate=stats(...,season=${CURRENT_SEASON})`;
  const data = await mlbGetJson(url, CURRENT_SEASON_TTL);
  // ...
}
```

### Fix 2: Simple Current Year Function

```typescript
// CORRECT: No month logic needed — just return the current year
function currentSeason(): number {
  return new Date().getFullYear();
}
```

### Fix 3: Pacific Timezone with Noon Cutover

```typescript
// CORRECT: Uses Pacific time, shows last night's stats until noon
function todayDateStr(): string {
  const now = new Date();
  const pacificHour = Number(now.toLocaleString("en-US", {
    timeZone: "America/Los_Angeles", hour: "numeric", hour12: false
  }));
  if (pacificHour < 12) {
    // Before noon PST — show yesterday's games (last night's stats)
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    return yesterday.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  }
  return now.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}
```

## Prevention Strategies

1. **Never hardcode year constants** — Use `new Date().getFullYear()` or a centralized `currentSeason()` utility
2. **Be careful with 0-indexed months** — `getMonth()` returns 0-11, not 1-12. March = 2, not 3
3. **Always specify timezone for date formatting** — Use `toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" })` for MLB dates
4. **Test at season boundaries** — March 25-31 is the danger zone where offseason logic meets regular season
5. **Use short cache TTL for live data** — 2 hours for current season stats (not 30 days like historical data)
6. **Search codebase for hardcoded years** — `grep -r "2025\|2026\|LAST_SEASON" server/src/ client/src/` before each season

## Key Learnings

- MLB seasons align with calendar years — once January 1 hits, the current season year is the new year
- The `lastCompletedSeason()` pattern is fragile and unnecessary — just use `getFullYear()`
- UTC vs Pacific timezone causes a 7-8 hour offset that affects evening game data
- The noon PST cutover pattern works well: last night's stats visible until noon, then today's games appear

## Related Patterns to Watch

| Pattern | Risk | Mitigation |
|---------|------|-----------|
| Hardcoded month numbers | High | Extract to named constants or config |
| UTC vs Local timezone | High | Always specify timezone explicitly |
| DST transitions | Medium | Use IANA timezone names, not offsets |
| Cached stats with no TTL | High | Always set explicit TTL based on data freshness needs |
| Season detection logic | High | Use `getFullYear()` not month-based branching |
