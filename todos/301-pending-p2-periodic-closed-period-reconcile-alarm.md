---
status: pending
priority: p2
issue_id: 301
tags: [reconciliation, standings, ADR-014, alerting, closed-periods]
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
