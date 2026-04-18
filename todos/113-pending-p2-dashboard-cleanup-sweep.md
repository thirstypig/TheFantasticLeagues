---
status: pending
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
