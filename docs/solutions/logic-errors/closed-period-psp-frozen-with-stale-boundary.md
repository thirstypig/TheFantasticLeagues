# Closed-period PSP rows freeze with whatever boundary the last sync used

**Date solved:** 2026-06-09 · **Severity:** P1 (wrong standings for a closed period, real money league) · **Fixed by:** todo #284 (data re-sync) + PR #393 (path-routing guard) · **Full evidence:** `docs/reports/onroto-audit-2026-06-08.md` Sections 5–6

## Symptom

A closed period's standings diverge from FanGraphs (the official scoring platform) by small, systematic amounts in every category, for every team — and the gap never closes, no matter how long you wait. For OGBA P1: TFL read +2..+7 R and up to +16 K high per team, weeks after the period ended.

## Root cause

`syncAllActivePeriods` only syncs **active** periods. P1's last sync ran while its end boundary still extended through April 19 (P2's first day); the boundary was later corrected to April 18, but nothing ever re-synced the frozen rows. Every player's P1 `PlayerStatsPeriod` row silently contained one extra day of stats — which were *also* correctly counted in P2, so season sums double-counted the day.

A second, compounding defect: `hasMidPeriodPickup` compared millisecond timestamps, so an `acquiredAt` stamped at noon on the period's start date (import-script artifact) flipped the whole period onto the daily-stats fallback — which has its own gaps — meaning the *displayed* numbers were simultaneously **under**counted while the stored PSP was **over**counted.

## How it was diagnosed (the reusable technique)

For every rostered player, diff the stored PSP row against a **fresh MLB API `byDateRange` fetch of the identical date range, run today**:

- If `stored == fresh` everywhere → TFL data is current; look elsewhere (attribution, display).
- If `stored − fresh` is nonzero → the stored rows are stale. Identify *which day* the surplus belongs to by fetching single-day ranges for the divergent players (here: every surplus matched the player's April 19 box score exactly).

This one experiment simultaneously disproved the tempting wrong explanations ("MLB API lags FanGraphs", "scorers revised the stats") — the official API, FG, and BBRef all agreed; only our frozen rows differed. **Persistent divergence on a closed period is a TFL-side defect until proven otherwise**; lag only applies to the active period.

## Fix

1. Normalize artifact `acquiredAt` timestamps to period start (so the period routes to the PSP path).
2. `POST /api/admin/sync-stats {periodId}` → re-runs `syncPeriodStats` under the current boundary (idempotent upsert).
3. `POST /api/admin/recompute-period-cache {periodId, leagueId}`.
4. Verify against FG's team pages — fetchable without login via `session_id=guest`.
5. Code guard (PR #393): `hasMidPeriodPickup` now compares UTC calendar dates, with regression tests in `standingsService.pathRouting.test.ts`.

## Prevention

- **Any edit to a period's start/end dates must be followed by a re-sync of that period.**
- Todo #287: automated one-shot PSP re-sync ~1–4 days after each period closes (also absorbs genuine late MLB corrections).
- Audit-methodology rules captured in the audit report Section 6, Issue 5 (pitcher decisions not team results; never derive a period by subtraction across a live boundary; don't use `audit_period.ts` as source of truth).
