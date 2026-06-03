---
status: pending
priority: p2
issue_id: "242"
tags: [standings, attribution, mid-season-trades, closed-period, fangraphs-audit]
dependencies: []
---

# Standings `computeWithPeriodStats` attributes closed-period PSP to CURRENT owner — over-credits receiving team after post-period trades

## Problem Statement

`server/src/features/standings/services/standingsService.ts:597-664`
(`computeWithPeriodStats`) attributes ALL period stats to whoever holds
the player NOW (`releasedAt === null`):

```ts
const activePlayerTeam = new Map<number, number>();
for (const r of rosters) {
  if (r.releasedAt === null) activePlayerTeam.set(r.playerId, r.teamId);
}
// ...
const currentTeam = activePlayerTeam.get(roster.playerId);
if (currentTeam !== t.id) continue;
```

For a player traded **after a period ends**, this retroactively reassigns
that period's PSP credit to the new owner. The team that held the player
during the period — and earned those stats — loses credit.

Example surfacing this bug:
- Bryson Stott on Skunk Dogs throughout Period 1 (3/25–4/18), released 4/19.
- New team picks him up 4/19.
- Production standings for Period 1: Stott's stats credit the NEW team.
- Skunk Dogs loses credit for stats they earned.

Confirmed via 2026-06-02 audit:
- `fangraphs-audit.ts` (ownership-overlap attribution) vs Excel snapshot:
  Period 2 Σ|Δ| = **0.0** (perfect match).
- Same script switched to current-owner attribution (matches production):
  Σ|Δ| jumped to **29.0** with 7-point swings on multiple teams.

The OGBA league commissioner's Excel snapshot, FanGraphs OnRoto, and most
fantasy platforms use ownership-window attribution. Production's
current-owner shortcut is a documented deviation but no team has called it
out yet — probably because trade volume is low and the visible deltas are
1-5 points per team, easily attributed to rounding.

## Findings

- Code site: `server/src/features/standings/services/standingsService.ts:597-664`
- The fallback `computeWithDailyStats` (lines 476-564) already does
  ownership-window correctly: `if (d >= from && d <= to)` per daily row.
- PSP rows are immutable per (player, periodId) — the data needed for
  ownership-window attribution at the period level exists, but only at
  granularity of "all of period". The PSP totals can't be pro-rated for a
  player traded mid-period.

## Proposed Solutions

### Option 1: ownership-overlap with last-team-of-period tiebreaker

For each (player, period), attribute PSP to the team that owned the player
on the LAST day of the period (or last day before trade-out, if traded
during the period). Requires reconstructing day-of-period ownership from
acquiredAt/releasedAt without per-day stats.

For mid-period trades: PSP is whole-period; splitting it requires
day-by-day stats. Either:
- (a) Fall through to `computeWithDailyStats` when any roster overlap
  doesn't span the full period.
- (b) Attribute the whole-period PSP to whoever owned the player on
  period.endDate (matches FG semantics).

### Option 2: ownership-overlap with PSP for full-period owners only, DailyStats fallback for split-period owners

Hybrid: if a player was on exactly one team for the entire period, credit
that team with PSP. If they were on multiple teams during the period, fall
through to daily-stats summing for that player only. Avoids the production
bug while preserving doubleheader-safe period totals for the common case.

### Option 3: document the deviation as intentional

If the simplification is intentional and the league has accepted it, add
a note to `standingsService.ts` and the OGBA league rules doc, and don't
change the code. (Recommended only if owners explicitly do not want
historical attribution to shift retroactively when post-period trades
happen.)

## Acceptance Criteria

- [ ] Option chosen and documented in the standings code
- [ ] If a code change: tests added for "player traded after period end"
  attribution (mirror the SKD/Stott P1 scenario)
- [ ] If a code change: standings cache invalidation behavior verified
  for the closed-period recompute case
- [ ] FG/Excel audit run to confirm closed-period numbers stabilize

## Resources

- Audit script: `server/src/scripts/fangraphs-audit.ts` (PR #364)
- Production code: `server/src/features/standings/services/standingsService.ts:597-664`
- Compound doc: `docs/solutions/integration-issues/mlb-statsapi-sync-hasstats-filter-drops-er-rbi.md`
- Audit-vs-Excel P2 verification: Σ|Δ| = 0.0 with ownership-overlap

## Notes

The audit script (PR #364) intentionally uses ownership-overlap rather
than matching production exactly. The rationale is captured in the
audit script's inline comment and the compound doc — production's
deviation is a real bug, not the audit's.
