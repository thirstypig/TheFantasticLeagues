---
status: complete
priority: p1
issue_id: 301
tags: [reconciliation, standings, ADR-014, alerting, closed-periods, confirmed-live]
dependencies: []
---

## Problem Statement
`reconcileRecentlyClosedPeriods` (`mlbStatsSyncService.ts:531`) only covers closed periods with `endDate ≥ now-5d`, PSP-only, core-fields-only. P1/P2/P3 (76/48/27 days closed) are unmonitored — a boundary edit or late MLB correction to an old period drifts forever with no alarm (exactly the June bug). Active periods, `PlayerStatsDaily`, and extended/rate fields are also uncovered. Evidence: `docs/reports/pipeline-staleness-audit-2026-07-02.md` Finding 4.

## Proposed Solutions
Add a nightly "re-audit ALL closed periods vs the MLB record" job that DIFFS (alert-only, no auto-heal needed for old periods) and fires the #299 alert on any drift. Cheap: it's the same diff the reconciler already does, just without the 5-day filter. Optionally extend field coverage to the rate/award feeders.

## Acceptance Criteria
- All closed periods (not just ≤5d) are diffed against MLB nightly; drift raises a durable alert.
- Reuses the production sync fetch path (not the non-faithful audit_period.ts).
- `git mv` this todo from pending → complete.

---

## CONFIRMED LIVE — 2026-07-24 OnRoto audit (priority raised P2 → P1)

This is no longer hypothetical. The drift this todo predicted has happened and is
**currently affecting production standings**.

**Instance:** Sean Manaea (mlbId 640455), Period 4 (2026-06-07 → 07-04),
Dodger Dawgs (owned 06-07 → 07-05, so the window covers the full period).

| Source | IP | ER | BB+H | SO | W |
|---|---|---|---|---|---|
| MLB.com statsapi (gameLog) | 29.00 | **14** | 35 | 26 | 1 |
| Baseball Reference | 29.00 | **14** | 35 | 26 | 1 |
| FanGraphs OnRoto | 29.0 | **14** | 35 | 26 | 1 |
| **FBST `PlayerStatsPeriod`** | 29.00 | **17** ❌ | **36** ❌ | 26 | 1 |

Three independent sources agree; FBST's frozen PSP row is wrong by **+3 ER, +1 BB+H**.
IP / SO / W are all exact, so this is **not** a boundary or attribution issue — it is
stale stat *values* for an identical set of six games (MLB revised earned/unearned
scoring after FBST's last sync of that period).

**Why nothing caught it:** Period 4 ended 2026-07-04. `reconcileRecentlyClosedPeriods`
uses `windowDays = 5`, so Period 4 left the reconcile window on **2026-07-09** and has
not been checked since. Exactly the failure mode described above.

**Standings impact (real, not cosmetic):**
- Dodger Dawgs ERA **3.69** (should be 3.65) · WHIP **1.221** (should be 1.220)
- Costs Dodger Dawgs 1 ERA point and gives Devil Dawgs 1 — an ERA rank swap
- League totals: Dodger 54.5 (should be 55.5), Devil 33.5 (should be 32.5)

**Immediate remediation — DONE 2026-07-24.** Period 4 was re-synced via
`reconcileRecentlyClosedPeriods({ windowDays: 25 })`; it healed 5 drifted fields across 3
players and standings now match OnRoto 80/80 exactly. That closes *this instance* but not
the leak.

**The leak is ongoing, and we watched it happen.** Two hours after the heal, the same
crosscheck flagged two players that had passed at the start of the session — Cristopher
Sánchez (ER 40 vs MLB 39) and Andy Pages (RBI 68 vs 67, H 105 vs 104) — neither of which
the re-sync touched. MLB revised them mid-session. Without this todo's nightly all-periods
diff, those drifts are now permanent too.

Full write-up: `docs/reports/onroto-audit-2026-07-24.md`.


## Resolution — 2026-08-31

**Closed.** `auditAllClosedPeriods` diffs EVERY closed period against the MLB record nightly at
03:20 UTC (after the 02:00 stats sync), with no 5-day window. Drift raises a durable alert through
the same Resend path and `ALERT_EMAIL_TO` as the #299 dead-man's switch, and the job itself is
tracked as a `JobRun` so a sweep that stops running is caught by that switch in turn.

**Alert-only, deliberately.** The 14:00 windowed reconciler auto-heals because a period closed in
the last five days has barely been looked at. An older period's standings have been seen and acted
on by owners — silently rewriting them is a worse failure than reporting the drift, so a human
decides. That is a behavioural difference from `reconcileRecentlyClosedPeriods`, not an oversight.

**Uses the production fetch path** (`reconcilePeriodStats`), per the AC — never `audit_period.ts`,
which classifies by *current* `assignedPosition` and double-counts drop-and-re-adds.

**`fetch_error` is not `clean`.** An unreachable MLB means we learned nothing, which is not the
same as learning the data is fine; unchecked periods count as needing attention. Same rule the
audit skill applies to INCOMPLETE. Mutation-verified: making fetch_error benign, or letting it
outrank real drift, each reddens exactly the test that guards it.

**Known limitation, recorded honestly:** `reconcilePeriodStats` shares `fetchFreshPeriodStats` with
the syncer by design (ADR-014 — it must compare against exactly what the syncer would write). So
this alarm catches *late MLB revisions to stored data*, which is what the todo was filed for, but
it structurally CANNOT catch a fetch-layer bug — it would re-read the same wrong value and report
clean. That is the `splits[0]` class (PR #429), and only an independent path (`gameLog`, i.e. the
`audit-standings` skill) reconciles it. Do not treat a clean nightly sweep as proof the data is
right.

**First prod run: 6 periods checked, 0 drift, 0 unchecked** — consistent with the same-day
standings audit, which passed all six against MLB across 1,269 player-period checks.
