---
status: pending
priority: p2
issue_id: 288
tags: [code-review, architecture, roster, rosterwindow, teams]
dependencies: []
---

## Problem Statement

The `GET /api/teams/:id/period-roster` endpoint (routes.ts:445–456) inlines the period-overlap boundary logic directly:

```ts
acquiredAt: { lte: period.endDate },
OR: [{ releasedAt: null }, { releasedAt: { gt: period.startDate } }],
```

CLAUDE.md has an explicit project-wide convention: **all period-scoped queries MUST use named predicates from `lib/rosterWindow.ts`** (`ownedOn`, `overlapsPeriod`, `clampToPeriod`) rather than raw boundary logic. This PR violates that convention by duplicating the `ownedOn`-style semantics inline without calling the library or cross-referencing it.

The risk: if `ownedOn`'s semantics ever change in `rosterWindow.ts` (e.g., timezone edge case, DST handling), `standingsService.ts` has a comment surfacing it but `routes.ts` will silently diverge. The standings service already has its own copy of this logic — three separate inline implementations now exist across the codebase.

## Findings

- **File**: `server/src/features/teams/routes.ts`, lines 445–456
- **Convention source**: CLAUDE.md ("Time-aware ownership predicates" section)
- **Related predicate**: The fix correctly implements `ownedOn`-style exclusive upper bound (`releasedAt > period.startDate`), NOT `overlapsPeriod`'s inclusive upper bound. This distinction is load-bearing and should be documented regardless.
- **Precedent**: `standingsService.ts` line ~407 has a comment calling out the SQL-equivalent of `overlapsPeriod`. The teams route has no such cross-reference.

## Proposed Solutions

### Option A — Extract `periodOverlapFilter` to rosterWindow.ts (Recommended)
Add to `server/src/lib/rosterWindow.ts`:
```ts
import type { Prisma } from "@prisma/client";

/** Prisma WHERE clause equivalent of ownedOn-semantics: half-open [acquiredAt, releasedAt).
 *  Use in roster findMany queries scoped to a period. Distinct from overlapsPeriod (doubly-inclusive). */
export function periodOverlapFilter(period: { startDate: Date; endDate: Date }): Prisma.RosterWhereInput {
  return {
    acquiredAt: { lte: period.endDate },
    OR: [{ releasedAt: null }, { releasedAt: { gt: period.startDate } }],
  };
}
```
Then in `routes.ts`:
```ts
import { periodOverlapFilter } from "../../lib/rosterWindow.js";
// ...
const overlapping = await prisma.roster.findMany({
  where: { teamId, ...periodOverlapFilter(period) },
  include: { player: true },
  orderBy: { acquiredAt: "asc" },
});
```
- **Pros**: Single source of truth; convention-compliant; future semantics changes propagate automatically
- **Cons**: Requires Prisma type import in rosterWindow.ts (couples lib to Prisma)
- **Effort**: Small
- **Risk**: Low

### Option B — Add a comment cross-referencing rosterWindow.ts
Add to `routes.ts` at the query:
```ts
// Half-open [acquiredAt, releasedAt) window matching ownedOn() in lib/rosterWindow.ts.
// Uses ownedOn-style exclusive upper bound (releasedAt > startDate), NOT overlapsPeriod
// (which uses inclusive >=) — period-roster wants "owned ≥1 day" not "present at start".
```
- **Pros**: Zero code change, documents the semantic distinction
- **Cons**: Does not prevent drift if rosterWindow.ts semantics change
- **Effort**: Trivial
- **Risk**: Minimal (drift risk remains)

## Recommended Action

Option A (extract `periodOverlapFilter`) — eliminates the drift risk permanently and makes the convention explicit. Prisma type import in a lib is acceptable precedent (other lib files use Prisma types). ~10 lines total.

## Technical Details

- **Affected files**: `server/src/lib/rosterWindow.ts`, `server/src/features/teams/routes.ts`
- **CLAUDE.md rule**: "Any function checking 'does this roster entry cover this date/period?' MUST use the named predicates from `lib/rosterWindow.ts`"
- **PR that introduced the gap**: #400 (2026-06-12) — boundary fix was correct but did not consolidate into rosterWindow

## Acceptance Criteria

- [ ] `rosterWindow.ts` exports `periodOverlapFilter(period)` returning a Prisma-ready `RosterWhereInput`
- [ ] `routes.ts` period-roster query uses `periodOverlapFilter` instead of inline boundary
- [ ] The `ownedOn`-vs-`overlapsPeriod` semantic distinction is documented in the exported function's JSDoc
- [ ] Server tsc clean (CI authority)
- [ ] `git mv` this todo to complete

## Work Log

- **2026-06-13**: Created via code review of PR #400 (architecture-strategist agent finding P2-A). Confirmed CLAUDE.md convention exists and is violated.
