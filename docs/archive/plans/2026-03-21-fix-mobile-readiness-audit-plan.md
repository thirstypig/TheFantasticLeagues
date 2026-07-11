---
title: "fix: Mobile readiness audit — auction-first, full app, Activity sticky headers"
type: fix
status: completed
date: 2026-03-21
deepened: 2026-03-21
---

# fix: Mobile readiness — Activity sticky headers, auction viewport, touch targets

## Enhancement Summary

**Deepened on:** 2026-03-21
**Research agents used:** Activity Page Structure Explorer, Auction Mobile Layout Explorer, Code Simplicity Reviewer, Sticky Learning Applicator

### Key Improvements from Research
1. **Applied compound learning** — Activity page has 2 of 3 documented sticky blockers (unconstrained height, overflow-hidden on lg-card). Must fix these before adding `<ThemedThead sticky>`.
2. **Scope reduced 7→3** — dropped viewport-fit=cover (YAGNI, no PWA users), mobile table density (contradicts age-friendly work), full audit (separate QA task).
3. **Auction bid controls already adequate** — h-14 (56px) bid buttons are fine. Pass/AI buttons at py-1.5 need bumping.
4. **ContextDeck tabs are cramped** — text-[10px] with px-2.5 py-2 on 5 tabs is hard to tap on 390px.

### Scope Reduction
| Dropped | Reason |
|---------|--------|
| Priority 3: viewport-fit=cover + safe-area | YAGNI — no PWA standalone users, Safari handles safe areas |
| Priority 6: mobile table density (smaller font/padding) | Contradicts the age-friendly 15px/py-3 work we just shipped |
| Priority 7: full app audit checklist | Discovery task, not implementation — do as separate QA pass |

---

## Overview

Three focused changes for mobile readiness before draft day: Activity page sticky headers, auction iOS viewport fix, and touch target improvements.

## What Already Works

- Hamburger menu with slide-out sidebar drawer (AppShell.tsx)
- Responsive padding: `px-4 py-6 md:px-6 md:py-10` across all pages
- Filter grids: `grid grid-cols-2 md:flex` on Players and AddDrop
- `overflow-x-auto` on all tables for horizontal scroll
- Auction bid buttons: `h-14` (56px) — adequate touch targets
- Auction layout stacks to `flex-col` on mobile, `md:flex-row` on desktop
- Nomination panel usable at 390px (headshot 80px + info flex-1)

---

## Change 1: Activity Page Sticky Headers

### Problem

The Activity page tables do NOT have sticky headers. The `<ThemedThead>` on both the History tab (TransactionsPage.tsx:241) and Add/Drop tab (AddDropTab.tsx:264) are missing the `sticky` prop.

**But simply adding `sticky` would silently fail** — the compound learning (`docs/solutions/ui-bugs/css-sticky-fails-nested-overflow-containers.md`) identified these blockers:

| Blocker | TransactionsPage | AddDropTab |
|---------|-----------------|------------|
| Unconstrained viewport height | PRESENT — no height constraint on outer div (line 127) | PRESENT — embedded, no height constraint |
| `overflow-hidden` on lg-card | PRESENT — line 238 | Not present |
| Intermediate `overflow-x-auto` | PRESENT — line 239 | PRESENT — line 262 |
| Shadcn Table wrapper | AVOIDED — uses `ThemedTable bare` | AVOIDED — uses `ThemedTable bare` |

### Fix (same pattern as Players page)

**File:** `client/src/features/transactions/pages/TransactionsPage.tsx`

1. **Constrain page to viewport height**: Outer div → `h-[100svh] flex flex-col overflow-hidden`
2. **Tab bar stays above scroll area** (always visible, like Players filter bar)
3. **Each tab's content wraps in `flex-1 overflow-auto`** — the single scroll container
4. **Remove `overflow-hidden` from `lg-card`** wrappers (lines 238, 181)
5. **Remove intermediate `overflow-x-auto`** divs — the outer scroll container handles both axes
6. **Add `<ThemedThead sticky>`** to the History table (line 241)

**File:** `client/src/features/roster/components/AddDropTab.tsx`

1. **Remove intermediate `overflow-x-auto`** div (line 262)
2. **Add `<ThemedThead sticky>`** (line 264)
3. The parent `flex-1 overflow-auto` from TransactionsPage provides the scroll container

**File:** `client/src/features/transactions/components/ActivityHistoryTab.tsx`

1. Same pattern if this component is used — remove `overflow-hidden` from lg-card, remove `overflow-x-auto`, add `<ThemedThead sticky>`

---

## Change 2: Auction iOS Viewport Height

### Problem

`AuctionLayout.tsx:27` uses `h-[calc(100vh-64px)]`. On iOS Safari, `100vh` equals the *large* viewport (address bar hidden), causing content to be clipped when the address bar is visible on page load.

### Fix

**File:** `client/src/features/auction/components/AuctionLayout.tsx`

```tsx
// BEFORE (line 27):
<div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden ...">

// AFTER:
<div className="flex flex-col h-[calc(100svh-64px)] overflow-hidden ...">
```

**File:** `client/src/features/players/pages/Players.tsx`

```tsx
// BEFORE (line 168):
<div className="h-[100dvh] flex flex-col overflow-hidden scrollbar-hide">

// AFTER (svh is stable, dvh recalculates on toolbar resize):
<div className="h-[100svh] flex flex-col overflow-hidden scrollbar-hide">
```

**Also update** any other `100vh` references in `index.css`:
- `min-height: 100vh` on body → `min-height: 100svh`
- Auth container → `min-height: 100svh`

---

## Change 3: Touch Target Improvements

### Problem

Several interactive elements are below 44px minimum for 40+ users:

| Element | File:Line | Current | Size |
|---------|-----------|---------|------|
| Sidebar nav items | index.css:413 | `padding: 5px 8px` | ~30px |
| Auction Pass button | AuctionStage.tsx:290 | `py-1.5` | ~26px |
| Auction AI button | AuctionStage.tsx:290 | `py-1.5` | ~26px |
| ContextDeck tabs | ContextDeck.tsx:32 | `px-2.5 py-2 text-[10px]` | cramped |
| Theme toggle | AppShell.tsx:224 | `p-1.5` | ~26px |
| Mute button | AuctionLayout.tsx | `p-1` | ~22px |

### Fix

**Sidebar items** (index.css):
```css
/* BEFORE */
.lg-sidebar-item { padding: 5px 8px; }

/* AFTER */
.lg-sidebar-item { padding: 10px 12px; }
```

**Auction Pass/AI buttons** (AuctionStage.tsx):
- Increase from `py-1.5` to `py-2.5` for 44px+ height

**ContextDeck tabs** (ContextDeck.tsx):
- Increase from `text-[10px] px-2.5 py-2` to `text-[11px] px-3 py-2.5`

**Icon buttons** (AppShell.tsx, AuctionLayout.tsx):
- Theme toggle, mute button: `p-1.5` → `p-2.5`

---

## Acceptance Criteria

### Must Fix
- [x] Activity page: Add/Drop table has sticky headers that work when scrolling
- [x] Activity page: History table has sticky headers that work when scrolling
- [x] Activity page: viewport height constrained (scroll container actually scrolls)
- [x] Activity page: no `overflow-hidden` on lg-card wrappers trapping sticky
- [x] Auction page: `100vh` → `100svh` for iOS Safari
- [x] Players page: `100dvh` → `100svh` for consistency

### Strongly Recommended
- [x] Sidebar nav items: padding increased to 10px 12px
- [x] Auction Pass/AI buttons: py-2.5 (44px+ touch targets)
- [x] ContextDeck tabs: increased size for tappability
- [x] Icon buttons (theme toggle, mute): p-2.5

### Verification
- [x] All 187 client tests pass
- [x] Visual: Activity page at 390px with sticky headers (Playwright screenshot)
- [ ] Visual: Auction page at 390px — bid controls, timer, player pool
- [x] Visual: Players page at 390px — sticky headers, filter wrapping
- [x] TypeScript compiles cleanly

## Files to Modify

| File | Changes |
|------|---------|
| `client/src/features/transactions/pages/TransactionsPage.tsx` | Viewport height constraint, remove overflow-hidden/overflow-x-auto, add `<ThemedThead sticky>` |
| `client/src/features/roster/components/AddDropTab.tsx` | Remove overflow-x-auto, add `<ThemedThead sticky>` |
| `client/src/features/transactions/components/ActivityHistoryTab.tsx` | Remove overflow-hidden/overflow-x-auto, add `<ThemedThead sticky>` |
| `client/src/features/auction/components/AuctionLayout.tsx` | `100vh` → `100svh` |
| `client/src/features/players/pages/Players.tsx` | `100dvh` → `100svh` |
| `client/src/index.css` | Sidebar item padding, body min-height to svh |
| `client/src/features/auction/components/AuctionStage.tsx` | Pass/AI button padding |
| `client/src/features/auction/components/ContextDeck.tsx` | Tab size increase |
| `client/src/components/AppShell.tsx` | Icon button padding |

## Sources

### Institutional Learning
- `docs/solutions/ui-bugs/css-sticky-fails-nested-overflow-containers.md` — 3 blockers for position:sticky, prevention checklist verified against Activity page files

### External
- [WCAG 2.2 SC 2.5.8: Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- [Dynamic Viewport Height (svh/dvh)](https://www.frontend.fyi/tutorials/finally-a-fix-for-100vh-on-mobile)
- svh = stable (uses small viewport), dvh = recalculates on toolbar resize
