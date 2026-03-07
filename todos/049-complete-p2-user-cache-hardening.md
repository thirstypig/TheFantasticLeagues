---
status: pending
priority: p2
issue_id: "049"
tags: [code-review, security, performance]
dependencies: []
---

# User Auth Cache: Hash Token Key, Add Size Bound, Wire Logout Eviction

## Problem Statement
The `attachUser` middleware caches user data keyed by raw JWT tokens. Three issues: (1) raw tokens in memory are a security risk if process memory is dumped, (2) no max cache size bound, (3) `evictUserCache()` exists but is never called on logout.

## Findings
- **Security Sentinel**: M1 — cache poisoning / memory growth risk
- **TypeScript Reviewer**: C2 — token in memory
- **Performance Oracle**: cache eviction on logout not wired
- **Architecture Strategist**: no horizontal scaling, role changes delayed 5 min
- **Location**: `server/src/middleware/auth.ts` lines 7-27

## Proposed Solutions

### Option A: Hash key + size cap + eviction wiring (Recommended)
1. Key cache by `crypto.createHash('sha256').update(token).digest('hex')`
2. Add MAX_CACHE_SIZE (e.g., 1000 entries), evict oldest on overflow
3. Call `evictUserCache()` from logout flow
- **Effort**: Small | **Risk**: Low

## Acceptance Criteria
- [ ] Cache keyed by token hash, not raw token
- [ ] Cache size bounded (e.g., 1000 entries max)
- [ ] Logout flow calls `evictUserCache()`
- [ ] Role changes propagate within TTL window (documented)

## Work Log
| Date | Action | Notes |
|------|--------|-------|
| 2026-03-06 | Created | Found by 4 review agents |
