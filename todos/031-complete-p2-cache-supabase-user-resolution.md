---
status: complete
priority: p2
issue_id: "031"
tags: [code-review, performance]
dependencies: []
---

# Cache Supabase User Resolution in attachUser Middleware

## Problem Statement
`attachUser` middleware calls `supabaseAdmin.auth.getUser()` on every authenticated request. This adds latency to every API call and increases Supabase API usage.

## Findings
- **Source**: performance-oracle
- **Location**: `server/src/middleware/auth.ts` — `attachUser` function
- JWT tokens are valid for a known duration; the user lookup could be cached

## Proposed Solutions

### Option A: In-memory LRU cache with TTL
- Cache Supabase user by token hash for 5 minutes
- **Pros**: Simple, no new dependencies
- **Effort**: Small
- **Risk**: Low (cache miss just falls through to Supabase)

### Option B: Verify JWT locally, only call Supabase on first seen token
- Use Supabase JWT secret to verify locally
- **Pros**: No network call for cached users
- **Effort**: Medium
- **Risk**: Medium (need to handle key rotation)

## Acceptance Criteria
- [ ] Repeated requests with same token don't hit Supabase API
- [ ] Cache expires after reasonable TTL
- [ ] Cache invalidated on logout

## Work Log
| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-05 | Created from code review | Found by performance-oracle |
