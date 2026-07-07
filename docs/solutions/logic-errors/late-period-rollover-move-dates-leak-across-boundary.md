---
title: "Late period rollover leaked roster-move dates across the period boundary"
slug: late-period-rollover-move-dates-leak-across-boundary
category: logic-errors
date: 2026-07-06
component: "periods, transactions, standings, roster ownership-window"
problem_type: operational-date-misattribution
symptom: "Dropped players still appeared in the current period's roster (league-wide), and first-day stats mis-attributed, because a period rollover ran a day late and every add/drop defaulted to today's date"
root_cause: "Period 5 started Sun 07-05 but the rollover (status flip) + owners' roster moves happened Mon 07-06; add/drop effective dates default to 'today', and half-open ownership-window attribution ([acquiredAt, releasedAt)) counts any overlap — so a 07-06-dated drop was still owned on 07-05 and leaked into Period 5"
related_modules: "periods, transactions, standings, roster"
tags: [periods, rollover, ownership-window, acquiredAt, releasedAt, effDate, period-boundary, il_stash, source-label, OGBA, ADR-013, operational-fix]
severity: high
---

# Late period rollover leaked roster-move dates across the period boundary

## Symptom

An owner (Los Doyers / LDY) reported that players they had **dropped** for Period 5 were still showing on their roster for the current period. Concretely, LDY's drops — Matthew Liberatore, Colin Rea, Jonah Cox — all had `releasedAt = 2026-07-06`, and its adds — Eury Pérez, Matt McLain, Will Klein — all had `acquiredAt = 2026-07-06`.

It was **not one team**. Every one of the 8 OGBA teams had set their Period 5 roster on **07-06**: 31 adds + 35 drops + 71 `TransactionEvent`s + 4 `RosterSlotEvent`s (IL), all dated 07-06. Period 5's window is **07-05 → 08-01**.

Two consequences, one cosmetic and one that touches money:
1. **Roster view** — dropped players still appeared in Period 5 (their ownership window overlapped 07-05).
2. **Scoring** — every dropped player's **07-05 stats still counted for the old team**, and every added player's **07-05 stats did not count** — league-wide.

## Root cause — two things lining up

1. **The rollover ran a day late.** Period rollover is **manual** (`PATCH /api/periods/:id` flips `status`; there is no cron that auto-advances periods). Period 5's `startDate` was 07-05 (Sunday), but the status flip (P4 → `completed`, P5 → `active`) and all the owner roster moves happened 07-06 (Monday).
2. **Move effective dates default to "today."** An add/drop with no explicit effective date stamps `acquiredAt` / `releasedAt` = now (07-06).

Combined with **half-open ownership-window attribution** — a player is credited for the days `[acquiredAt, releasedAt)` and standings compute live from that (`computeTeamStatsFromDb`, ADR-013) — a player dropped with `releasedAt = 07-06` was still *owned* on 07-05, the first day of Period 5. So he shows in the Period 5 roster and gets 07-05 credit. See the canonical boundary rule in [standings-boundary-and-il-slot-historical-lookup](./standings-boundary-and-il-slot-historical-lookup.md): released **on** the period start ⇒ credited to no team; released **after** it ⇒ leaks in.

## How it was diagnosed

- Pulled the reporting team's roster: drops dated 07-06, not 07-05. **Not a display bug** — the data was dated a day late.
- Widened to the whole league (`Roster.acquiredAt` / `releasedAt` on 07-06, grouped by team): all 8 teams, ~66 rows.
- Confirmed standings *compute* fine (so it wasn't a crash) but attribute 07-05 to the wrong owners.

## Fix (operational — data backdate)

This was corrected as **data**, not a code deploy: backdate every 07-06 move to the period start `2026-07-05T00:00:00.000Z` (matching Period 5's actual stored `startDate`), league-wide, in **one atomic transaction**:

```ts
const P5_START = new Date("2026-07-05T00:00:00.000Z"); // == period.startDate for P5
await prisma.$transaction(async (tx) => {
  await tx.roster.updateMany({ where: { teamId: { in: teamIds }, acquiredAt: {gte: J6, lt: J7} }, data: { acquiredAt: P5_START } }); // 31 adds
  await tx.roster.updateMany({ where: { teamId: { in: teamIds }, releasedAt: {gte: J6, lt: J7} }, data: { releasedAt: P5_START } }); // 35 drops
  await tx.transactionEvent.updateMany({ where: { leagueId: 20, effDate: {gte: J6, lt: J7} }, data: { effDate: P5_START } });        // 71 events
  await tx.rosterSlotEvent.updateMany({ where: { leagueId: 20, effDate: {gte: J6, lt: J7} }, data: { effDate: P5_START } });         // 4 IL events
});
```

> **Match the period's actual `startDate` shape.** Periods created via `PATCH /api/periods/:id` use a **noon-UTC** shape (`new Date(dateStr + "T12:00:00Z")`), but this season's periods were seeded at **midnight-UTC** (`T00:00:00Z`). The backdate value must equal the period's *stored* `startDate` so the `acquiredAt <= startDate` / half-open `releasedAt` comparisons land correctly — don't blindly "normalize" to noon. See [period-end-fixture-uses-noon-not-midnight-shape](../test-failures/period-end-fixture-uses-noon-not-midnight-shape.md) and [period-date-timezone-shift](./period-date-timezone-shift.md).

Backdating the `releasedAt` of a drop **to** the period start makes the dropped player owned only through the *prior* period (half-open window excludes the start instant onward), so they drop out of Period 5 entirely; backdating an add's `acquiredAt` to the period start makes it owned for the whole period. `TransactionEvent.effDate` and `RosterSlotEvent.effDate` are moved too so the activity log and IL-stint records stay consistent (nothing computes scoring from those, but display/audit should agree).

## Secondary fix — `il_stash` source mislabeled active replacements

When you IL-stash a player and pick up a replacement in one transaction (`/transactions/il-stash`), the **replacement's** Roster row is written with `source: "il_stash"`. The UI renders that as an **"IL Stash"** badge — on a player who is actually an **active** starter (e.g. Cole Carrigg, an active OF; only Ronald Acuña was on IL). The stashed player's IL status comes from `assignedPosition = "IL"` + the `RosterSlotEvent(IL_STASH)`, **not** from `source`.

`source: "il_stash"` is **not read functionally anywhere** (grep confirmed); the auction/keeper logic only branches on `source === "prior_season"`. So the 4 active `il_stash` rows league-wide (Carrigg/DLC, Stott/DDG, Ewing/RGS, Henderson/TSH) were relabeled to `"waiver_claim"` (the value a normal claim uses), so they read as "Claimed":

```ts
await prisma.roster.updateMany({
  where: { teamId: { in: teamIds }, releasedAt: null, source: "il_stash", assignedPosition: { not: "IL" } },
  data: { source: "waiver_claim" },
});
```

This is the same "a `source` value is cosmetic/mislabeled and nothing reads it" pattern as [auction-results-reads-current-rosters-not-snapshot](./auction-results-reads-current-rosters-not-snapshot.md).

## Verification

- `0` roster rows league-wide with `releasedAt > P5 start` ⇒ no dropped player overlaps Period 5.
- `computeTeamStatsFromDb(20, 39)` succeeds; standings sensible (DLC 59, LDY 57, DDG 56.5).
- Roster-rules audit: all 8 teams `14 batters (OF:5) + 9 P`, DLC additionally `+1 IL (Acuña)` — all compliant.
- `0` active `il_stash` rows remain.

## Prevention

- **Roll periods over on the boundary date, not late.** The manual `PATCH .../periods/:id` flip is easy to forget over a weekend. Prevention options: a cron that advances `pending → active` / `active → completed` on `startDate` / `endDate`, or a commissioner reminder.
- **When you DO roll over late, backdate the transition moves to the period start** — the same fix above. "New rosters for the new period" means the moves must be effective the *period start*, not the day they were entered.
- **Ownership-window boundary is half-open `[acquiredAt, releasedAt)`.** A move dated one day off the period boundary is invisible to type-checks and tests — it only shows as "a dropped player still on my roster" or a small standings drift. Audit the boundary date, not just the roster contents.
- **A current-state `source` label is cosmetic** unless something reads it — don't overload it with flow-of-acquisition meaning that then leaks into the UI as a status.

## Related
- [standings-boundary-and-il-slot-historical-lookup](./standings-boundary-and-il-slot-historical-lookup.md) — the canonical released-on-period-start boundary rule (why a 07-06 drop leaks into 07-05).
- [period-roster-historical-il-display-and-gte-boundary](./period-roster-historical-il-display-and-gte-boundary.md) — "ghost players who owned zero days of the period"; same symptom class.
- [mid-period-pickup-degrades-whole-period-to-daily-stats](./mid-period-pickup-degrades-whole-period-to-daily-stats.md) — a different cause of the same "period attribution wrong" failure.
- [onroto-vs-fbst-stat-attribution-semantics](./onroto-vs-fbst-stat-attribution-semantics.md) — the ownership-window model (ADR-013) itself.
- [current-state-field-used-as-historical-predicate](./current-state-field-used-as-historical-predicate.md) — the `source`-is-current-state anti-pattern.
