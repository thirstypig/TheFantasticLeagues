---
title: "fix: Sticky table headers on Players and Auction PlayerPoolTab"
type: fix
status: completed
date: 2026-03-21
deepened: 2026-03-21
---

# fix: Sticky table headers on Players and Auction PlayerPoolTab

## Enhancement Summary

**Deepened on:** 2026-03-21
**Research agents used:** TypeScript Reviewer, Pattern Recognition Specialist, Code Simplicity Reviewer, Architecture Strategist, Frontend Races Reviewer, Best Practices Researcher

### Key Improvements from Research
1. **Changed approach**: Skip the `noWrapper` prop entirely — have ThemedTable's bare path render raw `<table>` instead of delegating to shadcn `<Table>`. This pattern already exists in the non-bare path (lines 34, 42) and requires zero changes to the shadcn primitive.
2. **Encapsulate sticky in ThemedThead**: Add a `sticky` prop to `ThemedThead` instead of spreading `className="sticky top-0 z-10 bg-[...]"` across consumer pages. This respects the project convention of "NO inline style overrides on ThemedTh/ThemedTd."
3. **Eliminated dead-end approach**: `overflow-x: auto; overflow-y: visible` does NOT work — per CSS spec, the browser silently recomputes `visible` to `auto` when the other axis is non-visible.

### New Considerations Discovered
- Mobile filter bar height coordination if scroll contexts merge on small screens
- ContextDeck animation must stay opacity-only (never `transform`) or sticky breaks
- iOS Safari is fine in 2026 for `position: sticky`

---

## Overview

Tables on the Players page and Auction PlayerPoolTab lose column headers when scrolling. Users must scroll back up to re-orient which column is which — especially painful on the Players page (hundreds of rows) and during live auction drafts (time-sensitive decisions).

## Problem Statement

`position: sticky` on `<thead>` only works relative to the **nearest scrollable ancestor**. Two issues break it:

1. **Shadcn `Table` wrapper creates an intermediate scroll container** — `table.tsx:16` wraps every `<table>` in `<div className="relative w-full overflow-auto">`. This becomes the nearest scroll ancestor for the `<thead>`, but since this div is unconstrained in height (grows with content), there's nothing to scroll against. The actual visible scrolling happens on an outer container.

2. **Players page has no sticky class at all** — `Players.tsx:279` renders `<ThemedThead>` with no sticky positioning. Plus there are THREE nested overflow containers: `flex-1 overflow-auto` (line 275) → `overflow-x-auto` (line 277) → Table's `overflow-auto` wrapper.

3. **Auction PlayerPoolTab has sticky but it's neutralized** — `PlayerPoolTab.tsx:405` correctly applies `sticky top-0 z-10` to ThemedThead, but the Table wrapper's intermediate `overflow-auto` div prevents it from working.

### Working references

- **KeeperPrepDashboard** (`KeeperPrepDashboard.tsx:320-322`) — uses raw `<table>` + `<thead className="sticky top-0">` inside a single `max-h-[60vh] overflow-y-auto` container. One scroll container = sticky works.
- **AuctionDraftLog** (`AuctionDraftLog.tsx:92`) — applies `sticky top-0 z-10 bg-[var(--lg-glass-bg-hover)]` to ThemedThead.

### Research Insights: CSS Spec Constraints

**`overflow-x: auto; overflow-y: visible` is NOT a viable shortcut.** Per the CSS Overflow Module spec: when one axis is set to a value other than `visible` or `clip`, and the other is `visible`, the `visible` value computes to `auto`. So the browser always recomputes to `overflow: auto` on both axes — the intermediate scroll container persists.

**`overflow-x: clip`** does not trigger this recomputation, but provides no scrollbar. Not suitable when horizontal scrolling is needed.

**The only reliable fix** is to eliminate the intermediate scroll container entirely, ensuring exactly one scroll container between the viewport and the `<thead>`.

---

## Proposed Solution (Revised After Research)

### Approach: ThemedTable bare path renders raw `<table>` (no shadcn wrapper)

The original plan proposed adding a `noWrapper` prop to the shadcn `Table` primitive. **Research identified a simpler, more idiomatic approach** that requires zero changes to the shadcn primitive:

**Observation:** ThemedTable's non-bare paths (lines 34 and 42) already render raw `<table>` elements directly, bypassing the shadcn `Table` wrapper. The bare paths (lines 31 and 39) are the only ones that delegate to `<Table>`, picking up the problematic `overflow-auto` wrapper.

**Fix:** Make the bare paths render raw `<table>` too, matching the non-bare pattern.

**Why this is better than `noWrapper`:**
- No change to the shadcn primitive (stays clean, no leaky abstraction)
- No prop drilling (`bare` → `noWrapper`)
- No naming inconsistency (TypeScript reviewer flagged `bare` vs `noWrapper`)
- Already proven by the non-bare paths in the same file
- Single file change (ThemedTable.tsx only)

### 1. Modify ThemedTable bare path to render raw `<table>`

**File:** `client/src/components/ui/ThemedTable.tsx`

```tsx
// BEFORE (lines 27-47):
export function ThemedTable({ children, className = '', bare = false, compact = false }: ThemedTableProps) {
  const content = compact ? (
    <TableCompactProvider compact>
      {bare ? (
        <Table className={className}>{children}</Table>          // ← uses shadcn Table (has overflow wrapper)
      ) : (
        <div className={cn('overflow-x-auto rounded-2xl liquid-glass', className)}>
          <table className="w-full caption-bottom text-sm">{children}</table>
        </div>
      )}
    </TableCompactProvider>
  ) : bare ? (
    <Table className={className}>{children}</Table>              // ← uses shadcn Table (has overflow wrapper)
  ) : (
    <div className={cn('overflow-x-auto rounded-2xl liquid-glass', className)}>
      <table className="w-full caption-bottom text-sm">{children}</table>
    </div>
  );
  return content;
}

// AFTER:
export function ThemedTable({ children, className = '', bare = false, compact = false }: ThemedTableProps) {
  const content = compact ? (
    <TableCompactProvider compact>
      {bare ? (
        <table className={cn("w-full caption-bottom text-sm", className)}>{children}</table>  // ← raw <table>
      ) : (
        <div className={cn('overflow-x-auto rounded-2xl liquid-glass', className)}>
          <table className="w-full caption-bottom text-sm">{children}</table>
        </div>
      )}
    </TableCompactProvider>
  ) : bare ? (
    <table className={cn("w-full caption-bottom text-sm", className)}>{children}</table>      // ← raw <table>
  ) : (
    <div className={cn('overflow-x-auto rounded-2xl liquid-glass', className)}>
      <table className="w-full caption-bottom text-sm">{children}</table>
    </div>
  );
  return content;
}
```

**Note:** The shadcn sub-components (`TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`) render plain HTML elements (`<thead>`, `<tbody>`, `<tr>`, `<th>`, `<td>`) with Tailwind classes. They have no dependency on the parent `<Table>` component (no React context, no DOM coupling). The `compact` context comes from `TableCompactProvider`, which ThemedTable controls independently. So bypassing `<Table>` is safe.

### 2. Add `sticky` prop to ThemedThead

**File:** `client/src/components/ui/ThemedTable.tsx`

The TypeScript reviewer flagged that adding `className="sticky top-0 z-10 bg-[var(--lg-glass-bg-hover)]"` directly on each page's `<ThemedThead>` violates the project convention: *"All tables use ThemedTable components, NO inline style overrides on ThemedTh/ThemedTd."*

Encapsulate sticky behavior in the shared component:

```tsx
interface ThemedTheadProps {
  children: React.ReactNode;
  className?: string;
  /** Pin header to top of scroll container */
  sticky?: boolean;
}

export function ThemedThead({ children, className = '', sticky = false }: ThemedTheadProps) {
  return (
    <TableHeader
      className={cn(
        sticky && 'sticky top-0 z-10 bg-[var(--lg-glass-bg-hover)]',
        className
      )}
    >
      {children}
    </TableHeader>
  );
}
```

**Background color choice:** `--lg-glass-bg-hover` provides sufficient opacity in both light and dark modes. The `--lg-table-header-bg` token is semi-transparent (`rgba(0,45,114, 0.10)` light / `rgba(26,117,255, 0.08)` dark) and would cause content bleed-through. Using `--lg-glass-bg-hover` matches the working pattern in AuctionDraftLog and PlayerPoolTab.

### 3. Fix Players page

**File:** `client/src/features/players/pages/Players.tsx`

- **Remove** the intermediate `<div className="overflow-x-auto">` (line 277) — the outer `flex-1 overflow-auto` handles both axes
- **Add** `sticky` prop to ThemedThead (line 279): `<ThemedThead sticky>`

Result: one scroll container (`flex-1 overflow-auto`) → one `<table>` (no wrapper) → sticky `<thead>`.

### 4. Update PlayerPoolTab to use `sticky` prop

**File:** `client/src/features/auction/components/PlayerPoolTab.tsx`

Replace inline sticky className with the new prop:

```tsx
// BEFORE (line 405):
<ThemedThead className="sticky top-0 z-10 bg-[var(--lg-glass-bg-hover)]">

// AFTER:
<ThemedThead sticky>
```

### 5. Update AuctionDraftLog to use `sticky` prop

**File:** `client/src/features/auction/components/AuctionDraftLog.tsx`

```tsx
// BEFORE (line 92):
<ThemedThead className="sticky top-0 z-10 bg-[var(--lg-glass-bg-hover)]">

// AFTER:
<ThemedThead sticky>
```

---

## Technical Considerations

### Horizontal scroll preservation

Removing the shadcn Table's `overflow-auto` wrapper means the caller is responsible for horizontal scroll. For most `ThemedTable bare` usage, the parent already provides scroll handling. **All 26 bare instances must be verified.**

Key instances to check:
- `Players.tsx` — outer `flex-1 overflow-auto` handles both axes
- `PlayerPoolTab.tsx` — outer `flex-1 overflow-auto` handles both axes
- `StatsTables.tsx` — already wraps each ThemedTable in `<div className="overflow-x-auto">` (safe)
- `Archive` page tables — check scroll behavior
- `PlayerDetailModal` tables — typically short, unlikely to need scroll

### Research Insight: CSS overflow axis recomputation

Per CSS spec, when `overflow-x` is any value other than `visible` and `overflow-y` is `visible`, the browser silently changes `overflow-y` to `auto`. This means `overflow-x: auto; overflow-y: visible` is **not** a viable approach — it produces `overflow: auto` on both axes. The only reliable fix is eliminating the intermediate container entirely.

### Background opacity for sticky headers

The `--lg-table-header-bg` token is semi-transparent (`rgba(0,45,114, 0.10)` light / `rgba(26,117,255, 0.08)` dark). Scrolling content bleeds through transparent sticky headers. The `sticky` prop on `ThemedThead` uses `bg-[var(--lg-glass-bg-hover)]` which provides sufficient opacity in both light and dark mode.

### z-index layering

- Sticky table headers: `z-10`
- Players filter bar: `sticky top-0 z-50`
- AppShell sidebar: `z-50`

No conflict — the table's scroll container (`flex-1 overflow-auto`) is a sibling below the filter bar, so the thead's `z-10` is scoped within its own stacking context.

### Research Insight: Mobile filter bar coordination

The frontend races reviewer identified a subtle concern: on the Players page, the filter bar is `sticky top-0 z-50` relative to the outer flex container, while the thead is `sticky top-0 z-10` relative to the inner scroll container. These are separate scroll contexts on desktop. **On mobile**, if the outer container collapses and scrolls, both sticky elements could fight for `top: 0`. However, the Players page uses `h-full flex flex-col` with the table in `flex-1 overflow-auto`, which constrains the table to its own scroll area. Verify this holds on mobile (390px).

### Research Insight: ContextDeck animation constraint

The Auction PlayerPoolTab lives inside a `ContextDeck` that uses `animate-in fade-in` (opacity-only CSS animation). **Never change this to a `transform`-based animation** (slide-in, scale). CSS `transform` on a parent creates a new containing block that `position: sticky` cannot escape. Add a comment in `ContextDeck.tsx` documenting this constraint.

### Research Insight: iOS Safari

Sticky positioning inside `overflow: auto` containers is fully reliable in Safari 15+ (2021). The FBST app targets modern browsers. No polyfills or workarounds needed. The remaining quirk (nested scroll containers confusing momentum scrolling) is avoided by the auction layout's `overflow-hidden` on outer containers.

### Regression scope

The bare path change in ThemedTable affects all `ThemedTable bare` consumers (~26 instances). The only behavioral difference is removal of the `<div class="relative w-full overflow-auto">` wrapper. Since this div had no height constraint, it never actually scrolled — so removing it changes no visible behavior. All existing parent scroll containers continue to work.

The non-bare path is unchanged. Direct `<Table>` usage (if any) is unchanged.

---

## Acceptance Criteria

- [ ] Players page: column headers stay visible when scrolling vertically
- [ ] Players page: horizontal scroll still works on mobile (390px viewport)
- [ ] Auction PlayerPoolTab: column headers stay visible when scrolling vertically
- [ ] Sticky headers have opaque background — no content bleed-through in light or dark mode
- [ ] AuctionDraftLog: no regression (sticky still works, now via `sticky` prop)
- [ ] KeeperPrepDashboard: no regression (uses raw `<table>`, unaffected)
- [ ] StatsTables (Season page, Archive page): no horizontal scroll regression
- [x] All 187 client tests pass
- [ ] Visual spot-check on mobile (390px) and desktop for both light and dark mode

## Files to Modify

| File | Change |
|------|--------|
| `client/src/components/ui/ThemedTable.tsx:27-47` | Bare paths render raw `<table>` instead of `<Table>` |
| `client/src/components/ui/ThemedTable.tsx:54-56` | Add `sticky` prop to `ThemedThead` |
| `client/src/features/players/pages/Players.tsx:277-279` | Remove intermediate `overflow-x-auto` div, add `sticky` prop to ThemedThead |
| `client/src/features/auction/components/PlayerPoolTab.tsx:405` | Replace inline sticky className with `sticky` prop |
| `client/src/features/auction/components/AuctionDraftLog.tsx:92` | Replace inline sticky className with `sticky` prop |

## Files to Verify (no changes expected)

| File | What to check |
|------|---------------|
| `client/src/components/ui/table.tsx` | **No changes** — shadcn primitive untouched |
| `client/src/features/keeper-prep/components/KeeperPrepDashboard.tsx` | No regression (raw table, unaffected) |
| `client/src/components/shared/StatsTables.tsx` | Horizontal scroll still works (has own `overflow-x-auto` wrappers) |
| `client/src/features/archive/pages/ArchivePage.tsx` | Tables still scroll horizontally |
| `client/src/features/auction/components/ContextDeck.tsx` | Verify animation is opacity-only (no transform) |

## Alternatives Considered

| Approach | Files | New API surface | Verdict |
|----------|-------|-----------------|---------|
| `noWrapper` prop on shadcn Table (original) | 3 | New prop on Table | Rejected: leaky abstraction, prop drilling, naming inconsistency |
| `overflow-x-auto` instead of `overflow-auto` | 1 | None | **Does not work**: CSS spec recomputes `overflow-y: visible` to `auto` |
| Bare path renders raw `<table>` (chosen) | 2 | `sticky` prop on ThemedThead | Clean: matches existing non-bare pattern, no shadcn changes |
| `overflow-x: clip` on wrapper | 1 | None | No scrollbar — unsuitable for wide tables |

## Sources

### Internal References
- Working pattern: `KeeperPrepDashboard.tsx:320-322` — single scroll container + sticky thead
- Working pattern: `AuctionDraftLog.tsx:92` — `bg-[var(--lg-glass-bg-hover)]` for opaque sticky bg
- Non-bare ThemedTable pattern: `ThemedTable.tsx:34,42` — renders raw `<table>` already
- FEEDBACK.md Session 33: identified as pre-auction priority

### External References
- CSS Overflow Module spec: `overflow-x/y` visible recomputation rule
- shadcn/ui Issues [#1151](https://github.com/shadcn-ui/ui/issues/1151), [#1564](https://github.com/shadcn-ui/ui/issues/1564), [#3965](https://github.com/shadcn-ui/ui/issues/3965) — sticky header fixes
- [CSS-Tricks: Dealing with overflow and position: sticky](https://css-tricks.com/dealing-with-overflow-and-position-sticky/)
- [Polypane: All the ways position:sticky can fail](https://polypane.app/blog/getting-stuck-all-the-ways-position-sticky-can-fail/)

### Research Agents
- **TypeScript Reviewer**: Flagged naming inconsistency, recommended encapsulating sticky in ThemedThead
- **Pattern Recognition Specialist**: Identified that bare path should render raw `<table>` (existing pattern in non-bare path)
- **Code Simplicity Reviewer**: Proposed `overflow-x-auto` one-liner (rejected per CSS spec constraints)
- **Architecture Strategist**: Validated blast radius analysis of 26 bare consumers; recommended incremental verification
- **Frontend Races Reviewer**: Identified mobile filter bar coordination concern and ContextDeck animation constraint
- **Best Practices Researcher**: Confirmed CSS spec limitations, documented shadcn community solutions
