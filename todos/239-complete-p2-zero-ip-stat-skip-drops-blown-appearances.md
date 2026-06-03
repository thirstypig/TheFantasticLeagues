---
status: complete
priority: p2
issue_id: "239"
tags: [stats-sync, mlb-api, audit, standings]
dependencies: []
---

# Daily stats sync skipped pitcher appearances with 0 IP + non-zero ER/BB+H

## Problem Statement

`server/src/features/players/services/mlbStatsSyncService.ts` `hasStats` filter
considered batter counters (AB/H/R/HR) and pitcher counters that imply a
positive outcome (W/SV/K/IP), but **omitted pure-negative pitcher counters**
ER and BB_H, and some batter counters (RBI, SB, BB).

Effect: a reliever who enters the game, gives up a run on 1 hit, gets
pulled with 0 outs (`0.0 IP, 1 ER, 1 H allowed, 0 K`) had zero fields in
the check set to non-zero → the entire game was silently dropped.

Discovered during the 2026-06-02 FanGraphs Period 3 audit. Cross-verified
against MLB statsapi `gameLog` for all 75 league-20 pitchers across 5/17–6/2
(~600 player-games). Exactly **one** miss surfaced: Matt Gage (DLC) 2026-05-19
vs ARI — 0.0 IP, 1 ER, 1 H allowed, gamePk 825086.

## Resolution

- Expanded `hasStats` check in `mlbStatsSyncService.ts` to include `RBI`, `SB`,
  `BB`, `ER`, `BB_H`. Comment explains the Matt Gage precedent.
- Added 3 regression tests in `mlbStatsSyncService.test.ts`:
  - Blown pitcher appearance (0 IP, 1 ER, 1 H) upserts correctly
  - Truly empty stat line still skips
  - 0-AB pinch runner with stolen base still upserts (sanity)
- Backfilled Matt Gage 5/19 via one-off prisma create with IP=0, ER=1, BB_H=1.
- Re-ran `server/audit-zero-ip-misses-league.mjs` → **0 missing games**.
- Re-ran `server/audit-period-3-stats.mjs` → DLC now reads ERA **4.03**, WHIP **1.331**
  (matches FanGraphs and MLB API exactly).

## Resources

- Code: `server/src/features/players/services/mlbStatsSyncService.ts:317-325`
- Tests: `server/src/features/players/__tests__/mlbStatsSyncService.test.ts`
- Audit scripts (gitignored, on disk): `server/audit-mlb-vs-fbst.mjs`,
  `server/audit-matt-gage.mjs`, `server/audit-zero-ip-misses-league.mjs`,
  `server/audit-backfill-matt-gage.mjs`
- PR: pending
