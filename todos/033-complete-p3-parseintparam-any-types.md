---
status: complete
priority: p3
issue_id: "033"
tags: [code-review, typescript, quality]
dependencies: []
---

# parseIntParam and handleGetMe Use `any` Types

## Problem Statement
`parseIntParam` in `server/src/lib/utils.ts` accepts `any` parameter. `handleGetMe` in auth routes uses `(req as any).user`. Both should use proper types.

## Findings
- **Source**: kieran-typescript-reviewer
- **Location**:
  - `server/src/lib/utils.ts` — `parseIntParam(v: any)` → should be `unknown`
  - `server/src/features/auth/routes.ts` — `(req as any).user` → should use typed request

## Proposed Solutions

### Option A: Fix types
- `parseIntParam(v: unknown)` — minimal change, callers unaffected
- Define `AuthenticatedRequest` interface extending Express.Request with `user` property
- **Effort**: Small
- **Risk**: Low

## Acceptance Criteria
- [ ] `parseIntParam` accepts `unknown` instead of `any`
- [ ] `handleGetMe` uses typed request instead of `(req as any)`
- [ ] All tests pass, tsc clean

## Work Log
| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-05 | Created from code review | Found by kieran-typescript-reviewer |
