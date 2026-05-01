---
status: pending
priority: p3
issue_id: "149"
tags: [code-review, simplicity, performance, admin]
dependencies: []
---

# Simplify `dashboardInsightEngine` rule registry; minor `dashboardService` perf cleanup

## Problem Statement

Two small touches on the admin dashboard module:

1. **`dashboardInsightEngine.ts` rule registry is over-architected** for 7 hardcoded rules with one consumer, no priority sorting, no runtime composition. The `InsightRule` type and `rules: InsightRule[]` array add ceremony for what could be a flat dispatch in `computeInsights`. Marked P3 with a "don't refactor today; collapse if a 2nd consumer doesn't materialize within a season" trigger.
2. **`dashboardService.weeklySparkline` allocates a fresh `countByModel` table per iteration** (`server/src/features/admin/services/dashboardService.ts:419-442`) — 180 closure objects per series × 7 series = 1,260 allocations per cold render. Negligible (sub-ms) but pure overhead; hoist to module scope.
3. **Retention `groupBy` ships unbounded user rows for length-only count** (`:189-198`). Switch to raw `COUNT(DISTINCT "userId")` — single integer.

Note: the larger `weeklySparkline` 91-query rewrite is captured in todo #120.

## Findings

- `server/src/features/admin/services/dashboardInsightEngine.ts` (192 LOC, 7 closure rules)
- `server/src/features/admin/services/dashboardService.ts:419-442` — per-iteration table
- `server/src/features/admin/services/dashboardService.ts:189-198` — `groupBy` for `.length`

## Proposed Solutions

### Option 1: Skip engine collapse; do the perf nits (recommended)

- Hoist `countByModel` to module scope, parameterize on `where`
- Replace retention `groupBy` with raw `COUNT(DISTINCT)` query
- Leave engine as-is until usage justifies the refactor

**Effort:** Small (~1h). **Risk:** Low.

### Option 2: Combined engine collapse + perf nits

Cleaner but larger blast radius.

**Effort:** Medium. **Risk:** Low.

## Recommended Action

Option 1.

## Technical Details

- `server/src/features/admin/services/dashboardService.ts:189-198, 419-442`

## Acceptance Criteria

- [ ] Allocation pressure on cold dashboard render measurably reduced (Node.js heap snapshot or perf profile)
- [ ] Retention count query returns a single integer
- [ ] No behavior change

## Resources

- Performance + simplicity review under /ce:review 2026-04-30
- Todo #120 (the bigger sparkline rewrite)

## Work Log

### 2026-04-30 — Initial Discovery
- performance-oracle + code-simplicity-reviewer both flagged.
