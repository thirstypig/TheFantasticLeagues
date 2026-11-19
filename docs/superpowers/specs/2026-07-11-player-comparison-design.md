---
id: DOC-044
title: "Player comparison (/compare) — design spec (parked)"
description: "Side-by-side season-stat comparison of up to 5 players. Parked 2026-11-18: not built during the off-season hardening phase."
type: tech-spec
status: deprecated
phase: null
owner: james
tags: [players]
links: [PRD-001]
updated: 2026-11-18
---

> **Parked 2026-11-18 (todo #329).** James chose not to build this during the hardening
> phase. The player card (#482) already covers one player's stats. Revisit when public
> leagues are scheduled. Copied from branch `feat/player-comparison` (rev 2, 9e1bdfd3, never pushed), which was
> then deleted.

# Player Comparison (`/compare`) — Design Spec

> Date: 2026-07-11 · Rev 2 (post multi-agent design review, 2026-07-12) · Status: proposed
> Effort: Small–Medium · Origin: roster-hub enhancement brainstorm (hub itself is complete).

## Goal

A standalone, league-wide page to compare **any players** side-by-side by their
season stats — the "who's the better play / should I pick up X over Y" decision.

## Decisions locked

- **Standalone `/compare` page** (not a hub sub-route, not a modal). Full width.
- **Any player in the active league's stats-source pool** — rostered (any team),
  free agent, or minors. League-scoped (the stats endpoint requires `leagueId`).
- **Up to 5 players** side-by-side (columns).
- **Raw season roto stats** — hitters R / HR / RBI / SB / AVG (+ AB, G context);
  pitchers W / SV / K / ERA / WHIP / IP (+ GS context).
  **These are raw season totals (a scouting view), NOT the league's
  ownership-window scoring numbers (ADR-013).** State this on the page so nobody
  files a "compare doesn't match standings points" bug.
- **Identity key is the internal `Player.id`**, not `mlb_id`. (`mlb_id` on the wire
  falls back to `String(Player.id)` for null-mlbId players — an overloaded
  namespace that risks collisions. `Player.id` is required + stable.) `?players=`
  and the new `ids=` filter both use `Player.id`.
- **MVP entry = the `/compare` page only** (search + `?players=<id,…>` deep-link).
- **Out of scope (MVP):** the roster-hub multi-select entry (fast-follow, below),
  two-way split display (below), L7/L30 splits, saved comparisons, projections,
  cross-league share links.

## Section membership & leader highlight (the tested core)

**Section membership keys off `is_pitcher`, not stat-presence.** The stats endpoint
emits `0` (never `null`) for stats a player doesn't accrue, and emits a single
`is_pitcher` boolean (derived `posPrimary === "P"`) — there is no `group` field and
no per-cell null to gate on. So:

- A player renders in **HITTING** iff `!is_pitcher`, in **PITCHING** iff `is_pitcher`.
  A player never appears in both (two-way is deferred — see below). A section with
  no members is hidden.
- **`compareLeaders` runs per section, over that section's members only** (all of
  whom have real stats, so no null-gating needed). For each stat row: best = max,
  except **ERA / WHIP → min**. Unique best → ★. Tie (≥2 share best) → no ★. A
  section with <2 members → no ★.
- **Context rows (AB·G, IP·GS) are never highlighted** — `compareLeaders` skips them.
- **Rate-stat sample floor:** suppress the ★ on AVG / ERA / WHIP when the leader's
  AB (resp. IP) is below a small floor (e.g. AB < 20, IP < 10) — a 2-AB 1.000 must
  not crown over a qualified regular. Value still shown; only the crown is withheld.

`compareLeaders` is a **pure** function (`lib/compareLeaders.ts`), no React, and is
the most-tested unit. Row type uses a `type` **intersection**, not `interface
extends` (the latter collapses the H/P discriminated union — precedent
`feedback_du_interface_extends_trap`).

## Two-way players (Ohtani) — deferred, documented limitation

`TWO_WAY_PLAYERS` is currently **empty**, and Ohtani exists as two separate Player
rows (real `mlbId` = hitter, synthetic `mlbId = real+1,000,000` = pitcher). The
synthetic pitcher row returns **all-zero** pitching from `/player-season-stats`
(statsapi has no synthetic person; the pitching mirror only feeds *period* stats,
not season). So a single selection cannot fill both sections, and selecting the
synthetic row would show a zero-filled PITCHING section.

**MVP behavior:** the compare page treats each Player row independently (by
`Player.id`) — consistent with how the rest of the app models Ohtani. It does **not**
attempt a merged two-way column. If/when two-way display is wanted, it needs the
pitcher stats pulled from the real person's season map + client-side role split —
tracked as a follow-up, affecting zero players today.

## UX

### Layout — stats as rows, players as columns

- First column (stat labels) **sticky-left**; the table in an `overflow-x: auto`
  container (5 columns scroll horizontally on narrow screens; the page body never
  scrolls sideways). **No sticky-top** — the table is ~12 rows across two sections
  and fits a viewport, so a fixed header isn't worth the sticky-corner z-index
  fiddliness.
- **Player column header (card):** name (links to detail), MLB team + position
  chips, owner (OGBA team name or "FA"), **and roster status when notable (IL /
  minors)** — status is decision-relevant for a pickup. Remove ✕ drops the column.
  Add is disabled at 5 columns.
- Bespoke `ComparisonTable` (transposed matrix) — **not** `ThemedTable` (which is
  players-as-rows). Its highlight/`—`/section CSS classes ship in the **same
  commit** as the JSX (jsdom can't catch a missing class rule).
- **Mobile:** rendered inside the mobile shell (`MobileLayoutGate`) as the same
  table in its `overflow-x` container — no separate mobile twin for MVP.

### States & edge cases (must be handled, not silent)

- **0 players:** search-prompt empty state. **1 player:** renders (no ★, correctly),
  with a "add another to compare" hint so it doesn't read as half-loaded.
- **Deep-link `?players=`:** parse in `Player.id` order; **columns follow param
  order.** Cap at 5 (drop the rest, tell the user). Ignore empty/garbage tokens.
- **Partial hydration:** ids that don't resolve (unknown, or valid but outside the
  league's stats-source pool — the endpoint applies an NL/AL/MLB filter in JS after
  the query) → render the columns that resolved + a dismissible "N players couldn't
  be loaded" notice. Never silently differ from what the sharer saw without a signal.
- **Shareable = same-league:** a link opened by a user whose active league differs
  resolves against the wrong pool. MVP scopes "shareable" to same-league members and
  says so on the page. (`leagueId` from `LeagueContext` can be `0`/stale for a tick
  before memberships sync — the page tolerates a not-ready `leagueId`.)
- **Search:** debounced `q`; no-results copy; if a common name exceeds `take` (e.g.
  10), a "refine your search" hint (the target may be past the cutoff). A player
  already added shows an **"Added" disabled** state (not a silent no-op). Dedupe by
  `Player.id`. Search input stays usable at the 5-cap (only Add is disabled).
- **Fetch failure / loading:** hydration spinner; a fetch error shows a retry, not a
  blank table. `?players=` survives the auth-shell login redirect for a logged-out
  deep-link visitor.

## Architecture

### Client — new `features/compare/` module

(Matches the single-page-module precedent: `nba`, `nfl`, `board`, `trading-block`.)
- `pages/ComparePage.tsx` — route container; owns the ≤5 selected `Player.id`s,
  syncs `?players=`, fetches stats via `fetchJsonApi<PlayerSeasonStatsResponse>(…)`
  (explicit type — untyped infers `unknown`; precedent
  `untyped-fetch-wrapper-api-contracts`).
- `components/ComparisonTable.tsx` — pure presentation given players + computed leaders.
- `components/PlayerSearchBox.tsx` — thin UI over the shared search hook.
- `lib/compareLeaders.ts` — pure leader logic (above).
- `hooks/usePlayerSearch.ts` — **shared** debounced `q`-against-`/player-season-stats`
  + per-`(leagueId,q)` cache. Extracted so this isn't the third bespoke copy
  (`players/pages/Players.tsx`, `wire-list/components/AddPicker.tsx` already do it).
- Route `/compare` (lazy) in `App.tsx`'s authenticated shell (`/compare` is currently
  unused; `LeagueProvider` supplies `leagueId` app-wide).

### Server — reuse + one additive param (`players/routes.ts`)

- **Reuse** `GET /api/player-season-stats?leagueId=&q=&take=&freeAgentsOnly=` for
  both search (`q`) and stats. With `freeAgentsOnly` false it returns rostered
  (any team) + FA players, enriched with ownership + `is_pitcher`; pitcher fields
  W/SV/K/IP/ERA/WHIP are populated; `take` clamps ≤200.
- **Add** optional `ids=<Player.id,…>` → `Player.id IN (...)`, additive to the
  `where` (doesn't collide with `freeAgentsOnly`'s `notIn`). **Caveat:** the JS
  stats-source filter still runs post-query, so `ids=` = "these players *if* in the
  league's stats-source pool" — hence the partial-hydration notice above.
- Import the shared schema by **relative `.js` path** (NodeNext ESM; precedent
  `feedback_shared_package_json_required`). Respect the schema's declared
  nullability — no `as` casts past it.

## Roster-hub entry (fast-follow, NOT MVP)

Once the page ships, add a "Compare" affordance to `RosterHubV3` — a local, ephemeral
multi-select (keyed on `playerId`, a `Set`) whose only effect is
`navigate('/compare?players=<ids>')`. **No shared store/context** — it must stay
independent of the existing single-select `selectedRosterId` (slot-move flow). A test
asserts the two selections don't entangle. Deferring this keeps MVP off the live,
real-money roster path entirely; the deep-link makes it a ~10-minute addition later.
(Also fold the FA-panel and player-detail "Compare" deep-links in here.)

## Testing

- **Unit (primary):** `compareLeaders` — per-section max/min, ERA/WHIP inversion,
  unique-leader vs tie (no ★), <2-members (no ★), context rows never crowned, the
  rate-stat sample floor.
- **Contract:** the `ids=` addition validated against `PlayerSeasonStatSchema`;
  empty/oversized/partial `ids` handled; identity round-trips on `Player.id`.
- **Component:** search → add → "Added" state → cap-at-5 → remove; two-section render
  driven by `is_pitcher`; partial-hydration notice; 0/1-player states; sticky-left +
  `overflow-x` container present; highlight CSS class rules exist (ship with JSX).
- **Role filtering:** a position player's mop-up pitching (`is_pitcher` false) never
  appears in PITCHING (precedent `position-player-pitching-counted-in-team-era`).
- **Browser (owner):** final visual check on prod behind auth — Claude can't
  self-verify auth-gated pages.

## Rollout

Single client-plus-`ids=` PR. No migration. `/compare` is a lazy shell route; `ids=`
is additive. After merge: browser-verify, then flip the roster-hub roadmap item to
done in `planning.json`.

## Resolved in review (rev 1 → rev 2)

- Endpoint emits `0` not `null` and no `group` → section membership now keys off
  `is_pitcher`, highlight runs per-section (was: null-gated). *(architecture, verifier)*
- Two-way "fills both sections" was impossible (synthetic pitcher row is zero-filled
  in the season endpoint) → deferred + documented. *(verifier, learnings)*
- Identity moved from `mlb_id` to `Player.id` (overloaded-namespace collision).
  *(architecture, verifier)*
- Deep-link hydration/portability defined; "shareable" scoped to same-league. *(flow)*
- Hub multi-select cut from MVP (only live-surface touch / named risk). *(simplicity)*
- Added: `usePlayerSearch` hook (DRY), rate-stat ★ floor, ADR-013 caveat, explicit
  fetch typing, `type`-intersection row type, IP thirds display, CSS-with-JSX, drop
  sticky-top, `features/compare/` module, full states/edge-case list.
