---
status: complete
priority: p2
issue_id: "242"
tags: [standings, attribution, mid-season-trades, closed-period, fangraphs-audit]
dependencies: []
---

# Standings `computeWithPeriodStats` attributed closed-period PSP to CURRENT owner — over-credited receiving team after post-period trades

## Problem Statement (recap)

`computeWithPeriodStats` attributed all period stats to the team that held
the player at query time (`releasedAt === null`). For players traded
AFTER a period ended, this retroactively reassigned that closed period's
PSP credit to the new owner. The team that earned the stats during the
period lost credit; the receiving team gained stats they didn't earn.

Bryson Stott / Skunk Dogs Period 1 was the concrete case surfaced by the
2026-06-02 audit — Stott was on SKD throughout P1 then released 4/19,
and production credited his P1 stats to whoever picked him up. SKD's
visible P1 standings dropped by 4-5 points after the post-period trade.

## Resolution (PR pending)

Switched `computeWithPeriodStats` from "current owner" attribution to
**end-of-period owner** attribution. A player's period PSP credits the
team that held them on `period.endDate` — players released before that
date go to whoever held them then (or no team, if they were free
agents); players released the day after the period closes stay credited
to the team that held them during the period.

Matches FanGraphs / OnRoto semantics — the league commissioner's Excel
snapshot is a derived view of FG, and the league treats FG as
source-of-truth. PR #364's audit script (ownership-window attribution
on PSP) verified Σ|Δ| = 0.0 for Period 2 vs the Excel snapshot under
this rule.

## Changes

- `server/src/features/standings/services/standingsService.ts` —
  `computeWithPeriodStats` replaces `activePlayerTeam`/`currentTeam`
  with `endOfPeriodOwner` keyed on overlap with `period.endDate`.
- `server/src/features/standings/__tests__/standingsService.releaseAt.test.ts`
  — new regression test mirroring the Stott/SKD P1 scenario; existing 9
  tests continue to pass (they didn't cover the post-period-trade case).
- File header docstring updated to reflect the new attribution rule
  and reference todo #242.

## Verification

- 84/84 standings tests pass (was 83).
- tsc clean.
- The fix mirrors the audit script's ownership-overlap attribution that
  validated Σ|Δ| = 0.0 vs the Excel snapshot for Period 2.

## Resources

- Audit script: `server/src/scripts/fangraphs-audit.ts` (PR #364)
- Compound doc: `docs/solutions/integration-issues/mlb-statsapi-sync-hasstats-filter-drops-er-rbi.md`
- PR #364: trust hierarchy + audit script
