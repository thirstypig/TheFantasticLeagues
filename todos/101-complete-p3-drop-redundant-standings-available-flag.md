---
status: complete
priority: p3
issue_id: "101"
tags: [code-review, simplicity, reports, api-surface]
dependencies: []
---

# Drop redundant `standings.available` flag — inferable from `rows.length === 0`

## Problem Statement

`WeeklyReport.standings.available: boolean` in the API surface is redundant. Any consumer can infer "available" from `rows.length > 0` — the flag just duplicates what `rows` already encodes.

Current client check:
```typescript
if (!standings.available || standings.rows.length === 0) {
  return <Placeholder>No active or completed periods...</Placeholder>;
}
```

The `!standings.available` clause is belt-and-suspenders — if there are periods, rows are populated; if there aren't, rows are empty. The flag adds zero semantic value and costs a field on the API type.

## Findings

### Agent: code-simplicity-reviewer
- "`.available` flag is redundant. `standings.rows.length === 0` conveys the same info. The client check `!standings.available || rows.length === 0` is belt-and-suspenders."
- Estimated savings: ~3 lines server, ~1 line client, removes 1 field from API type.

## Proposed Solutions

### Solution 1: Drop the flag (recommended)
1. Remove `available: boolean` from `WeeklyReport.standings` interface in both `reportBuilder.ts` and `client/src/features/reports/api.ts`.
2. Remove the `available: periods.length > 0` computation in `reportBuilder.ts`.
3. Simplify client check to `if (standings.rows.length === 0) return <Placeholder>...`

- **Pros**: One less field in the API contract; less to explain.
- **Cons**: None meaningful.
- **Effort**: Trivial (5 min)
- **Risk**: None.

### Solution 2: Keep the flag
- **REJECT** — provides no information the array length doesn't.

## Recommended Action

Solution 1.

## Acceptance Criteria

- [ ] `WeeklyReport.standings.available` removed from both server + client types
- [ ] Client check simplified to rows-length only
- [ ] Existing tests still pass

## Work Log

- **2026-04-16** (Session 66 `/ce:review`): Flagged by code-simplicity-reviewer as minor redundancy.

## Resources

- `server/src/features/reports/services/reportBuilder.ts` (standings block return)
- `client/src/features/reports/api.ts` (type declaration)
- `client/src/features/reports/pages/ReportPage.tsx` (StandingsBlock client check)
