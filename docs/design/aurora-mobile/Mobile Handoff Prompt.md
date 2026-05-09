# Aurora Mobile — Implementation Prompt for Claude Code

Paste this as the opening message in a fresh Claude Code session inside the
`TheFantasticLeagues` repo. The mobile design lives in the sibling sandbox
project (`Aurora Mobile.html` + `mobile-aurora-*.jsx`); link or copy those
files into the repo as reference assets before running this prompt.

---

## Context

The desktop Aurora theme is **shipped and working** — do not touch it.
We're adding a **mobile-optimized layout** that renders for narrow viewports
only, keeps **100% feature parity** with the desktop pages, and reuses every
existing data hook, API call, route, and context provider unchanged.

Reference designs (read these first, then mirror them):
- `Aurora Mobile.html` — canvas of all six mobile screens (manager + commish, dark + light) at 390 × 844
- `mobile-aurora-screens.jsx` — full JSX source for Home, Team, Standings, Players, More
- `mobile-aurora-atoms.jsx` — primitives (`MTopbar`, `MTabBar`, `MCard`, `MIridRing`, `MSparkline`, `MAICard`, `Glyph`, sortable header, segmented control)

## Hard rules

1. **Desktop is untouched.** No edits to existing `.tsx` files in
   `client/src/features/*/pages/*.tsx` or `client/src/pages/*.tsx`. Mobile is
   purely additive — new files, new route guards, new components.
2. **Same data, same hooks.** Every mobile page calls the exact same
   `useLeague`, `getPlayerSeasonStatsMeta`, `getStandings`, `getWatchlist`,
   `addToWatchlist`, etc. — never a parallel API.
3. **Same URLs.** Mobile reads/writes the same `useSearchParams` keys
   (`group`, `mode`, `q`, `sort`, `desc`, `team`, `pos`, `fantasy`,
   `statsMode`) so a desktop ↔ mobile handoff preserves filter state.
4. **Same Aurora tokens.** Pull from `client/src/components/aurora/aurora.css`
   (`--am-text`, `--am-surface`, `--am-irid`, …). Do not introduce new colors.
5. **Feature parity.** Sort, filter, search, watchlist toggle, expanded row,
   trade approval, period close, FAAB bid, lineup edit — every action that
   works on desktop must work on mobile.

## Routing strategy

Add a single `<MobileLayoutGate>` that wraps `<App>` and switches the
**page content** based on `useViewport()` — but does **not** swap routes.
The route tree stays identical so deep links still work.

```tsx
// client/src/components/MobileLayoutGate.tsx (new)
const isMobile = useMediaQuery('(max-width: 767px)');
return isMobile ? <MobileShell>{children}</MobileShell> : <>{children}</>;
```

Inside `MobileShell`, render the mobile topbar + bottom dock chrome, then
switch on the active route to render the matching mobile page component
(`<MobileHome>`, `<MobileTeam>`, `<MobileStandings>`, `<MobilePlayers>`,
`<MobileMore>`). Each mobile page imports the **same hooks and contexts**
the desktop page does — only the rendered JSX differs.

## File map to create

```
client/src/mobile/
├── MobileShell.tsx              ← topbar + bottom dock + safe-area
├── MobileTabBar.tsx             ← solid dock, role-aware (manager vs commish)
├── MobileTopbar.tsx             ← sticky 44px header with title + glyphs
├── atoms/
│   ├── MCard.tsx                ← Glass surface, padded variant
│   ├── MIridRing.tsx            ← iridescent gradient border wrapper
│   ├── MSparkline.tsx           ← 14-point inline trend line
│   ├── MSegmented.tsx           ← 2-3 option pill toggle
│   ├── MSortHeader.tsx          ← sortable column header w/ arrows
│   └── Glyph.tsx                ← inline SVG icon set
└── pages/
    ├── MobileHome.tsx           ← hero card + matchup strip + AI cards
    ├── MobileTeam.tsx           ← dense roster, Hitters/Pitchers tabs
    ├── MobileStandings.tsx      ← 5-cat table, Hitting/Pitching/Total
    ├── MobilePlayers.tsx        ← Hitters/Pitchers, LG filter, sortable
    └── MobileMore.tsx           ← profile + grouped nav, commish section
```

## Page-by-page feature parity checklist

### MobileHome
- Pulls from same data hooks as `pages/Home.tsx` (`useLeague`,
  `getMyTeamToday`, `getStandingsSummary`, `getRecentActivity`).
- Hero card: team name, record, total points, 14-week sparkline.
- Matchup strip uses `getMatchup(weekId)` data (live points + cats won/lost).
- AI cards from `getRecommendations()`.
- Standings top-5 + activity tail (4 items).

### MobileTeam
- Dense single-line roster rows: slot pill · name · team/pos · 4 stats.
- Hitters tab shows AVG/HR/RBI/SB. Pitchers tab shows W/K/ERA/WHIP.
- Tap row → opens existing `PlayerDetailModal` (already mobile-friendly?
  if not, route to `/players/:mlbId` instead).
- FAAB / cap / MV chips in compact hero.
- Same lineup-edit flow, drag-to-bench replaced with long-press menu.

### MobileStandings
- 5-cat **table** (no horizontal scroll, no bento boxes).
- Segmented: **Hitting** (AVG · HR · R · RBI · SB) ·
  **Pitching** (W · SV · K · ERA · WHIP) · **Total** (5-stat headline mix).
- Cells show roto **points** (1–10), color-graded
  (≥ 8 positive, ≥ 5 text, < 5 muted).
- Tap any column header to sort. Tap team row → desktop's existing
  `/team/:teamId` route.
- Strip the 2-letter initials sub-line — full team name only.

### MobilePlayers
- **Hitters / Pitchers** primary toggle (drives stat columns + position chip
  set + default sort key).
- **LG · All / NL / AL** chip row — wires to existing `filterTeam` URL
  param (`ALL`, `ALL_NL`, `ALL_AL`).
- Position chips:
  - Hitters: All, C, 1B, 2B, 3B, SS, MI, CM, OF, DH (uses `isCMEligible`,
    `isMIEligible` helpers).
  - Pitchers: All, P, SP, RP.
- 4 sortable stats per row: AVG/HR/RBI/SB or W/K/ERA/WHIP.
- Tap row → **inline expanded panel** (career table, L15 splits, Add /
  Watch / Compare buttons). Use the same `PlayerExpandedRow` content
  desktop uses, in a vertical layout. **No separate detail page** for
  mobile inline view; "Compare" / "Full Profile" still routes to
  `/players/:mlbId`.
- Watchlist star toggle calls existing `addToWatchlist` /
  `removeFromWatchlist`.

### MobileMore
- Profile card top.
- Grouped nav: **League** (Standings, Schedule, Transactions, Weekly
  Report) · **Commissioner** (visible only when
  `useLeague().isCommissioner === true` — League settings, Members &
  invites, Trade approvals, Period close, Auction setup, Audit log) ·
  **Account** (Notifications, Appearance, Profile).

## Bottom dock

5 tabs, role-aware:
- **Manager**: Home · Players · Standings · Coach · More
- **Commissioner**: Home · Players · Standings · Commish · More

Solid background (`var(--am-surface-strong)` + 40px backdrop blur),
1px top border, top accent rule above active tab using `var(--am-irid)`.
24px glyphs, 10.5px label. Larger touch targets — min 44 × 44.

## Implementation order

1. Add `useMediaQuery` hook + `MobileLayoutGate` wrapper around `<App>`.
2. Build atoms folder (port from `mobile-aurora-atoms.jsx`).
3. Build `MobileShell` + `MobileTabBar` + `MobileTopbar`.
4. Port pages one at a time, in this order: Home, Standings, Players, Team,
   More. Verify each one passes desktop's existing tests and adds no new
   network calls before moving on.
5. Add `__tests__/MobileShell.test.tsx` covering: viewport switch, role-aware
   dock, sortable standings, Hitters/Pitchers toggle wires `viewGroup` URL
   param, watchlist star toggle.

## Acceptance criteria

- [ ] Resizing browser to ≤ 767px swaps in mobile pages; ≥ 768px keeps
      desktop. No flash, no double render.
- [ ] All existing desktop tests still pass without modification.
- [ ] Every mobile page reads/writes the same URL params as desktop.
- [ ] Watchlist, sort, filter, FAAB bid, trade propose, lineup edit, and
      period close all work end-to-end on mobile.
- [ ] No new colors outside `aurora.css` tokens.
- [ ] No horizontal scroll anywhere on any mobile screen.
- [ ] Standings table fits all 10 team names without ellipsis at 390px.
- [ ] Bottom dock visible above iOS home indicator (`env(safe-area-inset-bottom)`).
- [ ] Commissioner-only menu items hidden when `isCommissioner === false`.

## Mock-data note

The sandbox uses `data.js` + `data2.js` mocks. **Ignore those** — wire
straight to the real API exports in `client/src/api`. The mocks were only
to render the design surface.

---

## Suggested kickoff message to Claude Code

> Read `Aurora Mobile.html`, `mobile-aurora-screens.jsx`, and
> `mobile-aurora-atoms.jsx` in the linked sandbox project. Then read
> `client/src/features/players/pages/Players.tsx`,
> `client/src/features/standings/`, `client/src/pages/Home.tsx`, and
> `client/src/components/aurora/` so you understand the existing data
> contracts. Then implement the plan in `Mobile Handoff Prompt.md`,
> starting with the `MobileLayoutGate` and the atoms folder. Do **not**
> modify any existing desktop file. Show me the gate + shell + first page
> (MobileStandings) before continuing.
