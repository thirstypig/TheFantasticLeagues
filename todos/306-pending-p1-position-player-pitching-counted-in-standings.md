---
status: pending
priority: p1
issue_id: 306
tags: [standings, scoring, attribution, fangraphs, live-scoring, bug, position-player-pitching]
dependencies: []
---

## Problem Statement
FBST team ERA/WHIP counted a **position player's mop-up pitching** toward team pitching totals; OnRoto (OGBA's official scoring system) does not. Found via the 2026-07-03 FanGraphs audit: Carson Kelly (C, Los Doyers) and Adrian Del Castillo (DH, RGing) each pitched a blowout inning (K=0, W=0 → counting stats unaffected, only ERA/WHIP), which our standings wrongly credited. This shifted Los Doyers ERA 4.13→4.15 / WHIP 1.222→1.223 and RGing WHIP 1.253→1.256 vs the official OnRoto standings. Full forensics: `docs/solutions/integration-issues/fangraphs-era-residual-is-rounding-not-a-bug.md`.

Root cause: `countPitching = !isTwoWay || assignedAsP` — for any non-two-way player this is always true, so a catcher's pitching counted. Duplicated in 3 places (2 in `standingsService.ts` compute paths + `fangraphs-audit.ts`).

## Proposed Solutions
Shared role helper `playerStatRoles({posPrimary, assignedPosition, isTwoWay})` in `lib/sports/baseball.ts`, keyed on **posPrimary** (role) not assignedPosition (slot, so benched pitchers aren't lost); two-way players follow the assigned slot. Route all 3 callsites through it (kills the divergent-logic risk). Excludes pitching for players whose primary position isn't in PITCHER_CODES_SET.

## Acceptance Criteria
- Position player's pitching excluded from team pitching; real (incl. benched) pitchers' pitching still counted; two-way (Ohtani) unaffected.
- Audit reproduces OnRoto: Los Doyers ERA/WHIP EXACT; all teams' counting stats + hitting unchanged. (RGing's residual 0.01 ERA is a genuine FG-stale value — Chandler 45 vs MLB 44 — and is correctly NOT chased.)
- Unit tests: `playerStatRoles` (position player / pitcher / benched / two-way / null) + the audit regression test flipped to assert exclusion.
- **Deploy note:** this changes LIVE standings mid-season (money league). Requires explicit go + a heads-up that Los Doyers ERA/WHIP will move to match the official OnRoto numbers.
- `git mv` this todo from pending → complete.

## Resolution
Fixed on branch `fix/position-player-pitching-excluded`: shared `playerStatRoles` helper, 3 callsites routed through it, verified against prod (Los Doyers now EXACT vs FG; 6 other teams unchanged), full server suite green (1345). PR pending; deploy gated on owner approval (live scoring).
