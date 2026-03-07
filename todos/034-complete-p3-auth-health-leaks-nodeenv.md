---
status: complete
priority: p3
issue_id: "034"
tags: [code-review, security, info-disclosure]
dependencies: []
---

# handleAuthHealth Leaks NODE_ENV

## Problem Statement
The `handleAuthHealth` endpoint returns `NODE_ENV` in its response, disclosing the server's runtime environment to any caller.

## Findings
- **Source**: security-sentinel
- **Location**: `server/src/features/auth/routes.ts` — `handleAuthHealth`

## Proposed Solutions

### Option A: Remove NODE_ENV from response
- Only return status ok/degraded, don't include environment info
- **Effort**: Small
- **Risk**: Low

## Acceptance Criteria
- [ ] Health endpoint does not expose NODE_ENV
- [ ] Health check still reports ok/degraded status

## Work Log
| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-05 | Created from code review | Found by security-sentinel |
