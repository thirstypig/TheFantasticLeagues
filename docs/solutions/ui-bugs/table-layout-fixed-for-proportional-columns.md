---
title: "One unconstrained column eats all leftover table width (auto-layout trap)"
category: ui-bugs
component:
  - client/src/components/ui/ThemedTable.tsx
  - client/src/components/ui/TableCard.tsx
  - client/src/index.css
  - client/src/features/players/pages/Players.tsx
  - client/src/features/periods/pages/Season.tsx
  - client/src/features/teams/pages/Team.tsx
  - client/src/features/admin/pages/AdminUsers.tsx
symptoms:
  - Player Name column is 442px (40% of a 1094px table), stats columns squeezed
  - Season Point Matrix Team column is 305px showing 8-char team names
  - Gap of 200+ pixels between Name and stats on desktop
  - Team-detail PLAYER column is 373px, nearly half of a 1170px table
root_cause: "Table `width: 100%` + default `table-layout: auto` means one unconstrained column absorbs ALL remaining width. Setting a `min-w-[140px]` without `max-w` or explicit `width` doesn't cap the column — the browser gives that column whatever leftover space exists after sizing the others."
date_encountered: 2026-04-14
severity: medium
tags:
  - table-layout
  - responsive-tables
  - css-table-algorithm
  - column-distribution
  - mobile-scroll
  - design-system
related:
  - overflow-hidden-blocks-child-horizontal-scroll.md
---

# One Unconstrained Column Eats All Leftover Table Width

## Problem

Across Players, Season, Team-detail, and Admin Users pages, tables visually had one comically-wide column next to a cluster of tight columns:

- **Players**: Name col `442px` (40%), stats `64px` each
- **Season Point Matrix**: Team col `305px` for names like "Skunk Dogs", P1 `189px` for numbers like "61.5", TOTAL `283px`
- **Team-detail Hitters**: PLAYER col `373px`, stats `79–133px`
- **Admin Users**: After first fix attempt, all 8 columns `146px` equal (too-rigid rubber-band)

The common experience: the "Name" column looks like it's been stretched on a rack while the stats next to it huddle together.

## Symptoms

- Obvious visual imbalance — name/player/team column dominates
- Gap of 150–250px between the wide column and the next group
- Stats columns compressed to barely-legible widths on desktop
- On mobile: different problem — columns sized by content, some overflow, no scroll affordance

## Root Cause

CSS has two table layout algorithms, and the default one is treacherous for responsive design:

### `table-layout: auto` (default)

1. Browser scans every cell's content to determine intrinsic column widths.
2. Any column with an **explicit** `width` or `min-width` is fixed at that minimum.
3. Columns **without** explicit width absorb all remaining space, distributed by content weight.

In our Players table:

```jsx
<table className="w-full min-w-[600px]">  {/* force 100% width */}
  <th className="pl-2 min-w-[140px]">Name</th>        {/* min only, no max */}
  <th className="w-16">MLB</th>    {/* 64px fixed */}
  <th className="w-16">R</th>      {/* 64px fixed */}
  {/* ...5 more stat cols at w-16 */}
  <th className="w-48">Fantasy Team</th>  {/* 192px fixed */}
</table>
```

With the table forced to `1094px`, the fixed columns total `~650px`. Remainder = `444px`. There's one column without a hard width (`Name` has `min-w` but no cap) → it eats the entire `444px`.

### Why `.lg-table { width: 100% }` made it worse

`index.css` had:

```css
.lg-table { width: 100%; }    /* Force stretch */
```

This meant *every* table stretched to fill its container regardless of content, amplifying the auto-layout absorption problem. Removing `width: 100%` made tables shrink to content — which created the opposite problem: dead whitespace on the right of every table on desktop.

## What We Tried First (and Why It Failed)

### Attempt 1: Shrink tables to content

```css
.lg-table {
  /* removed width: 100% */
  border-collapse: separate;
}
```

```jsx
<table className="min-w-[600px] ...">  {/* removed w-full */}
```

**Result**: Tables hugged content. Name column dropped from 442px → 187px. ✓

**But**: Tables now sat flush-left in the container with 200–300px of dead space on the right. User called this out immediately.

### Why it failed

We traded one bad layout for another. "Shrink to content" is correct when the table is the only thing you want to see; it's wrong when the table is supposed to fill a card.

## Working Solution

Use `table-layout: fixed` + `w-full` + **explicit widths on every column**:

```jsx
<table
  style={{ tableLayout: "fixed" }}
  className="w-full min-w-[600px] caption-bottom text-sm"
>
  <thead>
    <tr>
      <th className="w-12">#</th>
      <th className="w-[180px]">Team</th>
      <th className="w-[70px]">P1</th>
      <th className="w-[90px]">TOTAL</th>
      <th className="w-[100px]"></th>
    </tr>
  </thead>
```

### How `table-layout: fixed` behaves

1. Browser uses the widths declared on `<col>` or the first row's cells. **Content is ignored for sizing.**
2. If `width: 100%` and the column widths sum to less than 100%, the extra is **distributed proportionally** across ALL columns with explicit widths.
3. Content that overflows a cell just... overflows (clip, truncate, or wrap per your CSS — not your layout problem).

In our Season Point Matrix: widths sum to `180+12+70+90+100 = 452px`. Container is `1102px`. Ratio `~2.44x`. Every column grows by that same ratio — Team becomes `406px`, # becomes `29px`, etc. **No column is privileged** to absorb extra.

### Mobile scroll floor

```jsx
// ThemedTable: default 600 for 10+ col tables, 0 for small tables
const tableStyle = { tableLayout: "fixed" };
if (minWidth > 0) tableStyle.minWidth = `${minWidth}px`;
```

`min-w-[600px]` on the `<table>` means at viewport < 600px, the table stops shrinking and the parent `<div class="overflow-x-auto">` enables horizontal scroll. Mobile responsive AND desktop-proportional with one codepath.

### Small tables that *should* shrink to content

The 4-col Season category standings (Team/Season/Period/Chg) look silly at 600px wide with only short numbers in them. Added a `minWidth` prop:

```jsx
// client/src/components/ui/ThemedTable.tsx
interface ThemedTableProps {
  minWidth?: number;  // default 600, pass 0 for tables with ≤5 short cols
}

<ThemedTable minWidth={0} aria-label="Runs standings">
  ...
</ThemedTable>
```

## Before / After Measurements

| Surface | Before | After | Shape |
|---|---|---|---|
| Players | Name 442, stats 64 each | Name 288, stats 84 each | Fills 1094px, proportional |
| Season Point Matrix | Team 305, P1 189, TOTAL 283 | Team 406, P1 158, TOTAL 203 | Fills 1102px, 2.44× ratio |
| Team Hitters (9 cols) | PLAYER 373 (of 1170) | PLAYER 379 (of 1170) | Same width, proportional not hogged |
| Season Period category (4 cols, ×10) | 600 (min floor) each | 397 each (shrink-to-content) | `minWidth={0}` on small tables |
| Admin Users (8 cols) | 146 each (equal) | 90–304 (proportional) | Explicit widths matched to content |

## Prevention

### When designing a new table

1. **Always set an explicit width on every column** if the table is `w-full`. `className="w-[200px]"` or `className="w-16"` — doesn't matter what unit, just give it one.
2. **Prefer `table-layout: fixed` for data tables**. Auto-layout is for documents; fixed is for dashboards.
3. **If you only know one column's size constraints**, use `minWidth={0}` so the table hugs content — don't force a stretch with one unconstrained column.
4. **Don't use `min-w-[Npx]` alone on a column** under `w-full` tables. `min-w` without a `w` is a trap — the browser reads it as "at least this wide, grow freely" and the column grows without limit.

### Anti-pattern to avoid

```jsx
/* ❌ BAD — Name will absorb all extra width */
<table className="w-full">
  <th className="min-w-[140px]">Name</th>
  <th className="w-16">Stat</th>
  <th className="w-16">Stat</th>
</table>

/* ✅ GOOD — proportional */
<table style={{ tableLayout: "fixed" }} className="w-full">
  <th className="w-[140px]">Name</th>
  <th className="w-16">Stat</th>
  <th className="w-16">Stat</th>
</table>

/* ✅ ALSO GOOD — content-sized */
<table className="min-w-[600px]">   {/* no w-full, no fixed layout needed */}
  <th className="w-[140px]">Name</th>
  <th className="w-16">Stat</th>
</table>
```

### Tailwind JIT gotcha

Tailwind's JIT scans source for literal class names. A dynamic class like:

```jsx
className={`min-w-[${minWidth}px]`}  /* ❌ Tailwind won't generate the rule */
```

...will silently produce no CSS rule. Use inline styles for dynamic pixel values:

```jsx
style={{ minWidth: `${minWidth}px` }}  /* ✅ always applies */
```

### Review checklist

Before merging a PR that adds or modifies a table:

- [ ] Every `<th>` has an explicit `w-` class or pixel `width` (not `min-w-` alone)
- [ ] Table uses `tableLayout: "fixed"` if it's `w-full`
- [ ] Mobile check: does the table scroll horizontally under 600px?
- [ ] Desktop check: does the table fill the container without dead space?
- [ ] Does the widest column make sense for the longest realistic content?

## Why Two Fixes Were Needed

The first attempt (shrink-to-content) passed the "column balance" test but failed the "desktop fills container" test. The user's response — "empty space on the right — shouldn't all the tables be resized?" — was the signal that shrink-to-content wasn't the right solution for cards that are meant to occupy their layout slot.

The lesson: when a design system fix has competing constraints (balance column widths AND fill container AND work on mobile), none of the intuitive fixes work alone. You have to use the CSS feature purpose-built for the problem (`table-layout: fixed` + explicit widths + `w-full`), which is easy to skip over because "auto" is the default and you forget fixed exists.

## Related Files

- `client/src/components/ui/ThemedTable.tsx` — canonical implementation, exposes `minWidth` prop
- `client/src/components/ui/TableCard.tsx` — older `<Table>` component, same pattern applied
- `client/src/index.css` line 303 — `.lg-table` rule, removed `width: 100%`
- Test suite: no direct test for this — visual regression only. If we add Playwright visual tests, table layout is a good target.

## See Also

- [overflow-hidden-blocks-child-horizontal-scroll.md](overflow-hidden-blocks-child-horizontal-scroll.md) — related pattern where `overflow-x-hidden` on parent defeated table scroll. These two docs together cover the major responsive-table failure modes.
- MDN: [table-layout](https://developer.mozilla.org/en-US/docs/Web/CSS/table-layout) — authoritative reference for `auto` vs `fixed` semantics.
- Session 64 commit: `d69ac1b` — all table changes in one commit.
