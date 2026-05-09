---
status: complete
priority: p3
issue_id: "150"
tags: [code-review, simplicity, teams, tests]
dependencies: []
---

# Team.tsx: refactor sub-routes via React Router `<Outlet />`; trim toHubPlayer test count

## Problem Statement

Two small simplification opportunities in the v3 hub:

1. **`Team.tsx:119-128, 608-670`** — three `useMatch` calls feeding a ternary chain to derive `manageMode`, then a 60-line conditional render block (`manageMode ? <SubrouteContainer>...</SubrouteContainer> : <RosterHubV3 ...>`). The inner branch has its own three-way ternary on which panel to render. Reproduces a router inside a component. Cleaner with declarative nested `<Route>` + `<Outlet />`.
2. **`toHubPlayer.test.ts` has 17 tests for an 18-LOC mapper.** Several are redundant or guard against impossible inputs:
   - 3 tests for the `posList || posPrimary || ""` fallback chain (one would suffice)
   - 4 tests for `assignedSlot` canonicalization (parameterizable)
   - 1 test that casts `1 as unknown as boolean` to feed a non-boolean `isPitcher` (testing TS bypass, not real behavior)
   - 1 test that the docblock explicitly calls out as testing an arbitrary stylistic choice

   Trim to ~8 tests covering: identity (rosterId vs playerId), posList fallback chain, assignedSlot canonicalization (parameterized), role-aware split, gamesByPos passthrough, mlbTeam/isKeeper passthrough.

## Findings

- `client/src/features/teams/pages/Team.tsx:119-128, 608-670` — `useMatch` ternary chain
- `client/src/features/teams/lib/__tests__/toHubPlayer.test.ts` — 185 LOC for an 88 LOC source

Note: per `MEMORY.md` `feedback_test_fixtures.md`, test fixtures must mirror real API shapes. Trimming should not delete tests that pin down the exact contract — only the redundant variations.

## Proposed Solutions

### Option 1: Two small PRs (recommended)

- PR A: Migrate manage sub-routes to nested `<Route>` + `<Outlet />`, kill `manageMode` ternary
- PR B: Trim toHubPlayer tests to ~8 with parameterization

**Effort:** Small each (~2h). **Risk:** Low.

### Option 2: Combined PR

Faster but harder to review.

**Effort:** Small. **Risk:** Low.

## Recommended Action

Option 2. Both are mechanical and the surface they touch is tightly scoped.

## Technical Details

- `client/src/features/teams/pages/Team.tsx`
- `client/src/App.tsx` — nested route structure
- `client/src/features/teams/lib/__tests__/toHubPlayer.test.ts`

## Acceptance Criteria

- [ ] No `useMatch` calls in Team.tsx
- [ ] Three sub-routes render via `<Outlet />`
- [ ] toHubPlayer tests reduced to ≤10
- [ ] Test coverage of contracts unchanged (no real behavior bit lost)
- [ ] Browser smoke `/teams/<code>/manage/{claim,il-stash,il-activate}` — identical UX

## Resources

- Simplicity review under /ce:review 2026-04-30
- `MEMORY.md` `feedback_test_fixtures.md` (informs trim discipline)

## Work Log

### 2026-04-30 — Initial Discovery
- code-simplicity-reviewer flagged.
