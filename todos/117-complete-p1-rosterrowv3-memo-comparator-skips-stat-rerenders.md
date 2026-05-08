---
status: pending
priority: p1
issue_id: "117"
tags: [code-review, correctness, teams, v3-hub, react]
dependencies: []
---

# `RosterRowV3` / `MobileRowV3` custom memo comparator silently skips re-renders when stats / posList / GP change

## Problem Statement

Both `RosterRowV3.memo` (and presumably `MobileRowV3.memo`) ship with custom `arePropsEqual` comparators (`RosterRowV3.tsx:187-199`) that compare ONLY scalar `player.rosterId`, `player.assignedSlot`, and 7 boolean flags.

Props that ARE rendered but NOT in the comparator:
- `player.posList` (multi-chip eligibility)
- `player.gamesPlayedByPosition` (GP suffixes)
- `player.hitterStats.{R,HR,RBI,SB,AVG}` (5 columns of rendered stats)
- `player.pitcherStats.{IP,W,SV,K,ERA,WHIP}` (6 columns)
- `player.isKeeper`, `player.mlbTeam`

When stats refresh in the background → `displayRoster` updates → `hubHitters` / `hubPitchers` get new `RosterHubPlayer` objects via `toHubPlayer` (`Team.tsx:385-387`) → React passes new `player` props to each row → the custom comparator returns `true` for unchanged scalar fields → **row does not re-render even though new data arrived**.

User-visible symptom: stale stats. Eligibility chips don't refresh after a position-eligibility sync. GP suffixes lock to first render's value.

This is a correctness bug masquerading as a perf optimization. Default `React.memo` shallow-compare would have caught all the omitted props.

## Findings

- `client/src/features/teams/components/RosterHub/RosterRowV3.tsx:187-199` — comparator function
- `client/src/features/teams/components/RosterHub/MobileRowV3.tsx` — same pattern (verify line range)
- `client/src/features/teams/pages/Team.tsx:385-387` — `useMemo(() => hitters.map(toHubPlayer), [hitters])` produces NEW object identities on every `hitters` change, but the comparator's scalar checks don't notice
- The intent of `React.memo` with custom comparator is "capture every prop that affects render output" — this comparator captures less than half
- 23 rows × shallow compare per render ≈ ~3μs total — the perf cost the comparator was avoiding is negligible

## Proposed Solutions

### Option 1: Drop the custom comparator entirely (recommended)

**Approach:** Remove the second arg from `React.memo(RosterRowV3)`. Default shallow compare uses every prop. With `useMemo` upstream giving stable references and `useCallback` for action handlers, that's exactly what's wanted.

**Pros:**
- Correctness fix (eliminates stale-render bug)
- Less code; no comparator to maintain as new props get added
- Future-proof — adding props doesn't silently bypass memoization

**Cons:**
- ~3μs more work per parent re-render (negligible)

**Effort:** Small (~5 min + run tests)

**Risk:** Low — existing v3 tests will catch any regression. The comparator was a perf optimization that didn't pay rent.

### Option 2: Expand the comparator to cover all rendered props

**Approach:** Add deep comparisons for `player.posList`, `player.gamesPlayedByPosition` (object), `player.hitterStats` (object), `player.pitcherStats` (object), etc.

**Pros:**
- Keeps the explicit perf-control pattern

**Cons:**
- Object comparison is more expensive than shallow compare
- Same bug recurs the moment a new prop is added without updating the comparator

**Effort:** Small (~15 min)

**Risk:** Medium — easy to miss a field

## Recommended Action

Option 1. The comparator is a foot-gun, not an optimization at this scale.

## Technical Details

**Affected files:**
- `client/src/features/teams/components/RosterHub/RosterRowV3.tsx:187-199`
- `client/src/features/teams/components/RosterHub/MobileRowV3.tsx` (same pattern)

**No DB / API / contract changes.**

## Acceptance Criteria

- [ ] Default `React.memo` (no custom comparator) on both row components
- [ ] Manual verification: trigger a stats refresh on Team page, observe rows re-render with new values
- [ ] Existing tests pass (toHubPlayer.test.ts + any RosterHubV3 tests)
- [ ] No measurable render-time regression (sanity check via React DevTools)

## Resources

- **Source:** Performance-oracle agent (flagged as P3 perf, but correctness-class bug)
- **PR #182:** Introduced the comparator
- **Cross-reference:** PR #185 `toHubPlayer.test.ts` covers the mapper but not memoization behavior

## Work Log

### 2026-04-30 — Initial Discovery
- **By:** /ce:review performance-oracle agent
- **Actions:** Traced render flow from `useMemo` → `toHubPlayer` → row props → comparator
- **Learnings:** Custom React.memo comparators that don't cover every rendered prop are correctness bugs, not perf wins. Default shallow compare is almost always the right call.
