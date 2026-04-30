---
status: complete
priority: p3
issue_id: "086"
tags: [code-review, performance, database]
dependencies: []
---

# AiInsight missing @@index([type, leagueId, weekKey])

## Problem Statement
Three queries filter AiInsight by `(type, leagueId, weekKey)` but the unique constraint is 4-column `(type, leagueId, teamId, weekKey)`. PostgreSQL can use the first 2 columns but must scan for weekKey.

## Proposed Solutions
Add `@@index([type, leagueId, weekKey])` to AiInsight model in next migration.
- **Effort**: Small
- **Impact**: Negligible at current scale (queries run once per league per week)

## Technical Details
- **Affected files**: `prisma/schema.prisma`

## Work Log
| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-24 | Created from performance review | Low priority — tiny table |
| 2026-04-30 | Added `@@index([type, leagueId, weekKey])` to `AiInsight` in `prisma/schema.prisma` and shipped migration `20260430000000_aiinsight_3col_index/migration.sql` (CREATE INDEX only — no drops, fully additive). Railway runs `prisma migrate deploy` on boot per memory note, so the index lands automatically on next deploy. | Manually wrote migration SQL because shared Supabase note in MEMORY.md warns that `prisma migrate dev` would write to prod from local. Pattern matches existing migration files. |
