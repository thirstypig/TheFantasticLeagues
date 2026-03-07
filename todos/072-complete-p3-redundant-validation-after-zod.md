---
status: pending
priority: p3
issue_id: "072"
tags: [code-review, simplicity]
dependencies: []
---

# Redundant Manual Validation After Zod in Auction Nominate

## Problem Statement
The auction `/nominate` handler has `if (!nominatorTeamId || !playerId)` check after `validateBody(nominateSchema)` has already validated these fields as required. The Zod schema requires `nominatorTeamId` (positive int) and `playerId` (min 1 string).

## Findings
- **Code Simplicity Reviewer, Pattern Recognition**: Both flagged this redundancy
- `server/src/features/auction/routes.ts` line 225: manual check is unreachable after Zod validation

## Proposed Solutions

### Option A: Remove the redundant check
- Delete line 225: `if (!nominatorTeamId || !playerId) return res.status(400).json({ error: "Missing fields" });`
- **Effort**: Small | **Risk**: Low

## Technical Details
- **Affected file**: server/src/features/auction/routes.ts

## Acceptance Criteria
- [ ] Redundant validation removed
- [ ] Zod schema still validates all required fields
