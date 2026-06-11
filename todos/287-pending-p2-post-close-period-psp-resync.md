---
status: pending
priority: p2
issue_id: 287
tags: [standings, cron, psp, data-integrity, prevention]
dependencies: []
---

## Problem Statement

`syncAllActivePeriods` only syncs **active** periods, so a period's `PlayerStatsPeriod` rows freeze at whatever the last in-period sync produced. Two failure modes are then permanent: (1) the period's boundaries are edited after close (precedent: P1 kept April 19's games after the boundary was tightened to 4/18 — todo #284), and (2) MLB issues a late stat correction after the final sync. Either way the closed period silently diverges from the official record and from FanGraphs forever.

Evidence: `docs/reports/onroto-audit-2026-06-08.md` Sections 5.1 and 6 (Issue 2).

## Proposed Solutions

Add a post-close re-sync to the daily 13:00 UTC cron: after `syncAllActivePeriods()`, find periods with `status = "completed"` whose `endDate` is between 1 and ~4 days ago and run `syncPeriodStats(period.id)` for each (idempotent upsert, so running it a few days in a row is harmless and catches late corrections). Optionally follow with the `recompute-period-cache` upsert for that period.

Cheaper alternative (process-only): a runbook rule — after any period closes or any period-boundary edit, manually run `POST /api/admin/sync-stats {periodId}`. Less reliable than the cron.

## Acceptance Criteria

- A period that closed yesterday gets at least one more `syncPeriodStats` pass automatically.
- A boundary edit to a closed period is healed by the next cron run (or the runbook documents the manual call).
- Unit test covering the period-selection window (completed, endDate within N days).
- `git mv` this todo from pending → complete.
