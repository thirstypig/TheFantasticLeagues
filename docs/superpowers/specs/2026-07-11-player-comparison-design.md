# Player Comparison (`/compare`) — Design Spec

> Date: 2026-07-11 · Status: proposed (awaiting review) · Effort: Medium
> Origin: roster-hub enhancement brainstorm (the hub itself is complete; this is net-new).

## Goal

A standalone, league-wide page to compare **any players** side-by-side by their
season stats — the "who's the better play / should I pick up X over Y" decision.
Entered from the roster hub (and later other surfaces), but not a team-scoped
feature.

## Decisions locked (from brainstorm)

- **Standalone `/compare` page** (not a hub sub-route, not a modal). Full width so
  all stats stay visible.
- **Any player, any team** in the league pool — rostered (any team), free agent,
  or minors.
- **Up to 5 players** compared side-by-side (columns).
- **Season roto stats**, matching what the hub shows (so numbers reconcile):
  hitters R / HR / RBI / SB / AVG (+ AB, G for context); pitchers W / SV / K /
  ERA / WHIP / IP (+ GS for context).
- **Leader highlight** per stat row.
- **Mixed hitter+pitcher is allowed** and shown as two sections (see UX §2).
- **MVP entry points:** the `/compare` page itself (search-driven) + a hub
  multi-select → "Compare (N)". FA-panel and player-detail entry are fast-follow,
  not MVP.
- **Out of scope (MVP):** L7/L30 stat splits, saved/shareable comparisons,
  projections, min-AB qualifiers on AVG, cross-league compare.

## UX

### 1. Layout — stats as rows, players as columns

```
/compare
┌───────────────────────────────────────────────────────────┐
│ Compare Players                                            │
│ Search: [ Ohtani________ ]  ▾ results: Shohei Ohtani ·LAD·DH│
│                                        (＋Add)             │
├──────────┬─────────┬─────────┬─────────┬─────────┬─────────┤
│          │ Betts ✕ │ Judge ✕ │ Soto ✕  │ Ohtani✕ │  …≤5    │
│          │ LAD ·OF │ NYY ·OF │ NYM ·OF │ LAD·DH/P│         │
│          │ Skunk   │ (FA)    │ The Show│ Skunk   │  owner  │
├── HITTING ─────────────────────────────────────────────────┤
│ R        │  86 ★   │  84     │  71     │  61     │         │
│ HR       │  25     │  40 ★   │  22     │  30     │         │
│ RBI      │  …      │         │         │         │         │
│ SB       │         │         │         │         │         │
│ AVG      │ .273 ★  │ .255    │ .251    │ .268    │         │
│ AB / G   │ 359/95  │ …       │         │         │         │
├── PITCHING ────────────────────────────────────────────────┤
│ W        │  —      │  —      │  —      │  8 ★    │         │
│ … (SV/K/ERA/WHIP/IP)                                       │
└──────────┴─────────┴─────────┴─────────┴─────────┴─────────┘
```

- **First column (stat labels) sticky-left; header row (player cards) sticky-top.**
- The table lives in an `overflow-x: auto` container — with 5 columns it scrolls
  horizontally on narrow screens; the page body never scrolls sideways.
- **Player column header (card):** name (links to player detail), MLB team + position
  chips, and the owner (OGBA team name, or "FA"). A remove ✕ drops the column.
- Add is disabled at 5 columns.

### 2. Mixed hitter + pitcher → two sections (my recommended call)

The table always renders a **HITTING** section and a **PITCHING** section. Each
player fills only the section(s) their role contributes (`is_pitcher` / `group`
from the stats row; two-way players like Ohtani fill both). Cells a player doesn't
contribute to show `—`. This makes an accidental hitter+pitcher mix "just work"
(you see two blocks) rather than being blocked.

A section with **no** contributing players is hidden entirely (e.g. comparing five
hitters shows only HITTING).

### 3. Leader highlight (the tested core)

For each stat row, among players with a **non-null** value in that row:
- best = max, except **ERA / WHIP → min** (lower is better).
- If exactly **one** player holds the best value → highlight it (★ + emphasis).
- If **two or more tie** for best → highlight none (ties are un-highlighted).
- Rows where fewer than two players have a value are never highlighted (nothing to
  compare).

No min-AB/min-IP qualifier in the MVP — we compare the displayed rate directly.

## Architecture

### Client (`features/players/`)

- `pages/ComparePage.tsx` — route container. Owns the selected-player list (max 5),
  reads/writes the `?players=<mlb_id,…>` query param (deep-link + shareable), and
  fetches stats.
- `components/ComparisonTable.tsx` — pure presentation of the two-section table
  given the players + computed leaders.
- `components/PlayerSearchBox.tsx` — debounced search input + results dropdown +
  Add. Reuses the existing search endpoint (below).
- `lib/compareLeaders.ts` — **pure** leader computation (see §3). No React, fully
  unit-tested.
- Route `/compare` added to the authenticated shell in `App.tsx` (lazy).

### Server (`features/players/`)

- **Reuse** `GET /api/player-season-stats?leagueId=&q=&take=&freeAgentsOnly=`
  (already returns search results *with* stats, ownership `ogba_team_code`, and
  `group`/`is_pitcher`). The search box calls it with `q` + a small `take` (e.g.
  10). No new search endpoint.
- **Add one optional param** to that endpoint: `ids=<mlb_id,…>` → when present,
  filter the result to exactly those players (for deep-link/seeded fetch by id
  rather than name). Small, additive; existing callers unaffected.

### Data flow

1. `ComparePage` mounts, reads `?players=` → if present, `GET …?ids=<those>` to
   hydrate columns; else empty with the search prompt.
2. User types in `PlayerSearchBox` → `GET …?q=<term>&take=10` → dropdown.
3. Add appends the player (dedupe by `mlb_id`, cap 5) and updates `?players=`.
4. `compareLeaders(rows)` computes the highlight set; `ComparisonTable` renders.

## Entry points

- **MVP:** `/compare` (standalone, search-driven) + roster-hub multi-select:
  a "compare mode" toggle in `RosterHubV3` turns rows selectable; a "Compare (N)"
  action navigates to `/compare?players=<selected mlb_ids>`. (This is a *second*,
  separate selection from the existing single-select slot-move flow — must not
  collide with `selectedRosterId`.)
- **Fast-follow (not MVP):** "Compare" action on `FreeAgentPanel` rows and in
  `PlayerDetailModal`, both just deep-linking to `/compare?players=…`.

## Testing

- **Unit (primary):** `compareLeaders` — max/min per stat, ERA/WHIP inversion,
  single-leader vs tie (un-highlighted), null handling, <2-values rows, two-way
  players filling both sections.
- **Contract:** the `ids=` addition to `/api/player-season-stats` validated against
  `PlayerSeasonStatSchema`; empty/oversized `ids` handled.
- **Component:** search → add → dedupe → cap-at-5 → remove; two-section render with
  a mixed hitter/pitcher set; sticky/scroll container present.
- **Browser (owner):** final visual check on prod behind auth — the layout, the
  highlight, the mixed-type behavior. (Claude can't self-verify auth-gated pages.)

## Rollout

Single PR (client page + `ids=` param + hub entry). No migration. `/compare` is a
lazy admin-shell route; the `ids=` param is additive. After merge: browser-verify,
then flip the roster-hub roadmap item to done in `planning.json` (it's already
complete; this feature is the "one more enhancement").

## Risks / notes

- **Second selection model in the hub** — keep the compare multi-select cleanly
  separate from the slot-move `selectedRosterId`; a shared piece of state here would
  be a bug. (Reason this is a named risk: the hub's existing selection is
  single-purpose and easy to accidentally overload.)
- The stats endpoint is **league-scoped** (`leagueId` required) — "any team" means
  any team *in the active league*, which matches the product intent.
- AVG/ERA/WHIP come pre-computed in the stat row; we highlight the displayed value,
  so no rate recomputation and no precision drift vs the hub.
