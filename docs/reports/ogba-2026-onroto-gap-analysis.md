---
id: DOC-040
title: "OGBA 2026 gap analysis — FBST vs OnRoto vs the commissioner's workbook"
description: "Period-by-period audit: points match OnRoto exactly in P1, P2, P3, P5; the P6/P7 gaps are AL-traded players OnRoto doesn't score (now an FBST rule), plus six roster records fixed to OnRoto's dates."
type: report
status: active
phase: null
owner: james
tags: [scoring, roster, league-admin]
links: [DOC-026]
category: reports
date_documented: 2026-11-11
updated: 2026-11-11
---

> Read-only against prod (the app's own API), OnRoto (`session_id=guest`: final standings
> "through 09.27.26" and the 2026 transaction log), MLB statsapi, and the commissioner's
> workbook (period-end rosters and per-period points for all 7 periods, exported from OnRoto).
> Supersedes DOC-026's late-drop findings.

## Results

| Check | Result |
|---|---|
| Per-period points, all 8 teams | **Exact in P1, P2, P3, P5.** P4 off by 1 point for Dodger Dawgs / RGing (unattributed; possibly the Sal Stewart RBI FanGraphs is missing). P6 and P7 differ (below). |
| Period-end rosters, 7 periods × 8 teams | One real difference: Demolition has J. Webb from 08-02 in OnRoto, Emmet Sheehan in FBST. The rest are workbook typos. |
| Transactions | 414 OnRoto vs 415 FBST moves. Unmatched: the Sheehan drop and Webb add (08-02, missing in FBST), and 4 moves FBST dates 08-31 that OnRoto dates 08.30 (Greene/Gusto, Pratt/Norby). The rest are net-zero entries. |
| P7 categories vs OnRoto's final week | R, HR, SB, SV exact. Demolition +1 W, +15 K and ERA 2.93 vs 3.38 (Sheehan). Los Doyers +5 K. RBI ±1 for Dodger Dawgs / Devil Dawgs. |

## Root cause of the P6/P7 gaps: NL-only scoring

Hicks (MIA→TB), L. García Jr. (WSH→NYY), Peralta (→TB), F. Griffin (WSH→CLE),
Ramos (SF→NYY), E. Miller (→BOS) and N. Lowe (CIN→CLE) were traded to AL clubs at
the deadline. Both systems keep them on their OGBA rosters until 08-30, but **OnRoto
scores none of their AL games, and FBST scored all of them.**
- Example: Griffin's 3 W, 23 K for Cleveland in P6 counted for Los Doyers only on FBST.
- Lowe confirms the rule: OnRoto kept his one Cincinnati game (08-02) and nothing after.

DOC-026 read these players' missing stats as drops recorded a period late. OnRoto's
transaction log contradicts that.

## Decisions (James, 2026-11-11)

1. **Adopt OnRoto's rule.** In an NL-only league (the `overview.stats_source` rule, shown on
   the Rules screen as "NL players only"), stats earned on an AL team don't count. AL-only
   works the reverse way; "ALL"/"MLB" counts everything. Implemented in the period syncer
   and the reconciler.
   - **OGBA's Stats Source is currently "ALL"**, so the commissioner must turn "NL players only"
     on. That setting also limits the Players search to NL players, which fits an NL-only league.
   - Found in passing: the teams, auction and keeper screens read a `leagueType` field that is
     never stored (`League.rules` is the LeagueRule relation), so they always assume NL.
     Harmless for OGBA; worth fixing before any AL or mixed league exists.
   - Known limit: mid-period ownership windows read daily stat rows, which are shared
     across leagues and not filtered. OGBA's moves are at period boundaries, so it isn't
     affected today.
2. **Follow OnRoto and the workbook for the roster records.** `repair-onroto-roster-dates-2026.ts`
   now holds exactly the six differences: Sheehan drop, Webb add (08-02); Norby, Pratt,
   Greene, Gusto to 08-30. The seven AL-trade items were removed.

## To apply (prod writes — James)

1. Merge and deploy the scoring change.
1b. Rules screen → turn on "NL players only" for OGBA (sets `stats_source` to NL). Until then, nothing changes.
2. Run the roster repair FIRST (the re-score only fetches stats for rostered players, so Webb needs his roster row):
   `./scripts/with-prod-db.sh npx tsx src/scripts/repair-onroto-roster-dates-2026.ts` (dry run), then add `--apply --items=all`.
3. Re-score 2026: `./scripts/with-prod-db.sh npx tsx src/scripts/rescore-nl-only-2026.ts` (dry run lists every stat that changes), then the same with `--apply`. It re-syncs each period and rebuilds its cached team totals.
4. Re-run the season audit. Expected: FBST period points equal the workbook's, apart from
   P4's 1-point gap.
