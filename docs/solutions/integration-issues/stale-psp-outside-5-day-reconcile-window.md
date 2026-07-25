---
title: "Standings residual with ALL counting stats exact = stale PSP outside the 5-day reconcile window (not attribution, not FG-stale)"
slug: stale-psp-outside-5-day-reconcile-window
category: integration-issues
problem_type: data_staleness / reconciliation_gap
component: mlb-data-sync, standings, fangraphs-audit
date_documented: 2026-07-24
severity: high
symptoms:
  - OnRoto/FanGraphs audit shows a small rate-stat residual (ERA / WHIP / AVG) while every counting stat matches exactly
  - Team ERA off by ~0.01–0.05 with identical IP, SO, W and SV
  - A roto category rank flips between two teams on a hair's-breadth rate difference
  - audit-mlb-crosscheck reports 0 flagged, yet the standings still do not reconcile
  - A player's PlayerStatsPeriod row disagrees with MLB.com and Baseball Reference for a period that closed more than 5 days ago
related_files:
  - server/src/features/players/services/mlbStatsSyncService.ts
  - server/src/features/standings/services/standingsService.ts
  - server/src/scripts/fangraphs-audit.ts
  - server/src/scripts/audit-mlb-crosscheck.ts
  - docs/solutions/integration-issues/onroto-fangraphs-audit-runbook.md
tags:
  - reconciliation
  - psp-staleness
  - mlb-statsapi
  - closed-periods
  - onroto-audit
  - adr-014
  - scoring-corrections
# ── docs board fields (docs/README-DOCS.md) ──
id: DOC-023
description: "Counting stats exact but ERA/WHIP/AVG off means stale PlayerStatsPeriod values, not attribution. The reconciler only looks back 5 days."
type: solution
status: active
phase: null
owner: james
tags_board: [scoring, data-sync]
links: [DOC-022, DOC-016]
updated: 2026-07-24
---

# Standings residual with all counting stats exact = stale PSP

## Symptom

An OnRoto/FanGraphs audit that *almost* reconciles:

```
RAW mismatches: 4 / 80
  Dodger Dawgs  ERA   FBST=3.69   FG=3.65     ← 0.04
  Dodger Dawgs  WHIP  FBST=1.221  FG=1.220
  Skunk Dogs    AVG   FBST=.2587  FG=.2588
  The Show      AVG   FBST=.2543  FG=.2541
```

All 56 counting-stat cells (R, HR, RBI, SB, W, SV, SO) match **exactly**. Only rate stats
diverge. A category rank may flip on it — in the 2026-07-24 case the ERA rank swapped
between two teams, moving 1 roto point each way.

## The diagnostic signature — read this first

This is the whole value of the doc. **Rate stats off while `IP`, `SO`, `W` and `SV` are all
exact** narrows the cause to exactly one thing.

| Observation | What it rules out |
|---|---|
| Counting stats exact across all teams | **Sync lag.** A day-behind FanGraphs would move R/HR/RBI too. |
| `IP`, `SO`, `W`, `SV` exact for the affected team | **Ownership-window / attribution (ADR-013).** A different window changes integer counting stats — you cannot add or drop a game without moving innings and strikeouts. |
| `ER` and/or `H`/`BB` differ on that same identical game set | **The only thing left:** wrong *stat values* for games both sides agree happened. |

Wrong values for an agreed game set = **a stale `PlayerStatsPeriod` row**. MLB routinely
revises earned/unearned scoring decisions and hit/error rulings days or weeks after a game.

> **Corollary:** `audit-mlb-crosscheck` returning `0 flagged` does **not** clear this. That
> script skips partial-ownership and IL players (366 of 466 in OGBA). A residual can live
> entirely inside the skipped set. "0 flagged" means *no error among fully-owned players*,
> not *no error*.

## Root cause

`reconcileRecentlyClosedPeriods` — `server/src/features/players/services/mlbStatsSyncService.ts`:

```ts
const windowDays = opts.windowDays ?? 5;
const cutoff = new Date(now.getTime() - windowDays * 864e5);

const periods = await prisma.period.findMany({
  where: { status: "completed", endDate: { gte: cutoff, lte: now } },
  ...
});
```

The daily 14:00 UTC reconcile job **only examines periods that closed within the last 5
days.** Once a period ages past that, nothing ever re-checks it. Any MLB correction landing
after the period's last sync is baked in **permanently**.

Worked instance (2026-07-24): Period 4 closed 2026-07-04, left the window on 2026-07-09.
Sean Manaea's line sat at `ER=17, BB+H=36` while MLB.com, Baseball Reference **and**
FanGraphs all said `ER=14, BB+H=35` on identical `IP=29.0, SO=26, W=1`.

## Investigation dead-ends (don't repeat these)

| Hypothesis | Why it was wrong |
|---|---|
| **Position-player mop-up pitching (todo #306)** | Already fixed in PR #412 — `playerStatRoles` excludes it. Also the affected team had *zero* position-player pitching. |
| **Runs recorded instead of earned runs** | FBST's 17 is neither MLB's `ER=14` nor `R=19`. |
| **HBP included in BB+H** | FBST's 36 is neither `H+BB=35` nor `H+BB+HBP=39`. |
| **ADR-013 attribution divergence** | Ruled out by the signature above — `SO`/`W`/`SV` matched. |

### The measuring-instrument trap (cost real time here, and in PR #402)

A hand-rolled query that sums `PlayerStatsPeriod` directly **will appear to reproduce todo
#306**, because it bypasses `playerStatRoles`. Position players legitimately carry pitching
lines in raw PSP — PSP mirrors MLB's raw stats; the *scoring layer* excludes them.

**Never reconcile from a raw PSP sum.** Go through `accumulatePeriodStats`
(`fangraphs-audit.ts`, exported) or the audit scripts, which apply the same attribution and
role rules production does.

## Fix

### 1. Confirm with a dry run (no writes)

```ts
import { reconcilePeriodStats } from "../features/players/services/mlbStatsSyncService.js";
const report = await reconcilePeriodStats(periodId);   // diff only
console.log(report.fetchErrors, report.mismatches);
```

Output is field-level and authoritative — it re-fetches from the production MLB path:

```
mismatches=5
  {"playerId":1538,"mlbId":643289,"field":"AB","stored":83,"fresh":84}
  {"playerId":1538,"mlbId":643289,"field":"H","stored":23,"fresh":24}
  {"playerId":1701,"mlbId":640455,"field":"ER","stored":17,"fresh":14}
  {"playerId":1701,"mlbId":640455,"field":"BB_H","stored":36,"fresh":35}
  {"playerId":985,"mlbId":689414,"field":"H","stored":24,"fresh":23}
```

### 2. Heal through the production path — do not hand-write PSP rows

```ts
// windowDays widened just enough to include the target period, and no others.
const entries = await reconcileRecentlyClosedPeriods({ windowDays: 25 });
// → { periodId: 38, periodName: "Period 4", status: "healed",
//     mismatchesBefore: 5, mismatchesAfter: 0 }
```

This runs reconcile → detect drift → `syncPeriodStats` → re-reconcile → verify. It is the
same code path the nightly job uses, so there is no bespoke write logic to get wrong.

**Scope it deliberately.** Pick `windowDays` so only the intended period qualifies — check
each period's age first. `status: "active"` periods are excluded by the query, so a live
period is never touched.

### 3. Verify

```bash
npx tsx src/scripts/fangraphs-audit.ts 20      # re-run FBST totals
# then re-diff all 80 cells against a fresh FanGraphs scrape
```

Confirm FanGraphs' `STANDINGS through MM.DD.YY` header is unchanged between the before and
after scrapes, or the comparison is not like-for-like.

## Prevention

| Practice | Why |
|---|---|
| **Ship todo #301 — nightly diff of ALL closed periods** | The real fix. Alert-only, no auto-heal needed for old periods: it is the same diff the reconciler already performs, minus the 5-day filter. |
| **Treat "counting stats exact + rate stats off" as this bug until proven otherwise** | It is a near-unique signature. Jump straight to `reconcilePeriodStats` on the suspect period. |
| **Never trust `0 flagged` from audit-mlb-crosscheck alone** | It skips partial-ownership and IL players — where this residual lives. |
| **Reconcile through `accumulatePeriodStats`, never a raw PSP sum** | Raw sums bypass `playerStatRoles` and manufacture phantom #306 sightings. |
| **Re-run the crosscheck after any heal** | MLB revises continuously. See below. |

### Drift is continuous, not a one-off

Two hours after the 2026-07-24 heal, the closing crosscheck flagged **two players that had
passed at the start of the same session** — Cristopher Sánchez (ER 40 vs MLB 39) and Andy
Pages (RBI 68 vs 67, H 105 vs 104). Neither was touched by the heal, so their stored values
were unchanged: **MLB revised them mid-session.**

Expect new drift on roughly this cadence. Any period outside the 5-day window will
accumulate it silently until #301 exists.

### Suggested regression test

```ts
it("reconcile window covers every closed period, not just recent ones", async () => {
  // Guards the specific gap: a period closed 30 days ago must still be diffed.
  const periods = await prisma.period.findMany({ where: { status: "completed" } });
  const checked = await periodsCoveredByNightlyReconcile();
  expect(checked.map(p => p.id).sort()).toEqual(periods.map(p => p.id).sort());
});
```

## The generalizable lesson

> **A reconciler with a lookback window is only as good as its window.** Anything older is
> not "verified" — it is *unobserved*, and unobserved state drifts silently in one
> direction. If an upstream source revises history (MLB scoring decisions, bank settlement
> corrections, invoice adjustments), a bounded reconcile window converts every late
> revision into permanent local corruption.

Two questions worth asking of any reconciler in this codebase:

1. **What is outside the window, and who checks it?** If the answer is "nobody," that is the bug.
2. **Does the upstream source revise history?** If yes, a bounded window is not a design choice — it is a data-loss mechanism.

## Related

- `docs/reports/onroto-audit-2026-07-24.md` (DOC-022) — the full audit that found it
- `docs/solutions/integration-issues/onroto-fangraphs-audit-runbook.md` — the audit procedure
- `docs/solutions/integration-issues/fangraphs-era-residual-is-rounding-not-a-bug.md` — **partially superseded.** That doc concluded a small ERA residual is FG-stale rounding. True for sub-0.01; a **0.04** residual with exact counting stats is *this* bug instead.
- `docs/solutions/integration-issues/statsapi-leads-bbref-fangraphs-on-todays-games-align-as-of-date.md` — align as-of dates before calling any discrepancy
- `docs/solutions/logic-errors/position-player-pitching-counted-in-team-era.md` — the #306 fix this was initially mistaken for
- `todos/301-pending-p1-periodic-closed-period-reconcile-alarm.md` — the structural fix
