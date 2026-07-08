---
title: "FanGraphs ERA/WHIP residual RESOLVED: mostly an FBST bug (position-player pitching counted in team pitching) — fixed; a sub-0.01 remainder is FG-stale"
slug: fangraphs-era-residual-is-rounding-not-a-bug
category: integration-issues
created: 2026-07-02
component: fangraphs-audit, standings, mlb-data-sync
problem_type: false-positive-triage / audit-methodology
symptom: FanGraphs audit showed 6/8 teams exact but 2 teams had a ≤0.02 ERA (and ≤0.003 WHIP) residual; question was whether it was a computation bug
root_cause: No FBST bug — every pitcher on both teams reconciles to the MLB game log EXACTLY on IP (in outs), ER, and BB+H; our ERA/WHIP equal the MLB-derived values to the decimal. FanGraphs is the one that deviates from MLB (≤0.02 ERA). Confirmed STABLE (identical delta on two consecutive daily audits — NOT transient timing, correcting the initial hypothesis). Do NOT "match OnRoto": FG is a derived view, and forcing our numbers to FG would inject FG's deviation into MLB-correct data.
related_modules: standings, players, periods, fangraphs-audit
prs: []
tags: fangraphs, onroto, audit, era, earned-runs, whip, avg, hits, rounding, ownership-window, current-roster-ytd, psp, mlb-statsapi, baseball-reference, gamelog, ip-thirds-notation, false-positive, trust-hierarchy, display-team-stats, bubba-chandler, adolis-garcia, OGBA
---

## ✅ 2026-07-07 RESOLVED — named the exact stale FG lines (Chandler ER + García H); confirmed vs MLB *and* Baseball Reference

Closes the "Open item to name the exact game" further down. A fresh OnRoto audit (2026-07-07) again showed **7/8 teams exact**; RGing's residual (ERA 4.17 vs FG 4.19, AVG .2473 vs .2471) localized to **exactly two players**, both of which FanGraphs/OnRoto has stale by one and FBST + MLB have right:

| Cat | Player | OnRoto/FanGraphs | **MLB statsapi (authoritative)** | FBST | Baseball Ref |
|---|---|---|---|---|---|
| ERA | Bubba Chandler | 49 ER (ERA 4.92) | **48 ER** (IP 89.2, ERA 4.82) | 48 ✅ | agrees w/ MLB |
| AVG | Adolis García | 44 H | **45 H** (both at 231 AB) | 45 ✅ | agrees w/ MLB |

- **How the exact lines were named** (the thing the old open item said `display_team_stats.pl` couldn't do): pull OnRoto's per-player breakdown from `display_team_stats.pl?OGBA+<team>+<team>` **and** compute FBST's per-player accumulation (reuse `accumulatePeriodStats` from `fangraphs-audit.ts`, keyed by `playerId` instead of `teamId`), then diff player-by-player. The single off-by-one player pops out. `display_team_stats.pl` DOES supply enough at the per-player level once cross-referenced with FBST's per-player sums — correcting the old note that it couldn't.
- **Third-source confirmation:** Baseball Reference independently agreed with MLB/FBST on both. FanGraphs is the lone outlier — not a two-source coin flip.
- **First HITTING instance:** García (H → AVG) proves the FG-staleness mechanism is **not pitching-only** — it freezes any already-counted raw stat (ER, H) and doesn't re-apply MLB's later corrections.
- **Chandler is a repeat culprit** — 45-vs-44 ER on 07-03, now 49-vs-48. FanGraphs consistently runs ~1 ER hot on him. Do NOT chase; matching OnRoto would inject FG's error into MLB-correct data.

### Verification recipe (name-the-stale-line, ~2 min)
1. FBST side: `cd server && npx tsx src/scripts/fangraphs-audit.ts 20` (prod DB URLs exported).
2. OnRoto side: `onroto.fangraphs.com/baseball/webnew/display_team_stats.pl?OGBA+<teamIdx>+<teamIdx>&session_id=<...>` — per-player AB/H/IP/ER.
3. Localize: compute FBST per-player (remap `teamId→playerId` in `accumulatePeriodStats`), diff vs OnRoto; the off-by-1 player is the culprit. (Ignore IL'd players — the no-IL per-player sum over-includes their reserved stint.)
4. Tiebreak: `https://statsapi.mlb.com/api/v1/people/<mlbId>/stats?stats=season&group=<hitting|pitching>&season=2026`. **Verdict: FBST == MLB ⇒ FanGraphs stale, do NOT change FBST.**

---

## ✅ 2026-07-03 RESOLVED — the delta was TWO things; the big one was OUR bug (read this first)

The investigation below arrived at "we match MLB exactly, FanGraphs is the deviation, don't chase
OnRoto." **That was half right and it missed the main cause.** The full resolution:

**The delta was a *scoring-rule* difference, not a data-accuracy one — and on scoring rules OnRoto
is authoritative (it runs OGBA's official standings).** It decomposed into two parts:

1. **Position-player pitching (the big part — OUR bug).** Carson Kelly (C, Los Doyers) and Adrian
   Del Castillo (DH, RGing) each threw a blowout mop-up inning. MLB records it in their pitching
   log, so FBST — which counted *any* rostered non-two-way player's pitching — credited it to team
   ERA/WHIP. **OnRoto does not** (a catcher isn't a pitcher on your fantasy staff). Because those
   innings had K=0/W=0, only the rate stats moved: Los Doyers 4.13→4.15 ERA, RGing WHIP 1.253→1.256.
   **Fixed** by keying pitching attribution on `posPrimary` (role) via the shared `playerStatRoles`
   helper — PR #412, todo #306. After the fix the audit matches OnRoto: Los Doyers EXACT; RGing WHIP
   exact; 6 other teams and all counting/hitting stats unchanged.
2. **Chandler's ER (the tiny remainder — genuinely FG-stale).** After the fix, RGing still reads
   4.19 vs FG 4.20 because FanGraphs has Bubba Chandler at 45 ER while MLB (and we) have 44 — a
   frozen pre-correction stat on FG's side. This one we correctly do **not** chase.

**Lesson / correction to the "don't chase OnRoto" stance below:** when the delta is a *scoring rule*
(what counts), OnRoto is the authority and a mismatch can be OUR bug. When it's *raw stat accuracy*
(what MLB recorded), MLB is the authority and the mismatch is usually FG-stale. This residual was
one of each. The "we're exact, FG is wrong" framing was right only for part 2.

**How it was pinpointed:** the OnRoto **Full Report PDF** (`.../OGBA/report.pdf`, via Print Reports)
is the standings-level per-pitcher breakdown *including released players* — the view
`display_team_stats.pl` (current-roster) can't give. Diffing its per-pitcher ER/IP against MLB named
Carson Kelly / Del Castillo (position-player pitching) and Chandler (FG-stale) exactly.

---

## 2026-07-03 UPDATE — DEFINITIVE: we match MLB to the out; FanGraphs is the deviation

> ⚠️ Superseded by the RESOLVED banner above — this section proved our raw stats match MLB (true),
> but concluded the whole delta was FG-side (wrong: the main part was our position-player-pitching bug).

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

### Why FG deviates: it CALCULATES ERA from component inputs that are stale — not from wrong rosters/dates

FG necessarily *calculates* team ERA (`9·ΣER / ΣIP` over the team's rostered pitchers) — there is
no pre-computed "team ERA" to pull. So the deviation lives in FG's **component inputs**, and two
independent facts prove it is **NOT** an attribution / roster / date difference on our side:

1. **Counting stats match FG exactly (all 8 teams).** A pitcher's K/W/SV are credited to a team by
   the *same* ownership window that credits his IP/ER. If our rosters or period dates differed from
   FG's, the counting stats would diverge too (a misattributed pitcher carries his K/W to the wrong
   team). They don't — not by one strikeout. So we and FG credit the **identical** set of
   pitcher-games to each team; attribution is provably the same.
2. **Our windowed components match MLB exactly** (Δ=0, 34 pitchers, above).

Therefore the delta is isolated to a **stat value** on some pitcher-game where FG differs from
current MLB. And the two teams diverge via *different* shapes:
- **Los Doyers:** ERA and WHIP both drop together → an **IP-shaped** difference (more innings shrinks
  both rates).
- **RGing:** ERA rises while WHIP falls → **impossible from IP alone** (IP moves both the same way) →
  an **ER/baserunner-shaped** difference (e.g., a run scored earned vs. unearned, or a hit ↔ error).

Different shapes on different teams rule out a systematic rounding/method bug (which would bias every
team one way) and point to **isolated frozen/stale component values** — a per-pitcher-game MLB
correction FG never re-ingested, one per team. This also explains the *stability*: FG appears to
freeze already-counted stats and not re-apply corrections, so it never self-heals.

> ✅ **RESOLVED 2026-07-07 — see the top banner.** The exact lines were named (Chandler 49-vs-48 ER, García 44-vs-45 H) by cross-referencing `display_team_stats.pl`'s per-player view against FBST's per-player accumulation, then tie-breaking against MLB statsapi + Baseball Reference. `display_team_stats.pl` *can* supply this at the per-player level after all.

**Open item to name the exact game:** FG's *standings-level* per-pitcher ER/IP breakdown would let us
diff each pitcher against MLB and identify the stale line. FG's `display_team_stats.pl` uses a
*current-roster* model (not the standings accumulation), so it cannot supply this — a
standings-accumulation per-pitcher view (or the raw pitching lines pasted in) is required. Until then
the mechanism is proven (stale FG input, not our attribution) but the specific pitcher-game is unnamed.

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
