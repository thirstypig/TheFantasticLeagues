---
status: pending
priority: p3
issue_id: 259
tags: [code-review, adsense, test-coverage]
dependencies: []
---

## Problem Statement

Two minor cleanup items in the AdUnit component and test:

1. `AdUnit.tsx:4` has a stale TODO comment: "replace with real 10-digit slot ID from AdSense dashboard." The publisher ID (`ca-pub-7103672049879516`) is already the real one; slot IDs come from the `slot` prop (already parameterised). The TODO should be removed.

2. `AdUnit.test.tsx:69–73` tests that `display: "block"` is present and a custom `marginTop` is merged, but does not assert that `overflow: "hidden"` is present. Since `overflow: "hidden"` is a deliberate layout guarantee for hosting the AdSense iframe, it should be pinned.

## Findings

From kieran-typescript-reviewer:
- `client/src/components/AdUnit.tsx:4–5`: stale TODO
- `client/src/components/__tests__/AdUnit.test.tsx:69–73`: style merge test checks `display` and `marginTop` but misses `overflow`

## Proposed Solutions

**Option A — Remove stale comment + add overflow assertion (Recommended)**

In `AdUnit.tsx`: delete the TODO comment at lines 4–5.

In `AdUnit.test.tsx`, extend the style-merge test:
```typescript
expect(ins?.style.overflow).toBe("hidden");
```

Effort: Tiny | Risk: None

## Technical Details

Affected files:
- `client/src/components/AdUnit.tsx` line 4
- `client/src/components/__tests__/AdUnit.test.tsx` lines 69–73

## Acceptance Criteria

- [ ] Stale TODO comment removed from `AdUnit.tsx`
- [ ] `overflow: "hidden"` asserted in the style-merge test
- [ ] All AdUnit tests still pass

## Work Log

2026-06-04 — Surfaced by kieran-typescript-reviewer.
