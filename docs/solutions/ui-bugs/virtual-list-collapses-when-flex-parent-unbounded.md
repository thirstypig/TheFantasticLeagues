---
title: "Virtualized list paints zero rows when its flex parent has no constrained height"
category: ui-bugs
tags:
  - css
  - flexbox
  - tanstack-virtual
  - react-virtual
  - virtualizer
  - layout
  - min-height
  - 0-height-trap
  - aside
  - side-panel
module: client/src/features/teams/components/RosterHub/FreeAgentPanel
symptom: "FA panel search 'isn't working' — typing in the input does nothing. Panel itself is mounted; data fetch returns 2,311 rows; virtualizer's content spacer is 129,416 px tall — but the scroll viewport renders zero rows."
root_cause: >
  The panel's scroll viewport used `flex: 1; minHeight: 0` and counted on its
  parent <aside> to provide a bounded height for the flex child to fill. The
  <aside> had `className="fa-panel"` and an inline `display: flex; flexDirection:
  column` — but the matching `.fa-panel` CSS rules and `@keyframes fa-slide-in`
  declarations were never landed. Without a height-constrained parent, the
  flex child collapses to 0 px even though its inner virtualizer spacer
  correctly computes `getTotalSize() = 2311 × 56 ≈ 129,416 px`. With a
  zero-height viewport, `useVirtualizer.getVirtualItems()` returns `[]` (no
  rows are visible), so React renders nothing under the spacer. Search input
  state and filter logic were both fine — they just had nothing to filter
  into a viewport.
related:
  - css-sticky-fails-nested-overflow-containers.md
  - overflow-hidden-blocks-child-horizontal-scroll.md
prs:
  - 219 # FA panel virtualization landed (`@tanstack/react-virtual` wired)
  - 252 # this fix — `.fa-panel` CSS rules + side-panel/bottom-sheet docking
---

# Virtualized list paints zero rows when its flex parent has no constrained height

## Problem

User report: **"the FA search isn't working."** Typing into the panel's search input did nothing. No console errors. The panel was visible (header, search input, position chips all rendered fine), but no FA rows appeared and no "0 results" message either — just blank space below the chips.

## Symptoms

- FA panel `<aside>` exists in the DOM and is positioned in flow.
- Search input is focusable and accepts keystrokes (the React state updates correctly).
- Network tab shows `GET /api/player-season-stats?leagueId=20` returning **2,311 free agents** with the expected shape.
- React DevTools shows the `FreeAgentPanel` component's `data` state populated and `filtered` memo computing correctly.
- Zero console errors. Zero red flags anywhere except… no rows render.
- Bug appears identical at desktop (1440 px) and mobile (390 px).

## Root cause

**CSS layout, not behavior.** `useVirtualizer` only renders rows that fit (or just-overscan) within the **scroll viewport's own height**. If the viewport collapses to 0 px, `getVirtualItems()` returns an empty array — even when the spacer (the inner div whose height equals total list height) is correctly sized.

The panel's structure was:

```tsx
<aside className="fa-panel" style={{ display: "flex", flexDirection: "column" }}>
  <header>Free agents …</header>
  <input type="search" … />
  <div /* chips */ … />
  <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
    <div style={{ height: rowVirtualizer.getTotalSize() }}> {/* 129,416 px */}
      {rowVirtualizer.getVirtualItems().map(/* … */)}     {/* renders 0 rows */}
    </div>
  </div>
</aside>
```

`flex: 1; minHeight: 0` is the standard pattern for "child of a flex column, take the remaining height of the parent." It works **only if the parent has a constrained height**. If the parent is `height: auto` (its natural size), the flex child collapses to 0 px because there's no "remaining" to allocate.

The author intended `.fa-panel` to anchor the panel as a side dock with `position: fixed` and a viewport-bounded height. They wrote `className="fa-panel"`, the inline `animation: "fa-slide-in 200ms ease-out"`, and a comment block explaining "side panel ≥768px, bottom sheet <768px." But **the matching CSS rules and `@keyframes` were never landed.** No `.fa-panel { … }` block existed anywhere in the codebase.

DOM trace at the time of the bug, walking up from the scroll viewport:

| Element | computed height |
|---|---|
| `[data-fa-scroll]` | **0 px** ← the trap |
| `aside.fa-panel` | 174 px (header + search + chips, no room for body) |
| Parent div | 2543 px (display: block, doesn't constrain children) |
| Grand-parent div | 2892 px (display: grid, doesn't stretch the aside) |

The scroll viewport's spacer was 129,416 px tall — the data was fully loaded — but the viewport was zero, so the virtualizer painted nothing.

## Why standard tests missed it

This bug is invisible to **jsdom-based unit tests**. jsdom does not compute layout: every element reports `getBoundingClientRect()` as `{ width: 0, height: 0 }`. The 16 existing FA panel tests passed (mounting works, props plumb through, search filter logic is correct, virtualizer mocks return the expected items) precisely **because they don't exercise the broken path**.

## The fix

Land the missing `.fa-panel` CSS rules in `client/src/features/teams/components/RosterHub/rosterHub.css`:

```css
.fa-panel {
  position: fixed;
  z-index: 50;
  box-shadow: 0 12px 40px -8px rgba(0, 0, 0, 0.55);
}

@media (min-width: 768px) {
  .fa-panel {
    /* Side-dock on desktop. Top offset clears the Aurora header (~72px)
       plus a small breathing gap; max-height caps it on tall screens. */
    top: 96px;
    right: 16px;
    bottom: 16px;
    width: 380px;
    max-height: calc(100dvh - 112px);
    animation: fa-slide-in-side 200ms ease-out;
  }
}

@media (max-width: 767px) {
  .fa-panel {
    /* Bottom sheet on mobile. 75dvh keeps a peek of the roster behind
       so users see drag context. */
    left: 0;
    right: 0;
    bottom: 0;
    height: 75dvh;
    border-radius: 18px 18px 0 0;
    animation: fa-slide-in-bottom 200ms ease-out;
  }
}

@keyframes fa-slide-in-side {
  from { transform: translateX(110%); opacity: 0; }
  to   { transform: translateX(0);    opacity: 1; }
}

@keyframes fa-slide-in-bottom {
  from { transform: translateY(100%); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
}
```

After the fix, post-flight DOM trace:

| Element | computed height |
|---|---|
| `[data-fa-scroll]` | **588 px** |
| `aside.fa-panel` | 788 px (top: 96, bottom: 16, viewport: 900) |
| All ancestors | irrelevant — `position: fixed` lifts the aside out of the flow |

The virtualizer correctly renders ~17 rows at 1440×900, ~14 at 390×844.

## Prevention

### 1. When using `flex: 1; minHeight: 0`, lock down the parent's height in the same commit

Any time you write `flex: 1` (especially with `minHeight: 0` to enable internal scroll), the parent must have a height constraint:

- `position: fixed` with `top` + `bottom` (or `top` + `height`) — the case here.
- `position: absolute` with the same.
- A grandparent flex container that allocates a fixed-size area to this parent.
- An explicit `height: <value>` or `max-height: <value>` on the parent.

Without one of those, the flex child collapses to 0 px and *appears* to render nothing while internal logic runs fine.

### 2. Don't write a className without writing its CSS in the same commit

The original author left `className="fa-panel"` as a hook for CSS that was supposed to land later. It never did, and no test caught it because jsdom doesn't compute layout. **A class hook without rules is a layout bug waiting to happen.** Either land both together, or don't add the class until you write the rules.

### 3. When a virtualized list "renders nothing," check the *container* before the *data*

Diagnostic order for an empty virtualized list:

1. **`scrollRef.current.getBoundingClientRect().height` > 0?** If 0, the parent never gave it height. Fix the parent. (This is the most common cause.)
2. **`rowVirtualizer.getTotalSize()` > 0?** If 0, the data array is empty (or `count` is wrong). Check the upstream fetch.
3. **`rowVirtualizer.getVirtualItems().length` > 0?** If 0 even though the viewport has height and `getTotalSize()` is large, your `estimateSize` may be returning 0 or `Infinity`.

Order matters: 1 → 2 → 3. The bug here was step 1; everything downstream was correct.

### 4. Browser verification on layout-sensitive UI is non-negotiable

Per memory `feedback_partial_browser_verification.md`, this was a partial-verification trap: the unit tests pass, the data flows correctly, even the React state is right — but real-browser layout reveals a 0-height container. Always open the actual feature in a browser before declaring it done.

### 5. Optional: add a Playwright assertion that locks down panel layout

If this regresses again, the cheapest detection is a single E2E test:

```ts
test("FA panel renders rows when opened", async ({ page }) => {
  await page.goto("/teams/LDY");
  await page.click('button:has-text("+ Add free agent")');
  const panel = page.locator('[aria-label="Free agent panel"]');
  await expect(panel).toHaveCSS("position", "fixed");
  const rows = panel.locator('[data-fa-scroll] > div > div');
  await expect(rows.first()).toBeVisible();
});
```

Adopting Playwright in CI is a meaningful infra commitment; the test above is the smallest possible catch for this exact regression class.

## Related

- `css-sticky-fails-nested-overflow-containers.md` — Same family: a CSS layout context (sticky / flex / overflow) silently fails because an ancestor doesn't satisfy the spec's preconditions.
- `overflow-hidden-blocks-child-horizontal-scroll.md` — Sibling pattern: an intermediate ancestor blocks the descendant's intended layout behavior.

## Origin

Surfaced 2026-05-06 during browser verification of the Roster Hub save-flow on `/teams/LDY`. PM reported "FA search isn't working." Diagnosed in ~10 minutes via Playwright-driven dev-login + DOM ancestor walk. Fixed in PR #252.
