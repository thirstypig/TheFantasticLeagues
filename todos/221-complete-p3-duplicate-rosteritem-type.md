---
status: pending
priority: p3
issue_id: "221"
tags: [code-review, typescript, commissioner, type-duplication]
dependencies: []
---

# Duplicate `RosterItem` interface in `commissioner/api.ts` and `RosterGrid.tsx`

## Problem Statement

`RosterItem` is defined in two places:
- `client/src/features/commissioner/api.ts` — the canonical exported type
- `client/src/features/roster/components/RosterGrid.tsx` — a local copy used by the component

Both were updated in this session to add `assignedPosition` and `player.posList`. Any future fix to one won't automatically update the other — silent divergence.

`RosterGrid` accepts `rosters?: RosterItem[]` as a prop. It should import `RosterItem` from `commissioner/api.ts` (or from `shared/api/` — CLAUDE.md specifies that's the home for cross-module types) rather than maintaining a parallel definition.

## Proposed Solution

1. Remove the local `RosterItem` interface from `RosterGrid.tsx`
2. Import `RosterItem` from `../../commissioner/api` (or move to `shared/api/rosterTypes.ts`)
3. Ensure all fields used in `RosterGrid` are present in the canonical `RosterItem`

## Acceptance Criteria
- [ ] `RosterItem` defined in exactly one place
- [ ] `RosterGrid.tsx` imports from the canonical source
- [ ] `tsc --noEmit` clean on client

## Work Log
- 2026-05-18: Identified by TypeScript reviewer. The diff updated both simultaneously — a clear signal to consolidate.
