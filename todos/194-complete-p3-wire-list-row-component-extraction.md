---
status: pending
priority: p3
issue_id: "194"
tags: [code-review, wire-list, mobile, simplicity]
dependencies: [187]
---

# Extract WireListRow into a shared component (mobile + desktop parity)

## Problem Statement

`MobileWireList.tsx` and `WireListOwnerPage.tsx` both inline their row rendering for add/drop entries. The row shape (rank badge, player name, position chip, deadline, drag handle) is nearly identical between the two. Extraction into a shared `WireListRow` component would eliminate duplication and make future style changes (e.g., adding a status badge post-finalization) a single-file edit.

## Findings

- **Files**: `client/src/mobile/pages/MobileWireList.tsx`, `client/src/features/wire-list/pages/WireListOwnerPage.tsx`
- Both render an add/drop row with rank, player name, position, deadline
- Mobile uses a compact layout; desktop has slightly more padding — both could be handled via a `compact?: boolean` prop (same pattern as `WaiverDropModeToggle` in todo #187)
- This todo is naturally sequenced after #187 (shared utils) since both are in the same `wire-list` feature area

## Proposed Solution

1. Create `client/src/features/wire-list/components/WireListRow.tsx` with `compact?: boolean` prop
2. Replace inline row JSX in both pages with `<WireListRow ... />`
3. Ensure drag-handle slot is preserved as a `renderHandle?: () => ReactNode` prop so desktop drag-and-drop (todo #182) can inject its handle later

## Acceptance Criteria

- [ ] `WireListRow.tsx` created in `client/src/features/wire-list/components/`
- [ ] Both pages use `WireListRow`; local inline row JSX removed
- [ ] `compact` prop controls padding (mobile: compact, desktop: full)
- [ ] `renderHandle` optional prop slot present (even if unused initially)
- [ ] tsc clean

## Work Log

- 2026-05-11: Identified in PR #333 `/ce:review` simplicity pass.
