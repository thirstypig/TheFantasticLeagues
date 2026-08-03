---
title: "An IL-stashed player who returns to MLB play mid-period creates an FBST↔OnRoto delta that looks like a stat bug (it isn't)"
slug: il-stashed-player-returns-to-play-creates-phantom-fangraphs-delta
category: integration-issues
created: 2026-08-03
component: standings, ilWindows, fangraphs-audit, mlb-data-sync
problem_type: audit-methodology / attribution-semantics
symptom: "A single team diverges from FanGraphs on most hitting categories (FBST lower) while the other seven teams reconcile cell-for-cell. Counting stats are off by amounts too large to be sync lag and too small to be a whole-player omission."
root_cause: "The team IL-stashed a player who was still accruing MLB stats. FBST's wasOnIlAtPeriodStart() excludes an IL-slotted player's whole period; OnRoto's current-roster YTD model counts him. Neither system is wrong — they answer different questions."
related_modules: standings, periods, transactions, players, fangraphs-audit
prs: []
tags: fangraphs, onroto, audit, standings, il, attribution, adr-013, baseball-reference, statsapi, four-way
---

# IL-stashed player returns to play → phantom FanGraphs delta

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

## Root cause

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
smaller. Resolving it needs a per-player FG *period* slice — FG's per-team pages
show season YTD only.

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
