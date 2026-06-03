---
title: Period stats reattributed to current owner after closed-period trade
slug: psp-current-owner-reattributes-closed-period-stats
category: logic-errors
created: 2026-06-02
component: standings, period-stats, attribution
problem_type: attribution_drift
symptom: Standings drift ~4-5 pts per team after post-period trades; FanGraphs audit shows divergence
root_cause: computeWithPeriodStats credited PSP to current holder (releasedAt null) instead of end-of-period owner
related_modules: standings, periods, transactions, roster
prs: [365]
tags: standings, mid-season-trades, closed-period, psp, attribution, fangraphs-audit, end-of-period-owner
---

## Symptom

Standings silently shift after a post-period trade. The team that owned a player throughout a closed period quietly loses ~4-5 points per affected category swing per trade, while the team that acquired the player AFTER the period ended gains stats they didn't earn. Total points still sum to the expected period total (zero-sum invariant intact), so casual observation misses it — the bug only surfaces when comparing FBST production standings against an external source of truth (FG OnRoto, commissioner's Excel snapshot). That comparison shows mid-single-digit divergence concentrated on the teams involved in post-period trades, with no obvious cause in the activity log.

Concrete case (2026-06-02 audit): Bryson Stott on Skunk Dogs throughout Period 1 (3/25–4/18), released 4/19, acquired by Dodger Dawgs 4/19. Production credited his entire P1 line to DDG. SKD silently dropped 4-5 points in P1 standings on a trade that happened AFTER P1 ended.

## Investigation

1. Started from a 2026-06-02 FanGraphs audit run — season-total Σ|Δ| = 11 vs FG, larger than the usual nightly-sync lag.
2. PR #364 had just fixed the audit script to use PSP-based attribution with ownership-overlap windows. Re-running it for Period 2 vs the commissioner's Excel snapshot gave Σ|Δ| = 0.0 — exact match.
3. Period 1 still had a residual 13-point delta vs Excel; SKD was the +5 outlier (audit said SKD should have ~5 more points than production showed).
4. Drilled into SKD's P1 per-player attribution: all 23 rostered players were credited, no IL-window skip issues, no multi-team overlap bugs, no double-counting. Audit-side math was clean.
5. Formed hypothesis: maybe the audit was wrong and production was right. Switched the audit script to mirror production's "current owner" logic exactly (`releasedAt === null` snapshot). Σ|Δ| WORSENED to 29.
6. That inversion was the smoking gun — the audit using ownership-overlap was MORE correct than production. Production had the bug, not the audit.
7. Opened `server/src/features/standings/services/standingsService.ts` and read `computeWithPeriodStats`. The `activePlayerTeam` map keyed on `releasedAt === null` jumped out: classic "snapshot current roster state" logic being applied to a historical closed period. Confirmed against the Stott case — his current roster row was DDG with `releasedAt = null`, so production gave DDG his P1 PSP credit, and SKD's older `releasedAt = 4/19` row was filtered out.

## Root cause

```ts
// OLD — server/src/features/standings/services/standingsService.ts:597-627
const activePlayerTeam = new Map<number, number>();
for (const r of rosters) {
  if (r.releasedAt === null) {
    activePlayerTeam.set(r.playerId, r.teamId);
  }
}

return teams.map((t) => {
  // ...
  for (const roster of teamRosters) {
    // ...
    const currentTeam = activePlayerTeam.get(roster.playerId);
    if (currentTeam !== t.id) continue;
    // credit team t with the player's PSP
  }
});
```

The predicate decides attribution for a HISTORICAL period using CURRENT roster state (`releasedAt === null` at query time). For an in-progress period this is approximately right — you can't trade a player you don't own right now. For a closed period it's wrong: any trade that happens AFTER the period ends silently reassigns the closed period's credit to the new owner, because the new owner is now the one with `releasedAt === null`.

The PSP row stores aggregate stats per (player, periodId) — it does NOT store which team owned the player when those stats were earned. Attribution has to be reconstructed from `Roster.acquiredAt` / `releasedAt` boundaries against `period.endDate`, not inferred from "who has them now." The bug had persisted because the existing 9 tests in `standingsService.releaseAt.test.ts` covered release-during-period and IL scenarios but never the post-period-trade case.

## Fix

```ts
// NEW — same file, same lines (PR #365)
// A team "held the player on period.endDate" iff there is a roster row with
// acquiredAt <= endDate AND (releasedAt IS NULL OR releasedAt > endDate).
const endOfPeriodOwner = new Map<number, number>();
for (const r of rosters) {
  if (r.acquiredAt > period.endDate) continue;
  if (r.releasedAt !== null && r.releasedAt <= period.endDate) continue;
  if (endOfPeriodOwner.get(r.playerId) === undefined) {
    endOfPeriodOwner.set(r.playerId, r.teamId);
  }
}

return teams.map((t) => {
  // ...
  for (const roster of teamRosters) {
    // ...
    const endOwner = endOfPeriodOwner.get(roster.playerId);
    if (endOwner !== t.id) continue;
    // credit team t with the player's PSP
  }
});
```

Notes:
- New regression test at `standingsService.releaseAt.test.ts:109` mirrors the Stott/SKD scenario directly — player held by Team A through period end, traded to Team B after the period closes, asserts Team A keeps the PSP credit.
- The existing 9 tests still pass; none of them exercised the post-period-trade case, which is exactly why the bug shipped and survived.
- File header docstring updated to spell out the new attribution rule (end-of-period ownership window, not current roster state).
- Full standings suite: 84/84 green.

## Related work

**Related solution docs:**
- `docs/solutions/integration-issues/mlb-statsapi-sync-hasstats-filter-drops-er-rbi.md` — previous round of standings investigation; FanGraphs audit + sync hasStats filter dropping ER/RBI. Set the precedent for empirical FG-comparison debugging.
- `docs/solutions/logic-errors/standings-stat-attribution-and-avg-rounding.md` — Los Doyers free-agent phantom attribution (W=15, K=194 inflated); first time `releasedAt` semantics in standingsService were diagnosed as buggy.
- `docs/solutions/logic-errors/standings-boundary-and-il-slot-historical-lookup.md` — `releasedAt === periodStart` boundary exclusion + IL slot retroactive exclusion; closest prior art on roster ownership window math.
- `docs/solutions/logic-errors/trade-reversal-ghost-roster-double-counting.md` — period standings double-counting from ghost roster rows after trade reversal; same class of bug (trades corrupting closed-period credit).
- `docs/solutions/logic-errors/standings-stats-source-heuristic-chose-inaccurate-daily-over-period.md` — established `PlayerStatsPeriod` as authoritative source vs `playerStatsDaily` doubleheader collapse; the data-source half of the trust hierarchy this bug exercises.
- `docs/solutions/logic-errors/period-roster-historical-il-display-and-gte-boundary.md` — period-roster endpoint sibling of standings boundary fix; same `gte` boundary + historical IL pattern.

**Related PRs:**
- #365 `fix(standings): closed-period attribution to END-of-period owner (closes #242)` — the fix PR for this exact bug.
- #364 `fix(audit): fangraphs-audit.ts reads PlayerStatsPeriod + trust-hierarchy doc` — companion audit-tool fix.
- #343 `standings service correctness — guard ordering, parallelize queries, ilWindows log, doc attribution` — most recent attribution-doc cleanup; touches the same function.
- #335 `countedPlayers ordering bug, attribution docs, parallelize ilEvents query` — prior attribution ordering bug in same service.
- #241 `exclude IL-slotted players from team stat totals (#155)` — IL slot exclusion in standings totals.
- #176 `weighted averaging for rate stats` — earlier standingsService correctness pass.

## Prevention

### Naming conventions for time-aware predicates

- A variable named `currentTeam` is a SNAPSHOT — using it in a HISTORICAL computation is a category error. Rename to `historicalOwnerAt(date)` or `ownerDuring(period)` to force the time dimension into the name. If you can't append a time qualifier to the variable, you don't know which dimension it answers.
- A boolean check like `r.releasedAt === null` answers "are they still rostered NOW?", not "did they own them in 2026-04?". Wrap these into named predicates: `isCurrentlyRostered(r)` vs `wasRosteredDuring(r, period)`. Once the predicate has a name, the mismatched call site stands out in review.
- The `Roster` model has natural date columns (`acquiredAt`, `releasedAt`); any boolean derived from these without naming the time dimension is a bug seed. Prefer `roster.windowOverlaps(period)` over inline `releasedAt === null || releasedAt >= period.startDate` mixed with `acquiredAt <= period.endDate`.
- Avoid the word "current" in any function that takes a date or period parameter. If the function is parameterized by time, every variable inside it should also be parameterized by time.
- Lint rule candidate: flag any reference to `currentTeam` / `currentOwner` / `releasedAt === null` inside files that import `PlayerStatsPeriod` or `period.startDate` / `period.endDate`.

### When PSP attribution diverges from PSD attribution

The standings code now has two stat-aggregation paths with intentionally different attribution semantics:

- **`computeWithDailyStats` (PSD path)** — uses per-day ownership windows. A player traded mid-period gets stats split by ownership window. This is the precise path.
- **`computeWithPeriodStats` (PSP path)** — attributes by ownership during the period, **not** by end-of-period ownership and **not** by current ownership. PSP is a whole-period aggregate and cannot be split, so a mid-period trade requires falling back to PSD or accepting a documented coarse rule (e.g. credit the team that held the player on the period's last date).

**Rule for future refactors:** when introducing or modifying either path, add a paired test that runs BOTH paths on the same scenario and asserts they agree on per-team totals (within stat-granularity rounding). If they can't agree by construction (e.g. mid-period trade with no PSD), document why in a comment adjacent to the divergence and add an explicit "PSP path coarsens this case" test.

### Test cases to keep / add

The 10 tests in `server/src/features/standings/__tests__/standingsService.releaseAt.test.ts` cover:

1. Player released AT period startDate → no credit (existing)
2. Player released BEFORE period startDate → no credit (existing)
3. Player traded MID-period → goes to new team (existing, PSD path)
4. Both releasing + acquiring entries at period start, no double-count (existing)
5. Pitcher dropped as free agent → no credit (existing)
6. Multiple simultaneous free agents → no credit (existing)
7. Player on IL at period start → no credit (existing)
8. **Player on team A through closed period, traded to team B after period ends → A keeps closed-period credit** (NEW, todo #242 regression — this is the case the bug fix locks in)
9. Other existing tests covering the daily-stats path
10. Existing free-agent / undefined-currentTeam guard

**Add an 11th — three-way trade DURING a closed period:** A held player days 1–10, B days 11–20, C days 21–28 of a 28-day closed period. PSP has no daily breakdown to split; the test should pin the documented semantic (either "fall through to PSD when any ownership change occurs in-period" or "credit end-of-period owner with a `STANDINGS_PSP_COARSENING` comment"). Either decision is defensible; what's not defensible is leaving it unspecified — that's how `currentTeam` snuck in the first time.

### How to catch this class of bug going forward

- **Test scenario coverage matrix** — every standings function should have explicit tests across the (released-before-period, released-at-startDate, released-mid-period, released-at-endDate, released-after-period, never-released) × (acquired-before-period, acquired-at-startDate, acquired-mid-period, acquired-at-endDate, acquired-after-period) matrix. Most cells produce predictable outcomes; **missing cells are bug seeds**. The (never-released, traded-after-period) cell is the one we just patched.
- **Differential testing** — for any scenario expressible in both paths, compute standings via `computeWithDailyStats` AND `computeWithPeriodStats` and assert agreement within rounding. Mismatches surface attribution drift in either direction; convergence is the strongest guarantee we can give about future refactors.
- **Snapshot regression** — capture a known-good standings snapshot the day after a period closes; replay the same period months later; flag any drift > 0.5 points per team that wasn't from a documented backfill. The bug we just fixed would have produced a non-zero per-team delta with zero league-total delta — a signature only a snapshot diff can detect.
- **Property-based test for zero-sum-doesn't-mean-correct** — generate random rosters + random post-period trades, assert per-team standings are stable across the trades (not just that totals are). The current bug satisfied the league-sum invariant while violating the per-team invariant; the league-sum invariant alone is not a safety net.

### The audit-vs-production trust check

Always run audits with the **same source production reads from** (PSP for whole-period; PSD for daily) AND a **second independent source** (e.g. MLB statsapi direct query, or FanGraphs scrape per `fangraphs_audit_reference.md`). Three outcomes, three meanings:

- **Both derived sources disagree** — data layer drift (sync gap, missing PSD rows, double-counted PSP). Fix the ingest.
- **Both derived sources agree, product matches** — system healthy.
- **Both derived sources agree, product diverges** — the bug is in the rendering / attribution layer. **This is exactly where todo #242 lived** — the underlying `PlayerStatsPeriod` rows were correct; only the attribution math was wrong. When you see this signature, jump straight to `computeWith*` functions, not the sync jobs.

Corollary: when a manager reports "my standings dropped overnight and I made no roster moves," check whether *another* manager in the league made a post-period trade involving a player who was on the reporter's team during the closed period. That's the signature of this exact bug class.
