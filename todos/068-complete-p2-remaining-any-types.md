---
status: pending
priority: p2
issue_id: "068"
tags: [code-review, typescript]
dependencies: []
---

# Remaining `any` Types in Modified Files

## Problem Statement
Several `any` types remain in files modified by this PR, reducing type safety gains.

## Findings
- **TypeScript Reviewer**: Identified remaining instances
- `server/src/features/commissioner/routes.ts` line 402: `Number.isFinite(mlbIdNum as any)`
- `server/src/features/commissioner/routes.ts` line 194: `const created: any[] = []`
- `server/src/features/auth/routes.ts` line ~83: `users.find((u: any) => ...)`
- `server/src/index.ts` line 80: `(req as any).requestId`
- `server/src/features/auction/hooks/useAuctionState.ts`: `Record<string, any>`

## Proposed Solutions

### Option A: Replace with proper types
- Commissioner: type `created` array with `Team[]` or similar Prisma type
- Commissioner: remove `as any` cast, use proper number check
- Auth: type Supabase admin API response
- Index: extend Express Request interface for `requestId`
- **Effort**: Small | **Risk**: Low

## Technical Details
- **Affected files**: commissioner/routes.ts, auth/routes.ts, index.ts, useAuctionState.ts

## Acceptance Criteria
- [ ] No `any` types in files modified by this PR
- [ ] Express Request interface extended for requestId
