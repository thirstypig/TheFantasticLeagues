---
status: pending
priority: p3
issue_id: "055"
tags: [code-review, performance]
dependencies: []
---

# Rate Limiter Too Aggressive for Auction Polling

## Problem Statement
Global rate limit of 100 req/min may be too low. During live auctions, a single user polling state every 2-3 seconds generates ~20-30 req/min. Multiple tabs or power users could easily hit the limit.

## Findings
- **Performance Oracle**: Recommended raising to 200+ or per-user keying
- **Agent-Native Reviewer**: Critical for automated workflows
- **Location**: `server/src/index.ts` lines 83-98

## Proposed Solutions
### Option A: Raise global to 300/min, key by user ID
```typescript
const globalLimiter = rateLimit({
  windowMs: 60_000,
  max: 300,
  keyGenerator: (req) => (req as any).user?.id?.toString() || req.ip,
});
```
- **Effort**: Small | **Risk**: Low

## Acceptance Criteria
- [ ] Global limit raised or per-user keyed
- [ ] Auction polling at 2-3s interval works for 8 concurrent users

## Work Log
| Date | Action | Notes |
|------|--------|-------|
| 2026-03-06 | Created | Found by performance-oracle, agent-native-reviewer |
