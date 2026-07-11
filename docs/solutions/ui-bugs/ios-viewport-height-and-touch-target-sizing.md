---
title: "iOS Safari 100vh content clipping and mobile touch target accessibility"
category: ui-bugs
tags:
  - ios-safari
  - viewport-units
  - 100vh
  - 100svh
  - 100dvh
  - touch-targets
  - wcag
  - accessibility
  - tailwind
  - mobile
module: global
symptom: "Content clipped behind iOS Safari address bar on page load; interactive elements too small to tap reliably on mobile"
root_cause: "CSS 100vh on iOS Safari equals the large viewport height (address bar hidden), not the visible viewport; touch targets below 44px WCAG minimum"
date: 2026-03-21
severity: high
---

# iOS Safari 100vh content clipping and mobile touch target accessibility

## Root Cause

Two distinct but related mobile issues:

### 1. Viewport height mismatch on iOS Safari

CSS `100vh` on iOS Safari does not mean "the visible viewport." It equals the *large viewport height* — the height when the address bar is fully hidden. On initial page load (address bar visible), content sized to `100vh` extends ~85px below the visible area, clipping bottom content and interactive elements.

`100dvh` (dynamic viewport height) technically tracks the visible area, but it recalculates on every animation frame as the iOS toolbar slides in/out during scrolling, causing layout jitter and forced reflows.

`100svh` (small viewport height) equals the viewport when the address bar is fully visible — the smallest the viewport will ever be. This is stable and guarantees content is never clipped.

### 2. Touch targets below accessibility minimums

Several interactive elements had effective touch areas below the 44x44px minimum recommended by WCAG 2.2 Success Criterion 2.5.8. On mobile devices, small targets cause missed taps, accidental adjacent-element activation, and frustration — especially for users 40+ with reduced fine motor precision.

---

## Investigation Steps

1. AuctionLayout used `h-[calc(100vh-64px)]` — worked on desktop Chrome but bottom content was clipped on iOS Safari.
2. Players page used `h-[100dvh]` — worked but caused layout jitter when the iOS toolbar animated.
3. Searched for all `100vh` and `100dvh` references across the codebase — found 5 instances.
4. Tested `100svh` — stable on all platforms, content never clipped.
5. Audited touch targets at 390px viewport — sidebar items (30px), auction buttons (26px), tabs (24px) all below 44px minimum.

---

## Solution

### Viewport units — replace all `100vh` and `100dvh` with `100svh`

```tsx
// AuctionLayout.tsx
// BEFORE:
<div className="h-[calc(100vh-64px)]">
// AFTER:
<div className="h-[calc(100svh-64px)]">

// Players.tsx
// BEFORE:
<div className="h-[100dvh]">
// AFTER:
<div className="h-[100svh]">
```

```css
/* index.css body */
/* BEFORE */
body { min-height: 100vh; }
/* AFTER */
body { min-height: 100svh; }
```

### Touch targets — increase padding to meet 44px minimums

| Element | Before | After | Result |
|---------|--------|-------|--------|
| Sidebar nav items | `padding: 5px 8px; font-size: 13px` | `padding: 10px 12px; font-size: 14px` | ~44px height |
| Auction Pass/AI buttons | `py-1.5` (6px) | `py-2.5` (10px) | ~44px height |
| ContextDeck tabs | `text-[10px] px-2.5 py-2` | `text-[11px] px-3 py-2.5` | ~44px height |
| AppShell icon buttons | `p-1.5` (6px + 16px icon) | `p-2.5` (10px + 16px icon) | ~44px total |

---

## Key Learnings

1. **`100svh` is the correct default for constrained layouts on mobile.** It represents the smallest viewport the user will see, so content is never clipped. The tradeoff — a small gap when the toolbar hides — is vastly preferable to clipped content.

2. **`100vh` is broken on iOS Safari and has been since 2015.** Apple intentionally made `100vh` equal the large viewport to avoid content reflowing when the toolbar hides. This will not change.

3. **`100dvh` is rarely what you want for layout.** It is useful for full-screen overlays that must track the exact visible area in real time, but the continuous recalculation causes layout thrash for normal page content.

4. **The viewport unit hierarchy:**
   - `100svh` — stable, safe default (address bar visible)
   - `100lvh` — equivalent to iOS Safari's `100vh` (address bar hidden)
   - `100dvh` — animates between svh and lvh in real time (use sparingly)
   - `100vh` — avoid on mobile; behavior varies by browser

5. **44px is the floor, not the target.** Apple HIG recommends 44pt minimum, WCAG 2.2 specifies 24x24 CSS px minimum with 44x44 recommended. For 40+ users, bigger is always better.

6. **Padding is preferable to fixed height for touch targets.** Using generous padding rather than `h-11` or `min-h-[44px]` keeps the element responsive to content size while ensuring the tappable area is large enough.

---

## Prevention

### Grep check for viewport unit misuse

```bash
grep -rn '100vh\|100dvh' client/src/ --include='*.tsx' --include='*.css'
```

Any `100vh` or `100dvh` outside of full-screen overlay contexts should be flagged and replaced with `100svh`.

### Touch target audit checklist

Before shipping mobile-facing UI:
- [ ] All buttons: minimum 44px effective height
- [ ] All icon buttons: `p-2.5` or larger (10px padding + icon size ≥ 44px)
- [ ] All nav items: `padding: 10px 12px` or larger
- [ ] Tab bar items: minimum `py-2.5 px-3` with `text-[11px]` or larger
- [ ] Verify on a real iOS device (simulators don't reproduce toolbar behavior)

### Consider a design token

```css
:root { --app-vh: 100svh; }
```

Reference `var(--app-vh)` in layouts so viewport unit changes only need to happen in one place.

---

## Related Documentation

### Internal
- `docs/solutions/ui-bugs/css-sticky-fails-nested-overflow-containers.md` — closely related; references `h-[100dvh]` as part of the sticky fix, covers iOS Safari GPU compositing
- `docs/archive/plans/2026-03-21-fix-mobile-readiness-audit-plan.md` — the plan that drove this fix
- `docs/archive/plans/2026-03-21-fix-color-accessibility-age-friendly-plan.md` — companion WCAG compliance work (color contrast)
- FEEDBACK.md Session 34: documents completed mobile readiness PR #77

### External
- [WCAG 2.2 SC 2.5.8: Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- [Frontend.fyi: Fix for 100vh on mobile](https://www.frontend.fyi/tutorials/finally-a-fix-for-100vh-on-mobile)
- [Apple HIG: Touch targets](https://developer.apple.com/design/human-interface-guidelines/accessibility#Touch-targets)

### Key Source Files
| File | Role |
|------|------|
| `client/src/index.css:283,599` | `min-height: 100svh` on body and auth container |
| `client/src/features/auction/components/AuctionLayout.tsx:27` | `h-[calc(100svh-64px)]` |
| `client/src/features/players/pages/Players.tsx:168` | `h-[100svh]` |
| `client/src/features/transactions/pages/TransactionsPage.tsx:127` | `h-[100svh]` |
| `client/src/components/AppShell.tsx:224,232` | Icon button padding `p-2.5` |
