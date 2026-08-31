---
status: pending
priority: p3
issue_id: 307
tags: [audit, standings, drift, testing, instrument]
dependencies: []
---

## Problem Statement
`computeTeamPeriodTotals` (`server/src/lib/audit/fbstTotals.ts:77`) splits hitter vs pitcher on
`assignedPosition ?? posPrimary`. Production `playerStatRoles` (`server/src/lib/sports/baseball.ts:38-45`)
uses `posPrimary` ALONE for every non-two-way player, consulting `assignedPosition` only for two-way
players. So a pitcher parked in `BN` or `IL` has his pitching silently dropped **by the audit only** —
the audit under-reports a team the production scoring path counts correctly.

Found 2026-08-30 during the standings audit. Currently affects exactly **1** player league-wide
(Quinn Priester, The Show, slot=IL), and he is excluded by the IL guard anyway, so it changes no
present number. It is latent, not theoretical: the moment a pitcher sits on BN with real stats, the
audit reports a phantom divergence and someone spends a session chasing a bug in production that
does not exist.

This is the measuring-instrument trap the audit skill already warns about, one layer down —
`docs/solutions/integration-issues/onroto-fangraphs-audit-runbook.md` "the bug is sometimes in the
instrument" (PR #402 precedent).

## Proposed Solutions
Have the audit accumulator call `playerStatRoles` directly instead of re-deriving the rule. That
removes the second copy rather than syncing it — same reasoning as `rosterSlotFor` (PR #435/#440).
The accumulator would need `isTwoWay`, which it can source from the same `TWO_WAY_PLAYERS` set
`standingsService` uses.

## Acceptance Criteria
- `computeTeamPeriodTotals` classifies via `playerStatRoles`, with no local pitcher-code check.
- A test pins the divergent case: a pitcher with `assignedPosition: "BN"` and real pitching stats
  must be counted, and must have been MISCOUNTED before the change (mutation-verified).
- Audit re-run against prod produces identical team totals (this is a correctness fix with no
  expected numeric movement today — if numbers move, that is a finding, not a pass).
- `git mv` this todo from pending → complete.

## Resources
- Found: 2026-08-30 standings audit session
- Memory: `fangraphs_vs_tfl_audit_findings`, `standings_audit_skill_in_flight`
