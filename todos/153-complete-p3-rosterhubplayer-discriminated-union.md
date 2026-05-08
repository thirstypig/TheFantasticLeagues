---
status: complete
priority: p3
issue_id: "153"
tags: [code-review, type-safety, teams, simplicity]
dependencies: []
---

# Convert `RosterHubPlayer` to a discriminated union on `isPitcher`

## Problem Statement

`RosterHubPlayer` declares both `hitterStats?` and `pitcherStats?` as optional. The contract — established in `toHubPlayer.ts` and tested — is that exactly one is defined depending on `isPitcher`. The type doesn't enforce this, so consumer code uses `p.hitterStats?.HR` even in branches where `isPitcher === true`.

A discriminated union encodes the invariant in the type system:

```ts
type RosterHubPlayer = BaseFields &
  ({ isPitcher: false; hitterStats?: HitterStats } |
   { isPitcher: true; pitcherStats?: PitcherStats });
```

Then `if (p.isPitcher)` narrows to the pitcher branch, eliminating the need for `?.` chains where the value is guaranteed.

## Findings

- `client/src/features/teams/components/RosterHub/types.ts` — current shape
- `toHubPlayer.ts` — already enforces the invariant at runtime
- `RosterRowV3.tsx`, `MobileRowV3.tsx` consumers use defensive optional chaining

## Proposed Solutions

### Option 1: Refactor type + propagate through consumers (recommended)

Define the discriminated union; update consumers to use `if (p.isPitcher)` narrowing. Pairs with todo #127 (RosterRowV3 / MobileRowV3 collapse) — the discriminated union makes the unified component's stat handling cleaner.

**Effort:** Small (~2h). **Risk:** Low — runtime invariant unchanged.

## Recommended Action

Option 1, do alongside #127 if both land in the same session.

## Technical Details

- `client/src/features/teams/components/RosterHub/types.ts`
- `client/src/features/teams/lib/toHubPlayer.ts` — return type narrows automatically
- `client/src/features/teams/components/RosterHub/{RosterRowV3,MobileRowV3}.tsx` — consumers

## Acceptance Criteria

- [ ] `RosterHubPlayer` is a discriminated union
- [ ] Consumer code uses `if (p.isPitcher)` narrowing where applicable
- [ ] No `?.` chains on stats in branches where the union narrows
- [ ] Tests pass

## Resources

- kieran-typescript-reviewer under /ce:review 2026-04-30
- Todo #127 (RosterRowV3 / MobileRowV3 collapse)

## Work Log

### 2026-04-30 — Initial Discovery
- kieran-typescript-reviewer flagged.
