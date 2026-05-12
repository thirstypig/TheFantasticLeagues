---
status: pending
priority: p2
issue_id: "186"
tags: [code-review, wire-list, mobile, simplicity]
dependencies: [184]
---

# Consolidate MobileWireList MobileTopbar — 4 duplicate JSX blocks → 1

## Problem Statement

`MobileWireList.tsx` has four render branches (loading, error, no-period, active) each independently rendering a full `MobileTopbar` block. Three are byte-for-byte identical; the fourth adds a dynamic subtitle and trailing glyph. Any topbar change (e.g. adding an `onTrailingClick` for a settings sheet) must be applied 4×.

## Proposed Solution

Hoist the topbar JSX before the early-return guards:

```tsx
const topbar = (
  <MobileTopbar
    title="Wire List"
    subtitle={period && !isReadOnly
      ? `Locks ${formatDeadline(period.deadlineAt)}`
      : isReadOnly && period ? "Read only" : "Waiver picks"}
    leading={<Glyph kind="back" size={20} />}
    onLeadingClick={() => nav(-1)}
    trailing={period && !loading && !error ? <Glyph kind="moreDots" size={20} /> : undefined}
  />
);
```

Net reduction: ~26 lines.

## Acceptance Criteria

- [ ] Single `topbar` JSX element shared by all render branches
- [ ] tsc clean
- [ ] Visual output unchanged (compare screenshots before/after)

## Work Log

- 2026-05-11: Identified during PR #333 simplicity review.
