---
status: complete
priority: p2
issue_id: "098"
tags: [code-review, correctness, performance, reports]
dependencies: []
---

# Activity query in reportBuilder is cross-week bleed (correctness, not just perf)

## Problem Statement

`server/src/features/reports/services/reportBuilder.ts:85-99` pulls transactions via:

```typescript
prisma.transactionEvent.findMany({
  where: { leagueId },
  orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
  take: 50,
  select: { ... },
})
```

This doesn't filter by `weekKey`. It just takes the latest 50 transactions league-wide. Consequences:

- **Busy week**: if week 3 has 60+ transactions, the report silently hides some of them — a bounded page that looks complete.
- **Quiet current week + busy prior weeks**: the "Activity This Week" section on a current-week report shows 50 stale transactions from weeks 1-2, all labeled as "this week" by the section header.
- **Historical weeks (`/report/2026-W10`)**: the user clicks a past week and sees the last 50 transactions regardless of which weekKey they asked for. Completely wrong for historical reports.

The existing code comment at line 84 already flags this: "For MVP we pull recent and client-filter; future: use weekStart/weekEnd bounds." The "client-filter" part never shipped; the report currently renders all 50 without filtering.

## Findings

### Agent: performance-oracle
- Correctness bug masquerading as a performance question. An indexed `(leagueId, submittedAt)` range scan is both cheaper AND correct.
- Quote: "a busy week 3 could hide week 1's transactions entirely, or a quiet week could show stale month-old ones labeled as 'this week.'"

## Proposed Solutions

### Solution 1: Window by weekKey date range (recommended)
1. In `reportBuilder.ts`, compute `weekStart` + `weekEnd` Date objects from the `weekKey` param.
2. Pass them to the transaction query as `where: { leagueId, submittedAt: { gte: weekStart, lt: weekEnd } }`.
3. Drop the `take: 50` cap entirely (or keep as a safety rail at 500).

- **Pros**: Correct per-week filtering; historical reports render the right activity; leverages existing `@@index([leagueId, submittedAt])` from Prisma schema for cheap range scan.
- **Cons**: Need a `weekKeyToDateRange(weekKey)` helper — check if one exists in `lib/utils.ts`; if not, add it.
- **Effort**: Small (30 min including helper if needed)
- **Risk**: Low — widening from "all" to "range" can't return more data than before.

### Solution 2: Keep the cap, add weekKey filter as an AND
Same as Solution 1 but keep `take: 50` as insurance.
- **Pros**: Belt-and-suspenders for runaway weeks.
- **Cons**: 50 is arbitrary; with the range filter the cap is almost never hit.
- **Keep the cap at 500 as documentation-style safety; drop if feels unnecessary**.

### Solution 3: Do nothing
- **Pros**: Zero churn.
- **Cons**: Historical reports are broken; current reports mislead users about what happened this week.
- **REJECT**

## Recommended Action

Solution 1 (optionally with Solution 2's cap at 500 as safety rail).

## Technical Details

Helper needed: `weekKeyToDateRange(weekKey: string): { start: Date; end: Date }`. ISO week 1 = week containing Jan 4. Monday = start of week. Check `server/src/lib/utils.ts` — `getWeekKey` and `weekKeyLabel` already live there; a range helper may exist or can be added in the same file.

## Acceptance Criteria

- [ ] `weekKeyToDateRange(weekKey)` helper exists (add if missing)
- [ ] `reportBuilder.ts` activity query uses `submittedAt: { gte: start, lt: end }` filter
- [ ] Historical report (`/report/2026-W10`) returns only that week's transactions
- [ ] Current-week report returns only current-week transactions
- [ ] Comment at line 84 ("future: use weekStart/weekEnd bounds") removed/updated
- [ ] Optional: `take: 500` safety cap (or drop entirely)

## Work Log

- **2026-04-16** (Session 66 `/ce:review`): Flagged by performance-oracle as correctness bug. Code comment at line 84 already acknowledged it as "future work" — that future is now.

## Resources

- `server/src/features/reports/services/reportBuilder.ts:70-99` (query site)
- `server/src/lib/utils.ts` (home for helper if not already present)
- `prisma/schema.prisma` TransactionEvent `@@index([leagueId, submittedAt])` already exists (line 506)
