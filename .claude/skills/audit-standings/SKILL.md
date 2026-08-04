---
name: audit-standings
description: Reconcile FBST standings against MLB statsapi, FanGraphs OnRoto, and Baseball Reference. Use when the user says "audit standings", "onroto audit", "check the standings", "reconcile the period", or after closing a period.
---

# Standings audit

Two legs, both emitted on every run:

| Leg | Compares | Answers |
|---|---|---|
| **Period** | FBST vs **MLB statsapi** | Is the stored data correct? |
| **Season** | FBST vs **FanGraphs** | Does an outside observer agree? |

**Trust order: MLB statsapi > PlayerStatsPeriod > playerStatsDaily > FanGraphs.**

That ordering decides who **wins** a disagreement — not who is allowed to **raise**
one. FanGraphs sits at the bottom and was still the only layer that caught the
Curtis Mead trade bug (PR #429). Never dismiss an FG-only divergence as "FG is
stale" without checking MLB directly.

## Steps

1. **Run the audit.** From `server/`:

   ```bash
   ./scripts/with-prod-db.sh npx tsx src/scripts/audit-standings.ts 20 --period 39
   ```

   `20` is the league id. Omit `--period` to audit the most recently completed
   period. The wrapper exports prod URLs from Railway and refuses to run if the
   ref isn't prod. There is no `--season` flag — both legs always run.

2. **Read the verdict.**
   - `PASS` — zero residuals **and** full coverage. Done.
   - `FINDINGS` — at least one non-zero residual. Go to step 3.
   - `INCOMPLETE` — a source was unreachable or players were skipped. **This is
     not a pass.** Say so plainly; never report it as clean.

3. **Shape-read before theorising.** One team diverging means attribution, roster,
   or a per-player data bug. All teams diverging by a similar trailing amount
   means sync timing — check FG's `through MM.DD.YY` header against the period
   end before anything else.

4. **Four-way tie-break on any residual — mandatory.** Do not state a verdict or
   claim confidence above "unverified hypothesis" until the residual players are
   checked against MLB statsapi **and** Baseball Reference:

   ```bash
   curl -s "https://statsapi.mlb.com/api/v1/people/<mlbId>/stats?stats=gameLog&season=2026&group=hitting"
   curl -s -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36" \
     "https://www.baseball-reference.com/players/gl.fcgi?id=<bbrefId>&t=b&year=2026"
   ```

   Align the as-of date (games played) first — statsapi leads the others on
   same-day games.

5. **Test your explanation against the teams that did NOT diverge.** This is the
   step that matters most, and the one that gets skipped.

6. **Log the run.** Append one row to the Results log in
   `docs/solutions/integration-issues/onroto-fangraphs-audit-runbook.md`.

## The falsification rule

> **Apply the candidate explanation to the cases that did not fail.
> If it predicts they should have failed, the explanation is wrong.**

This rule has killed three proposed root causes on this codebase, two of them in
a single day (2026-08-03), each of which fit the failing team's arithmetic
exactly:

- **IL exclusion** — "FBST drops the stats of a player IL-slotted at period
  start; OnRoto counts them all season." Fit Demolition's gap to within a few
  RBI. Falsified: six other teams (Chourio, Ramos, Palencia, Priester, Díaz,
  Lindor) hold exactly that IL shape with real accumulated stats and reconcile
  cell-for-cell. It also closed HR to exactly 164+3=167 *by coincidence*.
- **ADR-013 pre-acquisition attribution** — falsified because MLB showed FG's
  number *was* the ownership-windowed one.
- The real cause was a **data bug**: `splits[0]`, below.

An explanation that fits only the failing case is curve-fitting. Arithmetic that
lands exactly is evidence of nothing on its own — with ten categories and eight
teams, something always adds up.

## Known gotchas

**Data-layer traps — check these first, they are what actually bit:**

- **A mid-period MLB trade can zero a player's whole period.** `byDateRange`
  returns one split per team **plus** an aggregate row; taking `splits[0]` yields
  only the first team's partial line. Curtis Mead (BOS→WSH, P5) stored as all
  zeros across 15 played games — 100% of Demolition's gap. Fixed in PR #429 by
  selecting the split where `sport.id === 0` (`code: "All"`). Do **not** sum
  splits (single-team players get two, both tagged with the team → double-count)
  and do **not** key off a missing `team` field (the aggregate carries `team`
  when only one club is involved).
- **"Reconcile says 0 mismatches" is NOT evidence the data is right.**
  `reconcilePeriodStats` shares `fetchFreshPeriodStats` with the syncer *by
  design* (ADR-014: it must compare against exactly what the syncer would
  write). So it re-read the same wrong `splits[0]` and reported 0 mismatches
  while the Mead bug was live — **0 before the fix, 6 after, same stored data**.
  It is a consistency check, not an audit. Only an independent path (`gameLog`)
  actually reconciles.
- **Closed periods stop being re-checked after 5 days.**
  `reconcileRecentlyClosedPeriods` uses `windowDays: 5`; any late MLB scoring
  revision (earned/unearned, hit/error — routine, days-to-weeks later) then
  freezes into stored PSP permanently. **Signature: counting stats exact and
  `IP`/`SO`/`W`/`SV` exact, but `ER`/`H`/`BB` off.** Heal by re-running with a
  wider window, e.g. `reconcileRecentlyClosedPeriods({ windowDays: 25 })`.
- **Magnitude splits FG-stale from a real bug.** A **sub-0.01** ERA/AVG residual
  on 1–2 players is FanGraphs lagging MLB — leave it. A **0.04+** residual, or
  one that survives the four-way tie-break, is real. Chase it.
- **`audit-mlb-crosscheck` returning "0 flagged" does not clear a residual** — it
  skips partial-ownership and IL players (366 of 466), which is exactly where
  these live.

**Measurement traps — the bug is sometimes in the instrument:**

- **Never hand-roll a PSP sum.** It bypasses `playerStatRoles` and manufactures a
  phantom "position player is pitching" finding — position players legitimately
  carry pitching in raw PSP and scoring excludes them. Always reconcile through
  `accumulatePeriodStats` or the audit scripts. (PR #402 spent a session on an
  audit-script drop-and-re-add double-count while prod was correct all along.)
- **`audit_period.ts` is not production-faithful** — it classifies by *current*
  `assignedPosition` and double-counts drop-and-re-adds. Use
  `computeTeamStatsFromDb` semantics.

**FanGraphs scraping:**

- **FG has no per-player or per-team period slice.** `display_team_stats.pl`'s
  only `<select>` is `changeTeam`; there is no date filter. That is why the
  season leg is season-scoped. Comparing FBST period totals against FG season
  totals produces nonsense (−570 R) and a permanently-`FINDINGS` verdict.
- **`session_id=guest` works** on `display_stand.pl`. Per-team and historical
  pages are **Cloudflare-gated (403 to curl)** — use Playwright for those.
- **On `display_stand.pl`, the top grid holds roto points, not raw stats.** Raw
  values live in the per-category breakdown rows.
- **`FgPlayerRow.name` is not a key.** A multi-stint player appears on several
  rows — current line plus one carryover row per prior stint, in either table.
  FG publishes no player id here. Filter and aggregate; `.find(p => p.name === X)`
  returns an arbitrary stint. A table's `TOTAL:` row is the self-check: summing
  parsed rows must reproduce it.
- **The team-index map drifts — re-verify every audit.** Identify a
  `display_team_stats.pl?OGBA+6+{n}` page by which team name is over-represented
  versus the uniform nav baseline (every page lists all 8 in the nav);
  first-match always returns the alphabetically-first team.

**Baseball Reference:**

- Column keys are not the obvious ones: the date column is `data-stat="date"`
  (not `date_game`) and batting stats are `b_`-prefixed (`b_r`, `b_hr`, `b_rbi`).
  **Wrong keys return zero rows, not an error.**

## Scoring model — do not re-litigate

Two settled decisions that look like bugs if you forget them (ADR-013):

- **Attribution is ownership-window, not current-roster YTD.** Stats count only
  for the days a player was on your roster. OnRoto's display uses current-roster
  full-season YTD — a display convenience, not the scoring authority.
- **Scoring is period-by-period roto, accumulated.** OGBA scores each period as a
  standalone roto contest and adds the points up. OnRoto's season standings use
  YTD roto, so its point totals are on a different scale by design. FBST's period
  totals (168, 164, 148…) are correct; OnRoto's (61, 55.5…) are not comparable.

## Reference

- Spec: `docs/superpowers/specs/2026-08-03-standings-audit-skill-design.md` (DOC-024)
- Runbook: `docs/solutions/integration-issues/onroto-fangraphs-audit-runbook.md`
- The trade bug: `docs/solutions/logic-errors/mlb-multi-team-split-zeroes-traded-player-stats.md`
- Stale PSP: `docs/solutions/integration-issues/stale-psp-outside-5-day-reconcile-window.md`
- The falsified IL theory, kept as a worked example of the trap:
  `docs/solutions/integration-issues/il-stashed-player-returns-to-play-creates-phantom-fangraphs-delta.md`
- Both known defects in the FG per-team parser, a matched pair — rows silently
  dropped, then rows silently misfiled:
  `docs/solutions/integration-issues/html-parser-silent-row-drop-passes-its-own-tests.md`
  and `docs/solutions/integration-issues/parser-boolean-conflates-membership-with-status-misfiles-stat-total.md`
