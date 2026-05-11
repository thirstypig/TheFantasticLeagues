---
status: pending
priority: p3
issue_id: "187"
tags: [code-review, wire-list, mobile, simplicity]
dependencies: [184]
---

# Extract wire-list shared utils: formatDeadline + ModeToggle

## Problem Statement

Two small items are duplicated between `MobileWireList.tsx` and `WireListOwnerPage.tsx`:

1. `formatDeadline(iso: string)` — identical 6-line function in both files
2. `ModeToggle` — stateless component for RELEASE/IL_STASH toggle. Mobile version has `padding: "5px 8px"`, desktop has `"4px 8px"`. Desktop is also missing `type="button"` (not a live bug since it's not inside a `<form>`, but incorrect HTML).

## Proposed Solution

1. Create `client/src/features/wire-list/utils.ts` with `export function formatDeadline(iso: string): string { ... }`. Import in both pages.

2. Create `client/src/features/wire-list/components/WaiverDropModeToggle.tsx` with a `compact?: boolean` prop (defaults `false` for desktop padding, `true` for mobile). This also fixes the desktop `type="button"` gap.

## Acceptance Criteria

- [ ] `client/src/features/wire-list/utils.ts` exists with `formatDeadline`
- [ ] Both pages import from it; local definitions removed
- [ ] `WaiverDropModeToggle.tsx` created with `compact` prop; both pages use it
- [ ] Desktop `type="button"` gap fixed
- [ ] tsc clean

## Work Log

- 2026-05-11: Identified during PR #333 simplicity review.
