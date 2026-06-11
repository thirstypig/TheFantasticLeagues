---
status: complete
priority: p2
issue_id: 286
tags: [standings, code-fix, attribution, ADR-013, wire-list]
dependencies: [285]
---

## Problem Statement

When a period has a real mid-period pickup, `computeTeamStatsFromDb` routes the **whole period** through `computeWithDailyStats` (ADR-013 fallback). The daily table collapses doubleheaders and has historical gaps, so every team's stats degrade because of one transaction. This has already happened: P3 (period 37) regressed off the verified-exact PSP path after 3 mid-period wire adds (DMK Spiers + Ashby 5/22, SKD Dollander 6/3) — live P3 now shows e.g. DMK K=154 vs FG's 152. Supersedes/extends todo #260. Evidence: `docs/reports/onroto-audit-2026-06-08.md` Section 5.4.

## Proposed Solutions

Hybrid attribution inside one period: use PSP rows for players whose roster windows are boundary-aligned (the overwhelming majority), and daily ownership-window sums **only** for players acquired or released strictly mid-period. This keeps doubleheader-safe PSP data for everyone except the handful of players whose sub-period windows genuinely require daily granularity.

Alternative considered: sync a sub-period PSP row (byDateRange acquiredAt→periodEnd) per mid-period pickup — more accurate than the daily table but a bigger schema/keying change.

## Acceptance Criteria

- A period with one mid-period pickup computes all boundary-aligned players from PSP.
- The mid-period player's credit excludes pre-acquisition stats (ADR-013 preserved).
- Differential test pinning hybrid vs pure-daily vs pure-PSP behavior.
- P3 live standings return to the FG-exact values.
- `git mv` this todo from pending → complete.

## Resolution (2026-06-10)

Shipped in PR #394: hybrid per-player routing (PSP for boundary-aligned, daily windows for mid-period acquired/released players), half-open releasedAt in the daily window, mergeTeamStatRows component merging. Verified read-only vs prod: P3 = FanGraphs exactly 8/8 teams all categories; P1/P2 unchanged. 4 tests. Solutions doc: docs/solutions/logic-errors/mid-period-pickup-degrades-whole-period-to-daily-stats.md.
