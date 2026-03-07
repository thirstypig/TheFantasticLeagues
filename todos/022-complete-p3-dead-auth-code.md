---
status: complete
priority: p3
issue_id: "022"
tags: [code-review, quality]
dependencies: []
---

# Remove Dead Auth Code

## Problem Statement
`server/src/middleware/auth.ts` contains dead code from the pre-Supabase JWT-based auth system.

## Findings
- `COOKIE_NAME` (line 6) — never read from `req.cookies`
- `getJwtSecret()` (lines 30-33) — never called
- `SessionTokenPayload` type (lines 8-10) — unused
- `cookieParser()` loaded in `index.ts:70` but unused by auth system

## Proposed Solutions
Delete the dead code. Remove `cookieParser` if no other middleware uses it.

**Effort**: Trivial (10 min)

## Work Log
- 2026-03-06: Created from code review synthesis
