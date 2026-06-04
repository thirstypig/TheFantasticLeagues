---
status: pending
priority: p2
issue_id: 254
tags: [code-review, architecture, rosterWindow, standings]
dependencies: []
---

## Problem Statement

`overlapsPeriod` is exported from `server/src/lib/rosterWindow.ts` but has zero callers. The `standingsService.ts` Prisma query at line 408 re-implements the identical logic as a SQL `WHERE` clause (documented with a comment referencing `overlapsPeriod`). The function exists as a "reference implementation" for the SQL, but as an exported, unused symbol it is:

1. An invisible maintenance trap: if the Prisma WHERE and the JS function diverge, attribution bugs appear for partial-period tenures with no type-level warning
2. A dead export that invites future callers to use it incorrectly (JS-side filtering instead of pushing the filter to the DB)

## Findings

From architecture-strategist (verified by grep across server tree):
- `overlapsPeriod` exported from `rosterWindow.ts` line 152
- `standingsService.ts` import at line 6: only imports `{ clampToPeriod, ownedOn }` — NOT `overlapsPeriod`
- No other file in `server/src/` imports `overlapsPeriod`
- The Prisma `where` clause at lines 408–414 implements the same logic in SQL (correct — Prisma can't call a JS function in its `where`)

## Proposed Solutions

**Option A — Keep exported but add a clear "SQL reference spec" comment (Recommended if other consumers expected soon)**

Remove the `export` keyword and add a block comment:
```typescript
/**
 * Reference spec for the Prisma `where` clause in standingsService.ts line 408.
 * Do not call directly — use the Prisma filter to avoid hydrating rows for JS-side filtering.
 * @internal
 */
function overlapsPeriod(...) { ... }
```

Keeps the function as documentation without creating a callable export that risks being misused.

Effort: Tiny | Risk: None

**Option B — Delete the function**

The SQL comment at `standingsService.ts:406` already serves as documentation. The function adds nothing that the comment doesn't say. Delete it; re-derive if a genuine JS caller appears.

Effort: Tiny | Risk: Low (only if a test directly imports it — `rosterWindow.test.ts` does)

**Option C — Wire it into a JS-side post-filter**

If a caller genuinely needs JS-side filtering (e.g., an MCP tool that already has a hydrated roster array), import and use `overlapsPeriod`. This earns the export.

Effort: Small | Risk: Low

**Recommended:** Option A in the short term (unexport, document as spec). Option C when todo #249 (MCP historical standings tool) is implemented.

## Technical Details

Affected files:
- `server/src/lib/rosterWindow.ts` — export keyword removal
- `server/src/lib/__tests__/rosterWindow.test.ts` — tests import `overlapsPeriod` directly; keep tests, adjust import if unexported (move to same file or make it a named non-export with a test-only re-export workaround)

Note: The `rosterWindow.test.ts` imports `overlapsPeriod` for unit testing. If unexported, those tests need to move to the same file or use a test-only barrel re-export. Simplest: keep exported from the module but add an `@internal` JSDoc tag.

## Acceptance Criteria

- [ ] `overlapsPeriod` is either: (a) called by at least one production caller, OR (b) marked `@internal` with a comment explaining it documents the SQL WHERE clause
- [ ] A comment in `standingsService.ts` line 406 links back to the function (already present — keep it)
- [ ] No net new callers use `overlapsPeriod` for JS-side filtering of already-fetched rows

## Work Log

2026-06-04 — Surfaced by architecture-strategist via grep. Zero callers confirmed.
