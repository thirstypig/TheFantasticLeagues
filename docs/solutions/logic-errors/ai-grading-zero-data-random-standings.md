---
title: "AI Grading Used Zero-Data Table, Producing Random Standings and Nonsensical Grades"
category: logic-errors
tags: [ai, llm, standings, teamstatseason, teamstatsperiod, cache, ohtani, grading]
module: teams, standings, aiAnalysisService
symptom: "1st place team received F grade; last place team received C grade; grades uncorrelated with standings"
root_cause: "TeamStatsSeason had rows with all-zero values; computeStandingsFromStats sorted zeros producing random rankings; cache key missing weekKey caused cross-week data leakage"
severity: high
session: 59
date: 2026-04-07
---

# AI Grading Used Zero-Data Table, Producing Random Standings and Nonsensical Grades

## Symptom

Weekly AI insights gave wildly inaccurate grades:
- Demolition Lumber Co. (tied 1st, 55 roto pts) received **F**
- The Show (dead last, 26 roto pts) received **C**
- Diamond Kings (6th place) received **A**
- Grades had zero correlation with actual roto standings

## Root Cause (4 bugs)

### Bug 1: TeamStatsSeason had all-zero data

The AI insights route at `teams/routes.ts:140` queried `TeamStatsSeason` to build standings:

```typescript
const allTeamStats = await prisma.teamStatsSeason.findMany({
  where: { team: { leagueId } },
  include: { team: { select: { id: true, name: true } } },
});
```

`TeamStatsSeason` rows existed (8 rows) but every stat field was zero. The `hasActualStats` check at line 132 was `!!teamSeasonStats` — it checked for row existence, not meaningful data. So `hasActualStats` was `true` but all data was zero.

The standings computation at line 171-175 then sorted all-zero `totalScore` values, producing random insertion-order rankings:

```typescript
standings = allTeamStats
  .map(ts => ({ teamName: ts.team.name, totalScore: 0, rank: 0 }))
  .sort((a, b) => b.totalScore - a.totalScore)  // sorts nothing
  .map((s, i) => ({ ...s, rank: i + 1 }));
```

The LLM received these random rankings and graded accordingly.

### Bug 2: Cache key missing weekKey

The in-memory insights cache used `${leagueId}:${teamId}` as the key without `weekKey`. When backfilling past weeks via `weekOverride`, each request hit the cache from the first week generated, silently returning stale data. The `generate-all` endpoint reported "generated" (got 200 response) but no new insight was persisted.

### Bug 3: Period query missing leagueId filter

`teamService.getTeamSummary()` queried:
```typescript
prisma.period.findFirst({ where: { status: "active" } })
```
Without `leagueId` filter, this found period id=1 (from a different league) instead of id=35 (the correct league 20 period). Per-player `periodStats` returned null for all players because no stats existed in the wrong period.

### Bug 4: mirrorTwoWayPitcherStats didn't zero hitter pitching

The function copied Ohtani's pitching stats from the real record (id=3) to the synthetic pitcher (id=3191), but left the pitching stats (W=1, K=6, IP=6) on the hitter record. Both DLC (hitter) and Skunk Dogs (pitcher) counted the same W=1, double-counting across the league.

## Solution

### Fix 1: Use TeamStatsPeriod as primary data source

```typescript
// Try TeamStatsPeriod first (has real data), fall back to TeamStatsSeason
const insightPeriod = await prisma.period.findFirst({
  where: { leagueId, status: "active" },
  orderBy: { id: "desc" },
});

if (insightPeriod) {
  const periodStats = await prisma.teamStatsPeriod.findMany({
    where: { periodId: insightPeriod.id },
    include: { team: { select: { id: true, name: true } } },
  });
  if (periodStats.length > 0 && periodStats.some(ps => ps.R > 0 || ps.W > 0)) {
    allTeamStats = periodStats;
    hasActualStats = true;
  }
}
```

Key pattern: **Check for meaningful data, not just row existence.** `periodStats.some(ps => ps.R > 0 || ps.W > 0)` ensures at least one team has non-zero stats.

### Fix 2: Include weekKey in cache key

```typescript
// Before (broken):
const cacheKey = `${leagueId}:${teamId}`;

// After (fixed):
const cacheKey = `${leagueId}:${teamId}:${weekKey}`;
```

### Fix 3: Filter period by leagueId

```typescript
// Before (cross-league):
prisma.period.findFirst({ where: { status: "active" } })

// After (scoped):
prisma.period.findFirst({
  where: { status: "active", leagueId: team.leagueId },
  orderBy: { startDate: "asc" },
})
```

### Fix 4: Zero hitter pitching after mirror

```typescript
// After copying to pitcher record, zero the hitter's pitching stats
await prisma.playerStatsPeriod.update({
  where: { playerId_periodId: { playerId: realPlayer.id, periodId } },
  data: { W: 0, SV: 0, K: 0, IP: 0, ER: 0, BB_H: 0 },
});
```

### Fix 5: Deterministic grade anchoring

```
GRADING RULES — grade MUST correlate with standings position:
- 1st-2nd place: A- to A+ (only A- if terrible week)
- 3rd-4th place: B to A- (adjust based on weekly trajectory)
- 5th-6th place: C to B (average production)
- 7th-8th place: D to C (only give F if truly catastrophic)
A 1st-place team CANNOT receive below B-. A last-place team CANNOT receive above B+.
```

## Prevention Patterns

### 1. Validate data meaningfulness, not just existence

```typescript
// BAD: rows exist but may be all zeros
const hasData = !!await prisma.table.findFirst({ where: { id } });

// GOOD: at least one field has meaningful data
const rows = await prisma.table.findMany({ where: { ... } });
const hasData = rows.length > 0 && rows.some(r => r.value > 0);
```

### 2. Cache keys must include ALL distinguishing dimensions

When a cache serves requests that vary by N dimensions, the key must encode all N. Missing one causes cross-contamination.

### 3. Always scope queries by parent entity

Any query for child entities (periods, stats, rosters) must filter by the parent's scope (leagueId, teamId) to prevent cross-entity data leakage.

### 4. Mirror operations must handle both source and destination

When copying data between records, always consider: does the source need cleanup? A copy without zeroing the source creates duplicates.

## Related Documentation

- [Silent Null Causes LLM Hallucination](./silent-null-causes-llm-hallucination.md) — same pattern: LLM receives empty/zero data and confidently halluccinates
- [Ohtani Two-Way Player Split Architecture](./ohtani-two-way-player-split-architecture.md) — context for the two-record Ohtani architecture
- [Ohtani Derived ID API Resolution](./ohtani-derived-id-api-resolution.md) — derived mlbId (1660271) resolution patterns

## Files Changed

- `server/src/features/teams/routes.ts` — AI insights data source, cache key, null dedup
- `server/src/features/teams/services/teamService.ts` — period query scoping, per-player periodStats
- `server/src/features/players/services/mlbStatsSyncService.ts` — hitter pitching zeroing
- `server/src/features/players/services/mlbSyncService.ts` — POSITION_OVERRIDES in resolvePosition
- `server/src/lib/sports/baseball.ts` — POSITION_OVERRIDES map
- `server/src/services/aiAnalysisService.ts` — deterministic grade prompt
