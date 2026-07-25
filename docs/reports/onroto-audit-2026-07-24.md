---
id: DOC-022
title: "OnRoto audit — 2026-07-24 (real FBST bug found, root-caused, and fixed — now 80/80 exact)"
description: "76/80 at open. Residual traced to stale PSP outside the 5-day reconcile window, confirmed four ways, healed in prod — closed at 80/80 exact."
type: report
status: active
phase: null
owner: james
tags: [scoring, data-sync, league-admin]
links: [DOC-016, DOC-007]
category: reports
date_documented: 2026-07-24
---

# OnRoto audit — 2026-07-24

**Verdict: a real FBST bug — confirmed by four sources, root-caused, fixed in production, and re-verified at 80/80 exact.** Unlike every
audit since 2026-06-09, this one did **not** reconcile. The residual is not attribution
and not FanGraphs staleness — FBST is wrong, and the cause is a gap in the closed-period
reconciler.

Procedure: `docs/solutions/integration-issues/onroto-fangraphs-audit-runbook.md`.
League 20 (OGBA), prod (`oaogpsshewmcazhehryl`).

---

## 1. As-of alignment ✓

FanGraphs header: **"STANDINGS through 07.23.26."** All 56 counting-stat cells matched
exactly, which is itself the proof the game sets are aligned — a day-behind FG would show
counting differences, not only rate ones.

## 2. The 80-cell diff — 76/80 exact

All of R, HR, RBI, SB, W, SV, SO matched across all 8 teams. Residual:

| Team | Cat | FBST | FG | Δ |
|---|---|---|---|---|
| Dodger Dawgs | **ERA** | 3.69 | 3.65 | **0.04** |
| Dodger Dawgs | WHIP | 1.221 | 1.220 | 0.001 |
| Skunk Dogs | AVG | .2587 | .2588 | 0.0001 |
| The Show | AVG | .2543 | .2541 | 0.0002 |

**Points:** 86/88 matched. The sole consequence is an **ERA rank swap** between Dodger
Dawgs (FBST 3.69) and Devil Dawgs (3.68) — worth 1 point each way.

| Team | FBST total | FG total |
|---|---|---|
| Dodger Dawgs | 54.5 | 55.5 |
| Devil Dawgs | 33.5 | 32.5 |

## 3. Ground truth (mandatory Step 5)

`audit-mlb-crosscheck.ts 20` → **100/100 fully-owned players consistent, 0 flagged**
(366 skipped for partial ownership / IL). Scoped to Dodger Dawgs: 11/11 consistent,
48 skipped.

The residual therefore lived in the **skipped partial-ownership set**, which is precisely
what the manual four-way exists for.

## 4. Isolating the driver

FanGraphs' authoritative Dodger Dawgs pitching TOTAL vs FBST (computed through the real
production attribution function, `accumulatePeriodStats`):

| | FBST | FG | Δ |
|---|---|---|---|
| IP | 717.33 | 717.3 | **same** |
| **ER** | **294** | **291** | **+3** |
| BB+H | 876 | 875 | +1 |
| SO / W / SV | 681 / 50 / 32 | 681 / 50 / 32 | same |

Identical innings and identical strikeouts/wins/saves, but 3 extra earned runs and 1
extra baserunner. That fully explains both rate deltas — and it rules out an ownership-window
difference, because a window change would move the integer counting stats too.

Per-player comparison produced exactly one candidate: **Sean Manaea** (mlbId 640455),
FBST ER=17 vs FG ER=14 — a difference of exactly 3, on identical 29.0 IP.

## 5. Four-way tie-break — FBST is wrong

Manaea was owned by Dodger Dawgs 2026-06-07 → 07-05, which fully covers **Period 4**
(06-07 → 07-04), so FBST credits the whole period line.

| Source | IP | ER | BB+H | SO | W |
|---|---|---|---|---|---|
| MLB.com statsapi (gameLog) | 29.00 | **14** | 35 | 26 | 1 |
| Baseball Reference | 29.00 | **14** | 35 | 26 | 1 |
| FanGraphs OnRoto | 29.0 | **14** | 35 | 26 | 1 |
| **FBST `PlayerStatsPeriod`** | 29.00 | **17** ❌ | **36** ❌ | 26 | 1 |

Six games, game-for-game identical across MLB.com and Baseball Reference:

| Date | Opp | IP | R | ER | H | BB |
|---|---|---|---|---|---|---|
| 06-07 | SDP | 4.0 | 2 | 2 | 4 | 1 |
| 06-13 | ATL | 6.0 | 2 | 2 | 4 | 0 |
| 06-18 | PHI | 5.1 | 3 | 2 | 6 | 1 |
| 06-24 (2) | CHC | 3.0 | 4 | 3 | 6 | 2 |
| 06-29 | TOR | 5.2 | 2 | 2 | 3 | 2 |
| 07-04 | ATL | 5.0 | 6 | 3 | 5 | 1 |
| **Total** | | **29.0** | **19** | **14** | **28** | **7** |

Three independent sources agree. **FBST is the outlier.**

Two hypotheses tested and rejected: FBST's 17 is neither MLB's ER (14) nor R (19), and
BB+H=36 is neither H+BB (35) nor H+BB+HBP (39). So it is not a runs/earned-runs mix-up
nor an HBP inclusion — it is a **stale snapshot** of values MLB has since revised
(earned/unearned scoring decisions are routinely changed after the fact).

## 6. Root cause

`reconcileRecentlyClosedPeriods` (`mlbStatsSyncService.ts:531`):

```ts
const windowDays = opts.windowDays ?? 5;
const cutoff = new Date(now.getTime() - windowDays * 864e5);
where: { status: "completed", endDate: { gte: cutoff, lte: now } }
```

**Period 4 ended 2026-07-04.** It left the 5-day reconcile window on **2026-07-09** and
has not been checked since. MLB corrected Manaea's line after FBST's last sync of that
period, and nothing will ever look again. The stale value is frozen permanently.

This is exactly the failure mode todo **#301** predicted ("a boundary edit or late MLB
correction to an old period drifts forever with no alarm"). This audit is its first
confirmed live instance, so #301 was **raised P2 → P1**.

## 7. Remediation — PERFORMED, standings now match exactly

Re-synced Period 4 (id=38) through the **production auto-heal path**
(`reconcileRecentlyClosedPeriods({ windowDays: 25 })` — scoped so only Period 4 qualified;
P3 ended 49d ago, P5 is `active`). Authorised by the owner before execution.

**Production's own dry-run diff found 5 drifted fields — two more than the manual audit
had isolated:**

| Player | Field | Stored | Fresh (MLB) |
|---|---|---|---|
| Sean Manaea (640455) | ER | 17 | **14** |
| Sean Manaea (640455) | BB_H | 36 | **35** |
| Mauricio Dubón (643289) | AB | 83 | **84** |
| Mauricio Dubón (643289) | H | 23 | **24** |
| Liam Hicks (689414) | H | 24 | **23** |

The two hit corrections were the previously-unexplained AVG residuals: Dubón's extra hit
was Skunk Dogs' missing .0001, Hicks' removed hit was The Show's excess .0002.

Result: `status: healed, before=5, after=0`. 217 players synced, 0 errors.

### Verification

| Check | Result |
|---|---|
| Manaea PSP | ER 17→**14**, BB+H 36→**35** ✓ |
| Dodger Dawgs | ERA 3.69→**3.65**, WHIP 1.221→**1.220** ✓ |
| Skunk Dogs AVG | .2587→**.2588** ✓ |
| The Show AVG | .2543→**.2541** ✓ |
| Roto points | Dodger 54.5→**55.5**, Devil 33.5→**32.5** ✓ |
| **Full 80-cell re-diff vs FanGraphs** | **0 mismatches / 80 — EXACT MATCH** |

FG coverage header unchanged (`through 07.23.26`), so the comparison is like-for-like.

### Post-heal: two NEW drifts appeared during the session

The closing `audit-mlb-crosscheck` run flagged two players that had passed the same check
~2 hours earlier, at the start of this audit:

- Cristopher Sánchez (650911, Dodger Dawgs): ER FBST **40** vs MLB **39**
- Andy Pages (681624, Los Doyers): RBI **68** vs **67**, H **105** vs **104**

**These were not caused by the re-sync.** The heal wrote exactly three players
(1538 / 1701 / 985); neither Sánchez nor Pages was among them, so their stored values are
unchanged by this operation. FBST is *higher* than MLB in both cases, which is not an
as-of lag — it means **MLB revised those lines downward during the session.**

That is the same root cause observed live: MLB continuously revises, and anything outside
the 5-day window is never re-checked. It is direct evidence that #301 is not a one-off
cleanup but an ongoing leak. **Not remediated here** — needs the same treatment once the
owning periods are identified.

**Structural (todo #301, now P1):** nightly diff of **all** closed periods against the MLB
record, alert-only, no 5-day filter. Same diff the reconciler already performs, minus the
window.

**Also worth noting:** the two AVG residuals (Skunk Dogs .2587/.2588, The Show
.2543/.2541) were not chased. They are within one hit of rounding and may share this root
cause. Re-audit after the Period 4 re-sync.

## 8. Correction issued during this audit

An early hypothesis — that todo **#306** (position-player mop-up pitching inflating team
ERA/WHIP) explained the residual — was **wrong on both counts**:

1. Dodger Dawgs has **zero** position-player pitching, so #306 could not be the cause.
2. #306 is **already fixed**, shipped in PR #412. `playerStatRoles` excludes position
   players' pitching and is wired into all four callsites. Todo #306 was merely stale
   (`status: pending`); it has now been marked complete.

The hypothesis came from a hand-rolled PSP query that bypassed `playerStatRoles` — the
measuring instrument was wrong, not the data. Same trap as PR #402. **Always reconcile
through `accumulatePeriodStats` or the audit scripts, never a raw PSP sum.**

## 9. What passed

- All 56 counting-stat cells, all 8 teams
- 100/100 fully-owned players vs the MLB game log
- Ownership-window attribution (ADR-013) — W/SV/SO agreeing with FG proves the windows match
- Position-player pitching exclusion (#306) — verified working for all 4 affected players
