---
status: pending
priority: p2
issue_id: "214"
tags: [code-review, typescript, teams, period-roster, state-management]
dependencies: []
---

# `selectedPeriodStart` is redundant parallel state — inconsistent with error path, should be co-located with periodRoster

## Problem Statement

`selectedPeriodStart` and `periodRoster` are always set together from the same API response, but they are two independent state variables. The error path only resets `periodRoster`:

```typescript
.then(res => {
  if (!canceled) {
    setPeriodRoster(res.roster);          // ← set
    setSelectedPeriodStart(res.period.startDate);  // ← set
  }
})
.catch(() => { if (!canceled) setPeriodRoster([]); })  // ← only resets periodRoster
// selectedPeriodStart retains the PREVIOUS period's start date on error
```

If the fetch fails, `periodRoster` becomes `[]` but `selectedPeriodStart` holds the stale value from the previous period. The `displayRoster` memo then filters an empty array with a stale boundary — benign today but a state inconsistency hazard.

## Findings

- **File:** `client/src/features/teams/pages/Team.tsx` lines ~227, ~381–399, ~411, ~457
- `setPeriodRoster(null)` and `setSelectedPeriodStart(null)` are called together on reset (correct)
- `setPeriodRoster([])` on error omits the `setSelectedPeriodStart(null)` reset (gap)
- The two pieces of state are logically one object: `{ roster, startDate }`

## Proposed Solutions

### Option A — Co-locate into one state atom (Recommended)
```typescript
const [periodData, setPeriodData] = useState<{
  roster: PeriodRosterEntry[];
  startDate: string;
} | null>(null);

// In effect:
.then(res => {
  if (!canceled) setPeriodData({ roster: res.roster, startDate: res.period.startDate });
})
.catch(() => { if (!canceled) setPeriodData({ roster: [], startDate: "" }); })
// Or: .catch(() => { if (!canceled) setPeriodData(null); })

// In reset:
setPeriodData(null);

// In memo:
return (periodData?.roster ?? []).filter(r =>
  r.releasedAt === null || !periodData || new Date(r.releasedAt) > new Date(periodData.startDate)
).map(r => { ... });
```
- **Pros:** Single state atom; error path can't leave the two fields inconsistent; ~8 LOC removed
- **Cons:** Mild refactor — all 6 references to `periodRoster`/`selectedPeriodStart` must be updated
- **Effort:** Small-Medium

### Option B — Fix only the error path
Add `setSelectedPeriodStart(null)` to the `.catch()` handler.
- **Pros:** Minimal diff
- **Cons:** Doesn't eliminate the parallel state smell; next modification could re-introduce the bug
- **Effort:** 1 line

## Recommended Action

Option B as a quick fix to close the error-path gap. Option A in the same session if todo #210 (PeriodMode cleanup) is also being worked — they can be combined into one pass.

## Acceptance Criteria
- [ ] Error path (`.catch`) resets `selectedPeriodStart` to `null` (or equivalent) alongside `periodRoster`
- [ ] State is never in a condition where `periodRoster` is `[]` and `selectedPeriodStart` has a stale value
- [ ] Existing period roster tests still pass

## Work Log
- 2026-05-18: Identified by Architecture Strategist + Code Simplicity reviewer. Minimal fix: add `setSelectedPeriodStart(null)` to catch block.
