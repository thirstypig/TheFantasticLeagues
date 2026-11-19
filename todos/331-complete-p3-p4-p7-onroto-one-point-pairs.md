---
priority: p3
issue_id: "331"
tags: [scoring, audit, decision]
dependencies: []
---

# 2026 final: P4 and P7 each have one ±1 pair vs OnRoto

## Problem Statement
After the 2026-11-12 rescore, P1–P3, P5, P6 match OnRoto exactly; P4 (DDG/RGS) and P7 (RGS/The Show) each differ by one ±1 pair. Final order is identical, so no payout changes.

## Proposed Solution
James decides: accept and close, or attribute both pairs per player (audit-standings skill) and document the cause.

## Acceptance Criteria
- [x] Decision recorded in STATUS.md open bugs.
- [x] (n/a — not investigated) If investigated: cause documented per player, no prod write without James.
- [x] `git mv` this todo from pending → complete.

## Work Log
- 2026-11-19: FULL PLAYER SWEEP after the 11-12 rescore. Every stored PlayerStatsPeriod row in OGBA periods 1-7 (1,580 rows) compared with MLB statsapi game logs summed over each period window, NL-team games only (AB, H, R, HR, RBI, SB, W, SV, K, outs, ER, BB+H). P5, P6, P7 identical. P1-P4 differ only on 58 rows for players who were not on any OGBA roster during that period (54 in P1, Miguel Rojas in P2, Cedric Mullins in P2-P4): stale rows from an earlier sync that no team is credited with. Every OGBA-rostered player has a row in every period. Result: every number that feeds OGBA standings matches MLB.
- 2026-11-19: INVESTIGATED (James asked for confirmation that all periods are correct). Both pairs are OnRoto errors; FBST is right.
  - Method: scored stored `TeamStatsPeriod` (full precision) with rank points vs Kent's workbook 'End of Season' rows 34-40 -> P1, P2, P3, P5, P6 exact (a P2 "diff" at 4-decimal AVG was a rounding artifact). Both residual pairs trace to ERA only.
  - P4 (DDG 53 vs OnRoto 52, RGS 57 vs 58): Sean Manaea 2026-07-04 start. MLB statsapi and Baseball-Reference: 5.0 IP, 3 ER, 5 H; FBST stores the same. OnRoto's stat-correction log: "07.04 Sean Manaea NYM pitchers ER 6 3", implemented 07.10, six days after P4 closed, so OnRoto's P4 still counts 6 ER. +3 ER puts DDG ERA at 3.53, behind RGS 3.42 = exactly OnRoto's swap.
  - P7 (RGS 60 vs 59, The Show 43 vs 44): OnRoto P7 pitcher lines (team page, current period) match FBST for all 9 The Show pitchers and 8 of 9 RGS pitchers. Bubba Chandler: OnRoto 23.0 IP / 17 ER / 26 H; MLB = BBRef = FBST 23.0 IP / 15 ER / 26 H (5 starts 09-02..09-25). OnRoto RGS ER 91 vs FBST 89 -> ERA 4.60 vs 4.50, behind The Show 4.53 = exactly OnRoto's swap. (Same OnRoto-runs-hot-on-Chandler pattern seen 2026-07-07.)
  - All 36 pitchers on the four disputed team-periods checked vs MLB gameLog (NL-team games only): 0 mismatches.
- 2026-11-18: James accepted the two ±1 pairs and closed this (final order identical, no payout change). Recorded in STATUS.md (open bugs + decisions).
- 2026-11-18: filed from the todo/design-review/open-items sweep.
