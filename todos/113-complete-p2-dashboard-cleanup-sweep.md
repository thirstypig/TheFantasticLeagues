---
status: complete
priority: p2
issue_id: "113"
tags: [code-review, cleanup, quality]
dependencies: []
---

# Dashboard cleanup: SVG ID collision, dead code, z() dedup, DOM prop leak

## Problem Statement

Multiple small issues from Session 67 review:

1. **SVG gradient ID collision**: `MiniSparkline.tsx` uses hardcoded `id="sparkFill"` across 7 instances. Use `React.useId()`.
2. **Dead code**: `setSortDesc` no-op in Players.tsx, unused `CardGridSkeleton` + default `Skeleton` export.
3. **Duplicate `z()` helper**: identical lambda defined twice in digestService.ts MVP/Cy Young sections.
4. **DOM prop leak**: `StatTileData.value` spread into `<Link>` via `{...tile}`. Destructure to exclude.
5. **Duplicate `prisma.user.count()`**: `totalUsers` and `totalSignups` are identical queries in same $transaction.
6. **Standings stampede prevention**: cache lacks coalescing (dashboard has it, standings doesn't).

## Proposed Solutions

Batch all 6 fixes in one commit. Each is 1-5 lines.

- **Effort**: Small (~30 min total)

## Work Log
- **2026-04-17**: Aggregated from typescript, performance, simplicity, architecture reviewers.
- **2026-04-30**: All six items shipped on the dashboard-perf-and-types branch.
  1. `MiniSparkline.tsx` now generates a per-instance gradient id via `React.useId()` (prefix `sparkFill-`) so collisions can no longer cause every sparkline on the dashboard to reference the first one's gradient.
  2. Dead code: removed the `setSortDesc = (_v) => {}` no-op from `PlayersLegacy.tsx` (URL params are the single source of truth — no setter needed); deleted unused `CardGridSkeleton` + default `Skeleton` export from `client/src/components/ui/Skeleton.tsx` (only `PageSkeleton` had consumers).
  3. `digestService.ts`: extracted the duplicated lambda into a module-scope `zScore(vals)` helper used by both the MVP and Cy Young composite sections.
  4. DOM prop leak: `AdminDashboard.tsx` now destructures `value` out of each tile before spreading into `<StatTile>` so the numeric value stays out of downstream prop surfaces (StatTile already destructures the rest cleanly into typed props).
  5. Duplicate `prisma.user.count()` removed: `totalSignups` was an identical query to `totalUsers` inside the same `$transaction` — collapsed to one count and `const totalSignups = totalUsers` after the batch resolves.
  6. Standings stampede prevention: `getSeasonStandings` cache entry now carries an optional `pending` Promise field; concurrent callers share the in-flight `getSeasonStandingsUncached()` instead of firing parallel duplicates (mirrors the dashboard service pattern).
