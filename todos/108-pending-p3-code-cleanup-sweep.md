---
status: pending
priority: p3
issue_id: "108"
tags: [code-review, cleanup, quality]
dependencies: []
---

# Code cleanup sweep: unused code, redundant exports, stubs

## Problem Statement

Multiple small cleanup items identified across the review that don't warrant individual todos:

1. **`activity[].raw` field unused** — `reportBuilder.ts:125` sends `transactionRaw`, `api.ts:28` declares `raw: string | null`, but `ReportPage.tsx` never reads it. Dead data over the wire.

2. **`getCategoriesForSport()` unused export** — `standingsService.ts:112-120` exports a function with zero callers. Premature multi-sport abstraction.

3. **`publicRouter` redundant default export** — `public.ts:90` has both `export const publicRouter` and `export default publicRouter`. Convention is named exports only.

4. **ReportPage stub sections** — Lines 83-86 ("Category Movers") and 119-122 ("Looking Ahead") render placeholder text. Stubs in shipped UI confuse users. Remove until features are built.

5. **`PITCHER_CODES.includes()` `as any` casts** — `standingsService.ts:469,568` — two identical casts. Fix with `.some(code => code === pos)`.

6. **FanGraphs audit duplicates standings logic** — `scripts/fangraphs-audit.ts:88-133` reimplements ~45 lines of roster-ownership + daily-stats accumulation that already exists in `computeTeamStatsFromDb`. Could delegate to the existing helper.

## Findings

### Agent: code-simplicity-reviewer
- Items 1-4 identified as unnecessary complexity or dead code.

### Agent: kieran-typescript-reviewer
- Items 5 identified as `as any` casts with simple fix.
- Item 6: `escapeRegex` utility in playerNameMatcher could live in shared `lib/utils.ts`.

### Agent: architecture-strategist
- Item 3: Convention violation (dual exports).

## Proposed Solutions

### Solution: Batch cleanup
Address all items in a single commit:
1. Remove `raw` from reportBuilder select + api.ts type
2. Remove or unexport `getCategoriesForSport`
3. Remove `export default publicRouter`
4. Remove two stub `<Section>` blocks from ReportPage
5. Replace `PITCHER_CODES.includes(... as any)` with `.some()`
6. Refactor fangraphs-audit to use `computeTeamStatsFromDb` (optional, lower priority)

- **Effort**: Small (~30 min for items 1-5, +30 min for item 6)
- **Risk**: Low — all items are removals or simplifications

## Acceptance Criteria

- [ ] No `raw` field in report API response or client type
- [ ] `getCategoriesForSport` removed or unexported
- [ ] `publicRouter` has only named export
- [ ] No stub/placeholder sections in ReportPage
- [ ] No `as any` on `PITCHER_CODES.includes()`
- [ ] All tests pass

## Work Log

- **2026-04-16** (Session 67 `/ce:review`): Aggregated from code-simplicity-reviewer, kieran-typescript-reviewer, architecture-strategist.

## Resources

- `server/src/features/reports/services/reportBuilder.ts:125`
- `server/src/features/standings/services/standingsService.ts:112-120,469,568`
- `server/src/routes/public.ts:90`
- `client/src/features/reports/pages/ReportPage.tsx:83-86,119-122`
- `server/src/scripts/fangraphs-audit.ts:88-133`
