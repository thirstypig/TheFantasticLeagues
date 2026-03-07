---
status: pending
priority: p3
issue_id: "071"
tags: [code-review, simplicity]
dependencies: []
---

# Simplify User Cache — Remove Background Sweep

## Problem Statement
The user cache in auth.ts has ~30 lines of infrastructure (interval timer, start/stop exports, `unref()`) for a background sweep that provides minimal value. The cache is already bounded at 1000 entries with a 5-minute TTL check on read. Expired entries consume negligible memory.

## Findings
- **Code Simplicity Reviewer**: Identified as the most impactful simplification opportunity
- Background sweep runs every 60s to prune expired entries, but entries are already rejected on read if expired
- `startCacheSweep`/`stopCacheSweep` exports exist primarily for testing
- YAGNI: 8-10 users in a fantasy league don't need a 1000-entry bounded cache with background pruning

## Proposed Solutions

### Option A: Remove interval-based pruning
- Keep Map with TTL check on read, keep `MAX_CACHE_SIZE` with eviction on write
- Remove `startCacheSweep`, `stopCacheSweep`, `_cacheTimer`, and the `setInterval` logic
- Keep `clearUserCache` for testing
- **Effort**: Small | **Risk**: Low
- **Saves**: ~18 lines

## Technical Details
- **Affected file**: server/src/middleware/auth.ts

## Acceptance Criteria
- [ ] Background sweep removed
- [ ] Cache still works (TTL check on read, size cap on write)
- [ ] Tests still pass
