---
status: pending
priority: p2
issue_id: "213"
tags: [code-review, teams, period-roster, correctness, edge-case]
dependencies: []
---

# Player traded away and back in the same period produces duplicate rows in period roster display

## Problem Statement

The `GET /api/teams/:id/period-roster` endpoint returns one row per `Roster` DB record. A player traded away and re-acquired in the same period has two `Roster` rows (one with `releasedAt` mid-period, one with `releasedAt = null`). Both pass the `displayRoster` filter:

```typescript
periodRoster.filter(r =>
  r.releasedAt === null || r.releasedAt > selectedPeriodStart
)
```

- Released row: `releasedAt = "2026-05-08T..."` > `period.startDate` → passes → renders
- Active row: `releasedAt === null` → passes → renders

The player appears twice in the period roster UI.

## Findings

- **File:** `client/src/features/teams/pages/Team.tsx` line ~411
- **Server:** `GET /api/teams/:id/period-roster` (teams/routes.ts ~line 440) returns `WHERE releasedAt >= period.startDate OR releasedAt IS NULL` — intentional for stats attribution
- The display filter only removes `releasedAt === period.startDate` boundary rows; it does not deduplicate players
- The trade-away-and-back case is known but no current league has seen it in production (OGBA doesn't have mid-period trades yet, but Wire List processing could create this)
- Related: todo #204 (`test-player-released-and-reacquired-same-team`) covers the stats-attribution half; this is the display half

## Proposed Solutions

### Option A — Deduplicate by `playerId` after filter, keeping the active row (Recommended)
After the `releasedAt` filter, deduplicate: if a player appears twice, keep the row with `releasedAt === null` (the active stint):

```typescript
const filtered = periodRoster.filter(r =>
  r.releasedAt === null || !selectedPeriodStart || new Date(r.releasedAt) > new Date(selectedPeriodStart)
);
const seenPlayerIds = new Set<number>();
const deduped = filtered.filter(r => {
  if (seenPlayerIds.has(r.playerId)) return false;
  seenPlayerIds.add(r.playerId);
  return true;
});
return deduped.map(r => { ... });
```

This requires the server response to put `releasedAt === null` rows first, OR sort client-side before deduping. Easiest: sort by `releasedAt` nulls-last-first before deduplication.
- **Effort:** Small
- **Risk:** Low — test with the duplicate-row case

### Option B — Fix at the server level: return only the active row per player, with stats covering the full period
More complex: requires aggregating stats across multiple Roster entries in the server response.
- **Effort:** Large
- **Risk:** Medium — server stats attribution logic is separate

### Option C — Add a `playedThisPeriod: boolean` flag to each roster entry server-side
Server computes and returns the flag; client filters on it.
- **Pros:** Explicit contract; no client-side deduction
- **Cons:** Server change required; flag semantics need to be defined

## Recommended Action

Option A for now — client-side deduplication keeping the active row. Option C is the clean long-term design.

## Acceptance Criteria
- [ ] Player traded away and back in the same period appears only ONCE in period roster display
- [ ] The active (releasedAt === null) row is kept, not the released row
- [ ] Existing period roster tests still pass
- [ ] New test: player with two Roster rows in the same period renders once

## Work Log
- 2026-05-18: Identified by Architecture Strategist. No current production occurrence; Wire List processing could trigger it. Related to todo #204 (stats attribution half).
