---
id: DOC-011
title: "Component library"
description: "Reusable UI components — name, props, states. Populate from the code, one row per component."
type: component-lib
status: draft
phase: null
owner: james
tags: [design-system]
links: [DOC-007, ADR-015]
updated: 2026-07-23
---

# Component library

**One row per reusable component: name, props, states.** Populate from the code.

This covers only **shared** components — the ones any feature may use. Feature-local
components stay inside their feature and are deliberately *not* listed here; promoting one
into this list is the act that makes it shared (see [ADR-015](adrs/ADR-015-feature-module-boundaries.md)).

> **Design system:** Score Sheet — flat paper palette, Inter only, warm taupe / medium
> gray, outfield-green accent. Full reference: [`docs/aurora-design-system.md`](../aurora-design-system.md).
>
> The CSS class `.aurora-theme` and token prefix `--am-*` are **legacy Aurora names kept
> deliberately** to avoid touching hundreds of call sites. Don't rename without a full sweep.

---

## Design-system primitives — `client/src/components/ui/`

15 components. shadcn-style.

| Component | Props | States | Notes |
|---|---|---|---|
| `ThemedTable` | `density`, `zebra` | — | Density: compact / default / comfortable |
| `table` | `density` | — | 3-tier density, same scale as `ThemedTable` |
| `SortableHeader` | generic `<K extends string>` | sorted asc / desc / unsorted | Accessible: a real `<button>` inside `<th>`, with `aria-sort` |
| `Badge` | <!-- TODO --> | | |
| `button` | <!-- TODO --> | | |
| `card` | <!-- TODO --> | | |
| `EmptyState` | <!-- TODO --> | | |
| `Input` | <!-- TODO --> | | |
| `Logo` | <!-- TODO --> | | |
| `PageHeader` | <!-- TODO --> | | |
| `Select` | <!-- TODO --> | | |
| `separator` | <!-- TODO --> | | |
| `Skeleton` | <!-- TODO --> | | loading placeholder |
| `ToggleGroup` | <!-- TODO --> | | |
| `Tooltip` | <!-- TODO --> | | |

*(The three filled rows come from `CLAUDE.md`, not from reading each component's source.
Treat them as accurate-but-unverified; everything else is genuinely unfilled.)*

---

## Shared domain components — `client/src/components/shared/`

9 components. These are domain-aware — they know about players, teams, and rosters — which
is why they live here rather than in `ui/`.

| Component | Purpose | Props | States |
|---|---|---|---|
| `PlayerDetailModal` | Player detail incl. fielding stats (games by position). Used by teams, auction, players. | <!-- TODO --> | |
| `StatsTables` | Shared stats tables. **Promoted out of `standings`** — the reference example of the ADR-015 fix. | <!-- TODO --> | |
| `RosterAlertAccordion` | IL / minors accordion. Red for IL, amber for minors. | <!-- TODO --> | |
| `PlayerNameCell` | <!-- TODO --> | | |
| `PlayerStatsColumns` | <!-- TODO --> | | |
| `PlayerFilterBar` | <!-- TODO --> | | |
| `TeamNameLink` | <!-- TODO --> | | |
| `DataFreshness` | <!-- TODO --> | | |
| `DeadlineWarnings` | <!-- TODO --> | | |

---

## App-level components — `client/src/components/`

Not a library in the reusable sense; these are mounted once. Listed so the inventory is
complete.

`AppShell` · `Sidebar` · `BottomNav` · `ErrorBoundary` · `ErrorProvider` · `ErrorToast` ·
`ThemeToggle` · `RouteAnnouncer` · `PostHogTracker` · `GATracker` · `AdUnit` ·
`GoogleSignInButton` · `MermaidDiagram` · `TrendArrow` · `AIInsightsModal`

> `ErrorProvider` **must** wrap everything in `main.tsx` — it's the subscriber that renders
> the `ErrorToast` stack. Without it, errors reach the bus and vanish.

---

## Rules for this library

**1. CSS ships in the same commit as the JSX.** Never write a `className` — or an inline
`animation: "<name>"` reference — without landing the matching CSS rule alongside it.
jsdom cannot catch a missing CSS rule, so tests pass and the UI silently breaks. This has
happened: the FA panel zero-row bug in PR #252.

**2. Promote deliberately, not reflexively.** Two similar small components in two features
are cheaper than one shared component that fits neither. `StatsTables` was promoted because
three features genuinely needed the same table — that's the bar.

**3. Domain-aware goes in `shared/`, domain-free goes in `ui/`.** If it knows what a player
is, it isn't a primitive.

**4. Browser verification is mandatory.** Any change here touches multiple features at once.

<!-- TODO(james): filling the props/states columns is a real afternoon of reading component
     source, not a footnote. It's also the single highest-value thing in this file — an
     unfilled component table is just a directory listing with extra steps. Worth doing
     for `ui/` first, since those are the ones you'd reach for when building something new. -->
