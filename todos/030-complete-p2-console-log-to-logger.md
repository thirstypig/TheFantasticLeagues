---
status: complete
priority: p2
issue_id: "030"
tags: [code-review, quality, logging]
dependencies: []
---

# console.log/console.warn in Production Code Instead of Logger

## Problem Statement
Several files use `console.log` and `console.warn` instead of the structured `logger` utility. This bypasses log level filtering, formatting, and any future log aggregation.

## Findings
- **Source**: pattern-recognition-specialist, code-simplicity-reviewer
- **Location**: `server/src/features/archive/routes.ts`, `server/src/features/admin/routes.ts`, and others
- `server/src/lib/logger.ts` exists and should be used everywhere

## Proposed Solutions

### Option A: Replace all console.* with logger.*
- `console.log` → `logger.info`
- `console.warn` → `logger.warn`
- `console.error` → `logger.error`
- **Effort**: Small
- **Risk**: Low

## Acceptance Criteria
- [ ] No `console.log`/`console.warn` in server route/service files
- [ ] All replaced with appropriate logger level
- [ ] Logger import added where missing

## Work Log
| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-05 | Created from code review | Found by pattern-recognition and simplicity agents |
