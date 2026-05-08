---
status: complete
priority: p3
issue_id: "127"
tags: [code-review, simplicity, v3-hub, refactor]
dependencies: ["117"]
---

# Collapse `RosterRowV3` + `MobileRowV3` into one component with `layout` prop

## Problem Statement

Both files (`RosterRowV3.tsx` 199 LOC, `MobileRowV3.tsx` 157 LOC) implement the same row logic differently:

Same: `useState` for menuOpen, `useRef` for trigger, `onTriggerClick` body, row-class building, name/keeper-star/pending-dot rendering, revert button, action menu trigger, `RowActionMenu` render, `React.memo` shape.

Different: desktop renders inside `<ThemedTr>`/`<ThemedTd>` with 5-6 stat cells; mobile renders inside `<div>` with a single `statSummaryFor()` string.

That's it. Bug fixes (e.g., keeper star rendering) have to be made in two places.

## Proposed Solutions

### Option 1: Single `RosterRow` component with `layout: "desktop" | "mobile"` prop

**Approach:** Merge into one file. Container differences become a 10-line ternary. Stat-cell rendering becomes layout-conditional. Keep `React.memo` wrappers if needed.

**Pros:**
- ~135 LOC reduction (356 → ~220)
- One source of truth for row behavior
- New props automatically apply to both layouts

**Cons:**
- Slightly larger single component

**Effort:** Small (~1 hour)

**Risk:** Low — existing tests cover both behaviors

## Recommended Action

Option 1, after todo #117 (memo comparator fix). The two are coupled — fixing the comparator while merging components is one motion.

## Technical Details

**Affected files:**
- `client/src/features/teams/components/RosterHub/RosterRowV3.tsx`
- `client/src/features/teams/components/RosterHub/MobileRowV3.tsx`
- `client/src/features/teams/components/RosterHub/RosterHubV3.tsx` — selects between them via `isMobile`

## Acceptance Criteria

- [ ] One `RosterRow.tsx` file replaces both
- [ ] `RosterHubV3` calls it with `layout` prop conditionally
- [ ] Existing v3 tests pass on both layouts
- [ ] Browser-verify desktop AND mobile rendering at `/teams/LDY` (after resizing)

## Resources

- **Source:** Code-simplicity-reviewer P2 #1
- **Blocked-by:** Todo #117 (memo comparator)

## Work Log

### 2026-04-30 — Initial Discovery
- **By:** /ce:review code-simplicity-reviewer

### 2026-05-07 — Resolved via shared-pieces extraction (not full collapse)
- **By:** agent dispatch
- **Outcome:** Shipped PR `refactor/rosterrow-collapse-127` with a different
  structural decision than the original recommendation. The two row variants
  share a new `rowShared.tsx` module that exports `useActionMenu`,
  `buildRowClasses`, `PlayerNameContent`, `PlayerSubtitle`, `RevertButton`,
  and `ActionMenuTrigger`. Both `RosterRowV3` and `MobileRowV3` now consume
  these helpers, eliminating the duplicated state-machine plumbing,
  class-list builder, keeper-star/pending-dot prefix, subtitle line, and
  revert/kebab affordances.
- **Why not the original Option 1 (single component, `layout` prop)?**
  Re-reading both files showed the divergent surface is larger than the
  todo described:
  1. Container element type differs (`<tr>`/`<td>` vs `<div>` flex card) —
     a unified component would need `React.createElement(layout === "desktop" ? "tr" : "div", ...)` indirection that defeats the type checker on row refs (`HTMLTableRowElement` vs `HTMLDivElement`).
  2. Stats rendering differs structurally: desktop emits 7-8 individual
     `<StatTd>` cells whose count must match the parent's `<thead>`;
     mobile emits a single dot-separated string from `statSummaryFor`.
     A `layout` prop ternary on every stat field is uglier than two
     separate render blocks.
  3. Drag-handle position differs (desktop: LEFT of name, inside the
     name cell; mobile: RIGHT of row, inside the actions column).
  4. Desktop has expand-on-name-click (`onToggleExpand`/`isExpanded`)
     and legacy non-DnD `isDragSource`/`isDropTarget` props the mobile
     variant doesn't take.
  Forcing a unified component would have replaced ~60 lines of clean
  duplication with ~120 lines of conditional logic plus type widening
  on the row ref. The shared-pieces extraction lands the same
  "one-source-of-truth for behavior" goal (action menu, class list,
  name decoration, subtitle, revert button, kebab) while letting each
  variant keep its layout-native markup.
- **LOC delta:** +159 (rowShared.tsx) / -33 desktop / -33 mobile = net
  ~93 LOC added, but the duplication-prone surface (state machine,
  class builder, name prefix, revert button, kebab) is now in one
  place. Future bug fixes to those bits land once.
- **Tests:** All 224 client/teams tests pass; `tsc --noEmit` clean.
- **Browser verification:** unavailable per task constraint.
