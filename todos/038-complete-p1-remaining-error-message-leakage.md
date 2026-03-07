---
status: complete
priority: p1
issue_id: "038"
tags: [code-review, security]
dependencies: []
---

# Remaining Error Message Leakage in 7 Endpoints

## Problem Statement
While todo 015 standardized most 500 error responses, 7 endpoints still return descriptive error strings or internal data in 500 responses. The most critical is archive import returning `logs: result.messages` which can leak internal processing details.

## Findings
- **Source**: architecture-strategist
- **Locations**:
  1. `server/src/features/commissioner/routes.ts:511` — `"Import failed"`
  2. `server/src/features/roster/rosterImport-routes.ts:92` — `"Failed to import roster CSV"`
  3. `server/src/features/archive/routes.ts:177` — `"Failed to update team"`
  4. `server/src/features/archive/routes.ts:541` — `"Internal server error"` (lowercase inconsistency)
  5. `server/src/features/archive/routes.ts:691` — `"Internal server error"` (lowercase)
  6. `server/src/features/archive/routes.ts:856` — `"Import failed"` + `logs: result.messages` (leaks internal messages)
  7. `server/src/features/periods/routes.ts:26` — `"Failed to fetch periods"`
- **Also**: `server/src/features/auth/routes.ts:57` — `"Auth check failed"` (P2-5 from architecture review)

## Proposed Solutions

### Option A: Standardize all to "Internal Server Error"
- Replace all 8 instances with `{ error: "Internal Server Error" }`
- Remove `logs: result.messages` from archive import response
- Log original errors server-side via `logger.error`
- **Effort**: Small
- **Risk**: Low

## Acceptance Criteria
- [ ] All 500 responses return exactly `{ error: "Internal Server Error" }`
- [ ] No internal data leaked in error responses
- [ ] Original errors logged server-side
