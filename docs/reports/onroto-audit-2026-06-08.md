# OGBA 2026 — Standings Audit
## FanGraphs on Roto vs The Fantastic Leagues

**Date:** June 8, 2026 (updated June 9, 2026) | **League:** OGBA | **Periods covered:** 1, 2, 3

---

## Executive Summary

*(Rewritten June 9 PM after the definitive player-level reconciliation — see Section 5.)*

- **Period 2:** ✅ **Exact match — all 8 teams, every subtraction-verifiable category (R/HR/RBI/SB/W/SV/K).** The apparent TSH deltas (+11 RBI, −1 W, −1 K) in the June 8 tables were arithmetic artifacts of deriving FG's P2 by subtraction while ignoring P4's first games; FG's own YTD totals prove FG P2 = TFL P2 (Section 5.2).
- **Period 3:** ✅ Exact match on the PSP computation path (verified June 8 and re-verified player-level June 9). ⚠️ The live site currently serves P3 via the daily-stats fallback because of 3 real mid-period wire adds (Section 5.4) — small spurious deviations until the hybrid-attribution fix lands.
- **Period 1:** ❌ TFL's stored `PlayerStatsPeriod` rows for P1 are **inflated by the games of April 19** — the first day of P2 — because the last P1 sync ran while the period boundary still extended through 4/19 and closed periods are never re-synced. Re-fetching the same 3/25–4/18 range from the MLB API today reproduces FG's numbers **exactly, cell for cell, for all 8 teams** (Section 5.1). The fix is one admin call: `POST /api/admin/sync-stats {periodId: 35}`.
- **Period 4 (active):** PSP path, healthy. Intraday differences vs FG are sync-cadence only (TFL 4×/day vs FG nightly) and converge.
- **BBRef verification (LDY P2 pitchers):** ✅ **BBRef = FG = TFL = 15 W / 166 K.** The June 8 claim of "23 W ground truth" was a bad scrape that counted team results instead of pitcher decisions (Section 5.3). There are **no retroactive scorer revisions** — once boundaries and syncs are correct, all sources agree exactly.
- **Data authority:** FanGraphs/OnRoto is the official scoring platform; BBRef is the independent third party; the MLB Stats API is TFL's feed. After this audit, all three agree wherever TFL's stored data is current — "stats are the same everywhere" holds.
- **`TeamStatsPeriod` cache fix (June 9 AM, PR #391):** the circular stale-cache bug is fixed (endpoint computes live from PSP) and remains valid. But two further defects were found June 9 PM: the P1 PSP boundary inflation above, and `hasMidPeriodPickup` mis-flagging P1 onto the daily path due to two artifact roster timestamps (Section 5.4).
- **Rosters:** ✅ All 8 teams confirmed across auction day, P2, and P3 against the FG transaction log.

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

**Root cause summary — SUPERSEDED (June 9 PM):** This section originally attributed the P1/P2 gaps to MLB Stats API lag. That explanation is **withdrawn**. The June 8 "TFL" numbers above were the stale `TeamStatsPeriod` cache (P1/P2) computed from the gappy daily table; the true causes are the April-19 boundary inflation in P1's stored PSP rows and derivation artifacts in the FG P2 subtraction. See Section 5 — after correction, TFL = FG exactly for P1, P2, and P3.

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

> **Corrected June 9 PM.** Source: StatMuse/BBRef game logs, re-verified per appearance using **pitcher decisions** (the W/L the official scorer assigned to the pitcher), not team results. The earlier version of this table counted team wins in games the pitcher appeared — Sewald, for example, had 0 personal wins (and 2 losses) in the span, not 4. Date range: April 19 – May 16, 2026.

| Pitcher | W (decisions) | SO | Notes |
|---------|---------------|-----|-------|
| Michael McGreevy (STL) | 2 | 24 | L 4/20, W 5/2, W 5/8 |
| Michael Soroka (ARI) | 1 | 19 | W 5/11 |
| Walker Buehler (SD) | 2 | 19 | 2–1 in span (W 5/5, W 5/16) |
| Clayton Beeter (WSH) | 0 | 2 | 1 appearance (Apr 21), no decision |
| Justin Wrobleski (LAD) | 4 | 21 | W 4/20, 4/26, 5/3, 5/16 |
| Merrill Kelly (ARI) | 2 | 20 | W 5/9, 5/15 |
| Carmen Mlodzinski (PIT) | 2 | 23 | W 5/2, 5/14 |
| Paul Sewald (ARI) | 0 | 8 | 0–2 in 8 relief appearances |
| Foster Griffin (WSH) | 2 | 30 | W 4/21, 5/8 |
| **TOTAL** | **15** | **166** | |

---

### 3.4 — Three-Way Gap Analysis: BBRef vs FG vs TFL (LDY P2)

*(Corrected June 9 PM.)*

| Source | W | K |
|--------|---|---|
| **BBRef / StatMuse (pitcher decisions)** | **15** | **166** |
| **FanGraphs / OnRoto** | **15** | **166** |
| **The Fantastic Leagues (PSP, production path)** | **15** | **166** |

✅ **All three sources agree exactly.** There are no retroactive scorer revisions and no residual MLB-API lag for this closed period. The previously reported "23 W BBRef ground truth" was a scrape error (team results counted as pitcher decisions); the previously displayed TFL 9W/102K was the stale `TeamStatsPeriod` cache fixed in PR #391. Per-pitcher TFL PSP values match the verified game logs cell-for-cell (McGreevy 2/24, Soroka 1/19, Buehler 2/19, Beeter 0/2, Wrobleski 4/21, Kelly 2/20, Mlodzinski 2/23, Sewald 0/8, Griffin 2/30).

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

### 4.5 — Corrected Standings *(SUPERSEDED by Section 5)*

> ⚠️ **June 9 PM:** The tables below were computed from PSP data that still contained the April-19 boundary inflation (Section 5.1), and the live endpoint was serving P1 via the daily-stats fallback (Section 5.4). They are kept for the historical record only. The definitive corrected P1 equals FG exactly — see Section 5.1.

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
| **Baseball Reference / StatMuse** | **Independent 3rd-party verification** | Use to verify FG is correct. For LDY P2, BBRef pitcher decisions = FG = TFL exactly (15W/166K, Section 3.4). When querying StatMuse/BBRef, always use **pitcher decisions**, never team results. |
| **MLB Stats API (TFL's data feed)** | **Official record, correct when queried with correct boundaries** | A fresh byDateRange fetch today reproduces FG exactly for every closed period (Section 5.1). Past divergence was TFL-side staleness (frozen P1 rows synced under an old boundary), not API lag. Intraday lag still applies to the active period. |

**Prevention going forward:** The `period-category-standings` endpoint now always reads live from PSP. If a future period's displayed stats seem wrong vs FG, run `POST /api/admin/recompute-period-cache` with the affected period ID to force a fresh PSP computation.

---

## Section 5 — Definitive Player-Level Reconciliation (June 9 PM)

The remaining "data-source lag" and "scorer revision" explanations from earlier sections were challenged and re-investigated player-by-player. Both are **withdrawn**. Every residual divergence has a concrete, verified cause. Once corrected, **TFL = FG = BBRef exactly for every closed period.**

### 5.1 — Period 1 root cause: stored PSP rows include April 19 (P2's first day)

The decisive experiment: for every P1-rostered player, compare the stored `PlayerStatsPeriod` P1 row against a **fresh MLB API `byDateRange(03/25–04/18)` fetch run today**.

Result: the per-team sum of (stored − fresh) reproduces the observed TFL−FG P1 delta **cell for cell**:

| Team | Observed TFL−FG (R/RBI/K/W) | Stored−Fresh (R/RBI/K/W) |
|------|------------------------------|---------------------------|
| RGing Sluggers | +3 / +3 / +16 / +1 | +3 / +3 / +16 / +1 |
| Dodger Dawgs | +3 / +4 / +12 / +1 | +3 / +4 / +12 / +1 |
| Skunk Dogs | +7 / +5 / +10 / +1 | +7 / +5 / +10 / +1 *(after Ohtani synthetic-row adjustment)* |

And the extra stats are precisely the **games of April 19, 2026**: e.g. Robbie Ray stored 31 K vs fresh 24 K, and Ray's 4/19 start was exactly 7 K; Mitch Keller +5 K +1 W = his 4/19 line; Devin Williams +3 K = his 4/19 outing. Nearly every hitter is +1 R/RBI — everyone played 4/19.

**Why:** the last P1 sync ran while P1's end boundary still extended through 4/19 (the "period ends when the next begins" convention before the boundary was tightened to 4/18). `syncAllActivePeriods` only syncs **active** periods, so once P1 closed, its rows were frozen with the extra day baked in. P2 was synced under correct boundaries throughout, so P2 is clean — and the 4/19 games are *also correctly counted in P2*, which is why FG's YTD totals are lower than TFL's period sums (e.g. RGS season K: TFL 476 vs FG 460, a difference of exactly the P1 +16).

**Verification that the fix lands on FG:** recomputing P1 entirely from fresh MLB data (production attribution semantics) matches FG's directly-scraped P1 table **exactly — all 8 teams, all categories** — and therefore reproduces FG's P1 rank points exactly (DLC 56.5, RGS 55.0, DDG 53.5, SKD 51.5, DVD 43.0, LDY 37.5, DMK 33.5, TSH 29.5).

**Fix:** `POST /api/admin/sync-stats {periodId: 35}` (re-runs `syncPeriodStats` with the current, correct 3/25–4/18 boundary), then `POST /api/admin/recompute-period-cache` for P1.

### 5.2 — Period 2 is a 100% exact match (TSH deltas were derivation artifacts)

The June 8 FG P2 values were derived as `Accumulated − P3 − P1`. For The Show, that arithmetic ignored P4 games already present in "Accumulated" when scraped, producing phantom deltas (+11 RBI, −1 W, −1 K). Proof from FG's own team page (fetchable as guest): TSH season RBI = 431; back out P1 (121), P3 (146), and current-week (7) → FG P2 RBI = **157 = TFL exactly**. With that corrected, **Period 2 matches FG for all 8 teams in every subtraction-verifiable category.** (FG period-level ERA/WHIP/AVG cannot be derived by subtraction; with identical underlying counting stats and identical raw data, they match by construction.)

### 5.3 — BBRef arbitration: all sources agree (see corrected Sections 3.3–3.4)

The "23 W" table was re-verified appearance-by-appearance using pitcher decisions: true total **15 W / 166 K**, agreeing with FG and with TFL's PSP per-pitcher values cell-for-cell. The "retroactive scorer revisions" theory is withdrawn — wins are essentially never revised, and no revision occurred here.

### 5.4 — Production-path defects found (code)

1. **`hasMidPeriodPickup` mis-flags P1 onto the daily-stats fallback.** Two artifact roster rows — `Shohei Ohtani (Pitcher)` (`acquiredAt` 2026-03-29, synthetic row created late) and `Andrew Vaughn` (`acquiredAt` 2026-03-25T12:00, noon on period start day) — register as "mid-period acquisitions," so `computeTeamStatsFromDb` routes P1 through `computeWithDailyStats`. The daily table has the documented 3/25–3/28 cold-start gap, so **the live P1 standings are currently the undercounted numbers** (the June 8 "stale" values — they were never cache-only). Fix: normalize the two timestamps to period start, and compare calendar dates (not timestamps) in `hasMidPeriodPickup`.
2. **Period 3 has regressed to the daily path.** Three real mid-period wire adds (DMK: Carson Spiers + Aaron Ashby on 5/22; SKD: Chase Dollander on 6/3) correctly trigger the ADR-013 fallback — but the daily table's doubleheader collapse makes the whole period slightly wrong (e.g. DMK K 154 vs FG 152). The verified-correct P3 numbers come from the PSP path. Fix direction (todo): hybrid attribution — PSP rows for boundary-aligned players, daily ownership-windows only for mid-period acquisitions.
3. **Closed periods are never re-synced.** Any boundary edit or late MLB stat correction after a period closes is permanently invisible. Fix direction: one-shot re-sync of a period's PSP ~3 days after period close (or after any boundary edit), via the existing `POST /api/admin/sync-stats {periodId}`.
4. **Audit-tooling note:** `src/scripts/audit_period.ts` classifies hitters/pitchers by *current* `assignedPosition` (drops a currently-IL'd pitcher's stats) and double-counts drop-and-re-add players (overlap attribution, no dedup). Its output diverges from production for exactly those cases — do not use it as the source of truth; use the production `computeTeamStatsFromDb` path.

### 5.5 — Remediation checklist

- [ ] Data: fix `acquiredAt` for the two P1 artifact roster rows (Ohtani synthetic pitcher → 2026-03-25T00:00Z; Andrew Vaughn → 2026-03-25T00:00Z).
- [ ] Data: `POST /api/admin/sync-stats {periodId: 35}` to rebuild P1 PSP under the correct boundary, then `POST /api/admin/recompute-period-cache` for P1.
- [ ] Code: date-normalize the `hasMidPeriodPickup` comparison (acquisitions on the period start date are boundary-aligned, not mid-period).
- [ ] Code (follow-up): hybrid PSP+daily attribution for periods with real mid-period pickups, so P3+ stays on accurate PSP data for boundary-aligned players.
- [ ] Process: re-sync each period's PSP once, ~3 days after it closes.

---

*Last updated June 9, 2026 (PM). Section 5 added: P1 boundary-inflation root cause + exact FG reconciliation for all closed periods; Sections 3.3/3.4 corrected (BBRef pitcher decisions: 15W/166K, all sources agree); Section 4.5 superseded. Earlier corrections: TeamStatsPeriod stale-cache circular bug fixed (PR #391); admin recompute endpoint deployed.*
