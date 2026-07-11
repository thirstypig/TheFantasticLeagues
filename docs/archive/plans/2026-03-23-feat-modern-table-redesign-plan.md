---
title: "feat: Modern table redesign — Linear/Notion-inspired with density tiers"
type: feat
status: active
date: 2026-03-23
---

# Modern Table Redesign (Option C)

## Overview

Transform all tables from the current bordered-row style to a modern, borderless design inspired by Linear and Notion, with three density tiers, sticky columns, inline interactions, and a SortableHeader component.

## Design Direction

**Borderless with subtle dividers.** No outer table borders, no vertical cell borders. Rows separated by thin horizontal dividers (`divide-y`). Hover reveals row actions. Clean typography with generous whitespace.

### Visual Style

```
Before (current):
┌──────────────────────────────────────────┐
│ Player      │ R  │ HR │ RBI │ AVG       │  <- bordered header
├──────────────────────────────────────────┤
│ Juan Soto   │ 12 │  5 │  18 │ .305      │  <- bordered rows
│ Mookie Betts│  8 │  3 │  12 │ .280      │
└──────────────────────────────────────────┘

After (modern):
  Player        R    HR   RBI   AVG           <- subtle header, no border
  ─────────────────────────────────────────
  Juan Soto     12    5    18   .305          <- borderless, hover highlight
  Mookie Betts   8    3    12   .280          <- zebra striping (subtle)
```

### Key Principles
- **No outer borders** on table container
- **Divide-y** between rows (thin, uses `--lg-border-faint`)
- **No vertical dividers** between columns
- **Row hover** reveals subtle background + optional action buttons
- **Header** visually distinct via opacity/weight, not background color
- **Numeric columns** right-aligned with `tabular-nums`
- **Sticky header** opaque background (no backdrop-blur)
- **Sticky first column** on mobile horizontal scroll

## Implementation

### Phase 1: Density Context + Base Styles

- [ ] Extend `TableCompactContext` to `TableDensityContext` with 3 tiers
  - `compact`: 28px rows, 12px text, `px-1.5 py-1` (auction panels)
  - `default`: 36px rows, 13px text, `px-3 py-2` (stats tables)
  - `comfortable`: 44px rows, 15px text, `px-3 py-3` (summaries — current)
- [ ] Update `table.tsx` TableHead and TableCell to read from density context
- [ ] `<ThemedTable density="default">` passes density via provider
- [ ] Backward compatible: no density prop = current behavior

### Phase 2: Borderless Row Style

- [ ] Remove outer border/shadow from table wrapper (keep `rounded-2xl` on container card only)
- [ ] Replace `border-b` per row with `divide-y divide-[var(--lg-border-faint)]` on `<tbody>`
- [ ] Header: remove background tint, use `font-semibold uppercase tracking-wide opacity-60` (text-only distinction)
- [ ] Add row hover: `hover:bg-[var(--lg-table-row-hover)]` with smooth transition
- [ ] Zebra striping via `[&>tr:nth-child(even)]:bg-[var(--lg-table-row-alt)]`
- [ ] Add `--lg-positive` / `--lg-negative` semantic tokens for stat value colors

### Phase 3: SortableHeader Component

- [ ] Create `client/src/components/ui/SortableHeader.tsx`
- [ ] Stacked ▲/▼ indicators: active uses `--lg-accent`, inactive faded
- [ ] `aria-sort` attribute, `role="button"`, keyboard accessible
- [ ] First click → descending for counting stats, ascending for rate stats (ERA, WHIP)
- [ ] Replace 10+ inline sort patterns in Players.tsx

### Phase 4: Sticky First Column (Mobile)

- [ ] Add `stickyFirstCol` prop to ThemedTable
- [ ] CSS: `position: sticky; left: 0;` on first `<th>` and `<td>`
- [ ] Z-index tiers: cells (auto) → sticky col (z-20) → sticky header (z-30) → corner (z-40)
- [ ] Opaque backgrounds on sticky cells (new `--lg-table-row-alt-opaque` token)
- [ ] Optional shadow on sticky column edge
- [ ] Apply to Players page and StatsTables

### Phase 5: Performance (Players.tsx)

- [ ] Split single `useMemo` into 3 stages: filter → stat overlay → sort
- [ ] `useDeferredValue(searchQuery)` for responsive typing
- [ ] `isStale` boolean to dim table during deferred recompute
- [ ] Evaluate `@tanstack/react-virtual` if DOM count is still a bottleneck

### Phase 6: Apply Across All Tables

- [ ] Players page (hitters + pitchers) — `default` density, sticky first col
- [ ] Season/Standings (StatsTables) — `default` density
- [ ] Auction Draft Log — `compact` density
- [ ] Auction Player Pool — `default` density, sticky first col
- [ ] Auction Teams — `compact` density for roster detail
- [ ] Teams Roster (TeamRosterManager) — `comfortable` density
- [ ] Archive — `default` density
- [ ] Periods — `default` density
- [ ] Trades — `comfortable` density
- [ ] Commissioner — `comfortable` density

## Acceptance Criteria

- [ ] All tables use unified density system (no more per-table padding overrides)
- [ ] Borderless row style with hover highlights across all tables
- [ ] SortableHeader replaces all inline sort logic
- [ ] Sticky first column works on mobile (390px viewport)
- [ ] Sticky headers still work after redesign
- [ ] Dark mode and light mode verified
- [ ] Performance: Players page sorts without visible lag
- [ ] WCAG: sort headers keyboard accessible, touch targets ≥ 44px

## Files to Modify

| File | Changes |
|------|---------|
| `client/src/components/ui/table.tsx` | Density context, borderless styles |
| `client/src/components/ui/ThemedTable.tsx` | Density prop, stickyFirstCol prop |
| `client/src/components/ui/SortableHeader.tsx` | **New** — reusable sort header |
| `client/src/index.css` | New tokens: `--lg-positive`, `--lg-negative`, `--lg-table-row-alt-opaque` |
| `client/src/features/players/pages/Players.tsx` | useMemo split, SortableHeader, density |
| `client/src/components/shared/StatsTables.tsx` | Borderless style, semantic colors |
| 8+ other page files | Apply density prop |

## Effort: ~3-4 hours

Phase 1-2 (foundation): 1 hour
Phase 3 (SortableHeader): 30 min
Phase 4 (sticky column): 45 min
Phase 5 (performance): 30 min
Phase 6 (apply to all): 1 hour
