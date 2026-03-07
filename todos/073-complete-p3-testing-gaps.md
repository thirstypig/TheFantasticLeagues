---
status: pending
priority: p3
issue_id: "073"
tags: [code-review, testing]
dependencies: []
---

# Testing Gaps — handleLogout, verifyTeamOwnerByCode, Standings Cache

## Problem Statement
Several new functions introduced in this PR have no test coverage.

## Findings
- **TypeScript Reviewer**: Identified testing gaps
- `handleLogout` in auth routes: no tests for cache eviction behavior
- `verifyTeamOwnerByCode` in roster routes: no tests for the inline ownership check
- Standings cache (`getCachedStandings`): no tests for cache hit/miss behavior
- `DataService` CSV parsing with `as unknown as` double-cast: no tests for edge cases

## Proposed Solutions

### Option A: Add focused tests
- Add 2-3 tests for handleLogout (with/without token, cache eviction)
- Add 2-3 tests for verifyTeamOwnerByCode (owner, non-owner, admin bypass)
- Add 2-3 tests for standings cache (hit, miss, different keys)
- **Effort**: Medium | **Risk**: Low

## Technical Details
- **Affected files**: auth/__tests__/routes.test.ts, roster/__tests__/routes.test.ts (new), standings/__tests__/standingsService.test.ts

## Acceptance Criteria
- [ ] handleLogout tested
- [ ] verifyTeamOwnerByCode tested
- [ ] Standings cache tested
