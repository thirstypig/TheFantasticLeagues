---
id: DOC-026
title: "OnRoto roster diff — 2026 final season (every FanGraphs residual attributed)"
description: "Per-player FBST vs OnRoto diff closes every season residual: 7 drops recorded a period late, 1 missing drop, 1 missing add, 1 add a day late, 1 unproven reserve gap, 1 FanGraphs data error, and 2 teams that were an audit-instrument artifact. Applying OnRoto's dates swaps 7th and 8th."
type: report
status: deprecated
phase: null
owner: james
tags: [scoring, roster, league-admin]
links: [DOC-024, DOC-025, DOC-040]
category: reports
date_documented: 2026-11-09
updated: 2026-11-11
---

> ⚠️ **Superseded by DOC-040 (2026-11-11).** The "7 drops recorded a period late" were not late drops: OnRoto's own transaction log releases all seven on 08.30, as FBST does. They were AL-traded players, and OnRoto does not score AL games in an NL-only league. The missing Sheehan drop and Webb add, and the 1-day-late Norby add, still stand.

> Read-only against prod + MLB statsapi + Baseball Reference + OnRoto (`session_id=guest`).
> Companion to the runbook Results-log rows dated 2026-11-09. No data was changed.

## Bottom line

- **Stat data is correct.** Every stored stat that can score matches MLB game logs, and MLB matches
  Baseball Reference (see the runbook row). Every difference from OnRoto is **roster state**, plus one
  FanGraphs data error.
- **Every residual is now attributed to a named player.** With OnRoto's roster dates applied,
  production's season totals equal FanGraphs **exactly** on all 7 counting categories for all 8 teams,
  except one RBI that FanGraphs is missing.
- **Two of the "unattributed" teams were never real.** Production already matches FanGraphs for
  Diamond Kings exactly, and Dodger Dawgs to one RBI. Their audit residuals came from the audit
  double-counting Trade 22 (see Instrument findings).
- **If OnRoto's dates were adopted, only 7th and 8th change:** Devil Dawgs (255) would pass Los Doyers
  (250). This holds without the one unproven item (255 vs 252). Places 1–6 do not move.

## Method

1. **FBST per player.** Ran the audit's own pure accumulator (`computeTeamPeriodTotals`) once per player,
   for every active or completed period. Summed over players, this reproduces `audit-standings`' season
   residuals exactly for all 8 teams, so the instrument is validated.
2. **OnRoto per player.** Fetched `display_team_stats.pl?OGBA+6+{0..7}` and parsed it with
   `parseFgTeamPage`. Identified each page by its over-represented team name.
3. **Self-check.** Each page's rows must sum to the team's value on `display_stand.pl`. The check failed
   on 5 teams until reserved-table rows were excluded; see Instrument findings, item 1.
4. **Tie-break.** For each residual player, found the date window over which MLB game logs reproduce
   OnRoto's number. That gives OnRoto's effective add or drop date, which can be compared with the
   `Roster` row.
5. **Closure and impact.** Applied every OnRoto date to production's P6 and P7 team rows (from a
   byte-verified prod dump), then recomputed roto points with `computeStandingsFromStats`. The
   unadjusted recompute reproduces the stored standings exactly.

## Attribution

All deltas below are FBST minus OnRoto.

| Team | Player | Delta | Mechanism | Evidence |
|---|---|---|---|---|
| Devil Dawgs | Erik Miller | W+1 K+18 | Drop recorded 08-30; OnRoto dropped him 08-02 | Delta equals his MLB P6 line exactly |
| RGing Sluggers | Heliot Ramos | R+1 RBI+1 SB+1 | Same | Delta equals his P6 line exactly |
| The Show | Liam Hicks | R+8 HR+3 RBI+12 | Same | Delta equals his P6 line exactly |
| The Show | Luis García Jr. | R+12 HR+5 RBI+12 SB+1 | Same | Delta equals his P6 line exactly |
| The Show | Freddy Peralta | W+1 K+20 | Same | Delta equals his P6 line exactly |
| Los Doyers | Foster Griffin | W+3 K+23 | Same | Delta equals his P6 line exactly |
| Demolition | Nathaniel Lowe | R+7 HR+2 RBI+12 | Drop recorded 08-30; OnRoto dropped him ~08-03, at his CIN→CLE trade | OnRoto keeps only his 08-02 game (R2 RBI2) |
| Demolition | Emmet Sheehan | W+1 K+28 | **Drop never recorded in FBST** (stint 07-05..open); OnRoto released him 08-02 | Delta equals every game from 08-02 on |
| Demolition | Jacob Webb | W−2 SV−4 K−17 | **Add never recorded in FBST**; OnRoto added him ~08-04 | OnRoto's line equals his Cubs log from 08-04 |
| Devil Dawgs | Connor Norby | RBI−1 | Add recorded 08-31; OnRoto added him 08-30 | His only RBI in the window came on 08-30 |
| Los Doyers | Paul Sewald | K+9 | OnRoto credits nothing after 08-04, but still lists him active. **Mechanism unproven** | The 9 K are every strikeout after 08-04; he was DFA'd by ARI 08-10 and claimed by TOR 08-12 |
| Dodger Dawgs | Sal Stewart | RBI+1 | **FanGraphs data error.** OnRoto is missing his 09-26 RBI | MLB and Baseball Reference both have it |
| Diamond Kings | Teoscar Hernández, Braxton Ashcraft | R+15 HR+5 RBI+20 SB+3 W+1 K+12 | **Audit artifact.** Production matches FanGraphs exactly | Trade 22 is stamped 08-30 15:41; see item 2 |
| Dodger Dawgs | Dylan Crews, Gabriel Hughes | R+11 HR+3 RBI+10 SB+4 K+18 | **Audit artifact.** Same trade | Same |

**Falsification notes.**
- *"OnRoto drops stats after an MLB team change"* would explain both Sewald and Lowe. It is
  **falsified** by Curtis Mead (BOS→WSH, P5, Demolition), who reconciles exactly. The likelier cause is
  that each player was released or benched in OnRoto when he moved.
- *"Every FBST drop dated 08-30 is late"* is falsified by Skunk Dogs (see the 08-30 runbook row). The
  claims above are per player instead: each delta equals that player's MLB P6 line exactly, across
  every category.

## Point impact of adopting OnRoto's dates (P6 and P7 only)

| Team | P6 | P7 | Season |
|---|---|---|---|
| Demolition Lumber Co. | 47 → 51 | 60.5 → 54.5 | 395 → 393 |
| Dodger Dawgs | 63.5 → 63.5 | 48 → 48.5 | 367 → 367.5 |
| RGing Sluggers | 39.5 → 43.5 | 59.5 → 60 | 319.5 → 324 |
| Skunk Dogs | 44 → 43 | 19.5 → 20.5 | 314 → 314 |
| The Show | 55.5 → 54 | 43 → 43 | 312.5 → 311 |
| Diamond Kings | 50.5 → 50.5 | 51 → 53 | 303.5 → 305.5 |
| Devil Dawgs | 28.5 → 28 | 43.5 → 46.5 | 252.5 → **255** |
| Los Doyers | 31.5 → 26.5 | 35 → 34 | 256 → **250** (252 without Sewald) |

Rate stats (AVG, ERA, WHIP) are recomputed from components, which is why some teams *gain* points
after losing a player's line.

**This is a commissioner decision, not a correction.** Under ADR-013, FBST's roster records are the
scoring authority. The question is whether those records are right: did the owners actually make these
moves at the P6 rollover? OnRoto says yes for 7 drops, 1 add and 1 missing drop.

## Instrument findings (audit tooling, not production)

1. **FanGraphs standings exclude reserved-table rows.** `fgTeamParser.ts`'s header says a team total is
   the sum of all rows. That matches the page's own `TOTAL:` row but **not** `display_stand.pl`. The
   standings omit stats earned while a player was on the reserve list. Proof: each of the 5 self-check
   gaps equals that team's reserved rows exactly (Acuña + Vaughn, Chourio, Ramos + Palencia, Betts,
   Pagán). Any per-player FanGraphs diff must filter `reserved: true`.
2. **`isInPeriodWindow` compares raw timestamps.** Production compares UTC calendar dates (todo #285).
   Trade 22 is stamped `2026-08-30T15:41`, on P7's first day. Production treats that as boundary-aligned
   and credits only the end-of-period owner. The audit keeps the old team's stint in P7 too, crediting
   both teams with the whole period.
3. **Data anomaly.** Gabriel Hughes' Diamond Kings row has `releasedAt` (08-30 00:00) before
   `acquiredAt` (08-30 15:41). This is the same defect as Chase Dollander's (2026-08-31).
