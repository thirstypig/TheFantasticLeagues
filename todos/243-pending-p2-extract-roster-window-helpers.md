---
status: pending
priority: p2
issue_id: "243"
tags: [code-review, pr-365, standings, refactor, prevention]
dependencies: []
---

# Extract `rosterWindow.ts` shared helpers for roster-vs-period predicates

## Problem Statement

Per architecture review on PR #365, three sites in `standingsService.ts` do
roster-vs-period window math with subtly different predicates:

- **Prisma query** (`standingsService.ts:407-424`) — `acquiredAt: { lte: period.endDate } + OR: [{ releasedAt: null }, { releasedAt: { gte: period.startDate } }]`
- **`computeWithDailyStats`** (`~518`) — `from = max(acquiredAt, periodStart)`, `to = min(releasedAt, periodEnd)` — clamped window
- **`computeWithPeriodStats` end-of-period owner** (`~611`) — `acquiredAt <= endDate AND (releasedAt IS NULL OR releasedAt > endDate)` — endpoint check

Three predicates, three semantics, no shared vocabulary. The next regression
will introduce a fourth variant. The compound doc Prevention section already
recommends `roster.windowOverlaps(period)` / `ownedOn(date)` — but no
implementation exists.

## Proposed Solutions

### Option 1 (recommended): `lib/rosterWindow.ts` parallel to `lib/ilWindows.ts`

```ts
export function overlapsPeriod(roster: RosterRow, period: PeriodWindow): boolean;
export function ownedOn(roster: RosterRow, date: Date): boolean;
export function clampToPeriod(roster: RosterRow, period: PeriodWindow): { from: Date; to: Date };
```

Use these everywhere; document at the Prisma-query call site how the
SQL `where` clause corresponds to `overlapsPeriod`.

## Acceptance Criteria

- [ ] `server/src/lib/rosterWindow.ts` exists with the 3 functions
- [ ] `computeWithPeriodStats` and `computeWithDailyStats` use them
- [ ] Compound doc updated with link to the lib
- [ ] Unit tests for each helper

## Resources

- Compound doc: `docs/solutions/logic-errors/closed-period-stat-attribution-uses-current-owner.md`
- Companion module: `server/src/lib/ilWindows.ts`
- PR #365 architecture review finding F2
