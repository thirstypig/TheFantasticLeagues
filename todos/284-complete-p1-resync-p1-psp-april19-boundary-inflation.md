---
status: complete
priority: p1
issue_id: 284
tags: [standings, data-fix, psp, audit, onroto]
dependencies: []
---

## Problem Statement

Period 1's stored `PlayerStatsPeriod` rows include the games of **April 19, 2026** — the first day of Period 2. The last P1 sync ran while P1's end boundary still extended through 4/19; closed periods are never re-synced, so the extra day stayed baked in. Verified player-by-player on 2026-06-09: per-team (stored − fresh MLB byDateRange 3/25–4/18) reproduces the TFL−FG P1 delta cell-for-cell (e.g. Robbie Ray +7 K = his 4/19 start). The 4/19 games are also correctly counted in P2, so season sums double-count one day (RGS season K: TFL 476 vs FG 460).

Recomputing P1 from fresh MLB data matches FanGraphs **exactly — all 8 teams, all categories** (FG P1 points: DLC 56.5, RGS 55.0, DDG 53.5, SKD 51.5, DVD 43.0, LDY 37.5, DMK 33.5, TSH 29.5).

Full evidence: `docs/reports/onroto-audit-2026-06-08.md` Section 5.1.

## Proposed Solutions

Prod data fix (admin, no code):
1. Fix two artifact roster timestamps so P1 returns to the PSP path (see todo #285 for the code-side guard):
   - `Shohei Ohtani (Pitcher)` (player 3191) roster row `acquiredAt` 2026-03-29 → 2026-03-25T00:00:00Z
   - `Andrew Vaughn` roster row `acquiredAt` 2026-03-25T12:00 → 2026-03-25T00:00:00Z
2. `POST /api/admin/sync-stats {periodId: 35}` — rebuilds P1 PSP under the correct 3/25–4/18 boundary.
3. `POST /api/admin/recompute-period-cache {periodId: 35, leagueId: 20}`.
4. Browser-verify P1 standings vs the FG points above.

## Acceptance Criteria

- P1 raw stats in the app equal FG's P1 table (audit report Section 2 FG table) for all 8 teams.
- `computeTeamStatsFromDb(20, 35)` takes the PSP path (no mid-period acquisitions detected).
- Season-total sums no longer double-count 4/19 (RGS season K = 460).
- `git mv` this todo from pending → complete.

## Resolution (2026-06-09)

Executed same session: roster rows 3915 (Ohtani synthetic pitcher) and 3835 (Vaughn) normalized to 2026-03-25T00:00:00Z; `syncPeriodStats(35)` re-ran (183 synced, 0 errors, two-way mirror intact); `computeTeamStatsFromDb(20, 35)` takes the PSP path (0 mid-period acquisitions) and matches FG exactly for all 8 teams in all categories; TeamStatsPeriod cache recomputed. Browser-verified on prod: /season Period 1 column = FG points (DLC 56.5, RGS 55.0, DDG 53.5, SKD 51.5, DVD 43.0, LDY 37.5, DMK 33.5, TSH 29.5).
