---
status: pending
priority: p3
issue_id: "060"
tags: [code-review, quality]
dependencies: []
---

# setInterval for Cache Pruning Starts at Module Import (Affects Tests)

## Problem Statement
The 60-second `setInterval` for cache pruning in `middleware/auth.ts` starts as a side effect of importing the module. Test files that import auth middleware silently spin up this timer.

## Findings
- **TypeScript Reviewer**: C3 — side effect on import
- **Location**: `server/src/middleware/auth.ts` lines 23-27

## Proposed Solutions
### Option A: Lazy initialization on first cache write
Start the interval only when the first entry is written to the cache.
- **Effort**: Small | **Risk**: Low

## Acceptance Criteria
- [ ] Timer does not start until cache is first used
- [ ] Tests importing auth middleware do not create timers

## Work Log
| Date | Action | Notes |
|------|--------|-------|
| 2026-03-06 | Created | Found by kieran-typescript-reviewer |
