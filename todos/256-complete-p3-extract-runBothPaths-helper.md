---
status: pending
priority: p3
issue_id: 256
tags: [code-review, test-coverage, standings, simplification]
dependencies: []
---

## Problem Statement

`standingsService.differential.test.ts` repeats the same 14-line PSD→PSP mock-setup sequence in every test case (4 cases × 14 lines = 56 lines of identical boilerplate). Each pair differs in exactly two mock calls (`mockPeriodStatsCount` value and whether `mockDailyFindMany` or `mockPeriodStatsFindMany` is the active path). Extracting a `runBothPaths` helper would centralize the path-guard assertions and reduce the file by ~18%.

## Findings

From code-simplicity-reviewer:
- 4 test cases each run PSD then PSP, with identical mock setup scaffold
- Differing lines per case: `mockPeriodStatsCount.mockResolvedValueOnce(0|1)` + the relevant data mock
- Path-guard assertions (`expect(mockDailyFindMany).toHaveBeenCalledTimes(1)`, `expect(mockPeriodStatsFindMany).not.toHaveBeenCalled()`) copy-pasted 4 times — if one drifts, the guard becomes a false positive

## Proposed Solutions

**Option A — Extract `runBothPaths` helper (Recommended)**

```typescript
async function runBothPaths(
  rosters: unknown[],
  dailies: unknown[],
  psp: unknown[],
) {
  mockRosterFindMany.mockResolvedValueOnce(rosters);
  mockPeriodStatsCount.mockResolvedValueOnce(0);
  mockDailyFindMany.mockResolvedValueOnce(dailies);
  const psdResult = await computeTeamStatsFromDb(20, 36);
  expect(mockDailyFindMany).toHaveBeenCalledTimes(1);
  expect(mockPeriodStatsFindMany).not.toHaveBeenCalled();

  mockRosterFindMany.mockResolvedValueOnce(rosters);
  mockPeriodStatsCount.mockResolvedValueOnce(1);
  mockPeriodStatsFindMany.mockResolvedValueOnce(psp);
  const pspResult = await computeTeamStatsFromDb(20, 36);
  expect(mockPeriodStatsFindMany).toHaveBeenCalledTimes(1);
  expect(mockDailyFindMany).toHaveBeenCalledTimes(1);

  return { psdResult, pspResult };
}
```

Each test becomes `const { psdResult, pspResult } = await runBothPaths(rosters, dailies, psp);`.

Effort: Small | Risk: None | Savings: ~56 lines

## Technical Details

Affected files:
- `server/src/features/standings/__tests__/standingsService.differential.test.ts`

## Acceptance Criteria

- [ ] `runBothPaths` helper extracted above the first `describe` block
- [ ] All 4 test cases use it
- [ ] Path-guard assertions (call-count checks) live only in the helper — not duplicated per test
- [ ] All tests still pass

## Work Log

2026-06-04 — Surfaced by code-simplicity-reviewer. Estimated 56 LOC reduction.
