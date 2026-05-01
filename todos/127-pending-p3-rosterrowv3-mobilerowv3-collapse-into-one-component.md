---
status: pending
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
