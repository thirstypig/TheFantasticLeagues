---
title: Sub-0.02 ERA residual vs FanGraphs is a STABLE FG-side deviation from MLB, not an FBST bug (we match MLB to the out)
slug: fangraphs-era-residual-is-rounding-not-a-bug
category: integration-issues
created: 2026-07-02
component: fangraphs-audit, standings, mlb-data-sync
problem_type: false-positive-triage / audit-methodology
symptom: FanGraphs audit showed 6/8 teams exact but 2 teams had a ≤0.02 ERA (and ≤0.003 WHIP) residual; question was whether it was a computation bug
root_cause: No FBST bug — every pitcher on both teams reconciles to the MLB game log EXACTLY on IP (in outs), ER, and BB+H; our ERA/WHIP equal the MLB-derived values to the decimal. FanGraphs is the one that deviates from MLB (≤0.02 ERA). Confirmed STABLE (identical delta on two consecutive daily audits — NOT transient timing, correcting the initial hypothesis). Do NOT "match OnRoto": FG is a derived view, and forcing our numbers to FG would inject FG's deviation into MLB-correct data.
related_modules: standings, players, periods, fangraphs-audit
prs: []
tags: fangraphs, onroto, audit, era, earned-runs, whip, rounding, ownership-window, current-roster-ytd, psp, mlb-statsapi, gamelog, ip-thirds-notation, false-positive, trust-hierarchy, display-team-stats, OGBA
---

## 2026-07-03 UPDATE — DEFINITIVE: we match MLB to the out; FanGraphs is the deviation

The residual reappeared on the 2026-07-03 audit — **identical deltas, same two teams**
(Los Doyers our 4.15 vs FG 4.13; RGing our 4.19 vs FG 4.20). Persisting *unchanged* for two
consecutive days **disproves the "correction-sync timing" hypothesis** in the original writeup
below: this is a **stable** FG-side difference, not transient lag.

To settle it beyond doubt, every pitcher on both teams was reconciled against the MLB game log
on the exact residual-driving components — **IP counted in OUTS** (zero decimal rounding),
**ER**, and **BB+H** — windowed to ownership:

| Team | IP (outs) ours/MLB | ER ours/MLB | BB+H ours/MLB | ERA ours/MLB | WHIP ours/MLB |
|---|---|---|---|---|---|
| Los Doyers | 1965 / 1965 | 302 / 302 | 801 / 801 | **4.150 / 4.150** | **1.223 / 1.223** |
| RGing | 2061 / 2061 | 320 / 320 | 863 / 863 | **4.192 / 4.192** | **1.256 / 1.256** |

**Δ=0 for all 34 pitchers, every stat.** Our ERA/WHIP equal the MLB-derived values *exactly*.
FanGraphs shows 4.13 / 4.20 → **FanGraphs is the one that deviates from MLB** (≤0.02 ERA) on
these two teams. Since FG derives from the same MLB feed, this is a small rounding / stale-
correction quirk on FG's side that we cannot see into and must not chase.

**Do NOT "make our data match OnRoto."** OnRoto/FanGraphs is a *derived view* (trust hierarchy:
`MLB statsapi > PSP > FanGraphs`). Forcing our numbers to equal FG's would inject FG's deviation
from MLB into data that is currently MLB-exact. "Close is not acceptable for data" cuts the
*other* way here: we are not *close* to MLB, we are **exact** — FG is the close-but-not-exact one.

**No stale code.** This reconciliation exercised the entire scoring path — PSP sync →
`parseIP` thirds conversion (`lib/utils.ts`: `whole + frac/3`, verified correct) → ownership-
window attribution → aggregation — and produced MLB-exact numbers for all 34 pitchers. Checking
IP in *outs* eliminated any decimal-rounding suspicion. There is nothing to fix on our side.

**Reproduce:** windowed per-pitcher IP(outs)/ER/BB+H reconciliation vs MLB `people/{id}/stats?stats=gameLog&group=pitching`
(same method as the ER-only pinpoint below, extended to IP-in-outs and BB+H).

---

## Symptom

The 2026-07-02 FanGraphs audit (`fangraphs-audit.ts`, leagueId 20), run at ~11 AM PT
against prod after FG's nightly sync had caught up (both systems "through 07-01"):

- **Counting stats: 8/8 teams exact** on R, HR, RBI, SB, W, SV, K.
- **Two teams off only on pitching rate stats:**
  - Los Doyers — our ERA **4.15** vs FG **4.13**; WHIP 1.223 vs 1.222.
  - RGing Sluggers — our ERA **4.20** vs FG **4.21**; WHIP 1.258 vs 1.255.

All deltas were ≤ 0.02 ERA / ≤ 0.003 WHIP, and the two ERA gaps pointed in **opposite
directions** (we read high on Doyers, low on RGing). Question: real computation bug or noise?

## Investigation

1. **Team-level raw compare** (from FG's `display_stand.pl` category-breakdown YTD totals):
   every counting stat matched across all 8 teams. Only the two rate residuals above remained.

2. **Back-solving FG's ER from the displayed ERA** — I inferred "FG is 1 ER low on Doyers,
   1 ER high on RGing." **This was the first trap** (see Root cause): a 2-decimal ERA is a
   lossy encoding, so this was an inference reported as if measured.

3. **Definitive check — reconcile per pitcher against MLB ground truth.** Wrote a throwaway
   script mirroring the audit's ownership-window + per-`(team,player)` dedup, but keeping
   per-pitcher ER/IP, and diffed each pitcher's ER against the MLB statsapi **game log**,
   windowed to the exact periods that pitcher was owned:

   ```ts
   // For each rostered pitcher, sum MLB gameLog ER over the date ranges of the
   // periods they were owned (period-boundary transactions => whole-period windows),
   // then diff against our PSP-accumulated ER.
   const log = await mlbGameLog(mlbId); // [{date:'YYYY-MM-DD', ER}]
   let mlbER = 0;
   for (const g of log) {
     if (ownedPeriods.some(w => g.date >= ymd(w.start) && g.date <= ymd(w.end))) mlbER += g.ER;
   }
   // compare mlbER vs our summed PSP ER for that pitcher
   ```

   **Result: every pitcher matched MLB exactly.** Team ER Δ = 0 for both:

   | Team | Our ER | MLB game-log ER (windowed) | Δ |
   |------|--------|----------------------------|---|
   | Los Doyers | 302 | 302 | **0** |
   | RGing Sluggers | 320 | 320 | **0** |

   All 20 Doyers pitchers and all 14 RGing pitchers reconciled to the earned run —
   full-season owners and mid-season pickups alike.

4. **Tried to measure FG's per-pitcher ER** via `display_team_stats.pl?OGBA+6+<N>`
   (RGing = index 4, Doyers = index 6). **This was the second trap:** that page listed a
   **completely different roster** (RGing showed Ashby, Duran, Sasaki, Glasnow… — none of the
   pitchers our standings credited) and a team ERA of **3.55**, nowhere near the standings
   4.21. It shows the *current active roster's full-season stats* — a different attribution
   model — so it cannot be used to audit the accumulated standings ER.

## Root cause

**There is no FBST bug.** Our accumulated ERA reconciles to the MLB game log exactly, per
pitcher, windowed to ownership periods. The residual is entirely **FanGraphs-side**: display
rounding plus correction-sync timing (a pending official-scorer earned/unearned
reclassification FG hasn't ingested yet). Two "instrument traps" made triage briefly
misleading:

- **Trap 1 — a rounded display value is not a measurement.** Two-decimal ERA is a lossy
  encoding of `(ER, IP)`. Over ~655 IP a 0.02 ERA gap maps to a **range** — roughly one
  earned run, *or* ~3 innings of IP, *or* a mix — not a specific integer. Back-solving it and
  reporting "1 ER low / 1 ER high" presented an inference as a fact.

- **Trap 2 — FG's per-team stats page uses a different attribution model than its standings.**
  `display_team_stats.pl` shows **current-roster YTD** (whoever is on the roster *now*, full
  season). `display_stand.pl` standings use the **accumulated ownership-window** model that
  FBST's standings/audit also use. The two disagree wildly (RGing 3.55 vs 4.21) and must never
  be cross-audited. This is the same current-roster-vs-ownership-window split documented in
  [`onroto-vs-fbst-stat-attribution-semantics.md`](../logic-errors/onroto-vs-fbst-stat-attribution-semantics.md).

- **The two teams' residuals are independent.** Different pitchers, different games — nothing
  moves an earned run *from* one team *to* the other. "One high, one low" is coincidence of two
  unrelated sub-measurable gaps, not a coupled mechanism.

## Resolution

Triaged as a **non-bug**. No code change. The reusable artifact is the verification method
(per-pitcher ER windowed to owned periods, diffed against the MLB game log), which returned
Δ = 0 team-wide and proved the residual is FG-side.

## Prevention

### Verification recipe — is a rate-stat residual ours?
To confirm an ERA/WHIP residual vs FanGraphs is *not* FBST's, go to ground truth (MLB), not to
FG-vs-us:
1. For each rostered pitcher, pull the MLB statsapi **game log**
   (`/people/{mlbId}/stats?stats=gameLog&season=YYYY&group=pitching`).
2. Sum ER over the date ranges of the periods the pitcher was owned (period-boundary
   transactions ⇒ whole-period windows; this mirrors the audit's attribution).
3. Diff against our PSP-accumulated per-pitcher ER. **Team-wide Δ = 0 ⇒ our data equals MLB;
   the residual is FanGraphs-side** (rounding/timing), and there is nothing to fix.

### Don't back-solve rounded display stats
Never recover an integer count from a 2-decimal displayed rate and report it as measured. A
rounded ERA/WHIP encodes a *range* of `(ER, IP)` pairs. If you can't measure the counterparty's
raw counts, say "within rounding tolerance," not "off by N."

### Right instrument for FanGraphs audits
- **Standings ER/rate** ⇒ `display_stand.pl` (accumulated ownership-window). Its
  category-breakdown sections carry per-team YTD raw totals.
- **`display_team_stats.pl` is current-roster YTD** — a different model. Do **not** use it to
  audit standings ER, and don't be alarmed that its team ERA differs from the standings.

### Triage threshold
All counting stats exact + a ≤0.02 ERA / ≤0.003 WHIP residual + opposite signs across teams =
FG rounding/timing, **not** a bug. Escalate only if a rate residual **persists across days**
*and* a counting stat also diverges.

### MLB IP thirds-notation gotcha
MLB reports IP in baseball notation: `95.1` = 95⅓, `95.2` = 95⅔ — **not** decimals. Our DB
stores IP as a decimal (`95.3` ≈ 95.33). A naive `Math.abs(mlbIP - ourIP) > 0.05` check
**false-flags every pitcher.** Compare ER (an unambiguous integer) for pinpointing, or convert
thirds→decimal before comparing IP.

### Trust hierarchy
`MLB statsapi > PlayerStatsPeriod (production) > FanGraphs (derived view)`. When a derived view
disagrees, check each side against MLB — don't ask "who's right?" between two derived views.
See [`mlb-statsapi-sync-hasstats-filter-drops-er-rbi.md`](./mlb-statsapi-sync-hasstats-filter-drops-er-rbi.md).

## Related
- [`../logic-errors/onroto-vs-fbst-stat-attribution-semantics.md`](../logic-errors/onroto-vs-fbst-stat-attribution-semantics.md)
  — the current-roster-YTD vs ownership-window split that Trap 2 is a live instance of.
- [`./mlb-statsapi-sync-hasstats-filter-drops-er-rbi.md`](./mlb-statsapi-sync-hasstats-filter-drops-er-rbi.md)
  — the trust hierarchy and the FBST-vs-MLB statsapi cross-check recipe.
- [`../logic-errors/closed-period-psp-frozen-with-stale-boundary.md`](../logic-errors/closed-period-psp-frozen-with-stale-boundary.md)
  — a case where a FG-vs-FBST divergence *was* real (stale PSP boundary); contrast with this non-bug.
- [`../logic-errors/mid-period-pickup-degrades-whole-period-to-daily-stats.md`](../logic-errors/mid-period-pickup-degrades-whole-period-to-daily-stats.md)
  — how mid-period pickups are attributed (relevant to windowing the game-log check).
- Audit tooling: `server/src/scripts/fangraphs-audit.ts` + unit test
  `server/src/scripts/__tests__/fangraphs-audit.test.ts`.
