---
status: complete
priority: p1
issue_id: "109"
tags: [code-review, correctness, standings]
dependencies: []
---

# Rate-stat season totals use unweighted mean (correctness bug)

## Problem Statement

`server/src/features/standings/routes.ts:122-140` computes season-to-date AVG/ERA/WHIP by summing then dividing by period count. This is an unweighted arithmetic mean — a team with .300 AVG in 100 AB and .200 AVG in 400 AB shows .250 instead of the correct .220. Error compounds as period lengths diverge.

## Findings

### Agent: performance-oracle
- Flagged as CRITICAL correctness issue. Unweighted mean of rates is mathematically wrong.
- Fix: accumulate rate-stat components (H, AB, ER, IP, BB_H) across periods and recompute from totals.

## Proposed Solutions

### Solution 1: Extend computeTeamStatsFromDb return to include components
Add H, AB, ER, IP, BB_H to the season totals accumulation. Compute AVG = total_H / total_AB, ERA = (total_ER * 9) / total_IP, WHIP = total_BB_H / total_IP.

- **Effort**: Medium (extend TeamStatRow or add parallel accumulation)
- **Risk**: Low — covered by standings tests

## Acceptance Criteria
- [x] Season AVG = sum(H) / sum(AB) across periods, not avg(AVG)
- [x] Season ERA = sum(ER) * 9 / sum(IP), not avg(ERA)
- [x] Season WHIP = sum(BB_H) / sum(IP), not avg(WHIP)
- [x] Standings tests pass

## Work Log
- **2026-04-17** (Session 67 review): Flagged by performance-oracle as P0 correctness bug.
- **2026-04-30**: Implemented Solution 1. Extended `TeamStatRow` with optional H/AB/ER/IP/BB_H components and populated them in both DB compute paths (`computeWithDailyStats`, `computeWithPeriodStats`) plus the CSV path (`aggregatePeriodStatsFromCsv`). Rewrote the season-totals reducer in `server/src/features/standings/routes.ts:122-160` to recompute rate stats from accumulated components instead of dividing per-period rates by period count. Divide-by-zero falls back to 0 (matches existing service convention). Added 5 new route tests in `server/src/features/standings/__tests__/routes.test.ts` proving (a) AVG/ERA/WHIP all use weighted formulas, (b) unweighted period-mean values are explicitly rejected, (c) zero-AB / zero-IP returns 0, (d) counting stats remain straight sums. All 855 server tests pass.
