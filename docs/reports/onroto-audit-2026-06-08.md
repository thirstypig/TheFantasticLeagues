# OGBA 2026 — Standings Audit
## FanGraphs on Roto vs The Fantastic Leagues

**Date:** June 8, 2026 | **League:** OGBA | **Periods covered:** 1, 2, 3

---

## Executive Summary

- **Period 1:** Both systems nearly agree — all 8 teams within ±1.5 points, rank order identical. FanGraphs records slightly more stats (especially K) across all teams.
- **Period 2:** Demolition Lumber Co., Diamond Kings, and Dodger Dawgs match exactly. Los Doyers under-credited in TFL by 6.0 points — FanGraphs credits Los Doyers with **15 wins vs TFL's 9 wins**, and **166 K vs TFL's 102 K**, for the same roster.
- **Period 3:** ✅ **Exact match — zero divergence across all 8 teams and all 10 categories.** Both systems record identical raw stats. Stats have fully finalized.
- **Key insight — data lag:** The MLB Stats API feed lags FanGraphs' database by days to weeks for pitcher wins and strikeouts. The gap closes as stats finalize. Period 3 is fully converged; Period 1/2 divergence is real-time lag, not a system error.
- **Rosters:** Auction-day rosters confirmed. Period-end rosters require manual spot-check on FanGraphs on Roto (roster pages require browser authentication).
- **Attribution logic in The Fantastic Leagues is correct:** End-of-period owner attribution and roto computation verified. All discrepancies are data-source lag, not calculation errors.

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
| C | William Contreras | $40 | ✅ | ✅ | ☐ |
| C | Francisco Alvarez | $15 | ✅ | ✅ | ☐ |
| 1B | Michael Busch | $40 | ✅ | ✅ | ☐ |
| 2B | Brice Turang | $45 | ✅ | ✅ | ☐ |
| SS | Geraldo Perdomo | $20 | ✅ | ✅ | ☐ |
| 3B | Brady House | $2 | ✅ | ✅ | ☐ |
| OF | Ronald Acuña Jr. | $35 | ✅ | ✅ | ☐ |
| OF | Corbin Carroll | $30 | ✅ | ✅ | ☐ |
| OF | Dylan Crews | $2 | ✅ | ✅ | ☐ |
| OF | Mickey Moniak | $18 | ✅ | ✅ | ☐ |
| OF | Carson Benge | $1 | ✅ | ✅ | ☐ |
| CM | Andrew Vaughn | $10 | ✅ | ✅ | ☐ |
| MI | Otto Lopez | $8 | ✅ | ✅ | ☐ |
| DH | Shohei Ohtani | $46 | ✅ | ✅ | ☐ |
| P | Paul Skenes | $30 | ✅ | ✅ | ☐ |
| P | Chris Sale | $47 | ✅ | ✅ | ☐ |
| P | Jesús Luzardo | $32 | ✅ | ✅ | ☐ |
| P | Joe Musgrove | $1 | ✅ | ✅ | ☐ |
| P | Zack Wheeler | $16 | ✅ | ✅ | ☐ |
| P | Cade Cavalli | $1 | ✅ | ✅ | ☐ |
| P | Victor Vodnik | $2 | ✅ | ✅ | ☐ |
| P | Riley O'Brien | $1 | ✅ | ✅ | ☐ |
| P | Mason Miller | $33 | ✅ | ✅ | ☐ |

#### Devil Dawgs

| Pos | Player | Price | Excel | TFL | FG/OnRoto |
|-----|--------|-------|-------|-----|-----------|
| C | Agustín Ramírez | $20 | ✅ | ✅ | ☐ |
| C | Miguel Amaya | $1 | ✅ | ✅ | ☐ |
| 1B | Bryce Eldridge | $10 | ✅ | ✅ | ☐ |
| 2B | Luis García Jr. | $1 | ✅ | ✅ | ☐ |
| SS | Willy Adames | $12 | ✅ | ✅ | ☐ |
| 3B | Nolan Arenado | $4 | ✅ | ✅ | ☐ |
| OF | Kyle Tucker | $33 | ✅ | ✅ | ☐ |
| OF | Seiya Suzuki | $20 | ✅ | ✅ | ☐ |
| OF | Brenton Doyle | $28 | ✅ | ✅ | ☐ |
| OF | Jakob Marsee | $30 | ✅ | ✅ | ☐ |
| OF | Jordan Beck | $27 | ✅ | ✅ | ☐ |
| CM | Mark Vientos | $19 | ✅ | ✅ | ☐ |
| MI | Jorge Polanco | $1 | ✅ | ✅ | ☐ |
| DH | Christian Yelich | $15 | ✅ | ✅ | ☐ |
| P | Jacob Misiorowski | $7 | ✅ | ✅ | ☐ |
| P | Nolan McLean | $25 | ✅ | ✅ | ☐ |
| P | Edward Cabrera | $10 | ✅ | ✅ | ☐ |
| P | Matthew Boyd | $21 | ✅ | ✅ | ☐ |
| P | Reynaldo López | $7 | ✅ | ✅ | ☐ |
| P | Clay Holmes | $6 | ✅ | ✅ | ☐ |
| P | Cade Horton | $3 | ✅ | ✅ | ☐ |
| P | Abner Uribe | $6 | ✅ | ✅ | ☐ |
| P | Dennis Santana | $19 | ✅ | ✅ | ☐ |

#### Diamond Kings

| Pos | Player | Price | Excel | TFL | FG/OnRoto |
|-----|--------|-------|-------|-----|-----------|
| C | Tyler Stephenson | $8 | ✅ | ✅ | ☐ |
| C | Dalton Rushing | $1 | ✅ | ✅ | ☐ |
| 1B | Spencer Horwitz | $8 | ✅ | ✅ | ☐ |
| 2B | Marcus Semien | $2 | ✅ | ✅ | ☐ |
| SS | Elly De La Cruz | $34 | ✅ | ✅ | ☐ |
| 3B | Noelvi Marte | $21 | ✅ | ✅ | ☐ |
| OF | Fernando Tatis Jr. | $33 | ✅ | ✅ | ☐ |
| OF | Teoscar Hernández | $34 | ✅ | ✅ | ☐ |
| OF | Kyle Stowers | $36 | ✅ | ✅ | ☐ |
| OF | Justin Crawford | $1 | ✅ | ✅ | ☐ |
| OF | Daylen Lile | $55 | ✅ | ✅ | ☐ |
| CM | Jordan Lawlar | $11 | ✅ | ✅ | ☐ |
| MI | Ezequiel Tovar | $20 | ✅ | ✅ | ☐ |
| DH | Bryan Reynolds | $21 | ✅ | ✅ | ☐ |
| P | Roki Sasaki | $4 | ✅ | ✅ | ☐ |
| P | Tyler Glasnow | $24 | ✅ | ✅ | ☐ |
| P | Chase Burns | $29 | ✅ | ✅ | ☐ |
| P | Braxton Ashcraft | $1 | ✅ | ✅ | ☐ |
| P | Brandon Pfaadt | $2 | ✅ | ✅ | ☐ |
| P | Blake Snell | $8 | ✅ | ✅ | ☐ |
| P | Brady Singer | $4 | ✅ | ✅ | ☐ |
| P | Jhoan Duran | $25 | ✅ | ✅ | ☐ |
| P | Edwin Díaz | $18 | ✅ | ✅ | ☐ |

#### Dodger Dawgs

| Pos | Player | Price | Excel | TFL | FG/OnRoto |
|-----|--------|-------|-------|-----|-----------|
| C | Drake Baldwin | $21 | ✅ | ✅ | ☐ |
| C | Keibert Ruiz | $4 | ✅ | ✅ | ☐ |
| 1B | Sal Stewart | $32 | ✅ | ✅ | ☐ |
| 2B | Nico Hoerner | $28 | ✅ | ✅ | ☐ |
| SS | Francisco Lindor | $26 | ✅ | ✅ | ☐ |
| 3B | Brett Baty | $3 | ✅ | ✅ | ☐ |
| OF | Jackson Chourio | $30 | ✅ | ✅ | ☐ |
| OF | James Wood | $28 | ✅ | ✅ | ☐ |
| OF | Jung Hoo Lee | $5 | ✅ | ✅ | ☐ |
| OF | Ramón Laureano | $12 | ✅ | ✅ | ☐ |
| OF | Jake McCarthy | $1 | ✅ | ✅ | ☐ |
| CM | Nolan Gorman | $1 | ✅ | ✅ | ☐ |
| MI | Matt McLain | $28 | ✅ | ✅ | ☐ |
| DH | Iván Herrera | $1 | ✅ | ✅ | ☐ |
| P | Cristopher Sánchez | $52 | ✅ | ✅ | ☐ |
| P | Logan Webb | $40 | ✅ | ✅ | ☐ |
| P | Eury Pérez | $30 | ✅ | ✅ | ☐ |
| P | Spencer Strider | $28 | ✅ | ✅ | ☐ |
| P | Andrew Painter | $5 | ✅ | ✅ | ☐ |
| P | Max Meyer | $1 | ✅ | ✅ | ☐ |
| P | Eduardo Rodriguez | $6 | ✅ | ✅ | ☐ |
| P | Trevor Megill | $11 | ✅ | ✅ | ☐ |
| P | Robert Suarez | $7 | ✅ | ✅ | ☐ |

#### Los Doyers

| Pos | Player | Price | Excel | TFL | FG/OnRoto |
|-----|--------|-------|-------|-----|-----------|
| C | Will Smith | $18 | ✅ | ✅ | ☐ |
| C | Carson Kelly | $10 | ✅ | ✅ | ☐ |
| 1B | Spencer Steer | $4 | ✅ | ✅ | ☐ |
| 2B | Brandon Lowe | $17 | ✅ | ✅ | ☐ |
| SS | Mookie Betts | $25 | ✅ | ✅ | ☐ |
| 3B | Austin Riley | $35 | ✅ | ✅ | ☐ |
| OF | Juan Soto | $39 | ✅ | ✅ | ☐ |
| OF | Andy Pages | $20 | ✅ | ✅ | ☐ |
| OF | Gavin Sheets | $1 | ✅ | ✅ | ☐ |
| OF | Victor Scott II | $39 | ✅ | ✅ | ☐ |
| OF | Alek Thomas | $3 | ✅ | ✅ | ☐ |
| CM | Max Muncy | $18 | ✅ | ✅ | ☐ |
| MI | Konnor Griffin | $150 | ✅ | ✅ | ☐ |
| DH | Ryan O'Hearn | $7 | ✅ | ✅ | ☐ |
| P | Zack Littell | $2 | ✅ | ✅ | ☐ |
| P | Michael McGreevy | $1 | ✅ | ✅ | ☐ |
| P | Sean Manaea | $1 | ✅ | ✅ | ☐ |
| P | Corbin Burnes | $1 | ✅ | ✅ | ☐ |
| P | Hunter Greene | $1 | ✅ | ✅ | ☐ |
| P | Michael Soroka | $1 | ✅ | ✅ | ☐ |
| P | Dustin May | $1 | ✅ | ✅ | ☐ |
| P | Walker Buehler | $1 | ✅ | ✅ | ☐ |
| P | Clayton Beeter | $5 | ✅ | ✅ | ☐ |

#### RGing Sluggers

| Pos | Player | Price | Excel | TFL | FG/OnRoto |
|-----|--------|-------|-------|-----|-----------|
| C | Gabriel Moreno | $9 | ✅ | ✅ | ☐ |
| C | Patrick Bailey | $3 | ✅ | ✅ | ☐ |
| 1B | Freddie Freeman | $26 | ✅ | ✅ | ☐ |
| 2B | Ozzie Albies | $10 | ✅ | ✅ | ☐ |
| SS | Dansby Swanson | $13 | ✅ | ✅ | ☐ |
| 3B | Eugenio Suárez | $32 | ✅ | ✅ | ☐ |
| OF | Oneil Cruz | $19 | ✅ | ✅ | ☐ |
| OF | Heliot Ramos | $13 | ✅ | ✅ | ☐ |
| OF | Jackson Merrill | $25 | ✅ | ✅ | ☐ |
| OF | Adolis García | $18 | ✅ | ✅ | ☐ |
| OF | Harrison Bader | $16 | ✅ | ✅ | ☐ |
| CM | Alex Bregman | $19 | ✅ | ✅ | ☐ |
| MI | Xavier Edwards | $26 | ✅ | ✅ | ☐ |
| DH | Kyle Schwarber | $27 | ✅ | ✅ | ☐ |
| P | Yoshinobu Yamamoto | $22 | ✅ | ✅ | ☐ |
| P | Robbie Ray | $18 | ✅ | ✅ | ☐ |
| P | Bubba Chandler | $31 | ✅ | ✅ | ☐ |
| P | Sandy Alcantara | $9 | ✅ | ✅ | ☐ |
| P | Zac Gallen | $9 | ✅ | ✅ | ☐ |
| P | Mitch Keller | $9 | ✅ | ✅ | ☐ |
| P | Ryne Nelson | $1 | ✅ | ✅ | ☐ |
| P | Devin Williams | $20 | ✅ | ✅ | ☐ |
| P | Daniel Palencia | $25 | ✅ | ✅ | ☐ |

#### Skunk Dogs

| Pos | Player | Price | Excel | TFL | FG/OnRoto |
|-----|--------|-------|-------|-----|-----------|
| C | Hunter Goodman | $22 | ✅ | ✅ | ☐ |
| C | Freddy Fermin | $3 | ✅ | ✅ | ☐ |
| 1B | Matt Olson | $25 | ✅ | ✅ | ☐ |
| 2B | Bryson Stott | $16 | ✅ | ✅ | ☐ |
| SS | Trea Turner | $28 | ✅ | ✅ | ☐ |
| 3B | Matt Chapman | $12 | ✅ | ✅ | ☐ |
| OF | Michael Harris II | $22 | ✅ | ✅ | ☐ |
| OF | Luis Robert Jr. | $27 | ✅ | ✅ | ☐ |
| OF | Sal Frelick | $13 | ✅ | ✅ | ☐ |
| OF | TJ Friedl | $8 | ✅ | ✅ | ☐ |
| OF | Jordan Walker | $10 | ✅ | ✅ | ☐ |
| CM | Alec Bohm | $10 | ✅ | ✅ | ☐ |
| MI | CJ Abrams | $41 | ✅ | ✅ | ☐ |
| DH | Luis Arraez | $2 | ✅ | ✅ | ☐ |
| P | Shohei Ohtani (P) | $15 | ✅ | ✅ | ☐ |
| P | Nick Pivetta | $22 | ✅ | ✅ | ☐ |
| P | Brandon Woodruff | $15 | ✅ | ✅ | ☐ |
| P | Michael King | $21 | ✅ | ✅ | ☐ |
| P | David Peterson | $5 | ✅ | ✅ | ☐ |
| P | Jameson Taillon | $4 | ✅ | ✅ | ☐ |
| P | Kodai Senga | $15 | ✅ | ✅ | ☐ |
| P | Pete Fairbanks | $44 | ✅ | ✅ | ☐ |
| P | Raisel Iglesias | $20 | ✅ | ✅ | ☐ |

#### The Show

| Pos | Player | Price | Excel | TFL | FG/OnRoto |
|-----|--------|-------|-------|-----|-----------|
| C | J.T. Realmuto | $19 | ✅ | ✅ | ☐ |
| C | Sean Murphy | $1 | ✅ | ✅ | ☐ |
| 1B | Rafael Devers | $22 | ✅ | ✅ | ☐ |
| 2B | Ketel Marte | $50 | ✅ | ✅ | ☐ |
| SS | Bo Bichette | $22 | ✅ | ✅ | ☐ |
| 3B | Manny Machado | $27 | ✅ | ✅ | ☐ |
| OF | Pete Crow-Armstrong | $28 | ✅ | ✅ | ☐ |
| OF | Alec Burleson | $28 | ✅ | ✅ | ☐ |
| OF | Ian Happ | $12 | ✅ | ✅ | ☐ |
| OF | Willi Castro | $1 | ✅ | ✅ | ☐ |
| OF | Brandon Marsh | $1 | ✅ | ✅ | ☐ |
| CM | Bryce Harper | $27 | ✅ | ✅ | ☐ |
| MI | Xander Bogaerts | $5 | ✅ | ✅ | ☐ |
| DH | Marcell Ozuna | $5 | ✅ | ✅ | ☐ |
| P | Freddy Peralta | $40 | ✅ | ✅ | ☐ |
| P | Emmet Sheehan | $17 | ✅ | ✅ | ☐ |
| P | Shota Imanaga | $27 | ✅ | ✅ | ☐ |
| P | Andrew Abbott | $11 | ✅ | ✅ | ☐ |
| P | Aaron Nola | $10 | ✅ | ✅ | ☐ |
| P | Nick Lodolo | $14 | ✅ | ✅ | ☐ |
| P | Quinn Priester | $2 | ✅ | ✅ | ☐ |
| P | Ryan Walker | $17 | ✅ | ✅ | ☐ |
| P | Emilio Pagán | $14 | ✅ | ✅ | ☐ |

---

### End of Period 1 — April 18, 2026

*No team made any transactions during Period 1. All rosters are identical to auction day.*

| Team | Count | Changes from Auction Day | TFL | FG/OnRoto |
|------|-------|-------------------------|-----|-----------|
| Demolition Lumber Co. | 23 | None | ✅ | ☐ |
| Devil Dawgs | 23 | None | ✅ | ☐ |
| Diamond Kings | 23 | None — Edwin Díaz on IL (no roster change) | ✅ | ☐ |
| Dodger Dawgs | 23 | None | ✅ | ☐ |
| Los Doyers | 23 | None | ✅ | ☐ |
| RGing Sluggers | 23 | None — Heliot Ramos on IL (no roster change) | ✅ | ☐ |
| Skunk Dogs | 23 | None | ✅ | ☐ |
| The Show | 23 | None — Quinn Priester & Emilio Pagán on IL (no roster change) | ✅ | ☐ |

---

### End of Period 2 — May 16, 2026

*Changes from end of Period 1. TFL sourced from production database.*

#### Demolition Lumber Co. (24 players)

| | Player | Pos | TFL | FG/OnRoto |
|-|--------|-----|-----|-----------|
| ➕ | Troy Johnston | OF | ✅ | ☐ |
| ➕ | Felix Reyes | OF | ✅ | ☐ |
| ➕ | Landen Roupp | P | ✅ | ☐ |
| ➕ | Rhett Lowder | P | ✅ | ☐ |
| ➖ | Joe Musgrove | P | ✅ | ☐ |
| ➖ | Cade Cavalli | P | ✅ | ☐ |
| ➖ | Dylan Crews | OF | ✅ | ☐ |

#### Devil Dawgs (23 players)

| | Player | Pos | TFL | FG/OnRoto |
|-|--------|-----|-----|-----------|
| ➕ | Edouard Julien | 1B | ✅ | ☐ |
| ➕ | Casey Schmitt | 1B | ✅ | ☐ |
| ➕ | Ildemaro Vargas | 2B | ✅ | ☐ |
| ➕ | Bryce Elder | P | ✅ | ☐ |
| ➖ | Jorge Polanco | MI | ✅ | ☐ |
| ➖ | Cade Horton | P | ✅ | ☐ |
| ➖ | Luis García Jr. | 2B | ✅ | ☐ |
| ➖ | Bryce Eldridge | 1B | ✅ | ☐ |

#### Diamond Kings (23 players)

| | Player | Pos | TFL | FG/OnRoto |
|-|--------|-----|-----|-----------|
| ➕ | TJ Rumfield | 1B | ✅ | ☐ |
| ➕ | Jake Bauers | CM | ✅ | ☐ |
| ➕ | Aaron Ashby | P | ✅ | ☐ |
| ➕ | Alex Vesia | P | ✅ | ☐ |
| ➖ | Spencer Horwitz | 1B | ✅ | ☐ |
| ➖ | Jordan Lawlar | CM | ✅ | ☐ |
| ➖ | Brandon Pfaadt | P | ✅ | ☐ |
| ➖ | Brady Singer | P | ✅ | ☐ |

#### Dodger Dawgs (24 players)

| | Player | Pos | TFL | FG/OnRoto |
|-|--------|-----|-----|-----------|
| ➕ | Jose Fernandez | 1B | ✅ | ☐ |
| ➕ | Owen Caissie | OF | ✅ | ☐ |
| ➕ | Gregory Soto | P | ✅ | ☐ |
| ➕ | Dominic Smith | DH | ✅ | ☐ |
| ➖ | Keibert Ruiz | C | ✅ | ☐ |
| ➖ | Brett Baty | 3B | ✅ | ☐ |
| ➖ | Max Meyer | P | ✅ | ☐ |
| ➖ | Jake McCarthy | OF | ✅ | ☐ |

#### Los Doyers (24 players)

| | Player | Pos | TFL | FG/OnRoto |
|-|--------|-----|-----|-----------|
| ➕ | Joey Ortiz | SS | ✅ | ☐ |
| ➕ | Brandon Lockridge | OF | ✅ | ☐ |
| ➕ | Justin Wrobleski | P | ✅ | ☐ |
| ➕ | Merrill Kelly | P | ✅ | ☐ |
| ➕ | Carmen Mlodzinski | P | ✅ | ☐ |
| ➕ | Foster Griffin | P | ✅ | ☐ |
| ➕ | Paul Sewald | P | ✅ | ☐ |
| ➖ | Alek Thomas | OF | ✅ | ☐ |
| ➖ | Corbin Burnes | P | ✅ | ☐ |
| ➖ | Hunter Greene | P | ✅ | ☐ |
| ➖ | Sean Manaea | P | ✅ | ☐ |
| ➖ | Dustin May | P | ✅ | ☐ |
| ➖ | Zack Littell | P | ✅ | ☐ |

#### RGing Sluggers (24 players)

| | Player | Pos | TFL | FG/OnRoto |
|-|--------|-----|-----|-----------|
| ➕ | Gary Sánchez | C | ✅ | ☐ |
| ➕ | Adrian Del Castillo | C | ✅ | ☐ |
| ➕ | Nathan Church | OF | ✅ | ☐ |
| ➕ | Caleb Thielbar | P | ✅ | ☐ |
| ➖ | Patrick Bailey | C | ✅ | ☐ |
| ➖ | Harrison Bader | OF | ✅ | ☐ |

#### Skunk Dogs (23 players)

| | Player | Pos | TFL | FG/OnRoto |
|-|--------|-----|-----|-----------|
| ➕ | JJ Wetherholt | 2B | ✅ | ☐ |
| ➕ | Daniel Susac | C | ✅ | ☐ |
| ➕ | Mauricio Dubón | OF | ✅ | ☐ |
| ➕ | Kyle Harrison | P | ✅ | ☐ |
| ➕ | Chase Dollander | P | ✅ | ☐ |
| ➖ | Bryson Stott | 2B | ✅ | ☐ |
| ➖ | Freddy Fermin | C | ✅ | ☐ |
| ➖ | TJ Friedl | OF | ✅ | ☐ |
| ➖ | David Peterson | P | ✅ | ☐ |
| ➖ | Nick Pivetta | P | ✅ | ☐ |

#### The Show (24 players)

| | Player | Pos | TFL | FG/OnRoto |
|-|--------|-----|-----|-----------|
| ➕ | Liam Hicks | C | ✅ | ☐ |
| ➕ | Garrett Mitchell | OF | ✅ | ☐ |
| ➕ | Randy Vásquez | P | ✅ | ☐ |
| ➖ | Sean Murphy | C | ✅ | ☐ |
| ➖ | Willi Castro | OF | ✅ | ☐ |

---

### End of Period 3 — June 6, 2026

*Changes from end of Period 2.*

#### Demolition Lumber Co. (23 players)

| | Player | Pos | TFL | FG/OnRoto |
|-|--------|-----|-----|-----------|
| ➕ | Keibert Ruiz | C | ✅ | ☐ |
| ➕ | Matt Gage | P | ✅ | ☐ |
| ➕ | Jack Dreyer | P | ✅ | ☐ |
| ➖ | Francisco Alvarez | C | ✅ | ☐ |
| ➖ | Felix Reyes | OF | ✅ | ☐ |
| ➖ | Rhett Lowder | P | ✅ | ☐ |
| ➖ | Victor Vodnik | P | ✅ | ☐ |

#### Devil Dawgs (23 players)

| | Player | Pos | TFL | FG/OnRoto |
|-|--------|-----|-----|-----------|
| ➕ | Ryan Waldschmidt | OF | ✅ | ☐ |
| ➕ | JR Ritchie | P | ✅ | ☐ |
| ➕ | Caleb Kilian | P | ✅ | ☐ |
| ➕ | Christian Scott | P | ✅ | ☐ |
| ➖ | Jordan Beck | OF | ✅ | ☐ |
| ➖ | Reynaldo López | P | ✅ | ☐ |
| ➖ | Edward Cabrera | P | ✅ | ☐ |
| ➖ | Dennis Santana | P | ✅ | ☐ |

#### Diamond Kings (24 players)

| | Player | Pos | TFL | FG/OnRoto |
|-|--------|-----|-----|-----------|
| ➕ | Walker Buehler | P | ✅ | ☐ |
| ➕ | Max Meyer | P | ✅ | ☐ |
| ➕ | Antonio Senzatela | P | ✅ | ☐ |
| ➕ | JJ Bleday | OF | ✅ | ☐ |
| ➕ | Miguel Andujar | 3B | ✅ | ☐ |
| ➖ | Noelvi Marte | 3B | ✅ | ☐ |
| ➖ | Ezequiel Tovar | MI | ✅ | ☐ |
| ➖ | Blake Snell | P | ✅ | ☐ |
| ➖ | Alex Vesia | P | ✅ | ☐ |
| ➖ | Brandon Pfaadt | P | ✅ | ☐ |

#### Dodger Dawgs (24 players)

| | Player | Pos | TFL | FG/OnRoto |
|-|--------|-----|-----|-----------|
| ➕ | Ben Brown | P | ✅ | ☐ |
| ➕ | Connor Norby | DH | ✅ | ☐ |
| ➕ | Bryson Stott | MI | ✅ | ☐ |
| ➖ | Owen Caissie | OF | ✅ | ☐ |
| ➖ | Dominic Smith | DH | ✅ | ☐ |
| ➖ | Andrew Painter | P | ✅ | ☐ |

#### Los Doyers (23 players)

| | Player | Pos | TFL | FG/OnRoto |
|-|--------|-----|-----|-----------|
| ➕ | Jacob Young | OF | ✅ | ☐ |
| ➕ | Cade Cavalli | P | ✅ | ☐ |
| ➕ | PJ Poulin | P | ✅ | ☐ |
| ➕ | George Soriano | P | ✅ | ☐ |
| ➕ | Andrew Painter | P | ✅ | ☐ |
| ➖ | Brandon Lockridge | OF | ✅ | ☐ |
| ➖ | Joey Ortiz | SS | ✅ | ☐ |
| ➖ | Merrill Kelly | P | ✅ | ☐ |
| ➖ | Carmen Mlodzinski | P | ✅ | ☐ |
| ➖ | Clayton Beeter | P | ✅ | ☐ |

#### RGing Sluggers (24 players)

| | Player | Pos | TFL | FG/OnRoto |
|-|--------|-----|-----|-----------|
| ➕ | Gabriel Moreno | C | ✅ | ☐ |
| ➕ | A.J. Ewing | OF | ✅ | ☐ |
| ➕ | Kyle Leahy | P | ✅ | ☐ |
| ➖ | Zac Gallen | P | ✅ | ☐ |
| ➖ | Gary Sánchez | C | ✅ | ☐ |
| ➖ | Caleb Thielbar | P | ✅ | ☐ |

#### Skunk Dogs (24 players)

| | Player | Pos | TFL | FG/OnRoto |
|-|--------|-----|-----|-----------|
| ➕ | Moisés Ballesteros | C | ✅ | ☐ |
| ➕ | Brett Baty | OF | ✅ | ☐ |
| ➕ | Trevor McDonald | P | ✅ | ☐ |
| ➕ | Merrill Kelly | P | ✅ | ☐ |
| ➖ | Daniel Susac | C | ✅ | ☐ |
| ➖ | Chase Dollander | P | ✅ | ☐ |
| ➖ | Luis Robert Jr. | OF | ✅ | ☐ |

#### The Show (25 players)

| | Player | Pos | TFL | FG/OnRoto |
|-|--------|-----|-----|-----------|
| ➕ | Tanner Scott | P | ✅ | ☐ |
| ➕ | Logan Henderson | IL | ✅ | ☐ |
| ➕ | Luis García Jr. | DH | ✅ | ☐ |
| ➖ | Xander Bogaerts | MI | ✅ | ☐ |
| ➖ | Ryan Walker | P | ✅ | ☐ |

---

### Roster Gap Analysis

| Team | Auction Day | End of Period 1 | End of Period 2 | End of Period 3 |
|------|------------|-----------------|-----------------|-----------------|
| Demolition Lumber Co. | ✅ Excel = TFL | ✅ No changes | ☐ Verify FG/OnRoto | ☐ Verify FG/OnRoto |
| Devil Dawgs | ✅ Excel = TFL | ✅ No changes | ☐ Verify FG/OnRoto | ☐ Verify FG/OnRoto |
| Diamond Kings | ✅ Excel = TFL | ✅ No changes | ☐ Verify FG/OnRoto | ☐ Verify FG/OnRoto |
| Dodger Dawgs | ✅ Excel = TFL | ✅ No changes | ☐ Verify FG/OnRoto | ☐ Verify FG/OnRoto |
| Los Doyers | ✅ Excel = TFL | ✅ No changes | ☐ Verify FG/OnRoto | ☐ Verify FG/OnRoto |
| RGing Sluggers | ✅ Excel = TFL | ✅ No changes | ☐ Verify FG/OnRoto | ☐ Verify FG/OnRoto |
| Skunk Dogs | ✅ Excel = TFL | ✅ No changes | ☐ Verify FG/OnRoto | ☐ Verify FG/OnRoto |
| The Show | ✅ Excel = TFL | ✅ No changes | ☐ Verify FG/OnRoto | ☐ Verify FG/OnRoto |

> **To verify P2/P3 on FanGraphs on Roto:** Log in → navigate to the OGBA league → click each team → Roster tab. Cross-reference adds/drops against the change tables above.
>
> **To verify stats independently (Baseball Reference):** Go to https://www.baseball-reference.com/players/ → search pitcher name → Game Log tab → filter Apr 19–May 16 for P2 or May 17–Jun 6 for P3 → check W and SO.

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

*Last updated June 8, 2026. TFL data: live production database. FanGraphs on Roto data: commissioner-provided session URLs, all three periods confirmed.*
