---
status: pending
priority: p2
issue_id: "215"
tags: [code-review, teams, ux, commissioner, period-roster]
dependencies: []
---

# Removing Cumulative tab breaks season-level roster audit — recommend restoring as "Season total" pill

## Problem Statement

The Cumulative tab was removed and the Team page now defaults to the most recent period. Before this change, a commissioner could view season-aggregate stats (total R/HR/RBI/etc. across all periods) for any team by selecting "Cumulative." Now there is no way to see a team's full-season total stats in the team view.

The season aggregate data (`getTeamRosterHub`) is still fetched on every page load — but its data is immediately overwritten by the period-mode default and the roster hub data is never surfaced to the user.

Affected workflows:
1. **Season audit**: commissioner reviewing each team's totals to verify standings accuracy
2. **FanGraphs comparison**: matching full-season stats against external sources (OGBA uses this regularly — see `fangraphs_audit_reference.md`)
3. **Trophy hunting**: users checking their own cumulative stats late in season

## Findings

- **File:** `client/src/features/teams/pages/Team.tsx` lines ~357–360, ~1396–1410
- `getTeamRosterHub` is still called on mount (line ~280) and data loads — but is rendered only if `periodMode === "season"`, which is now unreachable
- The Hub fetch is a wasted network call (always fires, never used by the UI)
- No league currently has 0 periods defined — `if (opts.length > 0)` guard on line 358 always fires, overwriting "season" immediately

## Proposed Solutions

### Option A — Restore "Season total" as the first pill (Recommended)
Re-add the cumulative pill with a different label to distinguish it from a specific period:
```typescript
{[{ key: "season" as const, label: "Season" }, ...periodOptions.map(p => ({ key: p.id, label: p.name }))].map(...)
```
Keep the default to the most recent period (default behavior from the effect), but let the user navigate back to the cumulative view.
- **Pros:** Restores lost functionality; Hub fetch is no longer wasted
- **Cons:** "Season" is back in the type — may conflict with todo #210 PeriodMode cleanup; coordinate both todos

### Option B — Stop fetching Hub data if cumulative view is removed
If the cumulative view is permanently gone, remove the `getTeamRosterHub` call to avoid the wasted fetch.
- **Pros:** Removes dead code
- **Cons:** Loses season-aggregate stats entirely

### Option C — Show season totals in the existing period pills as an extra computed row
Not a separate tab, but a totals row at the bottom of each period's table.
- **Pros:** No extra tab
- **Cons:** Different UX pattern from existing pills; complex to implement

## Recommended Action

Option A — restore "Season total" pill as the first option. Coordinate with todo #210 (PeriodMode cleanup) to keep the type changes consistent.

## Acceptance Criteria
- [ ] Users can select "Season" (or "Season total") pill to view cumulative stats
- [ ] Hub data (`getTeamRosterHub`) is surfaced in the UI when "Season" is selected
- [ ] Period pills still default to most recent period on first load
- [ ] If todo #210 is addressed first, ensure PeriodMode type accommodates `"season"` or equivalent

## Work Log
- 2026-05-18: Identified by Architecture Strategist. Wasted Hub fetch is a secondary concern. Season audit workflow is the primary motivation.
