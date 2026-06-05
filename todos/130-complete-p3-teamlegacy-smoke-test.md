---
status: pending
priority: p3
issue_id: "130"
tags: [code-review, tests, aurora, legacy]
dependencies: []
---

# Add `TeamLegacy.test.tsx` smoke test (1 mount-check, no behavior)

## Problem Statement

Aurora rollout pattern (per `MEMORY.md`) preserves `*Legacy.tsx` files as escape hatches. Existing tests:
- `AuctionValuesLegacy.test.tsx` — 10 tests against the preserved legacy auction values page
- `AuctionValuesAurora.test.tsx` — 3 tests against Aurora-only behavior

`TeamLegacy.tsx` is now reachable via `/teams/:code/classic` but has **no test exercising it** post-PR #182. It's the only file producing `_dbPlayerId`/`_dbTeamId` enrichment that RosterMovesTab panels depend on (see todo #116). If TeamLegacy bit-rots silently, the escape-hatch claim becomes a fiction.

## Proposed Solutions

### Option 1: 1 smoke test that mounts the page and confirms it renders

**Approach:** Mirror `AuctionValuesLegacy.test.tsx`'s simplest test — render `<TeamLegacy />` with mocked APIs, confirm it doesn't throw and at least one expected element is present.

**Pros:**
- 5-minute insurance against silent breakage
- Catches the "imported a deleted helper" class of bug

**Cons:**
- One more test file to maintain (until TeamLegacy is itself deleted per todo #124 phase 2)

**Effort:** Trivial (~5 min)

**Risk:** None

## Recommended Action

Option 1.

## Technical Details

**Affected files:**
- `client/src/features/teams/__tests__/TeamLegacy.test.tsx` (new) — alongside existing `Team.test.tsx`

## Acceptance Criteria

- [ ] `TeamLegacy.test.tsx` exists with at least 1 mount test
- [ ] `cd client && npx vitest run src/features/teams` includes it
- [ ] Future Team.tsx changes that accidentally break TeamLegacy fail CI

## Resources

- **Source:** Architecture-strategist P3
- **Reference:** `client/src/features/auction/__tests__/AuctionValuesLegacy.test.tsx`

## Work Log

### 2026-04-30 — Initial Discovery
- **By:** /ce:review architecture-strategist
