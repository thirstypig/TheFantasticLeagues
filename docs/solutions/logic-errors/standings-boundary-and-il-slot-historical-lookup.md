---
title: "Standings: releasedAt boundary exclusion + static IL slot retroactive exclusion"
date: 2026-05-14
category: logic-errors
tags:
  - standings
  - prisma
  - roster-query
  - il-slot
  - boundary-condition
  - period-stats
symptoms:
  - "Players released on exactly the period start date have their stats credited to no team"
  - "Players moved to IL after a scoring period retroactively lose stats from periods when they were active"
  - "Roto standings show incorrect category rankings due to silently dropped stat credits"
  - "Teams undercount runs/stats with no visible error"
components:
  - server/src/features/standings/services/standingsService.ts
  - Prisma roster query (releasedAt boundary)
  - TransactionEvent (IL_STASH / IL_ACTIVATE history)
severity: high
---

# Standings: releasedAt boundary exclusion + static IL slot retroactive exclusion

From a manager's perspective, the standings Runs (and potentially other counting-stat) totals appear lower than they should be for certain teams, with no error surfaced — the numbers are simply wrong and silently understated. A player who was active and producing for a team during a scoring period can have all their stats vanish from that team's totals if they were subsequently placed on IL or happened to be released at midnight on the period's first day. The combined effect produced incorrect category rankings in a roto league, with at least 73 uncredited Runs across one scoring period causing one team to be ranked incorrectly above another.

## Root Cause

### Bug 1 — Exclusive boundary drops players released at period start

The Prisma roster query in `computeTeamStatsFromDb` used `gt` (strict greater-than) when filtering released players:

```ts
OR: [
  { releasedAt: null },
  { releasedAt: { gt: period.startDate } },  // WRONG: strict
],
```

A player released at exactly `period.startDate` (midnight UTC — the standard roster-settlement timestamp at period boundaries) was on the team at the period's very first moment and their stats belong to that team for the period. The strict `gt` predicate excluded them entirely, silently dropping their contributions from the standings calculation.

**Real-world impact:** Three RGing Sluggers players (Moreno 2R, Bailey 2R, Bader 1R) were released at midnight on period 2's start date. Their 5 combined Runs were credited to no team, causing RGing Sluggers to be incorrectly ranked below Demolition Lumber Co. in Runs (136 vs 137). Across all 8 teams, 73 total Runs went uncredited in period 2.

### Bug 2 — IL exclusion used current roster slot, not historical position

Both `computeWithDailyStats` and `computeWithPeriodStats` skipped IL players by reading the current `assignedPosition` field on the roster row:

```ts
if ((roster.assignedPosition ?? "").toUpperCase() === "IL") continue;
```

This is a point-in-time snapshot. For historical periods it produces two classes of error:

- **Retroactive exclusion (wrong):** A player who was active during period 1 but was subsequently placed on IL had their period 1 stats removed from the standings retroactively.
- **Wrong-reason exclusion (accidentally correct):** A player currently on IL but who was active during period N had their stats excluded for all historical periods, not just the current one.

**Real-world impact:** Mookie Betts (LDY) was active during period 1 (R=7, HR=2, RBI=7) and IL-stashed at the start of period 2. The static IL check excluded his period 1 stats entirely, undercounting LDY's period 1 totals.

## Solution

### Fix 1 — Change `gt` to `gte` on `releasedAt` (one character)

In `computeTeamStatsFromDb`, the OR clause must use an inclusive lower bound:

```ts
// Before (wrong — excludes players released at the boundary moment)
OR: [
  { releasedAt: null },
  { releasedAt: { gt: period.startDate } },
],

// After (correct — players released at exactly startDate were present at period start)
OR: [
  { releasedAt: null },
  { releasedAt: { gte: period.startDate } },
],
```

### Fix 2 — Date-aware IL exclusion via transaction event log

**Step 1 — `buildIlWindows()` helper**

Reconstructs open/closed IL stints for every player from `IL_STASH` / `IL_ACTIVATE` events:

```ts
type IlWindow = { start: Date; end: Date | null };

function buildIlWindows(
  events: { playerId: number | null; transactionType: string | null; effDate: Date | null }[],
): Map<number, IlWindow[]> {
  const byPlayer = new Map<number, typeof events>();
  for (const e of events) {
    if (!e.playerId || !e.effDate) continue;
    const list = byPlayer.get(e.playerId) ?? [];
    list.push(e);
    byPlayer.set(e.playerId, list);
  }

  const windows = new Map<number, IlWindow[]>();
  for (const [playerId, playerEvents] of byPlayer) {
    const sorted = [...playerEvents].sort(
      (a, b) => a.effDate!.getTime() - b.effDate!.getTime(),
    );
    const stints: IlWindow[] = [];
    let ilStart: Date | null = null;
    for (const e of sorted) {
      if (e.transactionType === "IL_STASH" && ilStart === null) {
        ilStart = e.effDate!;
      } else if (e.transactionType === "IL_ACTIVATE" && ilStart !== null) {
        stints.push({ start: ilStart, end: e.effDate! });
        ilStart = null;
      }
    }
    // Still on IL with no closing activation event
    if (ilStart !== null) stints.push({ start: ilStart, end: null });
    if (stints.length > 0) windows.set(playerId, stints);
  }
  return windows;
}
```

**Step 2 — `wasOnIlAtPeriodStart()` predicate**

Point-in-time check: was the player inside an IL window at the period's opening moment?

```ts
function wasOnIlAtPeriodStart(
  playerId: number,
  periodStart: Date,
  ilWindowsByPlayer: Map<number, IlWindow[]>,
): boolean {
  const stints = ilWindowsByPlayer.get(playerId);
  if (!stints) return false;
  return stints.some(
    w => w.start <= periodStart && (w.end === null || w.end > periodStart),
  );
}
```

**Step 3 — Fetch IL events and build windows in `computeTeamStatsFromDb()`**

After the roster fetch, before branching to either compute path:

```ts
const rosterPlayerIds = [...new Set(rosters.map(r => r.playerId))];
const ilEvents = await prisma.transactionEvent.findMany({
  where: {
    playerId: { in: rosterPlayerIds },
    transactionType: { in: ["IL_STASH", "IL_ACTIVATE"] },
    effDate: { not: null },
  },
  select: { playerId: true, transactionType: true, effDate: true },
  orderBy: { effDate: "asc" },
});
const ilWindowsByPlayer = buildIlWindows(ilEvents);

// Pass ilWindowsByPlayer into both compute paths:
return computeWithPeriodStats(teams, rosters, period, ilWindowsByPlayer);
// or
return computeWithDailyStats(teams, rosters, period, ilWindowsByPlayer);
```

**Step 4 — Replace the static IL check in both compute functions**

```ts
// Remove (reads current snapshot — wrong for historical periods):
if ((roster.assignedPosition ?? "").toUpperCase() === "IL") continue;

// Replace with (reads reconstructed historical window):
if (wasOnIlAtPeriodStart(roster.playerId, period.startDate, ilWindowsByPlayer)) continue;
```

## Prevention

### Roster query date ranges — what to watch for

Any query filtering roster history by `startDate`/`endDate` must treat period boundaries as **inclusive on the start, exclusive on the end** (`gte startDate, lt endDate`). Auction drafts, keeper releases, and waiver claims are frequently stamped at exact midnight UTC boundaries. A `gt` instead of `gte` on the start silently drops those players from the period entirely — no error, just a lower stat total. Whenever you touch `releasedAt`, `acquiredAt`, or `effDate` filters, ask: "could a legitimate event land exactly on this timestamp?" The answer for period starts is almost always yes.

### Current state vs. historical state — the right mental model

"What is true now" and "what was true during period N" are different queries. Current-state fields (`assignedPosition`, `isOnIL`) are snapshots valid only at this moment. Using them to filter historical periods is a category error — it silently rewrites history. The source of truth for historical state is the **TransactionEvent log** (`effDate`-ordered). Any time you see current-state fields inside a standings or period-scoped aggregation, treat that as a red flag requiring an explicit audit.

### Auditing for silent undercounting

Compare computed period totals against a known-good external source (FanGraphs WK column, MLB box scores). A systematic shortfall for one team — especially a team that drafted keepers or made early IL moves — is the fingerprint of a boundary or historical-state bug. Writing period-boundary unit tests (players acquired/released at exact `startDate`) and IL-transition tests (stash mid-period, activate next period) should accompany any roster-query change.

### Todo #155 — mid-period IL granularity limitation

IL exclusion currently operates at **period granularity**: a player stashed on day 3 of a 7-day period is excluded for the full period, not just days 3–7. This is a known, intentional simplification. Do not mistake undercounting caused by this limitation for a bug — and do not remove it without replacing it with day-level `effDate` math and corresponding tests.

## Tests

- `server/src/features/standings/__tests__/standingsService.IL.test.ts` — IL exclusion behavior: stash at/before period start, mid-period stash (included), IL_ACTIVATE restoring stats, multiple stints, period-before-stash counts
- `server/src/features/standings/__tests__/standingsService.releaseAt.test.ts` — releasedAt boundary behavior: released at period start credits releasing team, released before period gets nothing, mid-period trade goes to new owner, no double-counting

## Related

- `docs/solutions/logic-errors/standings-stats-source-heuristic-chose-inaccurate-daily-over-period.md` — same `computeTeamStatsFromDb` function; covers the `PlayerStatsPeriod` vs `playerStatsDaily` routing bug and also has a note on the `gt` vs `gte` trap
- `docs/solutions/logic-errors/trade-reversal-ghost-roster-double-counting.md` — `computeWithPeriodStats` attribution query and the `activePlayerTeam` map that prevents double-counting after trade reversals
- `docs/solutions/logic-errors/period-date-timezone-shift.md` — midnight UTC off-by-one on date parsing; complementary to the boundary condition documented here
