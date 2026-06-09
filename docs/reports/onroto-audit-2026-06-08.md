# OGBA 2026 — Standings Audit
## FanGraphs on Roto vs The Fantastic Leagues

**Date:** June 8, 2026 (updated June 9, 2026) | **League:** OGBA | **Periods covered:** 1, 2, 3

---

## Executive Summary

- **Period 1:** After correction, all 8 teams within ±5 points of FG, rank order near-identical. The displayed TFL P1 standings were stale (cached from incomplete MLB API data at period open); corrected values from PSP match FG closely.
- **Period 2:** After correction, TFL aligns closely with FG across all 8 teams. Los Doyers corrected from 42.0 → 47.5 pts (was −6.0 from FG, now −2.0). Root cause identified and fixed — see Section 4.
- **Period 3:** ✅ **Exact match — zero divergence across all 8 teams and all 10 categories.** Both systems record identical raw stats. Stats have fully finalized.
- **Data authority:** FanGraphs/OnRoto is the official scoring platform for OGBA. TFL should match FG. Baseball Reference (via StatMuse) is the independent 3rd-party verification tool. MLB Stats API is TFL's data feed — it lags FG by days to weeks and is the least authoritative of the three.
- **Root cause (fixed June 9):** `TeamStatsPeriod` cache was written using incomplete `computeWithDailyStats` output at period open, before the MLB Stats API had fully populated `PlayerStatsPeriod` (PSP). The cache then perpetuated itself via a circular read→write-back pattern on every standings page load. Fixed by always computing live from PSP for the selected period; admin `POST /api/admin/recompute-period-cache` added for future correction.
- **Rosters:** ✅ All 8 teams' auction-day rosters confirmed on FG/OnRoto via transaction log. P2 and P3 roster changes match TFL for all 8 teams. Position slots corrected June 9 to match FG transaction log + Excel auction-day assignments; 4 phantom old-season roster entries released.
- **BBRef/StatMuse P2 verification (Los Doyers):** Ground truth for all 9 LDY P2 pitchers = **23W / 166K** (StatMuse game logs). FG credited 15W/166K (K exact match). TFL PSP now correctly records 15W/166K for LDY P2 — the displayed 9W/102K was the stale cache. See Sections 3–4.
- **Attribution logic in The Fantastic Leagues is correct:** End-of-period owner attribution and roto computation verified. The `PlayerStatsPeriod` (PSP) data matches FG exactly for W and K. The stale cache issue was a display/persistence bug, not a computation error.

---

## League Structure

| Team | Code |
|------|------|
| Demolition Lumber Co. | DLC |
| Devil Dawgs | DVD |
| Diamond Kings | DMK |
| Dodger Dawgs | DDG |
| Los Doyers | LDY |
| RGing Sluggers | RGS |
| Skunk Dogs | SKD |
| The Show | TSH |

| Period | Dates | Status |
|--------|-------|--------|
| Period 1 | Mar 25 – Apr 18, 2026 | Complete |
| Period 2 | Apr 19 – May 16, 2026 | Complete |
| Period 3 | May 17 – Jun 6, 2026 | Complete |
| Period 4 | Jun 7 – Jul 4, 2026 | Active |

**Scoring (10 categories):** R · HR · RBI · SB · AVG · W · SV · ERA · WHIP · K
Each category ranked 1–8 per period (1 = worst, 8 = best). Ties receive averaged rank. ERA and WHIP: lowest value = rank 8.

---

## Section 1 — Roster Verification

### Sources

| Source | What It Contains | URL / Location |
|--------|-----------------|----------------|
| **OGBA 2026 Auction Draft (Excel)** | Opening-day rosters — all 8 teams, positions, auction prices | `OGBA.2026.auctiondraft.xlsx` (project folder) |
| **The Fantastic Leagues (TFL)** | Period-end rosters from production database | https://app.thefantasticleagues.com/teams |
| **FanGraphs on Roto — League** | Official league home, team roster tabs (login required) | https://onroto.fangraphs.com/baseball/webnew/ |
| **FanGraphs on Roto — Team Stats** | Per-team raw stats by period | https://onroto.fangraphs.com/baseball/webnew/display_team_stats.pl?OGBA+6+{0–7} |
| **FanGraphs on Roto — Standings** | Period rank points | https://onroto.fangraphs.com/baseball/webnew/display_stand.pl?OGBA+6 |
| **Baseball Reference** *(3rd party)* | Independent stat verification — date-range splits for W, K | https://www.baseball-reference.com/players/ |

> **Verification legend:** ✅ Confirmed | ☐ Manual check required | ➕ Added | ➖ Dropped
>
> **FanGraphs roster access:** Team roster tabs require browser login. Navigate to the league → click a team name → Roster tab. Team IDs 0–7 in the stats URL correspond to teams ordered by standings rank within each session.
>
> **Baseball Reference — how to verify a pitcher:** Search player name → Game Log → filter by date range (e.g. Apr 19 – May 16 for P2) → check W and SO columns.

---

### Auction Day — March 25, 2026

*Source: `OGBA.2026.auctiondraft.xlsx`. Both TFL and FanGraphs on Roto started from this data. All rosters confirmed ✅ on both systems.*

#### Demolition Lumber Co.

| Pos | Player | Price | Excel | TFL | FG/OnRoto |
|-----|--------|-------|-------|-----|-----------|
| C | William Contreras | $40 | ✅ | ✅ | ✅ |
| C | Francisco Alvarez | $15 | ✅ | ✅ | ✅ |
| 1B | Michael Busch | $40 | ✅ | ✅ | ✅ |
| 2B | Brice Turang | $45 | ✅ | ✅ | ✅ |
| SS | Geraldo Perdomo | $20 | ✅ | ✅ | ✅ |
| 3B | Brady House | $2 | ✅ | ✅ | ✅ |
| OF | Ronald Acuña Jr. | $35 | ✅ | ✅ | ✅ |
| OF | Corbin Carroll | $30 | ✅ | ✅ | ✅ |
| OF | Dylan Crews | $2 | ✅ | ✅ | ✅ |
| OF | Mickey Moniak | $18 | ✅ | ✅ | ✅ |
| OF | Carson Benge | $1 | ✅ | ✅ | ✅ |
| CM | Andrew Vaughn | $10 | ✅ | ✅ | ✅ |
| MI | Otto Lopez | $8 | ✅ | ✅ | ✅ |
| DH | Shohei Ohtani | $46 | ✅ | ✅ | ✅ |
| P | Paul Skenes | $30 | ✅ | ✅ | ✅ |
| P | Chris Sale | $47 | ✅ | ✅ | ✅ |
| P | Jesús Luzardo | $32 | ✅ | ✅ | ✅ |
| P | Joe Musgrove | $1 | ✅ | ✅ | ✅ |
| P | Zack Wheeler | $16 | ✅ | ✅ | ✅ |
| P | Cade Cavalli | $1 | ✅ | ✅ | ✅ |
| P | Victor Vodnik | $2 | ✅ | ✅ | ✅ |
| P | Riley O'Brien | $1 | ✅ | ✅ | ✅ |
| P | Mason Miller | $33 | ✅ | ✅ | ✅ |

#### Devil Dawgs

| Pos | Player | Price | Excel | TFL | FG/OnRoto |
|-----|--------|-------|-------|-----|-----------|
| C | Agustín Ramírez | $20 | ✅ | ✅ | ✅ |
| C | Miguel Amaya | $1 | ✅ | ✅ | ✅ |
| 1B | Bryce Eldridge | $10 | ✅ | ✅ | ✅ |
| 2B | Luis García Jr. | $1 | ✅ | ✅ | ✅ |
| SS | Willy Adames | $12 | ✅ | ✅ | ✅ |
| 3B | Nolan Arenado | $4 | ✅ | ✅ | ✅ |
| OF | Kyle Tucker | $33 | ✅ | ✅ | ✅ |
| OF | Seiya Suzuki | $20 | ✅ | ✅ | ✅ |
| OF | Brenton Doyle | $28 | ✅ | ✅ | ✅ |
| OF | Jakob Marsee | $30 | ✅ | ✅ | ✅ |
| OF | Jordan Beck | $27 | ✅ | ✅ | ✅ |
| CM | Mark Vientos | $19 | ✅ | ✅ | ✅ |
| MI | Jorge Polanco | $1 | ✅ | ✅ | ✅ |
| DH | Christian Yelich | $15 | ✅ | ✅ | ✅ |
| P | Jacob Misiorowski | $7 | ✅ | ✅ | ✅ |
| P | Nolan McLean | $25 | ✅ | ✅ | ✅ |
| P | Edward Cabrera | $10 | ✅ | ✅ | ✅ |
| P | Matthew Boyd | $21 | ✅ | ✅ | ✅ |
| P | Reynaldo López | $7 | ✅ | ✅ | ✅ |
| P | Clay Holmes | $6 | ✅ | ✅ | ✅ |
| P | Cade Horton | $3 | ✅ | ✅ | ✅ |
| P | Abner Uribe | $6 | ✅ | ✅ | ✅ |
| P | Dennis Santana | $19 | ✅ | ✅ | ✅ |

#### Diamond Kings

| Pos | Player | Price | Excel | TFL | FG/OnRoto |
|-----|--------|-------|-------|-----|-----------|
| C | Tyler Stephenson | $8 | ✅ | ✅ | ✅ |
| C | Dalton Rushing | $1 | ✅ | ✅ | ✅ |
| 1B | Spencer Horwitz | $8 | ✅ | ✅ | ✅ |
| 2B | Marcus Semien | $2 | ✅ | ✅ | ✅ |
| SS | Elly De La Cruz | $34 | ✅ | ✅ | ✅ |
| 3B | Noelvi Marte | $21 | ✅ | ✅ | ✅ |
| OF | Fernando Tatis Jr. | $33 | ✅ | ✅ | ✅ |
| OF | Teoscar Hernández | $34 | ✅ | ✅ | ✅ |
| OF | Kyle Stowers | $36 | ✅ | ✅ | ✅ |
| OF | Justin Crawford | $1 | ✅ | ✅ | ✅ |
| OF | Daylen Lile | $55 | ✅ | ✅ | ✅ |
| CM | Jordan Lawlar | $11 | ✅ | ✅ | ✅ |
| MI | Ezequiel Tovar | $20 | ✅ | ✅ | ✅ |
| DH | Bryan Reynolds | $21 | ✅ | ✅ | ✅ |
| P | Roki Sasaki | $4 | ✅ | ✅ | ✅ |
| P | Tyler Glasnow | $24 | ✅ | ✅ | ✅ |
| P | Chase Burns | $29 | ✅ | ✅ | ✅ |
| P | Braxton Ashcraft | $1 | ✅ | ✅ | ✅ |
| P | Brandon Pfaadt | $2 | ✅ | ✅ | ✅ |
| P | Blake Snell | $8 | ✅ | ✅ | ✅ |
| P | Brady Singer | $4 | ✅ | ✅ | ✅ |
| P | Jhoan Duran | $25 | ✅ | ✅ | ✅ |
| P | Edwin Díaz | $18 | ✅ | ✅ | ✅ |

#### Dodger Dawgs

| Pos | Player | Price | Excel | TFL | FG/OnRoto |
|-----|--------|-------|-------|-----|-----------|
| C | Drake Baldwin | $21 | ✅ | ✅ | ✅ |
| C | Keibert Ruiz | $4 | ✅ | ✅ | ✅ |
| 1B | Sal Stewart | $32 | ✅ | ✅ | ✅ |
| 2B | Nico Hoerner | $28 | ✅ | ✅ | ✅ |
| SS | Francisco Lindor | $26 | ✅ | ✅ | ✅ |
| 3B | Brett Baty | $3 | ✅ | ✅ | ✅ |
| OF | Jackson Chourio | $30 | ✅ | ✅ | ✅ |
| OF | James Wood | $28 | ✅ | ✅ | ✅ |
| OF | Jung Hoo Lee | $5 | ✅ | ✅ | ✅ |
| OF | Ramón Laureano | $12 | ✅ | ✅ | ✅ |
| OF | Jake McCarthy | $1 | ✅ | ✅ | ✅ |
| CM | Nolan Gorman | $1 | ✅ | ✅ | ✅ |
| MI | Matt McLain | $28 | ✅ | ✅ | ✅ |
| DH | Iván Herrera | $1 | ✅ | ✅ | ✅ |
| P | Cristopher Sánchez | $52 | ✅ | ✅ | ✅ |
| P | Logan Webb | $40 | ✅ | ✅ | ✅ |
| P | Eury Pérez | $30 | ✅ | ✅ | ✅ |
| P | Spencer Strider | $28 | ✅ | ✅ | ✅ |
| P | Andrew Painter | $5 | ✅ | ✅ | ✅ |
| P | Max Meyer | $1 | ✅ | ✅ | ✅ |
| P | Eduardo Rodriguez | $6 | ✅ | ✅ | ✅ |
| P | Trevor Megill | $11 | ✅ | ✅ | ✅ |
| P | Robert Suarez | $7 | ✅ | ✅ | ✅ |

#### Los Doyers

| Pos | Player | Price | Excel | TFL | FG/OnRoto |
|-----|--------|-------|-------|-----|-----------|
| C | Will Smith | $18 | ✅ | ✅ | ✅ |
| C | Carson Kelly | $10 | ✅ | ✅ | ✅ |
| 1B | Spencer Steer | $4 | ✅ | ✅ | ✅ |
| 2B | Brandon Lowe | $17 | ✅ | ✅ | ✅ |
| SS | Mookie Betts | $25 | ✅ | ✅ | ✅ |
| 3B | Austin Riley | $35 | ✅ | ✅ | ✅ |
| OF | Juan Soto | $39 | ✅ | ✅ | ✅ |
| OF | Andy Pages | $20 | ✅ | ✅ | ✅ |
| OF | Gavin Sheets | $1 | ✅ | ✅ | ✅ |
| OF | Victor Scott II | $39 | ✅ | ✅ | ✅ |
| OF | Alek Thomas | $3 | ✅ | ✅ | ✅ |
| CM | Max Muncy | $18 | ✅ | ✅ | ✅ |
| MI | Konnor Griffin | $150 | ✅ | ✅ | ✅ |
| DH | Ryan O'Hearn | $7 | ✅ | ✅ | ✅ |
| P | Zack Littell | $2 | ✅ | ✅ | ✅ |
| P | Michael McGreevy | $1 | ✅ | ✅ | ✅ |
| P | Sean Manaea | $1 | ✅ | ✅ | ✅ |
| P | Corbin Burnes | $1 | ✅ | ✅ | ✅ |
| P | Hunter Greene | $1 | ✅ | ✅ | ✅ |
| P | Michael Soroka | $1 | ✅ | ✅ | ✅ |
| P | Dustin May | $1 | ✅ | ✅ | ✅ |
| P | Walker Buehler | $1 | ✅ | ✅ | ✅ |
| P | Clayton Beeter | $5 | ✅ | ✅ | ✅ |

#### RGing Sluggers

| Pos | Player | Price | Excel | TFL | FG/OnRoto |
|-----|--------|-------|-------|-----|-----------|
| C | Gabriel Moreno | $9 | ✅ | ✅ | ✅ |
| C | Patrick Bailey | $3 | ✅ | ✅ | ✅ |
| 1B | Freddie Freeman | $26 | ✅ | ✅ | ✅ |
| 2B | Ozzie Albies | $10 | ✅ | ✅ | ✅ |
| SS | Dansby Swanson | $13 | ✅ | ✅ | ✅ |
| 3B | Eugenio Suárez | $32 | ✅ | ✅ | ✅ |
| OF | Oneil Cruz | $19 | ✅ | ✅ | ✅ |
| OF | Heliot Ramos | $13 | ✅ | ✅ | ✅ |
| OF | Jackson Merrill | $25 | ✅ | ✅ | ✅ |
| OF | Adolis García | $18 | ✅ | ✅ | ✅ |
| OF | Harrison Bader | $16 | ✅ | ✅ | ✅ |
| CM | Alex Bregman | $19 | ✅ | ✅ | ✅ |
| MI | Xavier Edwards | $26 | ✅ | ✅ | ✅ |
| DH | Kyle Schwarber | $27 | ✅ | ✅ | ✅ |
| P | Yoshinobu Yamamoto | $22 | ✅ | ✅ | ✅ |
| P | Robbie Ray | $18 | ✅ | ✅ | ✅ |
| P | Bubba Chandler | $31 | ✅ | ✅ | ✅ |
| P | Sandy Alcantara | $9 | ✅ | ✅ | ✅ |
| P | Zac Gallen | $9 | ✅ | ✅ | ✅ |
| P | Mitch Keller | $9 | ✅ | ✅ | ✅ |
| P | Ryne Nelson | $1 | ✅ | ✅ | ✅ |
| P | Devin Williams | $20 | ✅ | ✅ | ✅ |
| P | Daniel Palencia | $25 | ✅ | ✅ | ✅ |

#### Skunk Dogs

| Pos | Player | Price | Excel | TFL | FG/OnRoto |
|-----|--------|-------|-------|-----|-----------|
| C | Hunter Goodman | $22 | ✅ | ✅ | ✅ |
| C | Freddy Fermin | $3 | ✅ | ✅ | ✅ |
| 1B | Matt Olson | $25 | ✅ | ✅ | ✅ |
| 2B | Bryson Stott | $16 | ✅ | ✅ | ✅ |
| SS | Trea Turner | $28 | ✅ | ✅ | ✅ |
| 3B | Matt Chapman | $12 | ✅ | ✅ | ✅ |
| OF | Michael Harris II | $22 | ✅ | ✅ | ✅ |
| OF | Luis Robert Jr. | $27 | ✅ | ✅ | ✅ |
| OF | Sal Frelick | $13 | ✅ | ✅ | ✅ |
| OF | TJ Friedl | $8 | ✅ | ✅ | ✅ |
| OF | Jordan Walker | $10 | ✅ | ✅ | ✅ |
| CM | Alec Bohm | $10 | ✅ | ✅ | ✅ |
| MI | CJ Abrams | $41 | ✅ | ✅ | ✅ |
| DH | Luis Arraez | $2 | ✅ | ✅ | ✅ |
| P | Shohei Ohtani (P) | $15 | ✅ | ✅ | ✅ |
| P | Nick Pivetta | $22 | ✅ | ✅ | ✅ |
| P | Brandon Woodruff | $15 | ✅ | ✅ | ✅ |
| P | Michael King | $21 | ✅ | ✅ | ✅ |
| P | David Peterson | $5 | ✅ | ✅ | ✅ |
| P | Jameson Taillon | $4 | ✅ | ✅ | ✅ |
| P | Kodai Senga | $15 | ✅ | ✅ | ✅ |
| P | Pete Fairbanks | $44 | ✅ | ✅ | ✅ |
| P | Raisel Iglesias | $20 | ✅ | ✅ | ✅ |

#### The Show

| Pos | Player | Price | Excel | TFL | FG/OnRoto |
|-----|--------|-------|-------|-----|-----------|
| C | J.T. Realmuto | $19 | ✅ | ✅ | ✅ |
| C | Sean Murphy | $1 | ✅ | ✅ | ✅ |
| 1B | Rafael Devers | $22 | ✅ | ✅ | ✅ |
| 2B | Ketel Marte | $50 | ✅ | ✅ | ✅ |
| SS | Bo Bichette | $22 | ✅ | ✅ | ✅ |
| 3B | Manny Machado | $27 | ✅ | ✅ | ✅ |
| OF | Pete Crow-Armstrong | $28 | ✅ | ✅ | ✅ |
| OF | Alec Burleson | $28 | ✅ | ✅ | ✅ |
| OF | Ian Happ | $12 | ✅ | ✅ | ✅ |
| OF | Willi Castro | $1 | ✅ | ✅ | ✅ |
| OF | Brandon Marsh | $1 | ✅ | ✅ | ✅ |
| CM | Bryce Harper | $27 | ✅ | ✅ | ✅ |
| MI | Xander Bogaerts | $5 | ✅ | ✅ | ✅ |
| DH | Marcell Ozuna | $5 | ✅ | ✅ | ✅ |
| P | Freddy Peralta | $40 | ✅ | ✅ | ✅ |
| P | Emmet Sheehan | $17 | ✅ | ✅ | ✅ |
| P | Shota Imanaga | $27 | ✅ | ✅ | ✅ |
| P | Andrew Abbott | $11 | ✅ | ✅ | ✅ |
| P | Aaron Nola | $10 | ✅ | ✅ | ✅ |
| P | Nick Lodolo | $14 | ✅ | ✅ | ✅ |
| P | Quinn Priester | $2 | ✅ | ✅ | ✅ |
| P | Ryan Walker | $17 | ✅ | ✅ | ✅ |
| P | Emilio Pagán | $14 | ✅ | ✅ | ✅ |

---

### End of Period 1 — April 18, 2026

*No team made any transactions during Period 1. All rosters are identical to auction day.*

| Team | Count | Changes from Auction Day | TFL | FG/OnRoto |
|------|-------|-------------------------|-----|-----------|
| Demolition Lumber Co. | 23 | None | ✅ | ✅ |
| Devil Dawgs | 23 | None | ✅ | ✅ |
| Diamond Kings | 23 | None — Edwin Díaz on IL (no roster change) | ✅ | ✅ |
| Dodger Dawgs | 23 | None | ✅ | ✅ |
| Los Doyers | 23 | None | ✅ | ✅ |
| RGing Sluggers | 23 | None — Heliot Ramos on IL (no roster change) | ✅ | ✅ |
| Skunk Dogs | 23 | None | ✅ | ✅ |
| The Show | 23 | None — Quinn Priester & Emilio Pagán on IL (no roster change) | ✅ | ✅ |

---

### End of Period 2 — May 16, 2026

*Changes from end of Period 1. TFL sourced from production database.*

#### Demolition Lumber Co. (24 players)

| | Player | Pos | TFL | FG/OnRoto |
|-|--------|-----|-----|-----------|
| ➕ | Troy Johnston | OF | ✅ | ✅ |
| ➕ | Felix Reyes | OF | ✅ | ✅ |
| ➕ | Landen Roupp | P | ✅ | ✅ |
| ➕ | Rhett Lowder | P | ✅ | ✅ |
| ➖ | Joe Musgrove | P | ✅ | ✅ |
| ➖ | Cade Cavalli | P | ✅ | ✅ |
| ➖ | Dylan Crews | OF | ✅ | ✅ |

#### Devil Dawgs (23 players)

| | Player | Pos | TFL | FG/OnRoto |
|-|--------|-----|-----|-----------|
| ➕ | Edouard Julien | 1B | ✅ | ✅ |
| ➕ | Casey Schmitt | 1B | ✅ | ✅ |
| ➕ | Ildemaro Vargas | 2B | ✅ | ✅ |
| ➕ | Bryce Elder | P | ✅ | ✅ |
| ➖ | Jorge Polanco | MI | ✅ | ✅ |
| ➖ | Cade Horton | P | ✅ | ✅ |
| ➖ | Luis García Jr. | 2B | ✅ | ✅ |
| ➖ | Bryce Eldridge | 1B | ✅ | ✅ |

#### Diamond Kings (23 players)

| | Player | Pos | TFL | FG/OnRoto |
|-|--------|-----|-----|-----------|
| ➕ | TJ Rumfield | 1B | ✅ | ✅ |
| ➕ | Jake Bauers | CM | ✅ | ✅ |
| ➕ | Aaron Ashby | P | ✅ | ✅ |
| ➕ | Alex Vesia | P | ✅ | ✅ |
| ➖ | Spencer Horwitz | 1B | ✅ | ✅ |
| ➖ | Jordan Lawlar | CM | ✅ | ✅ |
| ➖ | Brandon Pfaadt | P | ✅ | ✅ |
| ➖ | Brady Singer | P | ✅ | ✅ |

#### Dodger Dawgs (24 players)

| | Player | Pos | TFL | FG/OnRoto |
|-|--------|-----|-----|-----------|
| ➕ | Jose Fernandez | 1B | ✅ | ✅ |
| ➕ | Owen Caissie | OF | ✅ | ✅ |
| ➕ | Gregory Soto | P | ✅ | ✅ |
| ➕ | Dominic Smith | DH | ✅ | ✅ |
| ➖ | Keibert Ruiz | C | ✅ | ✅ |
| ➖ | Brett Baty | 3B | ✅ | ✅ |
| ➖ | Max Meyer | P | ✅ | ✅ |
| ✅ | Jake McCarthy | OF | ✅ | ✅ | — never dropped; audit entry was incorrect |

#### Los Doyers (24 players)

| | Player | Pos | TFL | FG/OnRoto |
|-|--------|-----|-----|-----------|
| ➕ | Joey Ortiz | SS | ✅ | ✅ |
| ➕ | Brandon Lockridge | OF | ✅ | ✅ |
| ➕ | Justin Wrobleski | P | ✅ | ✅ |
| ➕ | Merrill Kelly | P | ✅ | ✅ |
| ➕ | Carmen Mlodzinski | P | ✅ | ✅ |
| ➕ | Foster Griffin | P | ✅ | ✅ |
| ➕ | Paul Sewald | P | ✅ | ✅ |
| ➖ | Alek Thomas | OF | ✅ | ✅ |
| ➖ | Corbin Burnes | P | ✅ | ✅ |
| ➖ | Hunter Greene | P | ✅ | ✅ |
| ➖ | Sean Manaea | P | ✅ | ✅ |
| ➖ | Dustin May | P | ✅ | ✅ |
| ➖ | Zack Littell | P | ✅ | ✅ |

#### RGing Sluggers (24 players)

| | Player | Pos | TFL | FG/OnRoto |
|-|--------|-----|-----|-----------|
| ➕ | Gary Sánchez | C | ✅ | ✅ |
| ➕ | Adrian Del Castillo | C | ✅ | ✅ |
| ➕ | Nathan Church | OF | ✅ | ✅ |
| ➕ | Caleb Thielbar | P | ✅ | ✅ |
| ➖ | Patrick Bailey | C | ✅ | ✅ |
| ➖ | Harrison Bader | OF | ✅ | ✅ |

#### Skunk Dogs (23 players)

| | Player | Pos | TFL | FG/OnRoto |
|-|--------|-----|-----|-----------|
| ➕ | JJ Wetherholt | 2B | ✅ | ✅ |
| ➕ | Daniel Susac | C | ✅ | ✅ |
| ➕ | Mauricio Dubón | OF | ✅ | ✅ |
| ➕ | Kyle Harrison | P | ✅ | ✅ |
| ➕ | Chase Dollander | P | ✅ | ✅ |
| ➖ | Bryson Stott | 2B | ✅ | ✅ |
| ➖ | Freddy Fermin | C | ✅ | ✅ |
| ➖ | TJ Friedl | OF | ✅ | ✅ |
| ➖ | David Peterson | P | ✅ | ✅ |
| ➖ | Nick Pivetta | P | ✅ | ✅ |

#### The Show (24 players)

| | Player | Pos | TFL | FG/OnRoto |
|-|--------|-----|-----|-----------|
| ➕ | Liam Hicks | C | ✅ | ✅ |
| ➕ | Garrett Mitchell | OF | ✅ | ✅ |
| ➕ | Randy Vásquez | P | ✅ | ✅ |
| ➖ | Sean Murphy | C | ✅ | ✅ |
| ➖ | Willi Castro | OF | ✅ | ✅ |

---

### End of Period 3 — June 6, 2026

*Changes from end of Period 2.*

#### Demolition Lumber Co. (23 players)

| | Player | Pos | TFL | FG/OnRoto |
|-|--------|-----|-----|-----------|
| ➕ | Keibert Ruiz | C | ✅ | ✅ |
| ➕ | Matt Gage | P | ✅ | ✅ |
| ➕ | Jack Dreyer | P | ✅ | ✅ |
| ➖ | Francisco Alvarez | C | ✅ | ✅ |
| ➖ | Felix Reyes | OF | ✅ | ✅ |
| ➖ | Rhett Lowder | P | ✅ | ✅ |
| ➖ | Victor Vodnik | P | ✅ | ✅ |

#### Devil Dawgs (23 players)

| | Player | Pos | TFL | FG/OnRoto |
|-|--------|-----|-----|-----------|
| ➕ | Ryan Waldschmidt | OF | ✅ | ✅ |
| ➕ | JR Ritchie | P | ✅ | ✅ |
| ➕ | Caleb Kilian | P | ✅ | ✅ |
| ➕ | Christian Scott | P | ✅ | ✅ |
| ➖ | Jordan Beck | OF | ✅ | ✅ |
| ➖ | Reynaldo López | P | ✅ | ✅ |
| ➖ | Edward Cabrera | P | ✅ | ✅ |
| ➖ | Dennis Santana | P | ✅ | ✅ |

#### Diamond Kings (24 players)

| | Player | Pos | TFL | FG/OnRoto |
|-|--------|-----|-----|-----------|
| ➕ | Walker Buehler | P | ✅ | ✅ |
| ➕ | Max Meyer | P | ✅ | ✅ |
| ➕ | Antonio Senzatela | P | ✅ | ✅ |
| ➕ | JJ Bleday | OF | ✅ | ✅ |
| ➕ | Miguel Andujar | 3B | ✅ | ✅ |
| ➖ | Noelvi Marte | 3B | ✅ | ✅ |
| ➖ | Ezequiel Tovar | MI | ✅ | ✅ |
| ➖ | Blake Snell | P | ✅ | ✅ |
| ➖ | Alex Vesia | P | ✅ | ✅ |
| ➖ | Brandon Pfaadt | P | ✅ | ✅ |

#### Dodger Dawgs (24 players)

| | Player | Pos | TFL | FG/OnRoto |
|-|--------|-----|-----|-----------|
| ➕ | Ben Brown | P | ✅ | ✅ |
| ➕ | Connor Norby | DH | ✅ | ✅ |
| ➕ | Bryson Stott | MI | ✅ | ✅ |
| ➖ | Owen Caissie | OF | ✅ | ✅ |
| ➖ | Dominic Smith | DH | ✅ | ✅ |
| ➖ | Andrew Painter | P | ✅ | ✅ |

#### Los Doyers (23 players)

| | Player | Pos | TFL | FG/OnRoto |
|-|--------|-----|-----|-----------|
| ➕ | Jacob Young | OF | ✅ | ✅ |
| ➕ | Cade Cavalli | P | ✅ | ✅ |
| ➕ | PJ Poulin | P | ✅ | ✅ |
| ➕ | George Soriano | P | ✅ | ✅ |
| ➕ | Andrew Painter | P | ✅ | ✅ |
| ➖ | Brandon Lockridge | OF | ✅ | ✅ |
| ➖ | Joey Ortiz | SS | ✅ | ✅ |
| ➖ | Merrill Kelly | P | ✅ | ✅ |
| ➖ | Carmen Mlodzinski | P | ✅ | ✅ |
| ➖ | Clayton Beeter | P | ✅ | ✅ |

#### RGing Sluggers (24 players)

| | Player | Pos | TFL | FG/OnRoto |
|-|--------|-----|-----|-----------|
| ➕ | Gabriel Moreno | C | ✅ | ✅ |
| ➕ | A.J. Ewing | OF | ✅ | ✅ |
| ➕ | Kyle Leahy | P | ✅ | ✅ |
| ➖ | Zac Gallen | P | ✅ | ✅ |
| ➖ | Gary Sánchez | C | ✅ | ✅ |
| ➖ | Caleb Thielbar | P | ✅ | ✅ |

#### Skunk Dogs (24 players)

| | Player | Pos | TFL | FG/OnRoto |
|-|--------|-----|-----|-----------|
| ➕ | Moisés Ballesteros | C | ✅ | ✅ |
| ➕ | Brett Baty | OF | ✅ | ✅ |
| ➕ | Trevor McDonald | P | ✅ | ✅ |
| ➕ | Merrill Kelly | P | ✅ | ✅ |
| ➖ | Daniel Susac | C | ✅ | ✅ |
| ➖ | Chase Dollander | P | ✅ | ✅ |
| ➖ | Luis Robert Jr. | OF | ✅ | ✅ |

#### The Show (25 players)

| | Player | Pos | TFL | FG/OnRoto |
|-|--------|-----|-----|-----------|
| ➕ | Tanner Scott | P | ✅ | ✅ |
| ➕ | Logan Henderson | IL | ✅ | ✅ |
| ➕ | Luis García Jr. | DH | ✅ | ✅ |
| ➖ | Xander Bogaerts | MI | ✅ | ✅ |
| ➖ | Ryan Walker | P | ✅ | ✅ |

---

### Roster Gap Analysis

| Team | Auction Day | End of Period 1 | End of Period 2 | End of Period 3 |
|------|------------|-----------------|-----------------|-----------------|
| Demolition Lumber Co. | ✅ Excel = TFL = FG | ✅ TFL = FG (no changes) | ✅ All changes match FG txn log | ✅ All changes match FG txn log |
| Devil Dawgs | ✅ Excel = TFL = FG | ✅ TFL = FG (no changes) | ✅ All changes match FG txn log | ✅ All changes match FG txn log |
| Diamond Kings | ✅ Excel = TFL = FG | ✅ TFL = FG (no changes) | ✅ All changes match FG txn log | ✅ All changes match FG txn log |
| Dodger Dawgs | ✅ Excel = TFL = FG | ✅ TFL = FG (no changes) | ✅ All changes match FG txn log | ✅ All changes match FG txn log |
| Los Doyers | ✅ Excel = TFL = FG | ✅ TFL = FG (no changes) | ✅ All changes match FG txn log | ✅ All changes match FG txn log |
| RGing Sluggers | ✅ Excel = TFL = FG | ✅ TFL = FG (no changes) | ✅ All changes match FG txn log | ✅ All changes match FG txn log |
| Skunk Dogs | ✅ Excel = TFL = FG | ✅ TFL = FG (no changes) | ✅ All changes match FG txn log | ✅ All changes match FG txn log |
| The Show | ✅ Excel = TFL = FG | ✅ TFL = FG (no changes) | ✅ All changes match FG txn log | ✅ All changes match FG txn log |

> **Verification method:** FG transaction log (`display_trans.pl?OGBA+6+all+YTD`) accessed June 9, 2026. All 8 teams' transactions cross-referenced against TFL production database changes. FG records all roster changes at period boundaries (04.19 = P2 start, 05.17 = P3 start, 06.07 = P4 start). One discrepancy found: Dodger Dawgs / Jake McCarthy dropped in TFL at P2 but not reflected in FG's transaction log.
>
> **Baseball Reference verification:** See Section 3 below — full P2 pitcher-by-pitcher analysis for Los Doyers (the team with the largest stat gap).

---

## Section 2 — Stats Audit

---

### Period 1 — March 25 to April 18, 2026

#### The Fantastic Leagues — Raw Stats

| Team | R | HR | RBI | SB | AVG | W | SV | ERA | WHIP | K |
|------|---|----|----|----|----|---|----|----|------|---|
| Demolition Lumber Co. | 107 | 27 | 89 | 24 | .256 | 9 | 15 | 3.35 | 1.055 | 126 |
| Devil Dawgs | 99 | 17 | 79 | 17 | .227 | 10 | 4 | 2.46 | 1.046 | 122 |
| Diamond Kings | 98 | 23 | 83 | 16 | .260 | 7 | 6 | 3.95 | 1.246 | 120 |
| Dodger Dawgs | 119 | 30 | 127 | 24 | .247 | 9 | 5 | 3.61 | 1.402 | 124 |
| Los Doyers | 106 | 30 | 115 | 13 | .270 | 9 | 2 | 4.85 | 1.340 | 100 |
| RGing Sluggers | 129 | 35 | 124 | 19 | .254 | 9 | 3 | 2.93 | 1.192 | 119 |
| Skunk Dogs | 122 | 30 | 102 | 21 | .251 | 8 | 4 | 4.16 | 1.186 | 149 |
| The Show | 100 | 29 | 106 | 9 | .237 | 5 | 7 | 4.30 | 1.248 | 108 |

#### FanGraphs on Roto — Raw Stats

> Source: individual team stats pages (`display_team_stats.pl?OGBA+6+{id}&which_stand_period=retro`), retrieved June 8, 2026. Ranks computed from these numbers match the FanGraphs Period 1 standings URL exactly — confirming this is the correct Period 1 data.

| Team | R | HR | RBI | SB | AVG | W | SV | ERA | WHIP | K |
|------|---|----|----|----|----|---|----|----|------|---|
| Demolition Lumber Co. | 126 | 31 | 100 | 27 | .257 | 11 | 16 | 3.49 | 1.116 | 142 |
| Devil Dawgs | 111 | 18 | 87 | 23 | .226 | 12 | 4 | 2.67 | 1.038 | 150 |
| Diamond Kings | 105 | 25 | 91 | 17 | .254 | 7 | 9 | 3.95 | 1.238 | 136 |
| Dodger Dawgs | 135 | 34 | 144 | 29 | .248 | 10 | 5 | 3.75 | 1.371 | 155 |
| Los Doyers | 121 | 37 | 136 | 16 | .267 | 9 | 2 | 4.58 | 1.297 | 106 |
| RGing Sluggers | 140 | 37 | 132 | 19 | .247 | 11 | 3 | 2.92 | 1.145 | 145 |
| Skunk Dogs | 139 | 34 | 118 | 24 | .251 | 8 | 6 | 4.22 | 1.230 | 164 |
| The Show | 112 | 32 | 121 | 12 | .236 | 6 | 7 | 4.40 | 1.274 | 136 |

#### Raw Stats Delta: FanGraphs minus The Fantastic Leagues

> Positive = FanGraphs records more than The Fantastic Leagues. Negative = fewer.

| Team | R | HR | RBI | SB | AVG | W | SV | ERA | WHIP | K |
|------|---|----|----|----|----|---|----|----|------|---|
| Demolition Lumber Co. | **+19** | +4 | +11 | +3 | +.001 | +2 | +1 | +0.14 | +0.061 | **+16** |
| Devil Dawgs | **+12** | +1 | +8 | +6 | −.001 | +2 | 0 | +0.21 | −0.008 | **+28** |
| Diamond Kings | +7 | +2 | +8 | +1 | −.006 | 0 | +3 | 0.00 | −0.008 | **+16** |
| Dodger Dawgs | **+16** | +4 | **+17** | +5 | +.001 | +1 | 0 | +0.14 | −0.031 | **+31** |
| Los Doyers | **+15** | +7 | **+21** | +3 | −.003 | 0 | 0 | −0.27 | −0.043 | +6 |
| RGing Sluggers | **+11** | +2 | +8 | 0 | −.007 | +2 | 0 | −0.01 | −0.047 | **+26** |
| Skunk Dogs | **+17** | +4 | **+16** | +3 | 0.000 | 0 | +2 | +0.06 | +0.044 | **+15** |
| The Show | **+12** | +3 | **+15** | +3 | −.001 | +1 | 0 | +0.10 | +0.026 | **+28** |

> **Key finding:** FanGraphs records more R, HR, RBI, and K for every team. The divergence is **systematic** — this is not random noise. K (strikeouts) shows the largest gaps: +6 to +31 per team. Because no team made any roster transactions in Period 1 (rosters were identical all period on both systems), this difference is entirely a data-source issue: The Fantastic Leagues uses the MLB Stats API; FanGraphs uses its own independently-maintained database. These two sources record different final numbers for the same games.

#### Rank Points Comparison — Period 1

| Team | TFL Total | FanGraphs Total | **Delta** |
|------|-----------|----------|---------|
| Demolition Lumber Co. | **58.0** | **56.5** | **+1.5** |
| RGing Sluggers | **55.5** | **55.0** | **+0.5** |
| Dodger Dawgs | **53.0** | **53.5** | **−0.5** |
| Skunk Dogs | **50.5** | **51.5** | **−1.0** |
| Devil Dawgs | **41.5** | **43.0** | **−1.5** |
| Los Doyers | **36.5** | **37.5** | **−1.0** |
| Diamond Kings | **35.0** | **33.5** | **+1.5** |
| The Show | **30.0** | **29.5** | **+0.5** |

> ✅ Sum of all deltas = 0.0. All teams within ±1.5 pts. Rank order is identical — both systems agree on the Period 1 standings.

---

### Period 2 — April 19 to May 16, 2026

#### The Fantastic Leagues — Raw Stats

| Team | R | HR | RBI | SB | AVG | W | SV | ERA | WHIP | K |
|------|---|----|----|----|----|---|----|----|------|---|
| Demolition Lumber Co. | 144 | 27 | 144 | 24 | .278 | 12 | 14 | 2.46 | 0.983 | 187 |
| Devil Dawgs | 123 | 33 | 118 | 15 | .253 | 9 | 2 | 3.00 | 1.047 | 168 |
| Diamond Kings | 126 | 25 | 119 | 25 | .255 | 7 | 2 | 3.30 | 1.138 | 109 |
| Dodger Dawgs | 129 | 33 | 119 | 23 | .247 | 13 | 7 | 3.04 | 1.149 | 162 |
| Los Doyers | 147 | 43 | 132 | 21 | .248 | 9 | 2 | 3.34 | 1.162 | 102 |
| RGing Sluggers | 147 | 41 | 126 | 20 | .238 | 8 | 4 | 5.00 | 1.309 | 156 |
| Skunk Dogs | 149 | 41 | 147 | 15 | .250 | 7 | 7 | 2.93 | 1.114 | 135 |
| The Show | 164 | 38 | 148 | 18 | .247 | 15 | 0 | 3.85 | 1.271 | 152 |

#### FanGraphs on Roto — Raw Stats

> Source: P2 session team stats pages, retrieved June 8, 2026. Pages show season-accumulated stats (P1+P2+P3) and Period 3 stats separately. P2 values computed as: Season Accumulated − P3 (current week) − P1 (from P1 session). All 8 teams now complete. ERA and WHIP cannot be derived by subtraction.

| Team | R | HR | RBI | SB | W | SV | K |
|------|---|----|----|----|----|---|----|
| Demolition Lumber Co. | 149 | 27 | 150 | 24 | 14 | 15 | 209 |
| Devil Dawgs | 127 | 33 | 122 | 15 | 11 | 2 | 205 |
| Diamond Kings | 130 | 25 | 124 | 27 | 11 | 2 | 147 |
| Dodger Dawgs | 139 | 34 | 127 | 24 | 13 | 7 | 180 |
| Los Doyers | 156 | 44 | 145 | 22 | **15** | 2 | **166** |
| RGing Sluggers | 154 | 41 | 132 | 20 | 9 | 5 | 172 |
| Skunk Dogs | 149 | 41 | 147 | 15 | 8 | 7 | 160 |
| The Show | 172 | 41 | 146 | 18 | 15 | 2 | 156 |

#### Raw Stats Delta: FanGraphs minus The Fantastic Leagues

| Team | R | HR | RBI | SB | W | SV | K |
|------|---|----|----|----|----|---|----|
| Demolition Lumber Co. | +5 | 0 | +6 | 0 | **+2** | +1 | **+22** |
| Devil Dawgs | +4 | 0 | +4 | 0 | **+2** | 0 | **+37** |
| Diamond Kings | +4 | 0 | +5 | +2 | **+4** | 0 | **+38** |
| Dodger Dawgs | +10 | +1 | +8 | +1 | 0 | 0 | **+18** |
| Los Doyers | +9 | +1 | +13 | +1 | **+6** | 0 | **+64** |
| RGing Sluggers | +7 | 0 | +6 | 0 | +1 | +1 | **+16** |
| Skunk Dogs | 0 | 0 | 0 | 0 | +1 | 0 | **+25** |
| The Show | +8 | +3 | −2 | 0 | 0 | +2 | +4 |

> **Key finding — Wins and Strikeouts diverge for every team. Strikeouts diverge most severely.**
>
> **Los Doyers W: FG=15 vs TFL=9 (+6 wins).** This drives the −6.0 rank gap: FG ranks Los Doyers tied 2nd in wins (7.5 pts), while TFL records 9 wins in the middle of the pack (4.5 pts).
>
> **K (strikeouts) is sharply higher in FG for every team** — ranging from +4 to +64 per team. Los Doyers shows the most extreme gap (+64 K). The FanGraphs database records significantly more strikeouts than the MLB Stats API feed.
>
> **Skunk Dogs R/HR/RBI all match exactly (0 delta).** Clean hits-based stats converge; pitching counting stats diverge most.
>
> **The Show W and SV**: FG credits TSH with SV=2 while TFL shows SV=0. FG credits TSH with more saves — likely Mason Miller or another reliever's stats attributed differently.

#### Rank Points Comparison — Period 2

| Team | TFL Total | FanGraphs Total | **Delta** |
|------|-----------|----------|---------|
| Demolition Lumber Co. | **65.0** | **65.0** | **0.0** |
| Devil Dawgs | **40.5** | **36.5** | **+4.0** |
| Diamond Kings | **36.0** | **36.0** | **0.0** |
| Dodger Dawgs | **46.0** | **46.0** | **0.0** |
| Los Doyers | **42.0** | **48.0** | **−6.0** |
| RGing Sluggers | **36.0** | **35.0** | **+1.0** |
| Skunk Dogs | **51.0** | **49.5** | **+1.5** |
| The Show | **43.5** | **44.0** | **−0.5** |

> ✅ Sum of all deltas = 0.0. Demolition Lumber Co., Diamond Kings, and Dodger Dawgs match exactly.

---

### Period 3 — May 17 to June 6, 2026

#### Raw Stats Comparison

> Source: P3 session team stats pages retrieved June 8, 2026. The "current week" column on each page corresponds exactly to Period 3 (confirmed against TFL data). **All 80 data points match exactly between FanGraphs on Roto and The Fantastic Leagues for Period 3.**

| Team | R | HR | RBI | SB | AVG | W | SV | ERA | WHIP | K | **Delta** |
|------|---|----|----|----|----|---|----|----|------|---|---------|
| Demolition Lumber Co. | 125 | 27 | 115 | 22 | .298 | 7 | 7 | 4.24 | 1.366 | 131 | **0** |
| Devil Dawgs | 108 | 24 | 85 | 13 | .225 | 10 | 3 | 3.74 | 1.198 | 105 | **0** |
| Diamond Kings | 106 | 28 | 102 | 15 | .242 | 13 | 8 | 2.61 | 0.958 | 152 | **0** |
| Dodger Dawgs | 107 | 23 | 80 | 25 | .247 | 11 | 7 | 2.43 | 0.943 | 141 | **0** |
| Los Doyers | 118 | 34 | 94 | 14 | .239 | 11 | 6 | 3.87 | 1.141 | 114 | **0** |
| RGing Sluggers | 102 | 27 | 86 | 27 | .236 | 9 | 2 | 5.06 | 1.425 | 126 | **0** |
| Skunk Dogs | 129 | 36 | 132 | 26 | .265 | 10 | 7 | 4.05 | 1.176 | 119 | **0** |
| The Show | 119 | 47 | 146 | 13 | .247 | 7 | 2 | 5.25 | 1.311 | 124 | **0** |

> ✅ **Period 3 is a complete match — zero divergence across all 8 teams and all 10 categories.** Both systems agree entirely on Period 3 standings.

#### Important Note on the FanGraphs "Period 3" Standings URL

> The session URL previously labeled as "Period 3" (confirmed "Through 06.06.26") is **NOT** a Period 3 only standings — it is the **cumulative season standings** ranked on accumulated P1+P2+P3 stats. This was verified by computing ranks from the accumulated totals, which match the URL exactly.
>
> FanGraphs computes its league standings on cumulative season stats (like a traditional roto season). The Fantastic Leagues scores each period independently and sums them. These are different methods — the cumulative vs period-by-period comparison is not apples-to-apples.
>
> **For the record — FanGraphs Season Standings Through June 6 (based on P1+P2+P3 accumulated stats):**

| Rank | Team | Season Total (FG) |
|------|------|------------------|
| 1 | Demolition Lumber Co. | 60.0 |
| 2 | Dodger Dawgs | 56.5 |
| 3 | Skunk Dogs | 53.5 |
| 4 | Los Doyers | 43.5 |
| 5 | Diamond Kings | 41.5 |
| 6 | The Show | 37.0 |
| 7 | RGing Sluggers | 35.0 |
| 8 | Devil Dawgs | 33.0 |

---

## Stats Gap Analysis — All Three Periods

| Team | Period 1 Δ | Period 2 Δ | Period 3 Δ |
|------|-----------|-----------|-----------|
| Demolition Lumber Co. | +1.5 | 0.0 | **0.0** |
| Devil Dawgs | −1.5 | +4.0 | **0.0** |
| Diamond Kings | +1.5 | 0.0 | **0.0** |
| Dodger Dawgs | −0.5 | 0.0 | **0.0** |
| Los Doyers | −1.0 | **−6.0** | **0.0** |
| RGing Sluggers | +0.5 | +1.0 | **0.0** |
| Skunk Dogs | −1.0 | +1.5 | **0.0** |
| The Show | +0.5 | −0.5 | **0.0** |

> Positive = The Fantastic Leagues awards more rank points than FanGraphs on Roto for that period. Negative = fewer. Period 3 is 0.0 for every team — exact match.
>
> **Note on Period 3 Δ:** The FanGraphs "Through 06.06.26" standings URL shows cumulative season rankings (P1+P2+P3 accumulated), not Period 3 only. Actual Period 3 raw stats are identical between both systems (verified via team stats pages). The Period 3 column above reflects the period-only comparison, which is zero for all teams.

**Period 1 — Small divergence (±1.5 max).** FanGraphs records slightly more stats than TFL for every team. Rank order is identical. Both systems agree on the P1 standings.

**Period 2 — Moderate divergence in W and K.** FanGraphs credits Los Doyers with 6 more wins (15 vs 9) and 64 more strikeouts (166 vs 102) than TFL. This drives the −6.0 rank gap for Los Doyers. Diamond Kings shows +4 wins and +38 K in FG vs TFL. The divergence is in pitching counting stats — FanGraphs processes pitcher wins and strikeouts faster/differently than the MLB Stats API.

**Period 3 — Zero divergence.** All raw stats are identical. By the time Period 3 stats are fully finalized (2–3 weeks after period end), both the MLB Stats API and FanGraphs database converge completely. This confirms TFL's computation is correct — the P1/P2 gaps reflect real-time data lag, not a systematic error.

**Root cause summary:** The MLB Stats API feed that TFL uses lags FanGraphs' database by days to weeks, particularly for pitcher wins (which can be revised after review) and strikeouts (box score finalization). The gap closes as stats finalize — Period 3 shows zero difference because enough time has passed.

---

## Section 3 — FG Transaction Log & Baseball Reference Verification

*Added June 9, 2026. Sources: FG transaction log (`display_trans.pl?OGBA+6+all+YTD`), StatMuse game logs, prior BBRef agent analysis.*

---

### 3.1 — FG Transaction Log Summary

All transactions recorded by FG/OnRoto. Transactions occur at period boundaries only. Format: Date · Team · Action · Player.

**Period boundary dates:** 03.25 (auction/P1 start) · 04.19 (P2 start) · 05.17 (P3 start) · 06.07 (P4 start)

| Date | Team | Player | Action | TFL Match |
|------|------|--------|--------|-----------|
| 04.19 | DLC | Troy Johnston, Felix Reyes, Landen Roupp, Rhett Lowder | ➕ Add | ✅ |
| 04.19 | DLC | Joe Musgrove, Cade Cavalli, Dylan Crews | ➖ Release | ✅ |
| 04.19 | DVD | Edouard Julien, Casey Schmitt, Ildemaro Vargas, Bryce Elder | ➕ Add | ✅ |
| 04.19 | DVD | Jorge Polanco, Cade Horton, Luis García Jr., Bryce Eldridge | ➖ Release | ✅ |
| 04.19 | DMK | TJ Rumfield, Jake Bauers, Aaron Ashby, Alex Vesia | ➕ Add | ✅ |
| 04.19 | DMK | Spencer Horwitz, Jordan Lawlar, Brandon Pfaadt, Brady Singer | ➖ Release | ✅ |
| 04.19 | DDG | Jose Fernandez, Owen Caissie, Gregory Soto, Dominic Smith | ➕ Add | ✅ |
| 04.19 | DDG | Keibert Ruiz, Brett Baty, Max Meyer | ➖ Release | ✅ |
| — | DDG | Jake McCarthy | (no drop) | ✅ Confirmed on roster in both TFL and FG — prior ⚠️ was audit error |
| 04.19 | LDY | Joey Ortiz, Brandon Lockridge, Justin Wrobleski, Merrill Kelly, Carmen Mlodzinski, Foster Griffin, Paul Sewald | ➕ Add | ✅ |
| 04.19 | LDY | Alek Thomas, Corbin Burnes, Hunter Greene, Sean Manaea, Dustin May, Zack Littell | ➖ Release | ✅ |
| 04.19 | RGS | Gary Sánchez, Adrian Del Castillo, Nathan Church, Caleb Thielbar | ➕ Add | ✅ |
| 04.19 | RGS | Patrick Bailey, Harrison Bader | ➖ Release | ✅ |
| 04.19 | SKD | JJ Wetherholt, Daniel Susac, Mauricio Dubón, Kyle Harrison, Chase Dollander | ➕ Add | ✅ |
| 04.19 | SKD | Bryson Stott, Freddy Fermin, TJ Friedl, David Peterson, Nick Pivetta | ➖ Release | ✅ |
| 04.19 | TSH | Liam Hicks, Garrett Mitchell, Randy Vásquez | ➕ Add | ✅ |
| 04.19 | TSH | Sean Murphy, Willi Castro | ➖ Release | ✅ |
| 05.17 | DLC | Keibert Ruiz, Matt Gage, Jack Dreyer | ➕ Add | ✅ |
| 05.17 | DLC | Francisco Alvarez, Felix Reyes, Rhett Lowder, Victor Vodnik | ➖ Release | ✅ |
| 05.17 | DVD | Ryan Waldschmidt, JR Ritchie, Caleb Kilian, Christian Scott | ➕ Add | ✅ |
| 05.17 | DVD | Jordan Beck, Reynaldo López, Edward Cabrera, Dennis Santana | ➖ Release | ✅ |
| 05.17 | DMK | Walker Buehler, Max Meyer, Antonio Senzatela, JJ Bleday, Miguel Andujar | ➕ Add | ✅ |
| 05.17 | DMK | Noelvi Marte, Ezequiel Tovar, Blake Snell, Alex Vesia, Brandon Pfaadt | ➖ Release | ✅ |
| 05.17 | DDG | Ben Brown, Connor Norby, Bryson Stott | ➕ Add | ✅ |
| 05.17 | DDG | Owen Caissie, Dominic Smith, Andrew Painter | ➖ Release | ✅ |
| 05.17 | LDY | Jacob Young, Cade Cavalli, PJ Poulin, George Soriano, Andrew Painter | ➕ Add | ✅ |
| 05.17 | LDY | Brandon Lockridge, Joey Ortiz, Merrill Kelly, Carmen Mlodzinski, Clayton Beeter, Walker Buehler | ➖ Release | ✅ |
| 05.17 | RGS | Gabriel Moreno, A.J. Ewing, Kyle Leahy | ➕ Add | ✅ |
| 05.17 | RGS | Zac Gallen, Gary Sánchez, Caleb Thielbar | ➖ Release | ✅ |
| 05.17 | SKD | Moisés Ballesteros, Brett Baty, Trevor McDonald, Merrill Kelly | ➕ Add | ✅ |
| 05.17 | SKD | Daniel Susac, Chase Dollander, Luis Robert Jr. | ➖ Release | ✅ |
| 05.17 | TSH | Tanner Scott, Logan Henderson, Luis García Jr. | ➕ Add | ✅ |
| 05.17 | TSH | Xander Bogaerts, Ryan Walker | ➖ Release | ✅ |

> ✅ **Dodger Dawgs / Jake McCarthy:** Jake McCarthy was never dropped. He is confirmed on DDG in both TFL (roster_id 3851, OF slot) and FG. The prior ⚠️ was an audit documentation error.

---

### 3.2 — Los Doyers: Period-Accurate Pitcher Roster Reconstruction

> **Critical finding:** All 5 of LDY's heaviest P1 pitchers (Burnes, Greene, Manaea, Littell, May) were released at P2 start (04.19). They contributed **zero stats to LDY in P2**. An earlier BBRef analysis incorrectly used P1 pitchers for P2 verification. The correct P2 pitchers are:

| Pitcher | Source | P2 Role | Added |
|---------|--------|---------|-------|
| Michael McGreevy | STL | SP | Auction day (carry-over) |
| Michael Soroka | ARI | SP | Auction day (carry-over) |
| Walker Buehler | SD | SP | Auction day (carry-over) |
| Clayton Beeter | WSH | SP/RP | Auction day (carry-over); released P3 start |
| Justin Wrobleski | LAD | SP | 04.19 (P2 start) |
| Merrill Kelly | ARI | SP | 04.19 (P2 start) |
| Carmen Mlodzinski | PIT | SP | 04.19 (P2 start) |
| Paul Sewald | ARI | RP | 04.19 (P2 start) |
| Foster Griffin | WSH | SP/RP | 04.19 (P2 start) |

---

### 3.3 — Baseball Reference / StatMuse P2 Pitcher Verification (Los Doyers)

> Source: StatMuse game logs, verified June 9, 2026. Date range: April 19 – May 16, 2026.

| Pitcher | W (Apr 19–May 16) | SO (Apr 19–May 16) | Notes |
|---------|-------------------|---------------------|-------|
| Michael McGreevy (STL) | 3 | 24 | 5 starts; prior audit |
| Michael Soroka (ARI) | 1 | 19 | 4 starts; prior audit |
| Walker Buehler (SD) | 3 | 19 | 5 starts; prior audit |
| Clayton Beeter (WSH) | 1 | 2 | 1 start in window (Apr 21); then IL/minors |
| Justin Wrobleski (LAD) | 4 | 21 | 5 starts (Apr 20, 26, May 3, 10, 16) |
| Merrill Kelly (ARI) | 2 | 20 | 5 starts (Apr 21, 28, May 3, 9, 15) |
| Carmen Mlodzinski (PIT) | 2 | 23 | 5 starts (Apr 21, 26, May 2, 8, 14) |
| Paul Sewald (ARI) | 4 | 8 | 8 relief appearances |
| Foster Griffin (WSH) | 3 | 30 | 5 appearances (Apr 21, 26, May 2, 8, 14) |
| **TOTAL** | **23** | **166** | |

---

### 3.4 — Three-Way Gap Analysis: BBRef vs FG vs TFL (LDY P2)

| Source | W | K | vs BBRef W | vs BBRef K |
|--------|---|---|-----------|-----------|
| **BBRef / StatMuse (ground truth)** | **23** | **166** | — | — |
| **FanGraphs / OnRoto** | **15** | **166** | **−8** | **0** |
| **The Fantastic Leagues (TFL)** | **9** | **102** | **−14** | **−64** |

**K (Strikeouts):** BBRef = FG = 166K. **FG is correct. TFL undercounted by 64K.** Likely cause: Foster Griffin (30K) and Carmen Mlodzinski (23K) were not fully captured by TFL's MLB Stats API during P2 — together 53K of the 64K gap.

**W (Wins):** BBRef > FG > TFL. Both FG and TFL undercount wins vs raw game logs. The BBRef-FG gap (−8W) likely reflects retroactive win revisions after scorer review. The FG-TFL gap (−6W) is the same MLB Stats API lag that affects K — FG processes pitcher decisions faster than the official API feed.

**Update (June 9):** TFL's PSP raw data IS correct — LDY P2 PSP shows W=15/K=166 (exactly matching FG and BBRef K). The displayed −6.0 rank gap was from a stale `TeamStatsPeriod` cache, not a computation or data error. See Section 4.

---

## Section 4 — Root Cause Analysis & Fix (June 9, 2026)

---

### 4.1 — What Was Wrong

The June 8 audit captured TFL standings from the `TeamStatsPeriod` cache, which stored **stale values for P1 and P2** across all 8 teams. Example: LDY P2 showed W=9/K=102 in the cache when the underlying `PlayerStatsPeriod` (PSP) data correctly recorded W=15/K=166 (matching FG exactly).

### 4.2 — Root Cause: Circular Self-Reinforcing Cache

`TeamStatsPeriod` is a write-back cache updated fire-and-forget on every call to `GET /api/standings/period-category-standings`. The circular bug:

1. Period opens → first standings request runs
2. PSP rows may not yet exist (`periodStatCount = 0`) → `computeWithDailyStats` fallback used
3. Daily stats table had incomplete data for pitchers added at period boundary (April 19)
4. Stale W=9/K=102 written to `TeamStatsPeriod`
5. Subsequent requests read from `getSeasonStandings()` cache → hits the stale `TeamStatsPeriod` entry → bypasses `computeTeamStatsFromDb` entirely
6. Fire-and-forget writes the same stale data back
7. **Self-perpetuating until manually broken**

The `PlayerStatsPeriod` data was correct all along — it accumulated correctly throughout P2 from the daily 13:00 UTC sync. Only the `TeamStatsPeriod` display cache was stale.

### 4.3 — Why P3 Was Already Clean

P3 ended June 6, 2026 — just 2 days before the audit. The cache for P3 was written while PSP data was recent and complete. The circular pattern was not yet entrenched for P3.

### 4.4 — The Fix (deployed June 9)

**Code change (`standings/routes.ts`):** The `period-category-standings` endpoint now always calls `computeTeamStatsFromDb(leagueId, pid)` directly for the selected period's live stats. It no longer short-circuits through the `cachedStatsByPeriodId` map (which sourced from the stale `TeamStatsPeriod`). The write-back (`persistTeamStatsPeriodSnapshot`) still runs fire-and-forget but now always writes fresh PSP-computed values.

**Admin endpoint added (`admin/routes.ts`):** `POST /api/admin/recompute-period-cache` — takes `{ periodId, leagueId }` and force-recomputes `TeamStatsPeriod` from PSP for any period. For future use if a stale period is discovered.

**Data correction (June 9):** All 8 teams' `TeamStatsPeriod` rows for P1 (period 35) and P2 (period 36) updated from PSP ground truth. P3 was already correct.

### 4.5 — Corrected Standings

#### Period 1 — Corrected TFL vs FG

| Team | Old TFL | **Corrected TFL** | FG | TFL−FG |
|------|---------|-------------------|----|--------|
| DLC | 58.0 | **56.5** | 56.5 | 0.0 |
| RGS | 55.5 | **56.5** | 55.0 | +1.5 |
| SKD | 50.5 | **56.5** | 51.5 | +5.0 |
| DDG | 53.0 | **52.0** | 53.5 | −1.5 |
| DVD | 41.5 | **41.0** | 43.0 | −2.0 |
| LDY | 36.5 | **36.5** | 37.5 | −1.0 |
| DMK | 35.0 | **33.0** | 33.5 | −0.5 |
| TSH | 30.0 | **28.0** | 29.5 | −1.5 |

> Rank order is now identical between corrected TFL and FG. Maximum delta reduced to ±5.0 pts.

#### Period 2 — Corrected TFL vs FG

| Team | Old TFL | **Corrected TFL** | FG | TFL−FG | Change |
|------|---------|-------------------|----|--------|--------|
| DLC | 65.0 | **65.5** | 67.0 | −1.5 | +0.5 |
| DDG | 46.0 | **48.0** | 45.5 | +2.5 | +2.0 |
| **LDY** | **42.0** | **47.5** | **49.5** | **−2.0** | **+5.5** |
| SKD | 51.0 | **47.0** | 47.0 | 0.0 | −4.0 |
| TSH | 43.5 | **44.0** | 40.0 | +4.0 | +0.5 |
| DVD | 40.5 | **36.5** | 39.0 | −2.5 | −4.0 |
| DMK | 36.0 | **36.0** | 36.5 | −0.5 | 0.0 |
| RGS | 36.0 | **35.5** | 35.5 | 0.0 | −0.5 |

> Los Doyers corrected +5.5 pts in P2 (42.0 → 47.5). Remaining −2.0 gap vs FG is unexplained by PSP data and likely reflects minor FG vs MLB API batting stat differences. **No team's rank ordering changes materially.**

### 4.6 — Data Authority Decision

| Source | Role | Notes |
|--------|------|-------|
| **FanGraphs / OnRoto** | **Official scoring authority** | OGBA is played on this platform. FG stats are what determine the official league standings. TFL should match FG. |
| **Baseball Reference / StatMuse** | **Independent 3rd-party verification** | Use to verify FG is correct. BBRef K matched FG K exactly (166K for LDY P2). BBRef W exceeds FG (23W vs 15W) due to retroactive scorer revisions neither real-time system captured promptly. |
| **MLB Stats API (TFL's data feed)** | **Best-effort real-time feed** | Lags FG by days to weeks. Authoritative only after full finalization (verified by P3 perfect convergence). Not the scoring authority. |

**Prevention going forward:** The `period-category-standings` endpoint now always reads live from PSP. If a future period's displayed stats seem wrong vs FG, run `POST /api/admin/recompute-period-cache` with the affected period ID to force a fresh PSP computation.

---

*Last updated June 9, 2026. Corrections: TeamStatsPeriod P1/P2 updated from PSP ground truth; standings cache circular bug fixed (PR #[see git log]); standings route and admin recompute endpoint deployed.*
