---
status: pending
priority: p1
issue_id: "210"
tags: [code-review, typescript, teams, period-roster, dead-code]
dependencies: []
---

# `PeriodMode` type includes unreachable `"season"` — dead branches + initial render flicker

## Problem Statement

`PeriodMode` is typed as `"season" | number`. The Cumulative tab was removed and the period fetch effect now immediately overwrites `periodMode` to `opts[opts.length - 1].id` on first load:

```typescript
// Team.tsx line ~358
if (opts.length > 0) setPeriodMode(opts[opts.length - 1].id);  // always a number
```

The initial `useState<PeriodMode>("season")` is set to `"season"`, which then triggers:
1. The `displayRoster` memo returns `roster` (season hub data)
2. The hub data renders briefly
3. The period effect fires, sets `periodMode` to a number
4. The period fetch begins, `periodLoading = true`
5. A loading state briefly shows
6. Period data arrives, `displayRoster` shows the period roster

This is a perceptible render flicker: season roster → loading → period roster on every page load.

Additionally, all guard branches on `periodMode === "season"` are now dead code:
```typescript
if (periodMode === "season" || !periodRoster) { ... }  // "season" branch unreachable
```

## Findings

- **File:** `client/src/features/teams/pages/Team.tsx`
- `useState<PeriodMode>("season")` — initial value immediately overwritten by effect
- All `periodMode === "season"` guards are dead (3+ locations)
- `"season"` is still a valid TypeScript value per the type definition, creating a false affordance
- The flicker is visible: hub roster renders, then period loading spinner, then period roster

## Proposed Solutions

### Option A — Initialize to `null` and guard on null (Recommended)
```typescript
const [periodMode, setPeriodMode] = useState<number | null>(null);
// In displayRoster memo: if (!periodMode || !periodRoster) return roster;
// In period fetch effect: if (!periodMode) { setPeriodRoster(null); return; }
```
- **Pros:** No flicker (shows hub roster until period data arrives without a null→season intermediate); removes dead type; all guards become `periodMode === null`
- **Cons:** Requires touching 5–6 locations in Team.tsx
- **Effort:** Medium
- **Risk:** Low — same visible behavior once data loads; fixes flicker

### Option B — Initialize directly to the last period ID (requires knowing it before the effect)
Pre-fetch period IDs synchronously or pass them as props.
- **Cons:** Over-complex; period list comes from an async fetch
- **Effort:** Large

### Option C — Keep `"season"` but remove the dead branches with a comment
Leave the type, add a `// NOTE: "season" is no longer reachable; clean up in next cycle` comment.
- **Pros:** Minimal diff
- **Cons:** Misleads future readers; flicker persists
- **Effort:** Tiny
- **Risk:** None but doesn't fix the problem

## Recommended Action

Option A — `null` as initial state eliminates both the dead type and the flicker. Medium effort but clean.

## Acceptance Criteria
- [ ] `PeriodMode` type removed or changed to `number | null`
- [ ] Initial `useState` value is `null`
- [ ] All `periodMode === "season"` guards replaced with `periodMode === null`
- [ ] No render flicker on Team page load (season roster renders once, period roster replaces it cleanly)
- [ ] `tsc --noEmit` clean on client

## Work Log
- 2026-05-18: Identified by TypeScript reviewer. The flicker is a secondary consequence of the Cumulative tab removal not being fully cleaned up in the type system.
