---
status: pending
priority: p1
issue_id: "047"
tags: [code-review, security]
dependencies: []
---

# Dev-Login Endpoint Has Weak Default Password and Returns Email

## Problem Statement
The `handleDevLogin` endpoint, while gated behind `ENABLE_DEV_LOGIN=true`, has two issues: (1) it falls back to `Password123` if `DEV_LOGIN_PASSWORD` is not set, and (2) it returns the admin user's email in the response body, which could aid account discovery.

## Findings
- **Security Sentinel**: Classified as Medium severity (M2)
- **Location**: `server/src/features/auth/routes.ts` lines 60-92
- The endpoint modifies the first admin user's password in Supabase, which could be dangerous if accidentally enabled in production.

## Proposed Solutions

### Option A: Remove default password, require env var (Recommended)
If `ENABLE_DEV_LOGIN=true` but `DEV_LOGIN_PASSWORD` is not set, refuse to register the route and log a warning at startup.
- **Pros**: Eliminates weak default entirely
- **Cons**: Requires explicit config for dev environments
- **Effort**: Small
- **Risk**: Low

### Option B: Remove email from response + require env var
Also stop returning the email in the JSON response. Log it server-side only.
- **Pros**: Most secure option
- **Cons**: Slightly harder for developers to discover the dev email
- **Effort**: Small
- **Risk**: Low

## Technical Details
- **Affected files**: `server/src/features/auth/routes.ts`

## Acceptance Criteria
- [ ] No fallback password — `DEV_LOGIN_PASSWORD` required when dev-login enabled
- [ ] Email not returned in response body (logged server-side only)
- [ ] Startup warning if `ENABLE_DEV_LOGIN=true` without `DEV_LOGIN_PASSWORD`
- [ ] Existing dev-login tests updated

## Work Log
| Date | Action | Notes |
|------|--------|-------|
| 2026-03-06 | Created | Found by security-sentinel agent |

## Resources
- PR #13: security/p0-fixes branch
