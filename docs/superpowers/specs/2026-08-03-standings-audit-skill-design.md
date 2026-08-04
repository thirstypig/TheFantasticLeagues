---
id: DOC-024
title: "Per-player standings audit skill — design"
description: "Design for a project skill that reconciles one period across FBST, MLB statsapi, FanGraphs OnRoto, and Baseball Reference, per player, reporting only unexplained residuals."
type: tech-spec
status: draft
phase: null
owner: james
tags: [scoring, data-sync, testing]
links: []
updated: 2026-08-03
---

# Per-player standings audit skill — design

## Problem

The OnRoto/FanGraphs reconciliation has been run by hand many times. The procedure
is documented (`docs/solutions/integration-issues/onroto-fangraphs-audit-runbook.md`)
and three scripts implement pieces of it (`fangraphs-audit.ts`, `audit_period.ts`,
`audit-mlb-crosscheck.ts`), but every run still re-derives the same steps, and the
existing tooling stops at **team level**. When a team diverges, attributing the gap
to a specific player is manual inference.

The 2026-08-03 run is the motivating case. 72 of 80 team-level cells matched; all
8 mismatches belonged to Demolition Lumber Co. Acuña's IL stash (07-05 → 08-02,
exactly all of Period 5) plausibly explained most of it, but the run ended at
"unverified hypothesis" because there was no per-player path to confirm it.

Two failure modes recur and both must be designed against:

1. **The measuring instrument can be the bug.** PR #402: the audit script
   double-counted a same-period drop-and-re-add; production was always correct.
2. **Silent skips read as passes.** `audit-mlb-crosscheck` reports "0 flagged"
   while skipping partial-ownership and IL players — precisely the population
   where divergences live.

## Scope

One period per run, defaulting to the most recently `completed` period.
`--season` selects the existing whole-season view.

Out of scope: fixing anything the audit finds, and the roster-legality pass beyond
the three checks listed below.

## Trust hierarchy

Unchanged from the runbook:

```
MLB statsapi > PlayerStatsPeriod (production) > PlayerStatsDaily > FanGraphs
```

FanGraphs is a *derived view*. When FG and FBST disagree the question is "what does
MLB say", never "what is wrong with FBST".

## Pipeline

### 1. Prod guard

Assert `DATABASE_URL` contains `oaogpsshewmcazhehryl`; abort otherwise. Standalone
scripts run under `tsx` resolve to **local** Supabase via Prisma's `.env` auto-load,
so an unguarded run silently audits the wrong database. Prod URLs come from Railway:

```bash
export DATABASE_URL="$(env -u RAILWAY_API_TOKEN railway variables --kv | grep '^DATABASE_URL=' | cut -d= -f2-)"
```

### 2. Legality pre-checks

Active-cap, per-slot limits, position eligibility. Run **before** any stat
comparison: an illegal roster makes every downstream stat delta meaningless.

### 3. FBST layer

Per-player `PlayerStatsPeriod` rows for the period, plus ownership windows
(`Roster.acquiredAt` / `releasedAt`, half-open `[acquired, released)`) and IL windows
reconstructed from `TransactionEvent` via `lib/ilWindows.ts`.

### 4. MLB layer — the correctness check

Re-fetch every player for the exact period window through `reconcilePeriodStats`,
which shares its fetch/parse path with the syncer by construction (ADR-014), and diff
against stored PSP.

This leg is independent of FanGraphs. It can find real bugs with no FG involvement,
and it is the leg that matters most.

### 5. FG layer

Playwright drives all 8 `display_team_stats.pl?OGBA+6+<N>` pages plus
`display_stand.pl`. The standings page works with plain `curl` and
`session_id=guest`; the per-team pages returned a Cloudflare interstitial
("Just a moment...") on 2026-08-03 and need a real browser.

Parsing gotcha, already learned: on `display_stand.pl` the top grid holds roto
**points**, not raw stats. Raw per-team values live in the per-category breakdown
rows further down. Run all HTML through `html.unescape`. FG labels categories `SV`
and `SO` where FBST uses `S` and `K`.

**RESOLVED 2026-08-03 by spike — Branch B is taken.** Driving
`display_team_stats.pl` in Playwright shows the page's only `<select>` is
`changeTeam` (8 team options). There is **no date filter**, so FG cannot express a
per-player period slice. `team_run_old_roto.pl` is team-level only and also
Cloudflare-gated (403 to curl, loads under Playwright).

Two things the spike *did* find, both useful to the classifier:

- The per-player tables carry a **`Sta` column** (`act` = active) plus a separate
  *"stats of previously reserved hitters"* table — this is FG's own IL/reserve
  marker, so the classifier can read FG's IL opinion rather than infer it.
- Every stat cell holds **two newline-separated values: season, then week**
  (e.g. `419\n3` = 419 season AB, 3 this week). Same shape as the standings page's
  Year/Wk pair. The week value is a *calendar* week, not a period, so it cannot
  substitute for a period slice.

Column headers, verbatim:
- Hitters: `Pos|Name|Tm|Sta|2026 Games by Position|AB|H|R|HR|RBI|SB|AVG|GS`
- Pitchers: `Pos|Name|Tm|Sta|IP|ER|H|BB|SO|W|SV|ERA|WHIP|ShO|NH`

The original two branches, retained for the record:

- **Branch A (preferred, if FG supports it):** obtain a per-player period slice by
  differencing two FG snapshots (as-of period start vs as-of period end). The only
  known historical view is `team_run_old_roto.pl`, which is team-level and whose
  date selector is a JS-rendered `<select>`, not a URL parameter.
- **Branch B (fallback, only if FG cannot produce a per-player period slice):** in
  period mode FG degrades to a **team-level tripwire** telling you which team
  diverges; per-player attribution comes from FBST + MLB, which is authoritative
  regardless. Per-player FG then applies only in `--season` mode, where YTD is
  natively comparable.

Branch B is a genuine reduction from the chosen "all 8 teams, per player, every run"
behaviour, and is taken **only** if the spike proves FG cannot express a per-player
period slice. If Branch B is taken, period-mode reports must say so explicitly in the
coverage line, so a thinner FG leg is never mistaken for a full one.

The spike is ~15 minutes and decides only this step. Every other step is unaffected.

### 6. Classifier

For each per-player FBST↔FG delta, attribute a cause and compute an **expected**
delta from FBST's own independent data:

| Cause | Expected delta derived from |
|---|---|
| IL exclusion | `buildIlWindows` + `wasOnIlAtPeriodStart` — IL-slotted at period start; FBST drops him, FG counts him |
| Partial ownership | acquired or released strictly inside the period; the out-of-window portion |
| Two-way synthetic | Ohtani's `mlbId + 1_000_000` pitcher row — FBST has two rows, FG has one |
| Roster mismatch | present on one side and not the other — usually name matching, not stats |
| FG coverage lag | FG's `through MM.DD.YY` header vs period end |

Then `residual = actual − expected`, and **only residual is a finding**.

#### The anti-overfit guard

Expected deltas are computed from the transaction log **before** the observed gap is
read, and are never fitted to it. A classifier that can stretch to explain any number
is worse than no classifier — that is the PR #402 lesson applied to this tool.

Enforced by three rules:

1. Every residual prints, including tiny ones. Calibration for ranking, not
   suppression: counting-stat residual > 2 or rate-stat residual > 0.010 ranks as
   likely-bug; smaller residuals still appear, ranked lower.
2. Explained and residual always print side by side, so an implausibly large
   "explained" column is visible rather than absorbed.
3. The classifier may never invent a cause. A delta with no derivable cause is
   residual by definition.

### 7. BBRef tie-break

Fetched **only** for players with an unexplained residual or an FBST↔MLB mismatch —
typically 0–5 players per run. Baseball Reference throttles aggressive scraping, and
confirming the ~175 players nobody disputes buys nothing.

Align the as-of date (games played) before declaring any discrepancy; statsapi leads
BBRef and FG on same-day games. See
`statsapi-leads-bbref-fangraphs-on-todays-games-align-as-of-date.md`.

### 8. Report

A dated report under `docs/reports/standings-audit-<period>-<YYYY-MM-DD>.md`, plus a
one-line append to the runbook's existing "Results log" table so audit history stays
in one place.

## Coverage is part of the verdict

The report states players checked, players skipped, and why.

A run that could not reach FanGraphs, was throttled by BBRef, or had to skip players
is **`INCOMPLETE`** — never **`PASS`**. Absence of evidence never renders green. This
exists because `audit-mlb-crosscheck` currently reports "0 flagged" while silently
skipping 43 players, which reads as a clean bill of health and is not one.

## Name matching

Prefer `mlbId` where available; otherwise normalize accents and suffixes
(Acuña, Andrés, Jesús, "Ronald Acuña Jr."). Unmatched players are a **loud finding**,
never a silent drop — an unmatched player is exactly where a real delta hides.

## Testing

All tests run without network access.

- **Classifier** — golden fixture built from the real 2026-08-03 Acuña Period 5 case:
  IL stash 07-05 → activate 08-02, PSP `R=5 HR=2 RBI=2 SB=0`, known cause. Plus a
  negative fixture asserting an unexplainable delta stays in residual.
- **FG parser** — against the captured `fg_standings.html`, asserting raw values come
  from the breakdown rows and not the points grid.
- **Name matcher** — the accented set above.
- **Prod guard** — asserts abort on a non-prod `DATABASE_URL`.

## Non-goals

- Auto-fixing findings. The skill reports; a human decides.
- Replacing `fangraphs-audit.ts` or `audit_period.ts`. The skill orchestrates
  existing tooling and adds the per-player and classifier layers.
- An accepted-divergence ledger. Considered and rejected for now: a stale entry
  could mask a regression, and auto-classification already removes the noise that
  a ledger would suppress.

## Known blocker

Prod-connected script runs are being intermittently denied by the permission
classifier (4 of ~10 attempts on 2026-08-03). Implementation and end-to-end testing
of this skill require a Bash permission rule or an equivalent grant.
