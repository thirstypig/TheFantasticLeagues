---
status: pending
priority: p1
issue_id: "110"
tags: [code-review, performance, admin]
dependencies: []
---

# Dashboard sparklines fire 91 sequential DB queries — use GROUP BY

## Problem Statement

`dashboardService.ts:200-209` calls `weeklySparkline()` 7 times sequentially, each firing N queries (one per week). For 90d: 7 × 13 = 91 sequential round-trips. At 5-15ms each = 580ms-1.7s just for sparklines.

## Proposed Solutions

### Solution 1: Raw SQL GROUP BY (recommended)
Replace per-week COUNT queries with single `GROUP BY date_trunc('week', "createdAt")` per model. Reduces 91 queries to 7. Also eliminates the `(prisma as any)` cast.

### Solution 2: Promise.all the 7 sparkline calls
Minimal change — wrap lines 200-209 in `Promise.all`. Reduces wall-clock to ~13 sequential queries (1 model's worth) instead of 91. Doesn't fix the N+1 per model but cuts latency 6x.

- **Effort**: Small (Solution 2) or Medium (Solution 1)

## Acceptance Criteria
- [ ] Dashboard cold-load under 800ms
- [ ] No `(prisma as any)` cast
- [ ] Sparkline data identical to current output

## Work Log
- **2026-04-17**: Flagged unanimously by performance-oracle, architecture, simplicity, typescript reviewers.
