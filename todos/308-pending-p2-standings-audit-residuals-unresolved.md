---
status: pending
priority: p2
issue_id: 308
tags: [audit, standings, onroto, reconciliation, roster]
dependencies: []
---

## Problem Statement
The 2026-08-30 audit established that **FBST's stored data is correct** — all six closed periods
PASS against MLB statsapi (1,269 player-period checks, 0 mismatches). Every FanGraphs residual is
therefore an *attribution* difference, not bad data.

The dominant cause is identified and its arithmetic is exact: **roster moves recorded in FBST later
than they happened in OnRoto**. A drop entered with `effDate = today` still satisfies the window
predicate (`releasedAt > period.startDate`), so FBST credits the team a full extra period.

- The Show's entire residual, all 7 categories = Peralta (W1 K20) + Hicks (R8 HR3 RBI12) +
  García (R12 HR5 RBI12) — each exactly that player's Period 6 line.
- Devil Dawgs = Erik Miller (W1 K18), 100%.
- RGing Sluggers = Heliot Ramos (R1 RBI1 SB1), 100%.

**Three things remain genuinely unresolved:**
1. **Confirmation.** The mechanism is inferred from FBST-side dates. It needs OnRoto's transaction
   log showing the REAL drop dates for Peralta, Hicks, García, and Erik Miller.
2. **Los Doyers `W2 K3`.** Pallante + Wrobleski explain W1 K24 of the W3 K27 residual. The rest is
   unexplained.
3. **Demolition's NEGATIVE pitching residual (W−2 SV−4 K−4).** Negative means OnRoto credits
   someone FBST does not — a different mechanism entirely, and unidentified. Its hitting side
   (R+7 HR+2 RBI+12) is close to but NOT exactly Nathaniel Lowe's P6 line.

**Do not adopt the naive rule.** "Dropped today ⇒ over-credited" is FALSIFIED: Skunk Dogs made 6
same-day moves including drops carrying real Period 6 stats and reconciles exactly. The mechanism
requires the FBST drop to be late *relative to OnRoto*, not merely recorded today.

## Proposed Solutions
Pull OnRoto's transaction log (Playwright — per-team and historical pages are Cloudflare-gated to
curl) and diff its move dates against `TransactionEvent.effDate`. That confirms or kills cause (1)
and likely explains (2). Demolition (3) needs its own pass — start from which players OnRoto has on
its Period 6 roster that FBST does not.

If confirmed, the durable fix is process, not code: backdate late-recorded moves to the real date
(see `period_rollover_and_roster_backdate` memory), or add a commissioner-facing warning when a
move is entered with an effDate in a period that has already closed.

## Acceptance Criteria
- OnRoto transaction log compared against FBST `effDate` for the four named players; cause (1)
  confirmed or falsified in writing.
- Los Doyers' residual fully attributed, or documented as unexplained with what was ruled out.
- Demolition's negative pitching residual explained.
- Any explanation is tested against the teams that did NOT diverge before being recorded as a cause.
- Runbook Results log updated.
- `git mv` this todo from pending → complete.

## Resources
- `docs/solutions/integration-issues/onroto-fangraphs-audit-runbook.md` (2026-08-30 row)
- `docs/reports/standings-audit-period-6-2026-08-31.md`
- Memory: `fangraphs_vs_tfl_audit_findings`
