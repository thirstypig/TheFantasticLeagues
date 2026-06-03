---
title: Auction results page summed live rosters instead of auction-day snapshot, drifting from Excel cap totals
problem_type: logic_error
component: auction-results
symptoms:
  - "/auction-results league total showed $2,245 vs Excel source of truth $3,200"
  - Three independent views disagreed (page $2,245, commissioner Team.budget $3,200, Excel $3,200)
  - Waiver pickups and mid-season free agents appeared on auction results despite never being won at auction
  - Keeper carryovers (~$955) missing because AuctionSession.state.log only recorded WIN bid events
  - Team totals failed to match the cap exactly after in-season drops and adds churned current roster state
date_solved: 2026-06-02
solved_by: PR #370 + PR #369
severity: high
tags:
  - auction-results
  - snapshot-semantics
  - roster-table
  - time-windowed-query
  - data-slice-mismatch
  - source-of-truth
related_prs:
  - 369
  - 370
related_files:
  - server/src/features/auction/routes.ts
  - client/src/features/auction/pages/AuctionResults.tsx
  - client/src/features/auction/components/AuctionComplete.tsx
---

## Problem

The FBST `/auction-results` page rendered wrong totals after the season was in flight. Three independent views of "what happened at the auction" disagreed:

| View | League total |
|---|---:|
| `/auction-results` (page) | **$2,245** |
| `/commissioner/:leagueId#people` (`Team.budget` cap) | $3,200 |
| OGBA Excel auction draft sheet (source of truth) | $3,200 |

The user spotted the symptom precisely: *"I see players that I did not win in the auction, but picked up recently."* Mid-season waiver pickups (Troy Johnston, Matt Gage, Keibert Ruiz on Los Doyers) were appearing on a page named "Auction Results" alongside players actually won at the auction. Conversely, players that were on the roster on auction day but dropped during the season had vanished from the page.

The user's hunch was correct: *"the auction results are not the current rosters … it is a snapshot in time of the auction results."*

## Root cause

The Auction Results page was answering the wrong question from the right table. `Roster` rows back two distinct views: the **live state** (`releasedAt: null`, what's on each team right now) and the **auction-day snapshot** (what was on each team the day the gavel fell). The `/api/auction/state` endpoint feeds the live auction floor and correctly filters `releasedAt: null` — perfect for "where do we stand today," wrong for "what was the auction outcome." For OGBA mid-season (~2026-06-02), this drift mixed in post-auction waiver pickups and excluded auction-day buys that had since been dropped — net effect ~$280 off a $3,200 cap.

Compounding it: 4 OGBA `Roster.source` values were mis-labeled (`DROP`, `SEASON_IMPORT`) for legit auction wins (Michael Busch, Andrew Vaughn, Daniel Palencia, Quinn Priester), so a naive `source = "auction_2026"` filter would also undercount.

PR #369 had already fixed a *secondary* bug — `AuctionComplete.tsx` was summing `auctionState.log` (a chronological event stream of WIN bidding events only, missing keeper carryovers); switching to sum `teamResults.roster` lifted the total from $2,245 to $2,920. But that still read the live view. **Closing the remaining $280 gap required choosing a different slice of the same table.**

## The fix

PR #370 added `GET /api/auction/results` returning the same wire shape as `/api/auction/state` but with an **auction-day-frozen** roster slice. Three filters compose the snapshot:

```ts
// server/src/features/auction/routes.ts (excerpt from the /results route)
const firstPeriod = await prisma.period.findFirst({
  where: { season: { leagueId } },
  orderBy: { startDate: "asc" },
  select: { startDate: true },
});
const cutoff = firstPeriod
  ? new Date(firstPeriod.startDate.getTime() + 7 * 24 * 60 * 60 * 1000)
  : new Date(`${new Date().getFullYear()}-04-01T00:00:00Z`);

const teams = await prisma.team.findMany({
  where: { leagueId },
  include: {
    rosters: {
      where: {
        source: { in: ["auction_2026", "prior_season", "DROP", "SEASON_IMPORT"] },
        acquiredAt: { lt: cutoff },
        OR: [{ releasedAt: null }, { releasedAt: { gte: cutoff } }],
      },
      include: { player: { select: { /* ... */ } } },
    },
  },
});
```

Three composable predicates, each loadbearing:

1. **`source IN (auction_2026, prior_season, DROP, SEASON_IMPORT)`** — clean auction-time rows plus the four known mis-labeled rows. The wire payload normalizes the mis-labels back to `"auction_2026"` so the keeper/auction sub-badge in the UI isn't misleading: `source: r.source === "DROP" || r.source === "SEASON_IMPORT" ? "auction_2026" : r.source`.
2. **`acquiredAt < cutoff`** — drafted or kept before auction window closed. Excludes any in-season pickup.
3. **`releasedAt IS NULL OR releasedAt >= cutoff`** — excludes pre-auction keeper cuts (mass releases on the cut deadline) while including in-season drops, so the player still counts toward the team that owned them on auction day.

Cutoff = `firstPeriod.startDate + 7d` buffer absorbs late synthetic-row backfills (Ohtani's two-way pitcher row was added 4 days after period 1 started). Client switch is one line in `AuctionResults.tsx` — fetch URL changes from `/auction/state` to `/auction/results?leagueId=...`. `AuctionComplete.tsx`'s render path is unchanged (response shape preserved).

## Verification

| State | League total | Source |
|---|---:|---|
| Before PR #369 | $2,245 | summed `auctionState.log` (no keeper carryover) |
| After PR #369 | $2,920 | summed `teamResults.roster`, live view (waiver drift) |
| After PR #370 | **$3,200** | auction-day snapshot, 184 rows, every team at cap exactly |

Browser-verified `/auction-results` on OGBA 2026: every team line shows total = cap exactly, matching Excel and commissioner `Team.budget`. Los Doyers card no longer surfaces Troy Johnston, Matt Gage, or other post-auction waiver pickups; Konnor Griffin ($150 keeper) is correctly present with the K badge.

## Prevention

### Detection — the invariant that would have caught this on day 1

A **budget-conservation invariant** test, runnable as both a unit assertion (against a seed fixture) and a nightly production probe:

> For every league, the sum of `auction_price` across all rows surfaced by `/auction-results` MUST equal `sum(Team.budget)` for that league.

Auction is a closed economic system — total dollars spent at auction is fixed at the moment the gavel falls. Any divergence is a snapshot leak. This single assertion would have flashed red the first time a waiver pickup contaminated the page. A companion invariant: **row count per team on the auction-results page MUST equal the league's roster size at auction close** (typically 23–25 for OGBA), independent of in-season transactions.

### Pattern recognition — red flags for the same bug family

- Any route or component named `*Results`, `*Summary`, `*History`, `*Report`, `*Recap`, `*Final`, or `*Snapshot` that calls Prisma directly instead of going through a `lib/<event>Snapshot.ts` helper.
- `releasedAt: null` filters in code paths whose UI copy references a past event ("at the auction", "draft day", "trade deadline").
- Queries on `Roster`, `Transaction`, `WaiverClaim`, or `Lineup` that lack BOTH a date-bounded predicate AND a `source` predicate when the page semantic is historical.
- `Roster.source` used as a filter without first acknowledging it's import-generated and unreliable (OGBA 2026 had 4 mis-labeled auction wins).
- Pages that render correctly on launch day but where nobody has manually re-verified totals 30+ days into the season. **Drift is the signature.**

### Architectural guardrail — proposed CLAUDE.md convention

> **Snapshot-named pages MUST read from snapshot helpers, not live state.** Any page named for a past event (Auction Results, Draft Report, Trade History, Final Standings) MUST source its data from `<feature>/lib/<event>Snapshot.ts`. The snapshot helper's file header MUST document: (1) the date or event the snapshot freezes, (2) which `source` values are trusted vs. recovered via date bounds, (3) the invariant the snapshot preserves (e.g., budget conservation). Direct Prisma calls from a `*Results`/`*History`/`*Summary` component are a review-blocker. Don't trust `Roster.source` as the sole filter — always pair it with a date bound from `Period[0].startDate` or equivalent league-anchored timestamp.

### Test recipe — two-view reconciliation

Pick a load-bearing aggregate (sum of dollars, count of players, set of player IDs) and compute it two independent ways — once via the page/snapshot helper, once via the authoritative source (`sum(Team.budget)`, the Excel fixture, the immutable event log). Assert they agree. Seed the fixture with a deliberately mis-labeled `source` row and a post-event mutation; the test passes only if the snapshot helper correctly includes the former and excludes the latter. Port this pattern to every page in the "Pattern recognition" list above.

## Related work

### Highly related (same bug class)

- [`logic-errors/closed-period-stat-attribution-uses-current-owner.md`](closed-period-stat-attribution-uses-current-owner.md) — PR #365: standings attributed closed-period stats to *current* owner instead of end-of-period owner. Same family — using current-state to answer a historical question.
- [`logic-errors/period-roster-historical-il-display-and-gte-boundary.md`](period-roster-historical-il-display-and-gte-boundary.md) — `Roster.assignedPosition` and `releasedAt` are mutable current-state columns; historical/snapshot views must reconstruct from events.
- [`logic-errors/standings-boundary-and-il-slot-historical-lookup.md`](standings-boundary-and-il-slot-historical-lookup.md) — establishes the "current state vs. historical state" mental model that auction-results extends to a non-standings surface.
- [`logic-errors/trade-reversal-ghost-roster-double-counting.md`](trade-reversal-ghost-roster-double-counting.md) — same `Roster` table query semantics; `releasedAt` filtering nuances.

### Tangentially related (see also)

- [`logic-errors/standings-stats-source-heuristic-chose-inaccurate-daily-over-period.md`](standings-stats-source-heuristic-chose-inaccurate-daily-over-period.md) — trust hierarchy + "which data source answers which question."
- [`runtime-errors/auction-production-outage-api-routing-player-ids.md`](../runtime-errors/auction-production-outage-api-routing-player-ids.md) — prior `/auction-results` endpoint area.
- [`logic-errors/prisma-select-omission-silent-ui-fallback.md`](prisma-select-omission-silent-ui-fallback.md) — silent UI fallback when query returns wrong slice with no error surfaced.

### Related GitHub items

- **PR #369** (2026-06-02) — switched `AuctionComplete.tsx` from summing `auctionState.log` to summing `teamResults.roster`. Took league total from $2,245 → $2,920.
- **PR #370** (2026-06-02) — added `GET /api/auction/results` auction-day snapshot endpoint. Closed the remaining $280 gap to $3,200.
- **PR #365** — closed-period attribution to end-of-period owner (sibling bug class).
- **PR #364** — FanGraphs audit script switched to PSP (related stats-pipeline work in the same session arc).
