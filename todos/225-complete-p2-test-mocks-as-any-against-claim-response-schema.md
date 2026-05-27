---
status: pending
priority: p2
issue_id: 225
tags: [code-review, testing, type-safety]
---

# Test Mocks Use `as any` Against ClaimResponse Schema

## Problem Statement

Several mocks in `AddDropPanel.test.tsx` use `as any` casts against `fetchJsonApi` return values:

```typescript
mockFetch.mockResolvedValueOnce({ ok: true, message: "Roster rules satisfied." } as any);
```

The `ClaimResponse` schema is importable from `@shared/api/rosterMoves`. Using `as any` bypasses TypeScript's check that the mock matches the production schema — exactly the pattern that caused the React key collision bug (todo #116, session 75). If the server adds or renames a field on `ClaimResponse`, the tests will continue to pass while prod breaks.

## Findings

Affected file: `client/src/features/transactions/components/RosterMovesTab/__tests__/AddDropPanel.test.tsx`

Pattern to fix:
```typescript
// Current (unsafe):
mockFetch.mockResolvedValueOnce({ ok: true, message: "..." } as any);

// Correct (type-safe):
mockFetch.mockResolvedValueOnce({
  success: true,
  playerId: 100,
  appliedReassignments: [],
} satisfies ClaimResponse);
```

The `satisfies` operator gives a compile-time error if the mock shape diverges from `ClaimResponse`.

Same pattern applies to preview endpoint mocks — check the `previewClaim` response shape in `shared/api/rosterMoves.ts` and ensure preview mocks use `satisfies PreviewResponse`.

**Why this matters here:** PR #349 adds 13 new tests. If any of those mocks use ad-hoc shapes, the test file now has more surface area for schema drift.

## Proposed Solutions

### Option A: Replace `as any` with `satisfies` (Recommended)
Import `ClaimResponse` and `PreviewClaimResponse` from `@shared/api/rosterMoves`, use `satisfies` operator on all mock values.
- Effort: Small
- Risk: May surface existing mock shape mismatches that need to be corrected

### Option B: Create typed mock factory functions
Create `makeClaimResponse(overrides)` and `makePreviewResponse(overrides)` factory helpers at the top of the test file.
- Effort: Small-medium
- Risk: Low

## Acceptance Criteria
- [ ] No `as any` casts on `fetchJsonApi` mock return values in `AddDropPanel.test.tsx`
- [ ] Mock shapes validated against `ClaimResponse` / `PreviewClaimResponse` via `satisfies`
- [ ] TypeScript compiles clean after changes
