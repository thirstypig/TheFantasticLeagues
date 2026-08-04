---
title: "One team diverges from FanGraphs and the IL explanation fit the arithmetic — but was falsified hours later (root cause still OPEN)"
slug: il-stashed-player-returns-to-play-creates-phantom-fangraphs-delta
category: integration-issues
created: 2026-08-03
updated: 2026-08-04
component: standings, ilWindows, fangraphs-audit, mlb-data-sync
problem_type: audit-methodology / attribution-semantics
symptom: "A single team diverges from FanGraphs on most hitting categories (FBST lower) while the other seven teams reconcile cell-for-cell. Counting stats are off by amounts too large to be sync lag and too small to be a whole-player omission."
root_cause: "RESOLVED — and it was not an attribution rule at all. The IL-exclusion hypothesis below fit the affected team's arithmetic but was FALSIFIED the same day: six other teams have IL-at-period-start players with real accumulated stats and show zero divergence. The actual cause was a data bug — a mid-period MLB trade stored as zeros because parsePlayerStats took splits[0] instead of the aggregate split (fixed in PR #429). This document is retained as a worked example of an explanation that fits the arithmetic without being the mechanism."
related_modules: standings, periods, transactions, players, fangraphs-audit
prs: [429, 431]
tags: fangraphs, onroto, audit, standings, il, attribution, adr-013, baseball-reference, statsapi, four-way
---

# One team diverges from FanGraphs — and the obvious explanation was wrong

> ## ⚠️ STATUS: ROOT CAUSE FALSIFIED — REAL CAUSE FOUND ELSEWHERE (PR #429)
>
> This document originally concluded that FBST's IL exclusion caused the divergence.
> **That conclusion is wrong** and was disproved the same day by the audit tool built
> from it. See [The disconfirming evidence](#the-disconfirming-evidence).
>
> **The actual cause was not an attribution rule at all.** Curtis Mead was traded
> Boston→Washington mid-Period-5. MLB's `byDateRange` returns one split per team plus
> an aggregate, and `parsePlayerStats` took `splits[0]` — so FBST stored his entire
> period as zeros across 15 played games. That missing R11/HR3/RBI9/SB2 is exactly
> the Demolition gap this document tried to explain. Fixed in PR #429; full write-up
> in `../logic-errors/mlb-multi-team-split-zeroes-traded-player-stats.md`.
>
> **What still holds:** every measurement here. Acuña's Period 5 line is R5/HR2/RBI2/AB22
> in FBST, MLB statsapi, and Baseball Reference — verified three ways. The doubleheader
> observation, the reproduction recipe, and the Baseball Reference parser keys are all
> unaffected.
>
> **What does not hold:** the causal claim built on top of those measurements. The
> `buildIlCandidates` classifier written from it was deleted in PR #431 — while live it
> manufactured the very gap it claimed to explain, printing `explained` and `residual`
> as identical columns for every already-reconciling team.
>
> Read this as a worked example of an explanation that matched a number without being
> the mechanism — which is more useful than the wrong answer it originally gave. The
> rule that killed it in minutes, now step 5 of the `audit-standings` skill: **apply the
> candidate explanation to the cases that did NOT fail.**

## Symptom

The 2026-08-03 season audit for OGBA (league 20) produced **72 of 80 cells exact**.
Seven teams matched FanGraphs cell-for-cell. All eight mismatches belonged to one
team, Demolition Lumber Co.:

| Cat | FBST | FG | Δ |
|---|---|---|---|
| R | 688 | 699 | −11 |
| HR | 164 | 167 | −3 |
| RBI | 637 | 646 | −9 |
| SB | 122 | 124 | −2 |
| AVG | .2647 | .2659 | −.0012 |
| ERA | 3.47 | 3.43 | +.04 |
| WHIP | 1.145 | 1.140 | +.005 |
| K | 911 | 907 | +4 |

The shape is the tell. **One team diverging rules out sync-timing lag**, which
would hit all eight. And the hitting deltas are far too large for rounding but far
too small to be a whole player missing.

## The hypothesis (FALSIFIED — kept for the record)

Demolition IL-stashed **Ronald Acuña Jr. on 2026-07-05** and activated him on
**2026-08-02**. Period 5 ran 07-05 → 08-01 — so the stash covered the period
*exactly*, start to end.

But Acuña **returned to actual MLB play on 07-27** and appeared in six games before
the period closed. Those stats are real, and they sit inside a period where FBST
considers him IL.

The two systems then disagree by construction:

- **FBST** — `wasOnIlAtPeriodStart(playerId, periodStart, ilWindows)` excludes a
  player who was IL-slotted at the *start* of that period. His whole period is
  dropped, including games played after he came back.
- **OnRoto/FanGraphs** — current-roster YTD. Once he's on the roster, his
  season totals count.

Neither is a bug. They answer different questions (see ADR-013 and
`onroto-vs-fbst-stat-attribution-semantics.md`).

**Whether FBST's answer is the one OGBA wants is a rules question, not a code
question.** A player who is IL-stashed but actively playing currently scores
nothing. Changing that is a league-rules decision with real standings impact.

## Verification — the four-way (mandatory, not optional)

The runbook requires a per-player four-way before any verdict. This is exactly the
case it exists for: the IL story was *plausible* long before it was *proven*, and
`fangraphs-audit.ts` alone could never have distinguished "FBST correctly excludes
Acuña" from "FBST lost Acuña's stats."

**Step 1 — reconcile the whole period against MLB.** `reconcilePeriodStats(39)`
re-fetches every player for the period window through the same fetch/parse path the
syncer uses (ADR-014) and diffs against stored PSP:

```
{ periodId: 39, playersChecked: 219, fetchErrors: 0, mismatches: [] }
```

219/219 exact. That eliminates "FBST's data is wrong" for the entire period in one
shot, and it does not involve FanGraphs at all.

**Step 2 — per-player, all three sources.** For the suspected player:

| Source | R | HR | RBI | SB | AB | H |
|---|---|---|---|---|---|---|
| FBST `PlayerStatsPeriod` | 5 | 2 | 2 | 0 | 22 | — |
| MLB.com statsapi | 5 | 2 | 2 | 0 | 22 | 3 |
| Baseball Reference | 5 | 2 | 2 | 0 | 22 | 3 |

Identical. Games: 07-27, 07-29, 07-29, 07-30, 07-31, 08-01.

Note the **two entries on 07-29 — a doubleheader**. Incidental confirmation of the
PSP-first rule: `playerStatsDaily` has `@@unique([playerId, gameDate])` and would
have collapsed both games into one row, silently undercounting him. See
`standings-stats-source-heuristic-chose-inaccurate-daily-over-period.md`.

### Arithmetic check

Adding the two IL-excluded windows back (Acuña P5, plus Andrew Vaughn's
04-19 → 05-17 stash covering all of Period 2) closes HR exactly and brings the rest
close:

| Cat | FBST | +IL windows | FG | residual |
|---|---|---|---|---|
| R | 688 | 698 | 699 | −1 |
| HR | 164 | 167 | 167 | **0** |
| RBI | 637 | 644 | 646 | −2 |
| SB | 122 | 122 | 124 | −2 |

**The residual is real and remains open.** Do not round it away. It is also
confounded: FBST included 08-03 games while FG's header said `through 08.02.26`,
which means the true IL-attributable gap is *larger* than the raw delta, not
smaller.

That HR column closing to exactly zero is what sold the hypothesis. It should not have.

---

## The disconfirming evidence

Later the same day, the audit skill built from this document ran the IL rule across
**all eight teams** instead of just the affected one. The result killed the hypothesis.

Six of the seven *non-diverging* teams also have IL-at-period-start players carrying
real accumulated stats:

| Team | IL-at-period-start player(s) | FBST↔FG divergence |
|---|---|---|
| Dodger Dawgs | Jackson Chourio (P2), Francisco Lindor (P3) | **none** |
| Devil Dawgs | Heliot Ramos (P3, P4) | **none** |
| RGing Sluggers | Daniel Palencia (P2), Heliot Ramos (P3, P4) | **none** |
| Skunk Dogs | Quinn Priester (P2–P4), Luis Robert Jr. (P3) | **none** |
| Diamond Kings | Edwin Díaz (P3, P4) | **none** |
| Los Doyers | (IL windows present) | **none** |
| Demolition Lumber Co. | Acuña (P5), Vaughn (P2) | **8 of 10 categories** |

Re-confirmed by re-running the 80-cell diff: **8 mismatches out of 80, all Demolition.**

If FBST excluded IL-period stats while OnRoto counted them, every team in that table
would diverge. Six of them do not. **The mechanism is not generally operative.**

The tell inside the tool was unmistakable: for six teams the classifier printed
`explained` and `residual` as *identical* columns — because `residual = fbst + explained − fg`
and `fbst == fg` already. Subtracting an "expected" divergence from a gap that does not
exist manufactures a residual out of nothing.

### What this means

- Acuña's and Vaughn's numbers are correct and triple-verified. That was never the issue.
- The arithmetic fit (HR closing to exactly 0) was **coincidence**, or at best a partial
  overlap with whatever the real mechanism is.
- Demolition's divergence has a cause that has **not** been identified. The pitching side
  always argued against the IL story anyway — it runs the *opposite* direction (FBST has
  +4 K and worse ERA/WHIP), which IL exclusion cannot produce.
- Next step is a genuine four-way, per-player, on Demolition's roster specifically:
  which players' season lines differ between FBST and FG, and why does no other team
  show the same effect?

## Reproduction recipe

```bash
# 1. Point at prod (scripts otherwise resolve to LOCAL Supabase)
export DATABASE_URL="$(env -u RAILWAY_API_TOKEN railway variables --kv | grep '^DATABASE_URL=' | cut -d= -f2-)"
export DIRECT_URL="$(env  -u RAILWAY_API_TOKEN railway variables --kv | grep '^DIRECT_URL='  | cut -d= -f2-)"
echo "$DATABASE_URL" | grep -q 'oaogpsshewmcazhehryl' && echo "PROD confirmed" || echo "NOT PROD — stop"

# 2. Whole-period ground truth (read-only, returns a report)
#    reconcilePeriodStats(periodId) from features/players/services/mlbStatsSyncService.ts

# 3. Per-player MLB game log for the period window
curl -s "https://statsapi.mlb.com/api/v1/people/660670/stats?stats=gameLog&season=2026&group=hitting"

# 4. Per-player Baseball Reference game log
curl -s -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36" \
  "https://www.baseball-reference.com/players/gl.fcgi?id=acunaro01&t=b&year=2026"
```

### Baseball Reference parser keys (cost two failed attempts)

BBRef's game-log table does **not** use the column names you'd guess:

- Date column is `data-stat="date"` — **not** `date_game`.
- Batting stats are `b_`-prefixed: `b_r`, `b_hr`, `b_rbi`, `b_sb`, `b_ab`, `b_h`
  — **not** bare `R`, `HR`, `RBI`.
- The table id is player-specific (e.g. `acuna-002ron`), so don't select by a fixed id.
- Plain `curl` with a browser UA works (HTTP 200). No Playwright needed.

A wrong key name yields **zero matched rows, not an error** — which silently reads
as "no games in this window." Always assert the game count is non-zero before
trusting a total.

## Prevention

0. **An explanation that fits the arithmetic is not yet a mechanism.** Before accepting
   one, apply it to the cases that *did not* fail. If the rule predicts divergence for six
   other teams and they reconcile exactly, the rule is wrong — no matter how neatly it
   closes the column you started from. This is the most expensive lesson in this file: a
   same-day writeup asserted a root cause that its own tooling disproved hours later. The
   check is cheap and it is not optional — run the candidate rule against the *passing*
   cases before you believe it.
1. **Shape-read the diff before theorizing.** One team diverging = attribution or
   roster. All teams diverging by a similar trailing amount = sync timing. This
   single check would have skipped an hour of speculation.
2. **Run the whole-period MLB reconcile first.** It is cheap, needs no FanGraphs,
   and settles the "is our data wrong" question globally before anyone argues about
   a single player.
3. **Check the transaction log for IL windows that align with period boundaries.**
   `IL_STASH` / `IL_ACTIVATE` pairs that bracket a period exactly are the highest-yield
   suspects. Both instances here (Acuña P5, Vaughn P2) had that signature.
4. **Never state a verdict before the four-way.** Precedent 2026-07-10: a confident
   "FG is stale ~3 ER" call was overturned once per-player data was compared. The
   first pass of *this* audit likewise stopped at "unverified hypothesis" — correctly.
5. **Assert non-zero row counts in any external-source parser.** Silent zero is the
   dominant failure mode for both the BBRef game log and the FG standings page.
6. **A residual you can't explain stays a finding.** Subtracting known model
   divergence is legitimate; stretching it to cover the remainder is not.

## Cross-references

- `onroto-fangraphs-audit-runbook.md` — the end-to-end procedure; Step 5 is the four-way.
- `onroto-vs-fbst-stat-attribution-semantics.md` — ADR-013 ownership-window vs YTD.
- `statsapi-leads-bbref-fangraphs-on-todays-games-align-as-of-date.md` — align as-of dates first.
- `standings-stats-source-heuristic-chose-inaccurate-daily-over-period.md` — why PSP beats PSD (doubleheaders).
- `closed-period-stat-attribution-uses-current-owner.md` — the prior attribution bug this is *not*.
- `docs/superpowers/specs/2026-08-03-standings-audit-skill-design.md` (DOC-024) — the audit skill that automates this classification.
