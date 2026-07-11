---
title: "Audit false alarm: MLB.com statsapi shows MORE than Baseball Reference + FanGraphs + FBST — it leads on TODAY's games; align the as-of date before declaring a discrepancy"
slug: statsapi-leads-bbref-fangraphs-on-todays-games-align-as-of-date
category: integration-issues
created: 2026-07-10
component: fangraphs-audit, standings, mlb-data-sync
problem_type: false-positive-triage / audit-methodology
symptom: In a four-way per-player audit (MLB.com statsapi vs Baseball Reference vs FanGraphs OnRoto vs FBST), statsapi reported 29 ER / 109 IP for a pitcher while BBRef, FanGraphs, AND FBST all reported 27 ER / 108 IP — looking like FBST and FanGraphs were each undercounting by 2 ER against the "authority."
root_cause: statsapi is the most real-time source and had already ingested that pitcher's SAME-DAY (in-flight) game; Baseball Reference, FanGraphs OnRoto, and FBST were all snapshotted through the prior day and had not. The gap equalled exactly that one game (games-played 19 vs 18). Aligned to a common as-of date, all four sources are unanimous. No data error anywhere; statsapi leading is the expected direction on today's games.
related_modules: standings, players, periods, fangraphs-audit, mlb-data-sync
prs: []
tags: mlb-statsapi, baseball-reference, fangraphs, onroto, audit, as-of-date, games-played, sync-timing, real-time-lag, trust-hierarchy, ownership-window, eduardo-rodriguez, false-positive, four-way-reconciliation, OGBA
---

# statsapi leads BBRef + FanGraphs on today's games — align the as-of date

## Symptom

Running a four-way per-player audit — MLB.com **statsapi** vs **Baseball
Reference** vs **FanGraphs OnRoto** vs **FBST** — one pitcher (Eduardo
Rodriguez, ARI, owned by Dodger Dawgs all season) came back like this:

| Source | ER | IP | G | as-of |
|---|---|---|---|---|
| MLB.com statsapi | **29** | **109.0** | **19** | live (through today, 07-10) |
| Baseball Reference | 27 | 108.0 | 18 | through 07-09 |
| FanGraphs OnRoto | 27 | 108.0 | — | through 07-09 |
| FBST (ours) | 27 | 108.0 | — | through 07-09 |

The tempting read — *"statsapi is the authority (top of the trust
hierarchy), it says 29, so FBST AND FanGraphs are both undercounting by 2
ER"* — is **wrong**, and wrong in a way that would send you hunting a
non-existent sync bug.

## Root cause

statsapi is the **fastest** source. It had already ingested Eduardo
Rodriguez's **same-day (07-10) outing: 2 ER, 1.0 IP** — visible as
**games-played 19 vs everyone else's 18**. Baseball Reference, FanGraphs's
nightly batch, and FBST's period snapshot were all still **through 07-09**.

Subtract the one game statsapi has that the others don't:

```
statsapi 29 ER − 2 (07-10 game)  = 27 ER  = BBRef = FanGraphs = FBST
statsapi 109 IP − 1 (07-10 game) = 108 IP = BBRef = FanGraphs = FBST
```

Aligned to a common as-of date, **all four sources are unanimous.** There is
no undercount and no data error. statsapi being *higher* is not evidence that
anyone else is short — it is evidence that statsapi is more current.

The non-obvious part: **even Baseball Reference lags today's in-flight
games** (it showed G=18, not 19). So you cannot treat "statsapi > BBRef" or
"statsapi > FanGraphs" as a red flag on its own — on the current game-day,
statsapi legitimately leads all of them.

## Why the trust hierarchy still holds (and how this fits ADR-013)

The trust hierarchy `MLB statsapi > PSP > PSD > FanGraphs`
(`mlb-statsapi-sync-hasstats-filter-drops-er-rbi.md`) is about **which source
is authoritative for a raw stat at a given point in time**, not about who has
the latest games first. statsapi is authoritative *and* fastest — both true.
The discipline is: when statsapi disagrees with the others, decide **first**
whether it's an as-of-date difference (statsapi has a newer game) before
concluding it's a data error.

This reconciles with `reports/onroto-audit-2026-06-08.md`, which concluded
"data-source lag only ever applies to the **active** period." This lesson is
that report's **active-period corollary**: within the active period, on
**today's** in-flight games, statsapi runs ahead of BBRef + FanGraphs +
FBST's snapshot — so a statsapi-high reading on a recent game is the normal
steady state, not a bug.

## The fix / method: reconcile the as-of date, use games-played as the key

Before declaring ANY per-player discrepancy in a cross-source audit:

1. **Read each source's as-of date.** FanGraphs prints
   `STANDINGS through MM.DD.YY`; FBST's audit window ends at the last synced
   period day; Baseball Reference and statsapi don't print one — so use...
2. **Games-played (G) as the as-of reconciler.** If statsapi shows G=19 and
   the others show G=18, statsapi has exactly one extra game. Pull that game
   from statsapi's `gameLog` and confirm its line accounts for the entire
   delta:
   ```bash
   curl -s "https://statsapi.mlb.com/api/v1/people/{mlbId}/stats?stats=gameLog&group=pitching&season=2026" \
     | python3 -c "import sys,json; d=json.load(sys.stdin); \
       print([(s['date'], s['stat'].get('earnedRuns'), s['stat'].get('inningsPitched')) for s in d['stats'][0]['splits'][-3:]])"
   ```
3. **Subtract the newer game(s) from statsapi, then compare.** If the delta
   collapses to zero, it's an as-of-date artifact — done, no bug.
4. Only if a per-player gap survives date-alignment do you escalate to a real
   attribution/sync investigation.

Also note **IP thirds notation**: statsapi returns IP as `100.1` = 100⅓
innings; FBST/FanGraphs render the same value as `100.3`. `100.1 (statsapi)`
and `100.3 (FBST)` are the SAME innings count — don't flag it as a mismatch.

## What this audit was NOT about (the standings-level residual)

The four-way check was triggered by a team-standings residual — FBST Dodger
ERA 3.59 vs FanGraphs 3.55 (0.04), plus two ±.0002 AVG cells. That residual
is a **separate, by-design phenomenon**: ownership-window vs current-roster
attribution on **dropped players** (ADR-013,
`onroto-vs-fbst-stat-attribution-semantics.md`). It is invisible to a
per-player raw-stat check — every individual player's ER/IP is identical
across sources; only the *team aggregation of partially-owned pitchers*
differs. Two distinct things, easy to conflate:

- **Team-standings residual** → attribution model (ADR-013), by design.
- **Per-player raw stat** → same across all sources once as-of dates align.

Neither is a bug. Baseball Reference / MLB.com can only ever adjudicate the
second (they don't publish OGBA fantasy standings), and on the second, FBST
is correct.

## Prevention

- **Add to the audit checklist:** "If any source shows MORE than the others,
  check games-played (G) / through-date FIRST. statsapi leading on the
  current game-day is normal, not an undercount."
- **Don't anchor on 'statsapi is the authority.'** It is — for raw values at
  a common instant. It is also the fastest, so it will disagree with slower
  snapshots on today's games. Both facts coexist.
- **Report team-standings divergences and per-player divergences separately.**
  A rate-only, rank-neutral team residual with all counting stats matching is
  almost always attribution (ADR-013), not data.

## Cross-references

- `docs/solutions/integration-issues/onroto-fangraphs-audit-runbook.md` — the audit runbook; this doc extends its "trust FG's through-header, not the clock" timing rule from FG-only to a four-source as-of alignment. (Append the 07-10 four-way result to its Results log.)
- `docs/solutions/integration-issues/fangraphs-era-residual-is-rounding-not-a-bug.md` — the sibling closed-period residual triage (FG-stale on Chandler ER / García H); per-player MLB + BBRef verification recipe.
- `docs/solutions/integration-issues/mlb-statsapi-sync-hasstats-filter-drops-er-rbi.md` — canonical trust hierarchy + the FBST-vs-statsapi boundary-convention decision.
- `docs/solutions/logic-errors/onroto-vs-fbst-stat-attribution-semantics.md` — ADR-013: ownership-window vs current-roster-YTD; the source of the team-standings residual that triggered this audit.
- `docs/reports/onroto-audit-2026-06-08.md` — the deep 3-way reference audit; this doc is its "active-period corollary."
