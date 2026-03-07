---
status: pending
priority: p2
issue_id: "051"
tags: [code-review, security]
dependencies: []
---

# Missing Zod validateBody on Several Write Endpoints

## Problem Statement
Several POST/PUT/PATCH endpoints validate input manually instead of using `validateBody()` with Zod schemas: `POST /leagues/:id/my-roster/keepers`, `PUT /archive/:year/teams/:teamCode`, `PATCH /archive/stat/:id`.

## Findings
- **Pattern Recognition**: Medium severity — inconsistent with other write endpoints that use Zod
- **Location**: `server/src/features/leagues/routes.ts` line 178, `server/src/features/archive/routes.ts` lines 142, 234

## Proposed Solutions
### Option A: Add Zod schemas to all three endpoints (Recommended)
- **Effort**: Small | **Risk**: Low

## Acceptance Criteria
- [ ] `keepersSchema` added with `z.object({ keeperIds: z.array(z.number().int().positive()) })`
- [ ] `archiveTeamUpdateSchema` added
- [ ] `archiveStatUpdateSchema` added
- [ ] All three endpoints use `validateBody()`

## Work Log
| Date | Action | Notes |
|------|--------|-------|
| 2026-03-06 | Created | Found by pattern-recognition-specialist |
