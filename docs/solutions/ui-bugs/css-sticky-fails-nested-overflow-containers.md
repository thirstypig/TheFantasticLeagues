---
title: "CSS position:sticky fails in nested overflow containers"
category: ui-bugs
tags:
  - css
  - position-sticky
  - overflow
  - tailwind
  - shadcn
  - table
  - performance
  - ios-safari
  - gpu-compositing
  - backdrop-filter
module: components/ui/ThemedTable
symptom: "Table column headers disappear when scrolling — sticky positioning does not work"
root_cause: >
  Multiple nested overflow containers trap position:sticky. shadcn Table wraps
  every <table> in <div class="overflow-auto">, creating an intermediate scroll
  context. The Players page stacked THREE nested overflow containers
  (flex-1 overflow-auto, overflow-x-auto, Table's overflow-auto). The outer div
  used h-full which resolved to content height (52877px) rather than viewport
  height, so the flex-1 overflow-auto container never actually scrolled.
  Additionally, the lg-card wrapper had overflow-hidden which creates a scroll
  context per CSS spec. Secondary issue: backdrop-blur-xl on sticky headers
  caused continuous GPU recompositing (20-30 FPS on iOS Safari).
date: 2026-03-21
severity: high
time_to_resolve: multi-hour
---

# CSS position:sticky fails in nested overflow containers

## Root Cause

`position: sticky` on a table `<thead>` silently fails when any ancestor between the sticky element and the intended scroll container creates its own scroll context. Three independent blockers were discovered:

### Blocker 1: Shadcn Table overflow wrapper

The shadcn `<Table>` component (`client/src/components/ui/table.tsx`) wraps every `<table>` in `<div class="relative w-full overflow-auto">`. Per the CSS spec, `overflow: auto` establishes a new scroll context. The sticky `<thead>` binds to this inner div, but since the div has no height constraint, it grows to the full height of the table content and never scrolls. The actual scrolling happens on an outer ancestor — which the sticky element cannot reach.

### Blocker 2: Unconstrained viewport height

The Players page used `h-full` on its outer div. `h-full` resolves to `100%` of the parent's height, but no ancestor in the chain constrained height — `AppShell` uses `min-h-screen` (not `h-screen`), so the percentage resolves to the full content height (e.g., 52,877px). The `flex-1 overflow-auto` container therefore never actually scrolled; it was already tall enough to hold all content.

### Blocker 3: `overflow-hidden` on card wrapper

The `lg-card` wrapper had `overflow-hidden`, which per the CSS Overflow Module specification creates a scroll context (identical to `overflow: auto` for sticky containment purposes), trapping the sticky element within the card boundary.

### Additional Finding

`overflow-x: auto; overflow-y: visible` does **not** work as a workaround. Per the CSS Overflow Module spec, when one axis is set to a non-`visible` value, the browser recomputes the other axis from `visible` to `auto`. You cannot have mixed overflow behaviors on a single element. The only exception is `overflow: clip`, which does not trigger this recomputation but provides no scrollbar.

---

## Investigation Steps

1. Applied `position: sticky; top: 0; z-index: 10` to `<thead>` — no visible effect.
2. Inspected computed styles in DevTools: sticky was being applied but the element never moved.
3. Used JavaScript to walk the DOM ancestor chain from `<thead>` upward, checking each node for `overflow` values other than `visible`. Found the scroll container had `scrollHeight === clientHeight` (never scrolled).
4. Found three ancestors with non-visible overflow: the shadcn table wrapper div (`overflow-auto`), the card wrapper (`overflow-hidden`), and the page container (unconstrained height making `overflow-auto` irrelevant).
5. Verified each blocker independently — removing any single one was insufficient; all three had to be resolved together.
6. Tested the `overflow-x: auto; overflow-y: visible` trick and confirmed the browser rewrites `overflow-y` to `auto`, per spec.
7. Checked performance of `backdrop-blur-xl` on the sticky header — found continuous GPU recompositing at 20-30 FPS on iOS Safari during momentum scrolling.

---

## Solution

### 1. ThemedTable: bypass the shadcn wrapper

The `bare` path in `ThemedTable` now renders a raw `<table>` element instead of delegating to shadcn's `<Table>`, which added the `overflow-auto` wrapper:

```tsx
// BEFORE: delegated to shadcn <Table> which adds overflow wrapper
<Table className={className}>{children}</Table>

// AFTER: raw <table> element, no wrapper
<table className={cn("w-full caption-bottom text-sm", className)}>
  {children}
</table>
```

The shadcn sub-components (`TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`) are stateless HTML wrappers with no dependency on the parent `<Table>` component — no React context, no DOM coupling. So bypassing `<Table>` is safe.

### 2. Players page: constrain viewport height and remove overflow blockers

```tsx
// Outer div: h-full → h-[100dvh] overflow-hidden
// Forces the inner flex child to have a real height constraint.
<div className="h-[100dvh] flex flex-col overflow-hidden scrollbar-hide">

// Filter bar: removed sticky (always visible above scroll area now)
<div className="max-w-6xl mx-auto px-4 py-4 md:px-6">

// lg-card: removed overflow-hidden
<div className="lg-card p-0 bg-transparent ...">

// Removed intermediate overflow-x-auto div entirely
// The outer flex-1 overflow-auto handles both axes.
```

### 3. ThemedThead: `sticky` prop with opaque background

```tsx
interface ThemedTheadProps {
  children: React.ReactNode;
  className?: string;
  sticky?: boolean;
}

export function ThemedThead({ children, className = '', sticky = false }: ThemedTheadProps) {
  return (
    <TableHeader
      className={cn(
        sticky && 'sticky top-0 z-10 bg-[var(--lg-table-header-sticky-bg)] border-b border-[var(--lg-border-subtle)]',
        className
      )}
    >
      {children}
    </TableHeader>
  );
}
```

Usage: `<ThemedThead sticky>` — opaque background token `--lg-table-header-sticky-bg` (#e8ecf2 light / #1c2638 dark) prevents content bleed-through. `border-bottom` provides visual separation (matches GitHub/Notion pattern).

### 4. Replaced backdrop-blur with opaque background

`backdrop-blur-xl` (24px Gaussian blur) caused continuous GPU recompositing on every scroll frame. On mid-range devices: 30-45 FPS. On iOS Safari: 20-30 FPS during momentum scrolling. No production app (GitHub, Linear, Notion, Figma, Bloomberg) uses backdrop-blur on sticky table headers — they all use opaque backgrounds.

```tsx
// BEFORE — GPU-expensive blur
sticky && 'sticky top-0 z-10 bg-[var(--lg-glass-bg-hover)] backdrop-blur-xl'

// AFTER — zero per-frame GPU cost
sticky && 'sticky top-0 z-10 bg-[var(--lg-table-header-sticky-bg)] border-b border-[var(--lg-border-subtle)]'
```

---

## Key Learnings

1. **Sticky requires an unbroken overflow chain.** Every ancestor between the sticky element and the intended scroll container must have `overflow: visible` (the default). A single `overflow: auto`, `overflow: hidden`, or `overflow: scroll` on any intermediate element traps the sticky element.

2. **Height must be constrained.** `overflow: auto` on a container only produces scrolling if the container has a height smaller than its content. `h-full` without a constrained ancestor means the container grows to fit content. Use `h-screen`, `h-[100dvh]`, or a flex layout with a height-constrained parent.

3. **`overflow-hidden` is equivalent to `overflow-auto` for sticky purposes.** Both create a scroll context per the CSS spec. If a card needs clipping, use `overflow: clip` instead — it clips without creating a scroll context.

4. **You cannot mix overflow axes.** `overflow-x: auto; overflow-y: visible` does not preserve visible on the y-axis. The spec recomputes `visible` to `auto` when the other axis is non-visible.

5. **Shadcn's Table component is hostile to sticky headers by design.** Its `overflow-auto` wrapper exists for horizontal scroll on narrow viewports, but it makes `position: sticky` on `<thead>` impossible. Bypass the wrapper and handle horizontal overflow at a higher level.

6. **Never use `backdrop-filter` on sticky elements inside scrollable containers.** The blur must be recalculated every frame because the content behind changes during scroll. Use opaque backgrounds instead — zero compositing cost.

---

## Prevention Strategies

### Code Review Checklist for Sticky Positioning

Before adding `position: sticky` to any element:

- [ ] Walk every ancestor from the sticky element to the scroll container — confirm all have `overflow: visible`
- [ ] Verify the scroll container has a **constrained height** (not growing with content)
- [ ] Inspect third-party component wrappers (shadcn, Radix, Headless UI) for hidden overflow properties
- [ ] Confirm the sticky element has an explicit edge offset (`top: 0`, etc.)
- [ ] Check that the sticky element's background is opaque (not transparent/semi-transparent)

### CSS Rules That Break Sticky

On any ancestor between the sticky element and the scroll container:

| Breaks sticky | Safe |
|--------------|------|
| `overflow: auto` | `overflow: visible` (default) |
| `overflow: scroll` | `overflow: clip` (clips without scroll context) |
| `overflow: hidden` | |
| `overflow-x: hidden` (one axis is enough) | |
| `contain: paint` | |

### Component Design Rule

Table components must NEVER set overflow on their own wrapper. Overflow responsibility belongs to the consumer, who wraps the table in a single scroll container. Document this contract with a comment.

### Performance Rule

Do not use `backdrop-filter` (e.g., `backdrop-blur`) on sticky elements inside scrollable containers. The blur shader runs every frame during scroll. Use opaque backgrounds — zero per-frame GPU cost.

### Testing Approach

CSS `position: sticky` cannot be verified with unit tests (JSDOM has no layout engine). Use Playwright/Cypress E2E tests:

```typescript
test('table header stays visible when scrolled', async ({ page }) => {
  await page.goto('/players');
  const header = page.locator('thead');
  const scrollContainer = page.locator('.overflow-auto');

  const beforeScroll = await header.boundingBox();
  await scrollContainer.evaluate(el => el.scrollTop = 500);
  await page.waitForTimeout(50);
  const afterScroll = await header.boundingBox();

  // Header should still be near the top (sticky working)
  expect(afterScroll!.y).toBeLessThan(beforeScroll!.y + 5);
});
```

---

## Related Documentation

### Internal
- Plan: `docs/archive/plans/2026-03-21-fix-sticky-table-headers-plan.md`
- Plan: `docs/archive/plans/2026-03-21-fix-color-accessibility-age-friendly-plan.md`
- FEEDBACK.md: Session 34 (2026-03-21)
- Working reference: `KeeperPrepDashboard.tsx:320-322` (raw `<table>` + single scroll container)

### External
- [shadcn/ui #1151](https://github.com/shadcn-ui/ui/issues/1151), [#1564](https://github.com/shadcn-ui/ui/issues/1564), [#3965](https://github.com/shadcn-ui/ui/issues/3965) — sticky header issues
- [CSS-Tricks: Dealing with overflow and position: sticky](https://css-tricks.com/dealing-with-overflow-and-position-sticky/)
- [Polypane: All the ways position:sticky can fail](https://polypane.app/blog/getting-stuck-all-the-ways-position-sticky-can-fail/)
- [CSS Overflow Module spec](https://www.w3.org/TR/css-overflow-3/) — overflow axis recomputation rule

### Key Source Files
| File | Role |
|------|------|
| `client/src/components/ui/ThemedTable.tsx` | Sticky behavior (`sticky` prop on `ThemedThead`) |
| `client/src/components/ui/table.tsx:16` | shadcn primitive with the `overflow-auto` wrapper (root cause) |
| `client/src/index.css` | `--lg-table-header-sticky-bg` token, `.lg-table thead` styles |
| `client/src/features/players/pages/Players.tsx` | Viewport-constrained layout fix |
