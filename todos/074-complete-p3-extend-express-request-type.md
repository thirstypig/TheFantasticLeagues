---
status: pending
priority: p3
issue_id: "074"
tags: [code-review, typescript]
dependencies: []
---

# Extend Express Request Type for requestId

## Problem Statement
`(req as any).requestId` is used in `server/src/index.ts` to attach a validated request ID. This cast is type-unsafe and could be avoided by extending the Express Request interface.

## Findings
- **TypeScript Reviewer**: Flagged as a remaining `any` cast
- The `req.user` extension already exists in `auth.ts` via `declare global` — same pattern should be used for `requestId`

## Proposed Solutions

### Option A: Extend Express Request interface
- Add `requestId?: string` to the Express Request interface declaration in auth.ts or a shared types file
- Remove `(req as any).requestId` cast
- **Effort**: Small | **Risk**: Low

## Technical Details
- **Affected files**: server/src/index.ts, server/src/middleware/auth.ts (or server/src/types/)

## Acceptance Criteria
- [ ] `requestId` property typed on Express Request
- [ ] No `as any` cast needed
