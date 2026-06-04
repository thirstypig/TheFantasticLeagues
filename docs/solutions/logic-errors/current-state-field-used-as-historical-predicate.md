---
title: "Current-state roster field used as historical period predicate"
slug: current-state-field-used-as-historical-predicate
category: logic-errors
severity: high
date: 2026-06-04
tags:
  - standings
  - il-stash
  - period-stats
  - temporal-state
  - roster-attribution
  - transaction-history
  - assignedPosition
affected_files:
  - server/src/features/standings/services/standingsService.ts
  - server/src/lib/ilWindows.ts
  - server/src/features/standings/__tests__/standingsService.IL.test.ts
symptoms:
  - A pitcher sitting in an IL roster slot has their W/K/IP counted toward team totals
    even though they pitched those games before being stashed (this is actually correct behavior)
  - After adding a naive `pos === "IL"` guard, two IL tests fail:
      "includes player stats when IL_STASH effDate is AFTER period start (mid-period stash)"
      "includes player stats for periods BEFORE the IL_STASH effDate"
  - Historical standings shift when a player changes their current slot — period scores
    that should be immutable change based on today's roster state
related:
  - docs/solutions/logic-errors/closed-period-stat-attribution-uses-current-owner.md
  - docs/solutions/logic-errors/auction-results-reads-current-rosters-not-snapshot.md
  - docs/solutions/logic-errors/standings-boundary-and-il-slot-historical-lookup.md
  - docs/solutions/logic-errors/period-roster-historical-il-display-and-gte-boundary.md
---

# Current-state roster field used as historical period predicate

## Symptom

During a FanGraphs standings audit (2026-06-04), Diamond Kings showed W=32 in FBST but FanGraphs ranked them lower. Investigation found Edwin Díaz (relief pitcher, currently in an IL slot) had W=1, IP=6 credited to the team. This was earned before he was stashed on IL mid-period.

The instinct was to add a guard:

```typescript
const pos = (roster.assignedPosition ?? roster.player.posPrimary ?? "").toUpperCase();
if (pos === "IL") continue; // ← seemed like the fix
```

This broke two tests immediately.

## Root cause

`roster.assignedPosition` is a **point-in-time snapshot** — it reflects where the player sits in the roster **right now**, at query time. It is not versioned by period or date.

When computing standings for Period 1 (March 25 – April 18) and a player is currently (in June) in an IL slot, `assignedPosition === "IL"` — even though they were in an active pitcher slot for all of Period 1. The guard incorrectly erases their Period 1 stats.

```
Period 1        Period 2        Period 3 (now)
Mar 25–Apr 18   Apr 19–May 16   May 17–present

Edwin Díaz: [   P slot    ] [IL stash Apr 25] [  IL slot  ]
                              ↑ mid-period stash
PSP Period 1: W=0, K=0, IP=0  ← he wasn't on this team in P1
PSP Period 2: W=1, K=10, IP=6 ← earned before stash (Apr 19–Apr 24)

assignedPosition today: "IL"
→ naive guard excludes ALL of Period 2's stats, including the pre-stash games
```

The `pos === "IL"` guard projects today's state backward onto every historical period — the canonical current-state trap.

## The correct mechanism

`wasOnIlAtPeriodStart(playerId, period.startDate, ilWindowsByPlayer)` reads `TransactionEvent` history (`IL_STASH` / `IL_ACTIVATE` rows) and returns `true` only if the player was on IL **at the specific period's start date**.

```typescript
// CORRECT — period-scoped, reads event history
if (wasOnIlAtPeriodStart(roster.playerId, period.startDate, ilWindowsByPlayer)) {
  continue; // only excludes players IL'd from period start
}
// Players stashed mid-period pass through — their pre-stash PSP stats count
```

`wasOnIlAtPeriodStart` returns `false` for:
- Mid-period stashes (IL_STASH effDate > period.startDate)
- Historical periods before the player was ever stashed

It returns `true` for:
- Players on IL at period start (IL_STASH effDate ≤ period.startDate, no subsequent IL_ACTIVATE before period.startDate)

## Why mid-period stash stats count

`PlayerStatsPeriod` (PSP) is a **full-period aggregate** fetched from MLB's `byDateRange` API. It includes all stats the player earned during the period window — including games played before the mid-period IL stash. There is no day-by-day split in the PSP row; it is one number for the entire period.

A player stashed on IL cannot pitch after the stash, so their PSP already only reflects pre-stash contributions. Excluding the entire PSP row would zero out legitimately earned stats. Implementing per-day IL attribution would require switching to `PlayerStatsDaily` for IL-affected periods — a larger change than appropriate for the current audit finding.

## What the regression tests guard

`standingsService.IL.test.ts` now has two tests that specifically prevent re-introduction of the `pos === "IL"` guard:

```typescript
it("PSP path: pitcher stashed mid-period with W > 0 — pitching stats count (pre-stash stats locked in)", () => {
  // assignedPosition: "IL", but IL_STASH effDate is mid-period
  // Expects: W=1, K=10, IP=6 counted
  // Guards against: blunt pos === "IL" check
});

it("PSP path: pitcher IL'd at period start — pitching stats excluded", () => {
  // assignedPosition: "IL", IL_STASH effDate <= period.startDate
  // Expects: W=0, K=0, IP=0 (correctly excluded)
  // Guards against: over-correction that includes IL-at-start players
});
```

The comment in the first test reads: *"A blunt `pos === 'IL'` guard would wrongly zero them out. Do NOT add such a guard — see 2026-06-03 session notes."*

## Prevention

**1. Distinguish current-state from historical-state in variable names.**

```typescript
// Current state — only valid for present-tense queries
const currentSlot = roster.assignedPosition;

// Historical state — use event history
const wasIlAtPeriodStart = wasOnIlAtPeriodStart(playerId, period.startDate, windows);
```

**2. Add a schema comment on the field itself** (Prisma schema or TypeScript type):

```
/// Current roster slot. NOT valid for historical period queries.
/// Use wasOnIlAtPeriodStart() with TransactionEvent history instead.
assignedPosition String?
```

**3. Code review checkpoint for standings / attribution PRs.** Any guard added inside `computeWithPeriodStats` or `computeWithDailyStats` that uses `roster.assignedPosition`, `roster.teamId`, or any other live-state field should be questioned: "Is this field period-scoped, or does it reflect today's state?"

**4. The canonical anti-pattern in this codebase** (three prior incidents):
- `closed-period-stat-attribution-uses-current-owner.md` — live `teamId` used for closed-period attribution
- `auction-results-reads-current-rosters-not-snapshot.md` — live rosters instead of auction-day snapshot
- This incident — live `assignedPosition` used for historical IL exclusion

All three share the same structure: a query over historical data uses a field that reflects present state. The fix in each case is an event-history lookup (`wasOnIlAtPeriodStart`, `endOfPeriodOwner` map, `auctionDaySnapshot`).
