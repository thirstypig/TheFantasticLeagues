---
status: complete
priority: p1
issue_id: "112"
tags: [code-review, typescript, quality]
dependencies: []
---

# Consolidate duplicated types: InlineInsight (3x), SparklinePoint (4x), INSIGHT_COLORS (2x)

## Problem Statement

Type drift risk from independent definitions:
- `InlineInsight`: dashboardService.ts, dashboardInsightEngine.ts, AdminDashboard.tsx
- `SparklinePoint`: AdminDashboard.tsx, MiniSparkline.tsx, StatTile.tsx, dashboardService.ts
- `INSIGHT_COLORS`: AdminDashboard.tsx, StatTile.tsx

## Proposed Solutions

1. Server: have insightEngine import `InlineInsight` from dashboardService (not redefine)
2. Client: create `features/admin/types.ts` with shared types, import everywhere
3. Extract `INSIGHT_COLORS` to the same shared file

- **Effort**: Small (~20 min)

## Work Log
- **2026-04-17**: Flagged by typescript, architecture, simplicity reviewers.
- **2026-04-30**: Created `client/src/features/admin/types.ts` with the canonical `SparklinePoint`, `HeroMetric`, `StatTileData`, `FunnelStage`, `FunnelData`, `ActivityEntry`, `InlineInsight`, `DashboardResponse`, plus the `INSIGHT_COLORS` Tailwind tokens. `AdminDashboard.tsx`, `StatTile.tsx`, and `MiniSparkline.tsx` now import from there (StatTile keeps a `type InsightData = InlineInsight` local alias to preserve its existing prop-name surface). Server-side, `dashboardInsightEngine.ts` re-exports `InlineInsight` from `dashboardService.ts` instead of redeclaring (server cannot import the client `types.ts` across the runtime boundary; the wire shape is mirrored manually with a comment in both files flagging the duplication).
