---
title: "OnRoto/FanGraphs standings audit — end-to-end runbook (+ trust the 'through' header, not the clock)"
slug: onroto-fangraphs-audit-runbook
category: integration-issues
created: 2026-07-09
component: fangraphs-audit, standings, mlb-data-sync
problem_type: audit-methodology / runbook
symptom: Every OnRoto standings audit re-derives the same scattered procedure (Railway prod-URL export, the fangraphs-audit.ts invocation, the session_id=guest FG scrape, which HTML rows hold the raw values, the cell-by-cell diff); and clock-time-based timing assumptions ("before 9 AM PT FG hasn't synced") produce false "FG is stale" calls.
root_cause: The audit procedure was never consolidated — pieces lived in the script header, docs/plans/standings-nested-stats-refactor.md, closed-period-psp-frozen-with-stale-boundary.md, and report §4. Separately, the timing memory keyed staleness off wall-clock (~9 AM PT) rather than FG's own authoritative "STANDINGS through MM.DD.YY" header.
related_modules: standings, players, periods, fangraphs-audit, mlb-data-sync
prs: []
tags: fangraphs, onroto, audit, runbook, standings, sync-timing, session-id-guest, reconciliation
---

# OnRoto / FanGraphs Standings Audit — Runbook

How to reconcile FBST production standings against FanGraphs OnRoto for OGBA
(league 20), end-to-end, in ~2 minutes. Consolidates procedure that was
previously scattered across the audit script's header comment,
`docs/plans/standings-nested-stats-refactor.md`, and several solution docs.

**This is a methodology/runbook doc, not a bug post-mortem.** The audits that
produced it (2026-07-07 → 07-09) all reconciled essentially exactly — the
value is making the *next* audit cheap and preventing the two recurring
false alarms (clock-based "FG is stale", and mis-reading which HTML rows hold
raw values).

---

## TL;DR

1. Export **prod** DB URLs from Railway (the script's `.env` points at LOCAL Supabase).
2. Run `npx tsx src/scripts/fangraphs-audit.ts 20` → FBST season totals from `PlayerStatsPeriod` (production's source).
3. `curl` OnRoto `display_stand.pl?OGBA+6&session_id=guest` → read the **category-breakdown rows** for FG's raw per-team values.
4. Confirm FG's **"STANDINGS through MM.DD.YY"** header covers the same games as FBST, then diff all 80 cells (8 teams × 10 categories).
5. Exact match (counting stats identical, rates to displayed precision) = pass. Any residual → apply the interpretation guide below **before** suspecting an FBST bug.

---

## Step 1 — Point the script at prod

The audit script reads `server/.env`, which resolves to **LOCAL** Supabase.
You must inject prod URLs from Railway (dotenv/Prisma won't override
pre-set env vars). See `docs/guides/database-operations.md` and
`supabase_railway_connection_setup.md`.

```bash
cd /Users/jameschang/Projects/thefantasticleagues/thefantasticleagues-app/server
export DATABASE_URL="$(env -u RAILWAY_API_TOKEN railway variables --kv | grep '^DATABASE_URL=' | cut -d= -f2-)"
export DIRECT_URL="$(env  -u RAILWAY_API_TOKEN railway variables --kv | grep '^DIRECT_URL='  | cut -d= -f2-)"

# Confirm you're on PROD, not local/staging, before trusting numbers:
echo "$DATABASE_URL" | grep -o 'oaogpsshewmcazhehryl' || echo 'NOT prod — stop'
```

Prod project ref is `oaogpsshewmcazhehryl`. Local is `127.0.0.1:54322`; the
`.env.local` cloud project is `kfxdgcxiawwhzooexqtm`. If the grep prints
nothing, you're pointed at the wrong DB — do not proceed.

## Step 2 — Run the FBST audit

```bash
DATABASE_URL="$DATABASE_URL" DIRECT_URL="$DIRECT_URL" \
  npx tsx src/scripts/fangraphs-audit.ts 20
```

- Reads `PlayerStatsPeriod` — the **same source production standings use**
  (`standingsService.ts`), so output matches what owners see live. (History:
  it previously read `PlayerStatsDaily`, which has an Opening-Day cold-start
  gap; switched in PR #364.)
- Attribution is ownership-window overlap with a team+player dedup guard
  (`accumulatePeriodStats`, unit-tested in
  `server/src/scripts/__tests__/fangraphs-audit.test.ts`) — a same-period
  drop-and-re-add is credited once, not per roster row.
- Prints raw category totals **and** a per-category / total ROTO points
  table. Default `leagueId = 20` (the real OGBA; `leagueId = 1` is an old
  4-row test league — never audit that one).

## Step 3 — Scrape FanGraphs (no login)

`session_id=guest` works for the OnRoto display pages — **plain `curl` is
enough**; you do NOT need Playwright/MCP for the live standings page. (Only
the historical *date-filter* page `team_run_old_roto.pl` needs a real
session + JS rendering.)

```bash
curl -sL --max-time 30 -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" \
  "https://onroto.fangraphs.com/baseball/webnew/display_stand.pl?OGBA+6&session_id=guest" \
  -o /tmp/fg_standings.html
```

### Where the raw values live (parsing gotcha)

`display_stand.pl` renders several `<table>` blocks. Do **not** read the raw
category numbers off the top standings grid — that grid shows *ROTO points*
(e.g. `8.0 / 7.0 / 5.5`), not raw stats. The raw per-team values (`585`,
`.2725`, `3.48`, …) live in the **per-category breakdown rows further down**
— one `<tr>` per category (R, HR, RBI, SB, AVG, W, SV, ERA, WHIP, SO), each
listing all 8 teams sorted best-to-worst as
`Team | seasonValue | weekValue | points | +/-`.

Notes that bite:
- Run the HTML through `html.unescape` — team names and headers are entity-encoded.
- FG labels the categories `SV` (saves) and `SO` (strikeouts); FBST calls
  them `S` / `K`. Same stat.
- Released players' rows freeze at release (ownership-window), consistent with FBST.

## Step 4 — Read FG's coverage header, then diff

**Trust FG's own header, not the wall clock.** The page prints
`STANDINGS through MM.DD.YY`. That string is the authoritative statement of
which game-day FG has ingested.

```bash
python3 -c "import re,html;h=html.unescape(open('/tmp/fg_standings.html',encoding='utf-8',errors='replace').read());m=re.search(r'through[^<]*',h,re.I);print(m.group(0).strip()[:40])"
```

- If FG's "through" date == the last completed MLB game-day that FBST's PSP
  also includes → compare directly.
- If FG is a day behind FBST → the divergence is **sync timing, not a bug**;
  either re-scrape later or drop that day's stats from FBST before comparing
  (see interpretation guide).

### The 80-cell diff harness

Paste FBST's printed values and FG's scraped values into two dicts and diff.
Doing it in code (not by eye) avoids transcription errors — and the "bug can
be in the measuring instrument" trap that cost real time in PR #402.

```python
cats = ['R','HR','RBI','SB','AVG','W','SV','K','ERA','WHIP']
# fbst[team][cat] from the script; fg[team][cat] from the breakdown rows.
# Keep rate stats as STRINGS at displayed precision (AVG 4dp, ERA 2dp, WHIP 3dp).
mism = 0
for t in fbst:
    for c in cats:
        if str(fbst[t][c]) != str(fg[t][c]):
            mism += 1; print(f"MISMATCH {t} {c}: FBST={fbst[t][c]} FG={fg[t][c]}")
print(f"Mismatches: {mism} / {len(fbst)*len(cats)}")
```

Pass = 0 mismatches. Counting stats must be identical; rates match to FG's
displayed precision.

---

## Interpretation guide — when a cell diverges

Apply the **trust hierarchy** before touching FBST code
(`mlb-statsapi-sync-hasstats-filter-drops-er-rbi.md`):

```
MLB statsapi (gameLog)  >  PSP (production)  >  PSD (audit-legacy)  >  FanGraphs (derived view)
```

The default question on a discrepancy is *"what does MLB say?"* — not
*"what's wrong with FBST?"* FanGraphs is the lowest-trust layer.

1. **All divergences cluster on one recent game-day, all teams TFL≥FG?**
   → Sync timing. FG's nightly batch hasn't caught that day; FBST's on-demand
   sync has. Re-check FG's "through" header. Not a bug. (Evening variant: TFL
   runs a day *ahead* of FG.)
2. **Tiny stable RGing-style ERA/AVG residual (≤0.02 ERA, ≤0.003 WHIP/AVG)
   isolated to one or two players?** → Almost always **FG stale on a raw
   counting stat** (precedent: FG ran ~1 ER hot on Bubba Chandler, and short
   on an Adolis García hit, on 07-03 and 07-07; both cleared by 07-08).
   Verify by diffing FG's per-player `display_team_stats.pl?OGBA+6+<N>`
   against FBST per-player and tie-breaking with
   `people/{mlbId}/stats?stats=gameLog`. FBST is right; leave it. Full recipe:
   `fangraphs-era-residual-is-rounding-not-a-bug.md`.
3. **Spread across multiple dates, or a single team off by a chunk?** → Now
   suspect a real attribution issue. Likely candidates, each with a doc:
   - Position players' mop-up pitching in team ERA/WHIP →
     `position-player-pitching-counted-in-team-era.md`
   - Mid-period pickup degrading a whole period to daily stats →
     `mid-period-pickup-degrades-whole-period-to-daily-stats.md`
   - Closed-period frozen with a stale boundary date →
     `closed-period-psp-frozen-with-stale-boundary.md`
   - Current-owner attribution on a closed period →
     `closed-period-stat-attribution-uses-current-owner.md`

**Do not "fix" FBST to match OnRoto's points scale.** OnRoto standings use
YTD roto; FBST production scores period-by-period roto accumulated (ADR-013).
The *raw category values* should reconcile; the season *point totals* are on
different scales by design. This runbook's audit script computes YTD-style
points precisely so the standings grid is comparable, but the authoritative
check is the raw-value diff.

## The boundary caveat (documented convention, not a bug)

FG's date filter is **exclusive** of the listed date; FBST's
`Period.endDate` is **inclusive**. On the *live* standings page this rarely
bites (both reflect the last completed sync), but when auditing a *specific
closed period* via the historical filter, expect a ~1-game-per-player
systematic offset. Decision (2026-06-02): document, don't retroactively
shift FBST endDates. See
`mlb-statsapi-sync-hasstats-filter-drops-er-rbi.md`.

---

## Results log (append each audit)

| Date run | FG "through" | Result |
|----------|--------------|--------|
| 2026-07-07 | 07.06.26 | 7/8 exact; RGing ERA 4.17 vs 4.19 / AVG residual = FG stale on Chandler (ER) + García (H). FBST correct per MLB + BBRef. |
| 2026-07-08 | 07.07.26 | **8/8 exact, all 10 cats.** RGing residual cleared (FG caught up overnight). |
| 2026-07-09 | 07.08.26 | **8/8 exact, all 10 cats.** Scraped 07:52 AM PDT — FG already synced through 07-08, disproving the "before 9 AM PT = stale" clock rule. |
| 2026-07-10 | 07.09.26 | 76/80 exact — all 7 counting cats match; 4 *rate* cells diverge (Dodger ERA 3.59 vs 3.55, Dodger WHIP, Skunk/Show AVG ±.0002). Root cause: ADR-013 ownership-window attribution on 07-05-dropped Dodger pitchers (prod `computeTeamStatsFromDb` == audit == 3.59; no bug; rank-neutral). Four-way per-player check (statsapi/BBRef/FanGraphs/FBST) on Dodger pitchers all agreed once as-of dates aligned — and surfaced the "statsapi-leads on today's games" trap (E-Rodriguez 29 ER/G19 vs 27 ER/G18 = his 07-10 game only statsapi had). See [[statsapi-leads-bbref-fangraphs-on-todays-games-align-as-of-date]]. |

## Scope note

This runbook covers the **stat-reconciliation** pass. A full audit also has a
**roster-legality** pass (active-cap, per-slot-limit, position-eligibility)
run *before* comparing stats — see the audit-cadence note in project memory
and `onroto-audit-2026-06-08.md` Section 1. The legality pass needs separate
roster tooling and is not part of this stat-diff procedure.

## Cross-references

- `docs/solutions/integration-issues/fangraphs-era-residual-is-rounding-not-a-bug.md` — the ≤0.02 residual triage; per-player verification recipe.
- `docs/solutions/integration-issues/mlb-statsapi-sync-hasstats-filter-drops-er-rbi.md` — canonical trust hierarchy; the boundary-convention decision.
- `docs/solutions/integration-issues/statsapi-leads-bbref-fangraphs-on-todays-games-align-as-of-date.md` — four-way (statsapi/BBRef/FanGraphs/FBST) reconciliation: statsapi leads on today's games; align the as-of date (games-played) before declaring a discrepancy.
- `docs/solutions/logic-errors/position-player-pitching-counted-in-team-era.md` — a real bug the audit surfaced.
- `docs/solutions/logic-errors/closed-period-psp-frozen-with-stale-boundary.md` — `session_id=guest` FG fetch; closed-period freezing.
- `docs/solutions/logic-errors/mid-period-pickup-degrades-whole-period-to-daily-stats.md` — path instrumentation found via the audit.
- `docs/reports/onroto-audit-2026-06-08.md` — the deep, full-season reference audit (roster + stats + BBRef three-way).
- `server/src/scripts/fangraphs-audit.ts` — the script; `__tests__/fangraphs-audit.test.ts` — its regression tests.
