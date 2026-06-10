---
title: One mid-period pickup degraded the whole period to the daily-stats fallback
slug: mid-period-pickup-degrades-whole-period-to-daily-stats
category: logic-errors
created: 2026-06-10
component: "standings, period-stats, attribution"
problem_type: source-selection-overcorrection
symptom: "Live P3 standings drifted off FanGraphs (DMK K 154 vs 152, DVD K 109 vs 105) after three mid-period wire adds, even though the period's PSP data was verified FG-exact"
root_cause: "hasMidPeriodPickup routed the ENTIRE period to computeWithDailyStats when any single roster row was acquired mid-period; the daily table collapses doubleheaders and has gaps, and its inclusive releasedAt clamping double-counted same-day drop-and-re-add boundary days"
related_modules: "standings, periods, transactions, wire-list"
prs: [394]
todos: [286]
tags: [standings, mid-period-pickup, PlayerStatsPeriod, playerStatsDaily, attribution, releasedAt-boundary, hybrid, ADR-013]
severity: high
---

# One mid-period pickup degraded the whole period to the daily-stats fallback

**Fixed:** 2026-06-10 (PR #394, todo #286) · **Discovered by:** the OnRoto audit's path instrumentation (`docs/reports/onroto-audit-2026-06-08.md` Section 5.4 / Section 6 Issue 4)

## Symptom

A period whose `PlayerStatsPeriod` (PSP) data was verified cell-for-cell identical to FanGraphs nonetheless *displayed* slightly wrong standings — and the deviation appeared only after the league's first real mid-period wire adds (DMK Spiers + Ashby on 5/22, SKD Dollander on 6/3). Live P3 showed DMK K=154 vs FG's 152, DVD K=109 vs 105, with small ERA/WHIP drift on several teams.

## Root cause — two layered defects

1. **All-or-nothing source selection.** `computeTeamStatsFromDb` checked `hasMidPeriodPickup` and, if *any* roster row was acquired strictly mid-period, routed the **whole period** — all ~190 players — through `computeWithDailyStats`. The daily table (`playerStatsDaily`) has `@@unique([playerId, gameDate])`, which collapses doubleheaders, plus historical gaps. So one wire pickup degraded every team's stats, when only the moved players actually needed ownership-window treatment (ADR-013). This was the deliberately conservative fix from PR #374 / todo #260 — correct attribution, wrong blast radius.

2. **Inclusive `releasedAt` clamping in the daily window.** `clampToPeriod` returned `to = releasedAt` and the day loop used `d <= to`. With the conventional UTC-midnight `effDate`, a same-team same-day drop-and-re-add (Ashby, 5/22) produced two windows `[start, 5/22]` and `[5/22, end]` that **both** matched 5/22 — double-counting that day (this was exactly DMK's +2 K). A player released *at* a period-start boundary similarly leaked the release day's stats to the dropper. This contradicted the documented half-open `[acquiredAt, releasedAt)` convention in `lib/rosterWindow.ts`; `ownedOn` already used the strict bound, `clampToPeriod` usage didn't.

A third gap fell out of the analysis: a mid-period **drop** to free agency (no re-add) left the period on the pure PSP path, where end-of-period attribution gives the dropper **zero** — but FG credits stats accrued while rostered.

## How it was diagnosed

Path instrumentation: for each period, log which source path `computeTeamStatsFromDb` takes and *why* (which roster rows triggered `hasMidPeriodPickup`). P3 reported "mid-period pickup detected" → daily path; recomputing P3 under PSP semantics matched FG exactly, isolating the deviation to the fallback's *table*, not the data or the attribution logic. The per-team residue (+2 K for DMK) then matched Ashby's 5/22 line — the double-count.

## Fix (PR #394)

**Hybrid routing** in `computeTeamStatsFromDb` (`server/src/features/standings/services/standingsService.ts`):

- Build `midPeriodPlayerIds`: players with any roster row acquired **or released** strictly mid-period, compared at **UTC calendar-date granularity** (todo #285's normalization).
- Split **per player, never per row** — a drop-and-re-add's two rows must not straddle paths, or the player gets credited twice.
- Boundary-aligned players → `computeWithPeriodStats` (doubleheader-safe PSP). Mid-period players → `computeWithDailyStats` (ownership windows). Merge with `mergeTeamStatRows`, recomputing AVG/ERA/WHIP from summed H/AB, ER/IP, BB_H/IP components (Issue #109 convention).
- Degenerate cases collapse to the old pure paths (no PSP rows → daily; no mid-period players → PSP; no clean players → daily).

**Half-open release boundary** in the daily day-loop:

```ts
// releasedAt is exclusive (half-open window, see lib/rosterWindow.ts header)
if (d >= from && d <= to && (roster.releasedAt === null || d < roster.releasedAt)) {
```

With midnight `effDate`s, the release day belongs to the next owner (or nobody), never the dropper; mid-day timestamps (legacy trades) keep their existing day-goes-to-dropper behavior because `midnight < 14:00`.

## Verification

- Read-only against prod: **P3 = FanGraphs exactly, 8/8 teams, all 10 categories including ERA/WHIP**, with the three mid-period players windowed through daily.
- Regression: P1/P2 still 8/8 FG-exact and still pure-PSP (boundary releases on 4/19 and 5/17 correctly not "mid-period").
- 4 tests: 3 TDD path-routing cases (hybrid split with pre-acquisition exclusion; same-day drop-and-re-add counted once; mid-period release credits dropper pre-release only) + 1 differential test proving the stable player's credit comes from PSP (deliberately-wrong daily rows) while the trade window-splits, with league-total conservation.

## Prevention

- `standingsService.pathRouting.test.ts` (11 tests) pins the routing matrix; `standingsService.differential.test.ts` pins hybrid source-of-credit and the zero-sum invariant. Any future attribution path needs a paired differential test (per `standings_stats_architecture` convention).
- When auditing standings vs FG: first log **which path each period takes** — a period can have verified-correct PSP data and still display wrong numbers because of routing.
- Half-open `[acquiredAt, releasedAt)` is THE convention. Any new window predicate must document its boundary semantics in `lib/rosterWindow.ts` and use the strict upper bound for midnight effDates.

## Related

- ADR-013 (`docs/decisions.md`) — ownership-window attribution; this fix narrows the daily fallback to exactly the players ADR-013 is about.
- `standings-stats-source-heuristic-chose-inaccurate-daily-over-period.md` — the original "daily table is not an acceptable substitute for PSP" finding; this bug was its routing-layer reincarnation.
- `closed-period-stat-attribution-uses-current-owner.md` — end-of-period owner attribution that the PSP half of the hybrid relies on.
- `closed-period-psp-frozen-with-stale-boundary.md` — the sibling P1 defect found in the same audit (PSP rows frozen with a stale boundary).
- `onroto-vs-fbst-stat-attribution-semantics.md` — the FG-comparison methodology used for acceptance.
- `mlb-statsapi-sync-hasstats-filter-drops-er-rbi.md` — earlier FG-delta root cause in the sync layer.
