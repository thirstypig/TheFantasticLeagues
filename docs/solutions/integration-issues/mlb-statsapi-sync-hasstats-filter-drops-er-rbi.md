---
title: hasStats filter dropped pitcher blown appearances and zero-AB hitter games
slug: hasstats-filter-omits-er-bb-rbi-drops-mlb-games
category: integration-issues
created: 2026-06-02
component: mlb-data-sync, standings, fangraphs-audit
problem_type: filter_predicate_bug
symptom: FBST standings diverged from FanGraphs by 14 ROTO points despite matching season totals
root_cause: hasStats predicate in mlbStatsSyncService checked AB/H/R/HR/W/SV/K/IP but omitted ER/BB/RBI/SB/BB_H, dropping blown pitcher appearances and zero-AB RBI games
related_modules: players, standings, periods
prs: [362]
tags: mlb-api, statsapi, gameLog, hasStats, blown-appearance, audit, doubleheader, zero-ab-rbi, sac-fly
---

## Symptom

A full-season FBST standings audit against FanGraphs revealed a 14-point distribution delta despite the league using a zero-sum scoring system (every point earned by one team must be lost by another). Per-team raw-stat totals showed small, persistent shortfalls — DLC's pitching staff totaled 40 ER in FBST vs 41 in both FanGraphs and MLB statsapi; DK's batting line totaled 86 RBI in FBST vs 87 in both external sources. A casual eye would never catch this: the missing rows had no positive "outcome" stat to draw attention (a relief pitcher pulled with 0 outs, a hitter with a sac fly and 0 AB), so the only signature was a per-team total running 1 short in a single category. Across ~1200 player-games swept, only 2 dropped rows surfaced — a 0.17% miss rate that nonetheless moved closed-period standings.

## Investigation

1. Started from a season-standings audit cross-referencing FBST against FanGraphs; noticed a 14-point distribution delta in a zero-sum scoring league, which is mathematically impossible from rounding or attribution alone.
2. **Dead-end #1**: First hypothesis was the known `playerStatsDaily` doubleheader-collapse issue (period stats are authoritative; daily collapses DH games). Spent time validating doubleheader handling before realizing the categorical shortfall pattern didn't match — collapse would lose entire days, not 1 ER from a pitcher's season line.
3. Queried MLB statsapi `gameLog` directly for DLC's full pitching staff: 74 of 75 pitcher-game rows matched FBST exactly to the counter.
4. The 1 mismatch was Matt Gage's 5/19 appearance vs ARI — entered, gave up a hit and an earned run, pulled with 0 outs recorded (0.0 IP, 1 ER, 1 H, 0 K). FBST had no `PlayerStatsDaily` row for that date. Traced to `mlbStatsSyncService.ts:317-320` and immediately spotted ER missing from the `hasStats` predicate.
5. Confirmed root cause: the filter was an OR over a fixed list of "positive outcome" counters; a pitcher line with only ER/BB_H positive would evaluate `false` and the row would be silently skipped (`skipped++`), never upserted.
6. Ran the same sweep against the hitter side anticipating an analogous gap — found TJ Rumfield 6/1: a sacrifice fly producing 0 AB, 1 RBI, 0 H. RBI was also missing from the predicate, so the row dropped the same way. SB and BB were missing too, though no concrete miss surfaced for those in this sweep.

## Root cause

```ts
// OLD — server/src/features/players/services/mlbStatsSyncService.ts:317-320
const hasStats = stats.AB > 0 || stats.H > 0 || stats.R > 0 || stats.HR > 0 ||
  stats.W > 0 || stats.SV > 0 || stats.K > 0 || stats.IP > 0;
if (!hasStats) { skipped++; continue; }
```

The predicate confuses **"positive outcome"** with **"stat-bearing event."** It was written as a guard against persisting truly empty rows (a player on the active roster who didn't appear), but the chosen flags only capture *good* fantasy outcomes — hits, runs, wins, saves, strikeouts, innings. The filter has no concept of *bad* stat-bearing events for pitchers (ER, hits-allowed) or *productive non-AB* events for hitters (RBI on a sac fly, a stolen base, a walk). The OR-list was incomplete by category, not by intent — every missing flag corresponds to a real scoring category in the league.

## Fix

```ts
// NEW — same file, same lines (PR #362)
const hasStats =
  stats.AB > 0 || stats.H > 0 || stats.R > 0 || stats.HR > 0 ||
  stats.RBI > 0 || stats.SB > 0 || stats.BB > 0 ||
  stats.W > 0 || stats.SV > 0 || stats.K > 0 || stats.IP > 0 ||
  stats.ER > 0 || stats.BB_H > 0;
```

Added: `RBI`, `SB`, `BB` (batter side); `ER`, `BB_H` (pitcher side). The predicate now flags any row containing a counter that contributes to a scoring category, regardless of whether that counter is "good" or "bad" from the player's perspective.

Additional artifacts shipped with the fix:
- `server/audit-backfill-matt-gage.mjs` — one-shot backfill for the 5/19 DLC pitcher miss.
- `server/audit-backfill-rumfield-6-1.mjs` — one-shot backfill for the 6/1 DK hitter miss.
- 3 regression tests in `server/src/features/players/__tests__/mlbStatsSyncService.test.ts`:
  - Blown pitcher appearance (0.0 IP, 1 ER, 1 H) → row is upserted.
  - Truly empty stat line (all counters 0) → row is still skipped (guard intent preserved).
  - 0-AB pinch runner with 1 SB → row is upserted.

## Related work

**Related solution docs:**
- `docs/solutions/logic-errors/standings-stats-source-heuristic-chose-inaccurate-daily-over-period.md` — Closest precedent: `playerStatsDaily` collapses doubleheaders so standings undercount RBI/K/W/IP; fix elevated `PlayerStatsPeriod` as the authoritative source. Same root failure mode (sync-layer omission silently undercounts), different mechanism (table choice vs. row-level skip filter).
- `docs/solutions/logic-errors/standings-stat-attribution-and-avg-rounding.md` — Free-agent attribution bug in standings; same "FanGraphs comparison surfaced silent undercounting" discovery pattern.
- `docs/solutions/logic-errors/standings-boundary-and-il-slot-historical-lookup.md` — `releasedAt`/`gte` boundary bugs causing silent stat misattribution in standings.
- `docs/solutions/logic-errors/period-roster-historical-il-display-and-gte-boundary.md` — Companion to the above; period-roster boundary fix shipped 2026-05-14.

**Related PRs:**
- **#362** `fix(stats-sync): include ER + BB_H + RBI/SB/BB in daily-stats hasStats filter` — The PR this compound doc is documenting.
- **#364** `fix(audit): fangraphs-audit.ts reads PlayerStatsPeriod` — Switches the audit script from PSD to PSP (the trust-hierarchy fix; same PR as this doc update).
- **#335** `fix(standings): countedPlayers ordering bug, attribution docs, parallelize ilEvents query` — Most recent standings attribution fix.
- **#176** `fix(standings): weighted averaging for rate stats + AiInsight index` — Earlier rate-stat correctness fix.
- **#281** `fix(stats): plumb computedAt through season-stats schema + standings client wrapper` — Stats freshness plumbing; observability surface for "are stats fresh?" questions.

## Prevention

### How to avoid this class of bug

- Naming is a contract: a predicate called `hasStats` must answer "did this player play?" — not "did this player produce a positive counting stat?" If the two questions diverge, the predicate is wrong even when the field list is "complete."
- Prefer presence checks over whitelist checks. "Did the upstream return a record for this player on this date?" is a structural question (`stats != null`, `stats.gamesPlayed >= 1`, or the API's own `gamesStarted`/`appearances` marker) and never goes stale when the schema grows.
- If you must enumerate fields, derive the list from the schema, not from a hand-typed array. A `hasAnyNonZero(stats)` helper that iterates `Object.entries(stats)` and checks numeric `> 0` auto-includes new columns; a literal `stats.h || stats.r || stats.hr` does not.
- Whitelists should be exclusion-shaped, not inclusion-shaped. Listing the *non-stat* fields to skip (`['playerId', 'gameDate', 'teamId']`) and treating everything else as "if any > 0, keep it" fails safe — a new stat column joins the predicate automatically.
- When adding a new stat column to a Prisma model, grep for predicates that enumerate stat field names manually (`grep -rE '\.(ab|h|r|hr|rbi|bb|er|ip)\b'` in services/) — those are now stale by construction.
- Symmetric coverage check: any predicate that walks "did the batter do anything" should have a mirror that walks "did the pitcher do anything," and both should include negative-outcome stats (ER, BB, H allowed, SF, GIDP), not just positive-outcome ones.

### Verification recipe — FBST vs MLB statsapi cross-check

Document the playbook for future "are our stats right?" investigations:

```bash
# 1. Fetch FG team stats for the period (manual / scraped JSON)
# 2. Compute FBST per-team raw totals
node server/audit-period-3-stats.mjs

# 3. For any divergent team, drill per-player (separate scripts for hitters/pitchers)
node server/audit-period-3-pitchers.mjs
node server/audit-hitters-vs-mlb-api.mjs

# 4. For any divergent player, hit MLB statsapi gameLog directly:
curl "https://statsapi.mlb.com/api/v1/people/{mlbId}/stats?stats=gameLog&season=YYYY&group=hitting"
curl "https://statsapi.mlb.com/api/v1/people/{mlbId}/stats?stats=gameLog&season=YYYY&group=pitching"

# 5. Compare game-by-game against PlayerStatsDaily rows for that mlbId + dateRange.

# 6. Verdict matrix:
#    MLB API == FBST, FG differs    → FG is wrong (most common, see Trust hierarchy)
#    MLB API == FG,  FBST differs   → FBST sync gap; identify which date(s) are missing rows
#    MLB API differs from both      → upstream correction; re-sync the affected window
```

Reusable league-wide sweep template (gitignored, copy and adapt): `server/audit-zero-ip-misses-league.mjs`. Pattern: for each rostered player in the period, fetch MLB gameLog, compare to PlayerStatsDaily, report rows where upstream has a game but FBST has none.

Always sweep *after* 9 AM PT — FG's nightly sync lags and will produce phantom 3–7 stat diffs on the most recent date (see `feedback_fangraphs_audit_timing_lag.md` in user memory).

### Test cases worth keeping

Three regression tests already exist in `server/src/features/players/__tests__/mlbStatsSyncService.test.ts`:

1. **Blown pitcher appearance** (0 IP, 1 ER, 1 H allowed) — must upsert. Guards the original bug.
2. **Truly empty stat line** (off-day, all zeros, no `gamesPlayed`) — must still skip. Guards against over-correcting into "upsert everything."
3. **0-AB pinch runner with SB** (1 SB, 0 AB, 0 H) — must upsert. Covers the "did something but no batting line" hitter case.

Recommend adding a 4th:

4. **Sac-fly hitter** (0 AB, 1 RBI, 1 SF, 0 H) — must upsert. Symmetric coverage of the hitter side of the original bug; today only the pitcher analog is asserted, so a future regression that drops SF/RBI from the predicate would slip through.

Optional 5th if the predicate is ever refactored to derive from schema: a **schema-drift test** that adds a fake column to the input and asserts the predicate sees it without code change.

### The trust hierarchy

There are FOUR layers of "stats truth" in play; ranking them correctly saves hours of misdirected investigation.

```
MLB statsapi  >  PlayerStatsPeriod (production)  >  PlayerStatsDaily (audit-tool)  >  FanGraphs (derived view)
```

**1. MLB statsapi `gameLog` is authoritative.** Every other layer derives from it. When two derived sources disagree, this is the tiebreaker.

**2. `PlayerStatsPeriod` (PSP) is what production standings actually read** (`standingsService.ts:464`). The `syncAllActivePeriods` cron writes it daily via MLB `byDateRange` — a SINGLE aggregate query for the full period, so PSP has no per-day filter, no opening-weekend cold-start gap, and no exposure to the `hasStats` bug above. **Audit the same source production reads from.**

**3. `PlayerStatsDaily` (PSD) is per-game and noisier.** It's populated by `syncDailyStats` (this filter bug) and only used by the standings UI as a fallback. The legacy `fangraphs-audit.ts` script aggregated PSD until PR #364 — that masked the real production picture behind audit-tool artifacts.

**4. FanGraphs is a derived view of MLB statsapi.** It's authoritative for "what does the OGBA league see in OnRoto" but NOT for "what are the correct stats." Three of this session's FG ↔ FBST discrepancies turned out to be FG over-counting (DK and RGS each had +1 spurious ER in FG); FBST's standings rebalancing was working as designed.

### When the audit and production disagree

Two real cases from this investigation:
- **Audit (PSD) showed a 28-point season delta vs FG.** Production (PSP) actually only diverged by 11. The 17-point difference was 187 missing PSD rows from Opening Day weekend (3/25–3/28) that production never read.
- **Audit script "found" a missing Matt Gage 5/19 row.** Production standings already had the correct totals via PSP (single aggregate query for the period, immune to the per-day filter). The audit-script gap was real; the production gap wasn't.

**Rule of thumb:** if you're chasing a divergence at the audit-script layer, validate it's not just an audit-tool artifact before assuming production is broken. Run the same query against PSP first.

### Default-blaming FBST cost time

For DK and RGS in this session, the first instinct was "what's wrong with FBST?" — 30 min sunk before the MLB API cross-check flipped the verdict to "FG is wrong." The trust hierarchy is the order in which to spend investigation time:

1. Hit `statsapi.mlb.com` for the specific player+date.
2. Check PSP (production source).
3. Check PSD (audit-tool source) only if step 2 confirms a real gap.
4. Assume FG is correct only after the prior three agree against it.

### Period boundary convention divergence (FG vs FBST)

The 2026-06-02 P1 audit closed out by discovering a **calendar convention
mismatch** between FG OnRoto and FBST that explains ~13 points of P1
distribution drift across the league — and is not a bug in either system.

**FG OnRoto's "Last Game Date in Desired Period: 04.18" filter means
"data current through MORNING of 04.18"** — it EXCLUDES games played
on 04.18 itself. FBST's `Period.endDate = 04.18` is INCLUSIVE — it counts
all 04.18 games as part of Period 1.

Evidence from FG P1 vs FBST P1 (Playwright scrape of `display_team_stats.pl`
after submitting the 04.18 filter at `team_run_old_roto.pl`):

| Stat | DDG FG | DDG FBST | SKD FG | SKD FBST | RGS FG | RGS FBST |
|---|--:|--:|--:|--:|--:|--:|
| AB | 903 | 950 | 971 | 1022 | 990 | 1028 |
| IP | 151.0 | 162.0 | 153.7 | 164.3 | 181.7 | 196.0 |
| K | 155 | 167 | 164 | 174 | 145 | 161 |
| W | 10 | 11 | 8 | 9 | 11 | 12 |

Pattern: **FG is uniformly ~1 game per player lower than FBST on every
counting stat**. ~47 AB / ~11 IP / ~12 K / 1 W per team — exactly one MLB
game day per player slot.

#### Conclusion

The 13-point P1 audit residual after PR #364 / #365 fixes is **entirely
explained by this convention difference**, not by a code bug. FBST's
PSP totals are internally consistent with MLB statsapi (verified 599 of
600 pitcher-games across Period 3); FG just sums to a different cutoff
boundary.

Decision (2026-06-02): accept the residual as a documented convention
difference rather than shift FBST's period endDates back by 1 day in
production. The blast radius of moving every historical period boundary
retroactively to gain a cosmetic FG-match is high; the actual standings
movement is small and bounded.

#### How to recreate the FG P1 view

The FG date filter is a JavaScript-rendered `<select>` — not a URL
parameter. To reproduce the comparison:

1. Navigate to `team_run_old_roto.pl?OGBA+6&session_id=<sid>`.
2. Select `04.18` from the "Last Game Date in Desired Period" combobox.
3. Click Submit. The form POSTs and the session_id changes — that new
   session has the date filter applied for all subsequent stat pages.
4. Navigate to `display_team_stats.pl?OGBA+6+<N>` with the new session_id
   to see team N's stats through the selected date.

Team index N (0-7) in this session-filtered view differs from the current-
week view. Confirm by reading the team-name header on each page.

The combobox options observed: `04.18`, `05.16`, `06.01`, `Refresh All`
— corresponds to FBST's `period.endDate` values.
