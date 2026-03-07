---
status: complete
priority: p3
issue_id: "035"
tags: [code-review, security]
dependencies: []
---

# Dev-Login Uses Hardcoded Password

## Problem Statement
The dev-login endpoint uses a hardcoded password (`Password123`). While gated behind `ENABLE_DEV_LOGIN`, the hardcoded credential is a code smell and could be a risk if the env var is accidentally set in production.

## Findings
- **Source**: security-sentinel
- **Location**: `server/src/features/auth/routes.ts` — `handleDevLogin`

## Proposed Solutions

### Option A: Use env var for dev password
- Read from `DEV_LOGIN_PASSWORD` env var instead of hardcoding
- **Effort**: Small
- **Risk**: Low

### Option B: Remove password entirely, use email-only in dev
- Dev login only requires a valid admin email, no password
- **Effort**: Small
- **Risk**: Low (already behind ENABLE_DEV_LOGIN gate)

## Acceptance Criteria
- [ ] No hardcoded passwords in source code
- [ ] Dev login still works when enabled

## Work Log
| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-05 | Created from code review | Found by security-sentinel |
