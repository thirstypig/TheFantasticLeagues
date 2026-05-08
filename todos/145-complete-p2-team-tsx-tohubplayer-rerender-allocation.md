---
status: complete
priority: p2
issue_id: "145"
tags: [code-review, performance, teams, react]
dependencies: []
---

## Verified shipped — 2026-05-07

The Option-1 cache lives in `client/src/features/teams/pages/Team.tsx` as the
`useHubPlayers` hook (lines 147-169): a `useRef<Map<number, HubPlayerCacheEntry>>`
keyed by `rosterId`, gated by `hubPlayerCacheKey(row)` derived from
`HUB_PLAYER_CACHE_KEY_FIELDS` in `client/src/features/teams/lib/toHubPlayer.ts`
(per sibling todo #162.2 — the cache key auto-widens when input fields are
added, eliminating silent stale-cache risk). All three call sites
(`baselineHubHitters`, `baselineHubPitchers`, `hubIl`) use the hook, and
unseen-rosterId entries are GC'd inside the same `useMemo` pass.

PR #298 also reduced upstream churn by replacing the legacy
`getTeamDetails` × `getPlayerSeasonStatsMeta` client join with a single
server-shaped `getTeamRosterHub()` call, so identity-stable rows now flow
through the cache without the previous double-allocation.

# Team.tsx allocates fresh RosterHubPlayer arrays on every render; mobile pill taps feel laggy

## Problem Statement

`client/src/features/teams/pages/Team.tsx:354-373` runs `useMemo(() => hitters.map(toHubPlayer), [hitters])` and similar for pitchers + IL. The `hitters` array is the output of a `sort()` that produces a new array reference on every render where roster, period, or selection changes. So `toHubPlayer` runs for every row × 3 groups × every render — even when only one row's `assignedPosition` changed.

For a 23-player roster: 23 fresh `RosterHubPlayer` allocations per re-render of Team.tsx, each with nested `gamesByPos` / `hitterStats` / `pitcherStats` objects. Combined with todo #117 (RosterRowV3.memo comparator skips stat re-renders), the net effect is the upstream allocation churn happens regardless. On mobile this is the difference between snappy and laggy pill-tap response.

## Findings

- `client/src/features/teams/pages/Team.tsx:354-373` — three `useMemo` calls each re-running mapper
- Each `toHubPlayer(p)` allocates fresh nested objects
- Todo #117 already addresses the comparator; this is the upstream churn

## Proposed Solutions

### Option 1: Memoize per-row via Map keyed on player identity (recommended)

```ts
const hubPlayerCache = useRef(new Map<number, RosterHubPlayer>());
const hubHitters = useMemo(
  () => hitters.map(p => {
    const cached = hubPlayerCache.current.get(p.id);
    if (cached && shallowEqual(cached, computeFromInput(p))) return cached;
    const next = toHubPlayer(p);
    hubPlayerCache.current.set(p.id, next);
    return next;
  }),
  [hitters],
);
```

Cuts allocations on identity-stable rows; mappers only run for changed players.

**Effort:** Small (~2h). **Risk:** Low — pure perf optimization.

### Option 2: Move the mapping server-side (#140)

Eliminates the problem at its source. Bigger-effort but cleaner.

**Effort:** Medium. **Risk:** Low.

## Recommended Action

Option 2 (#140) is the architecturally correct fix; if that slips, do Option 1 in the meantime.

## Technical Details

- `client/src/features/teams/pages/Team.tsx:354-373`
- `client/src/features/teams/lib/toHubPlayer.ts`
- See also #117 (memo comparator) and #140 (server-side hub roster)

## Acceptance Criteria

- [ ] React Profiler shows ≥80% reduction in commit count for Team.tsx on pill tap
- [ ] Mobile pill-tap latency improves (subjective, browser-verified)
- [ ] No regression on existing tests

## Resources

- Performance review under /ce:review 2026-04-30
- Todo #117 (sister: row memo comparator)
- Todo #140 (alternative: server-side hub roster)

## Work Log

### 2026-04-30 — Initial Discovery
- performance-oracle flagged during /ce:review re-run.
