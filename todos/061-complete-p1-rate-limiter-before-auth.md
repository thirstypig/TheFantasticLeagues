---
status: pending
priority: p1
issue_id: "061"
tags: [code-review, security, performance]
dependencies: []
---

# Rate Limiter Runs Before attachUser — User-Keyed Rate Limiting Non-Functional

## Problem Statement
The `globalLimiter` rate limiter is mounted in the Express middleware stack BEFORE `attachUser`. This means `req.user` is always `undefined` when the rate limiter's `keyGenerator` runs, so all requests are keyed by IP address instead of user ID. The intended per-user rate limiting (300/min per user) is not operational.

## Findings
- **Performance Oracle, Security Sentinel, Agent-Native Reviewer, Architecture Strategist**: All independently flagged this issue
- `server/src/index.ts`: rate limiter registered ~line 93, `attachUser` registered ~line 102
- `keyGenerator: (req) => req.user?.id?.toString() || req.ip || "unknown"` always falls back to `req.ip`
- Multiple users behind the same NAT/proxy share a single 300/min bucket

## Proposed Solutions

### Option A: Move rate limiter after attachUser
- Register `app.use(globalLimiter)` AFTER `app.use(attachUser)` in index.ts
- **Effort**: Small | **Risk**: Low
- **Pros**: Per-user rate limiting works as intended
- **Cons**: Every request incurs auth overhead before rate limiting (minor perf hit)

### Option B: Accept IP-based rate limiting
- Remove `req.user?.id` from keyGenerator, use only `req.ip`
- Document that rate limiting is per-IP
- **Effort**: Small | **Risk**: Low
- **Pros**: Rate limiting still protects against abuse; no ordering concerns
- **Cons**: Multiple users behind same IP share bucket

## Technical Details
- **Affected file**: `server/src/index.ts`

## Acceptance Criteria
- [ ] Rate limiter correctly keys by user ID for authenticated requests
- [ ] OR: Rate limiter explicitly documented as IP-based with user fallback removed
