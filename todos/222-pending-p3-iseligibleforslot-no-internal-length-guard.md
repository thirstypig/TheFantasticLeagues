---
status: pending
priority: p3
issue_id: "222"
tags: [code-review, security, server, position-eligibility, defense-in-depth]
dependencies: []
---

# `isEligibleForSlot` trusts caller to length-validate `targetSlot` — no internal guard

## Problem Statement

`isEligibleForSlot(posList, targetSlot)` calls `targetSlot.trim().toUpperCase()` without checking the input length. The callers in `teams/routes.ts` and `commissioner/routes.ts` both have Zod validation clamping `assignedPosition` to `.max(5)` before calling this function, so there's no current vulnerability.

But the function is a pure business-logic utility — it should be safe to call with any string without relying on caller discipline for correctness.

## Proposed Solution

Add a length guard at the top of `isEligibleForSlot`:
```typescript
function isEligibleForSlot(posList: string | null, targetSlot: string): boolean {
  if (!targetSlot || targetSlot.length > 5) return false;
  // ... existing logic
}
```

- **Effort:** 2 lines
- **Risk:** None — `targetSlot.length > 5` is never true when callers validate via Zod; no behavior change in production

## Acceptance Criteria
- [ ] `isEligibleForSlot` returns `false` for empty or >5-char `targetSlot`
- [ ] Existing unit tests still pass
- [ ] No behavior change in any current call path

## Work Log
- 2026-05-18: Identified by Security Sentinel. Defense-in-depth improvement; not a current vulnerability.
