---
status: completed
priority: p2
issue_id: "008"
tags: [code-review, quality]
dependencies: []
---

# Test Files Test Copied Logic Instead of Real Source Code

## Problem Statement
`auction/routes.test.ts` (373 LOC) and `auth/routes.test.ts` (183 LOC) re-implement route handler logic inline instead of importing and testing actual source code. Tests pass even if real code has bugs.

## Findings
- **Code Simplicity**: `calculateMaxBid` is redefined in tests, not imported from routes
- **Code Simplicity**: Auth handler tests manually simulate handler logic
- **Pattern Recognition**: Same problem in trades and waivers handler-logic tests
- Schema validation tests (Zod) and middleware tests ARE valuable

## Proposed Solutions

### Option A: Rewrite to test actual code
- Export functions from route files and import in tests
- Or use `supertest` for HTTP-level integration tests
- Keep Zod schema tests as-is (they test real schemas)
- **Effort**: Medium | **Risk**: Low

## Acceptance Criteria
- [ ] Tests import and call actual source functions
- [ ] No re-implemented copies of source logic in test files
