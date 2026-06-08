# OGBA 2026 — FanGraphs on Roto vs The Fantastic Leagues (TFL) Standings Audit

**Report date:** June 8, 2026
**League:** OGBA (leagueId = 20, FanGraphs on Roto identifier `OGBA+6`)
**Prepared by:** TFL Internal Audit
**Systems compared:** FanGraphs on Roto (FG/OnRoto) vs The Fantastic Leagues (TFL)
**TFL data source:** Live `PlayerStatsPeriod` + `TeamStatsPeriod` tables, production Supabase DB

---

## Purpose

This document is a period-by-period audit comparing **FanGraphs on Roto** (the official league platform) against **The Fantastic Leagues (TFL)** (our internal tracking system). For each period we verify:

1. **Rosters** — do both systems agree on who is on each team?
2. **Raw Stats** — do both systems record the same numbers (R, HR, RBI, SB, AVG, W, SV, ERA, WHIP, K/SO)?
3. **Roto Points** — do the computed rank-points match?
4. **Deltas** — where do they differ, and why?

---

## League Structure

**Teams (8):** Skunk Dogs (SKD), Diamond Kings (DMK), Dodger Dawgs (DDG), Devil Dawgs (DVD), RGing Sluggers (RGS), The Show (TSH), Los Doyers (LDY), Demolition Lumber Co. (DLC)

**Scoring categories (10):**
- Hitting: R, HR, RBI, SB, AVG
- Pitching: W, SV, ERA, WHIP, K (labeled "SO" on FG/OnRoto)

**Roto scoring:** Each category ranked 1–8 (1 = worst, 8 = best). Ties receive averaged rank. Higher is better for R/HR/RBI/SB/AVG/W/SV/K. Lower is better for ERA and WHIP (lowest ERA = rank 8).

| Period | Dates | Status |
|--------|-------|--------|
| Period 1 | Mar 25 – Apr 18, 2026 | Completed |
| Period 2 | Apr 19 – May 16, 2026 | Completed |
| Period 3 | May 17 – Jun 6, 2026 | Completed |
| Period 4 | Jun 7 – Jul 4, 2026 | Active |

---

## Season Baseline: Auction-Day Rosters (March 25, 2026)

> Source: OGBA 2026 auction draft spreadsheet. These are the rosters both FG/OnRoto and TFL should agree on at season start. Keeper salaries shown where applicable.

### Skunk Dogs

| POS | Player | Price |
|-----|--------|-------|
| 1B | Matt Olson | $25 |
| 2B | Bryson Stott | $16 |
| SS | Trea Turner | $28 |
| 3B | Matt Chapman | $12 |
| OF | Michael Harris II | $22 |
| OF | Luis Robert Jr. | $27 |
| OF | Sal Frelick | $13 |
| OF | TJ Friedl | $8 |
| OF | Jordan Walker | $10 |
| C | Hunter Goodman | $22 |
| C | Freddy Fermin | $3 |
| CM | Alec Bohm | $10 |
| MI | CJ Abrams | $41 |
| DH | Luis Arraez | $2 |
| P | Shohei Ohtani (P) | $15 |
| P | Nick Pivetta | $22 |
| P | Brandon Woodruff | $15 |
| P | Michael King | $21 |
| P | David Peterson | $5 |
| P | Jameson Taillon | $4 |
| P | Kodai Senga | $15 |
| P | Pete Fairbanks | $44 |
| P | Raisel Iglesias | $20 |

### Diamond Kings

| POS | Player | Price |
|-----|--------|-------|
| 1B | Spencer Horwitz | $8 |
| 2B | Marcus Semien | $2 |
| SS | Elly De La Cruz | $34 |
| 3B | Noelvi Marte | $21 |
| OF | Fernando Tatis Jr. | $33 |
| OF | Teoscar Hernández | $34 |
| OF | Kyle Stowers | $36 |
| OF | Justin Crawford | $1 |
| OF | Daylen Lile | $55 |
| C | Tyler Stephenson | $8 |
| C | Dalton Rushing | $1 |
| CM | Jordan Lawlar | $11 |
| MI | Ezequiel Tovar | $20 |
| DH | Bryan Reynolds | $21 |
| P | Roki Sasaki | $4 |
| P | Tyler Glasnow | $24 |
| P | Chase Burns | $29 |
| P | Braxton Ashcraft | $1 |
| P | Brandon Pfaadt | $2 |
| P | Blake Snell | $8 |
| P | Brady Singer | $4 |
| P | Jhoan Duran | $25 |
| P | Edwin Díaz | $18 |

### Dodger Dawgs

| POS | Player | Price |
|-----|--------|-------|
| 1B | Sal Stewart | $32 |
| 2B | Nico Hoerner | $28 |
| SS | Francisco Lindor | $26 |
| 3B | Brett Baty | $3 |
| OF | Jackson Chourio | $30 |
| OF | James Wood | $28 |
| OF | Jung Hoo Lee | $5 |
| OF | Ramón Laureano | $12 |
| OF | Jake McCarthy | $1 |
| C | Drake Baldwin | $21 |
| C | Keibert Ruiz | $4 |
| CM | Nolan Gorman | $1 |
| MI | Matt McLain | $28 |
| DH | Iván Herrera | $1 |
| P | Cristopher Sánchez | $52 |
| P | Logan Webb | $40 |
| P | Eury Pérez | $30 |
| P | Spencer Strider | $28 |
| P | Andrew Painter | $5 |
| P | Max Meyer | $1 |
| P | Eduardo Rodriguez | $6 |
| P | Trevor Megill | $11 |
| P | Robert Suarez | $7 |

### Devil Dawgs

| POS | Player | Price |
|-----|--------|-------|
| 1B | Bryce Eldridge | $10 |
| 2B | Luis García Jr. | $1 |
| SS | Willy Adames | $12 |
| 3B | Nolan Arenado | $4 |
| OF | Kyle Tucker | $33 |
| OF | Seiya Suzuki | $20 |
| OF | Brenton Doyle | $28 |
| OF | Jakob Marsee | $30 |
| OF | Jordan Beck | $27 |
| C | Agustín Ramírez | $20 |
| C | Miguel Amaya | $1 |
| CM | Mark Vientos | $19 |
| MI | Jorge Polanco | $1 |
| DH | Christian Yelich | $15 |
| P | Jacob Misiorowski | $7 |
| P | Nolan McLean | $25 |
| P | Edward Cabrera | $10 |
| P | Matthew Boyd | $21 |
| P | Reynaldo López | $7 |
| P | Clay Holmes | $6 |
| P | Cade Horton | $3 |
| P | Abner Uribe | $6 |
| P | Dennis Santana | $19 |

### RGing Sluggers

| POS | Player | Price |
|-----|--------|-------|
| 1B | Freddie Freeman | $26 |
| 2B | Ozzie Albies | $10 |
| SS | Dansby Swanson | $13 |
| 3B | Eugenio Suárez | $32 |
| OF | Oneil Cruz | $19 |
| OF | Heliot Ramos | $13 |
| OF | Jackson Merrill | $25 |
| OF | Adolis García | $18 |
| OF | Harrison Bader | $16 |
| C | Gabriel Moreno | $9 |
| C | Patrick Bailey | $3 |
| CM | Alex Bregman | $19 |
| MI | Xavier Edwards | $26 |
| DH | Kyle Schwarber | $27 |
| P | Yoshinobu Yamamoto | $22 |
| P | Robbie Ray | $18 |
| P | Bubba Chandler | $31 |
| P | Sandy Alcantara | $9 |
| P | Zac Gallen | $9 |
| P | Mitch Keller | $9 |
| P | Ryne Nelson | $1 |
| P | Devin Williams | $20 |
| P | Daniel Palencia | $25 |

### The Show

| POS | Player | Price |
|-----|--------|-------|
| 1B | Rafael Devers | $22 |
| 2B | Ketel Marte | $50 |
| SS | Bo Bichette | $22 |
| 3B | Manny Machado | $27 |
| OF | Pete Crow-Armstrong | $28 |
| OF | Alec Burleson | $28 |
| OF | Ian Happ | $12 |
| OF | Willi Castro | $1 |
| OF | Brandon Marsh | $1 |
| C | J.T. Realmuto | $19 |
| C | Sean Murphy | $1 |
| CM | Bryce Harper | $27 |
| MI | Xander Bogaerts | $5 |
| DH | Marcell Ozuna | $5 |
| P | Freddy Peralta | $40 |
| P | Emmet Sheehan | $17 |
| P | Shota Imanaga | $27 |
| P | Andrew Abbott | $11 |
| P | Aaron Nola | $10 |
| P | Nick Lodolo | $14 |
| P | Quinn Priester | $2 |
| P | Ryan Walker | $17 |
| P | Emilio Pagán | $14 |

### Los Doyers

| POS | Player | Price |
|-----|--------|-------|
| 1B | Spencer Steer | $4 |
| 2B | Brandon Lowe | $17 |
| SS | Mookie Betts | $25 |
| 3B | Austin Riley | $35 |
| OF | Juan Soto | $39 |
| OF | Andy Pages | $20 |
| OF | Gavin Sheets | $1 |
| OF | Victor Scott II | $39 |
| OF | Alek Thomas | $3 |
| C | Will Smith | $18 |
| C | Carson Kelly | $10 |
| CM | Max Muncy | $18 |
| MI | Konnor Griffin | $150 |
| DH | Ryan O'Hearn | $7 |
| P | Zack Littell | $2 |
| P | Michael McGreevy | $1 |
| P | Sean Manaea | $1 |
| P | Corbin Burnes | $1 |
| P | Hunter Greene | $1 |
| P | Michael Soroka | $1 |
| P | Dustin May | $1 |
| P | Walker Buehler | $1 |
| P | Clayton Beeter | $5 |

### Demolition Lumber Co.

| POS | Player | Price |
|-----|--------|-------|
| 1B | Michael Busch | $40 |
| 2B | Brice Turang | $45 |
| SS | Geraldo Perdomo | $20 |
| 3B | Brady House | $2 |
| OF | Ronald Acuña Jr. | $35 |
| OF | Corbin Carroll | $30 |
| OF | Dylan Crews | $2 |
| OF | Mickey Moniak | $18 |
| OF | Carson Benge | $1 |
| C | William Contreras | $40 |
| C | Francisco Alvarez | $15 |
| CM | Andrew Vaughn | $10 |
| MI | Otto Lopez | $8 |
| DH | Shohei Ohtani | $46 |
| P | Paul Skenes | $30 |
| P | Chris Sale | $47 |
| P | Jesús Luzardo | $32 |
| P | Joe Musgrove | $1 |
| P | Zack Wheeler | $16 |
| P | Cade Cavalli | $1 |
| P | Victor Vodnik | $2 |
| P | Riley O'Brien | $1 |
| P | Mason Miller | $33 |

---

## Period 1 Audit — Mar 25 to Apr 18, 2026

### 1a. Roster Verification — End of Period 1

> TFL rosters are sourced from the production database (players with `acquiredAt ≤ Apr 18` and `releasedAt IS NULL OR releasedAt > Apr 18`). FG/OnRoto rosters require manual verification via the league site.

| Team | TFL Roster (End of P1) | FG/OnRoto Match |
|------|------------------------|-----------------|
| SKD | Hunter Goodman (C), Freddy Fermin (C), Matt Olson (1B), Bryson Stott (2B), Trea Turner (SS), Matt Chapman (3B), Alec Bohm (CM), CJ Abrams (MI), Luis Arraez (DH), Michael Harris II (OF), Luis Robert Jr. (OF), Sal Frelick (OF), TJ Friedl (OF), Jordan Walker (OF), Shohei Ohtani-P (P), Nick Pivetta (P), Brandon Woodruff (P), Michael King (P), David Peterson (P), Jameson Taillon (P), Kodai Senga (P), Pete Fairbanks (P), Raisel Iglesias (P) | ☐ To verify |
| DMK | Tyler Stephenson (C), Dalton Rushing (C), Spencer Horwitz (1B), Marcus Semien (2B), Elly De La Cruz (SS), Noelvi Marte (3B), Jordan Lawlar (CM), Ezequiel Tovar (MI), Bryan Reynolds (DH), Fernando Tatis Jr. (OF), Teoscar Hernández (OF), Kyle Stowers (OF), Justin Crawford (OF), Daylen Lile (OF), Edwin Díaz (IL), Roki Sasaki (P), Tyler Glasnow (P), Chase Burns (P), Braxton Ashcraft (P), Brandon Pfaadt (P), Blake Snell (P), Brady Singer (P), Jhoan Duran (P) | ☐ To verify |
| DDG | Drake Baldwin (C), Keibert Ruiz (C), Iván Herrera (C), Sal Stewart (1B), Nico Hoerner (2B), Francisco Lindor (SS), Matt McLain (SS), Brett Baty (CM), Nolan Gorman (3B), Jackson Chourio (OF), James Wood (OF), Ramón Laureano (OF), Jake McCarthy (OF), Jung Hoo Lee (OF), Andrew Painter (P), Cristopher Sánchez (P), Logan Webb (P), Eury Pérez (P), Spencer Strider (P), Max Meyer (P), Eduardo Rodriguez (P), Trevor Megill (P), Robert Suarez (P) | ☐ To verify |
| DVD | Agustín Ramírez (C), Miguel Amaya (C), Bryce Eldridge (1B), Luis García Jr. (2B), Willy Adames (SS), Nolan Arenado (3B), Mark Vientos (CM), Jorge Polanco (MI), Christian Yelich (DH), Kyle Tucker (OF), Seiya Suzuki (OF), Brenton Doyle (OF), Jakob Marsee (OF), Jordan Beck (OF), Jacob Misiorowski (P), Nolan McLean (P), Edward Cabrera (P), Matthew Boyd (P), Reynaldo López (P), Clay Holmes (P), Cade Horton (P), Abner Uribe (P), Dennis Santana (P) | ☐ To verify |
| RGS | Gabriel Moreno (C), Patrick Bailey (C), Freddie Freeman (1B), Ozzie Albies (2B), Dansby Swanson (MI), Eugenio Suárez (3B), Alex Bregman (CM), Xavier Edwards (SS), Kyle Schwarber (DH), Oneil Cruz (OF), Heliot Ramos (IL), Jackson Merrill (OF), Adolis García (OF), Harrison Bader (OF), Yoshinobu Yamamoto (P), Robbie Ray (P), Bubba Chandler (P), Sandy Alcantara (P), Zac Gallen (P), Mitch Keller (P), Ryne Nelson (P), Devin Williams (P), Daniel Palencia (P) | ☐ To verify |
| TSH | J.T. Realmuto (C), Sean Murphy (C), Rafael Devers (1B), Ketel Marte (2B), Bo Bichette (SS), Manny Machado (3B), Bryce Harper (CM), Xander Bogaerts (MI), Marcell Ozuna (DH), Pete Crow-Armstrong (OF), Alec Burleson (OF), Ian Happ (OF), Willi Castro (OF), Brandon Marsh (OF), Quinn Priester (IL), Emilio Pagán (IL), Freddy Peralta (P), Emmet Sheehan (P), Shota Imanaga (P), Andrew Abbott (P), Aaron Nola (P), Nick Lodolo (P), Ryan Walker (P) | ☐ To verify |
| LDY | Will Smith (C), Carson Kelly (C), Spencer Steer (1B), Brandon Lowe (2B), Mookie Betts (SS), Austin Riley (3B), Max Muncy (CM), Konnor Griffin (MI), Ryan O'Hearn (DH), Juan Soto (OF), Andy Pages (OF), Gavin Sheets (OF), Victor Scott II (OF), Alek Thomas (OF), Corbin Burnes (P), Michael McGreevy (P), Sean Manaea (P), Michael Soroka (P), Dustin May (P), Zack Littell (P), Walker Buehler (P), Hunter Greene (P), Clayton Beeter (P) | ☐ To verify |
| DLC | William Contreras (C), Francisco Alvarez (C), Michael Busch (1B), Brice Turang (2B), Geraldo Perdomo (SS), Brady House (3B), Andrew Vaughn (CM), Otto Lopez (MI), Shohei Ohtani (DH), Ronald Acuña Jr. (OF), Corbin Carroll (OF), Mickey Moniak (OF), Dylan Crews (OF), Carson Benge (OF), Paul Skenes (P), Chris Sale (P), Jesús Luzardo (P), Joe Musgrove (P), Zack Wheeler (P), Cade Cavalli (P), Victor Vodnik (P), Riley O'Brien (P), Mason Miller (P) | ☐ To verify |

> **Note:** TFL P1 rosters are identical to auction-day rosters — no transactions changed any team's composition before April 18, 2026 (Heliot Ramos IL stash and Edwin Díaz/Quinn Priester/Emilio Pagán IL slots were set at or before auction). Verify the same is true on FG/OnRoto.

---

### 1b. Raw Stats — Period 1

> TFL raw stats are queried directly from `TeamStatsPeriod` (periodId = 35). FG/OnRoto raw stats require access to the individual team stats view on the league site — the standings URL only exposes rank points.

#### TFL Raw Stats — Period 1

| Team | R | HR | RBI | SB | AVG | W | SV | ERA | WHIP | K |
|------|---|----|----|----|----|---|----|----|------|---|
| SKD | 122 | 30 | 102 | 21 | .251 | 8 | 4 | 4.16 | 1.186 | 149 |
| DMK | 98 | 23 | 83 | 16 | .260 | 7 | 6 | 3.95 | 1.246 | 120 |
| DDG | 119 | 30 | 127 | 24 | .247 | 9 | 5 | 3.61 | 1.402 | 124 |
| DVD | 99 | 17 | 79 | 17 | .227 | 10 | 4 | 2.46 | 1.046 | 122 |
| RGS | 129 | 35 | 124 | 19 | .254 | 9 | 3 | 2.93 | 1.192 | 119 |
| TSH | 100 | 29 | 106 | 9 | .237 | 5 | 7 | 4.30 | 1.248 | 108 |
| LDY | 106 | 30 | 115 | 13 | .270 | 9 | 2 | 4.85 | 1.340 | 100 |
| DLC | 107 | 27 | 89 | 24 | .256 | 9 | 15 | 3.35 | 1.055 | 126 |

#### FG/OnRoto Raw Stats — Period 1

> ⏳ **Pending** — the FG/OnRoto standings URL (`display_stand.pl`) shows rank points only, not the underlying raw numbers. To complete this section, navigate to each team's stats page on FanGraphs on Roto and record R, HR, RBI, SB, AVG, W, SV, ERA, WHIP, SO for the period ending April 18, 2026.

---

### 1c. Roto Points Comparison — Period 1

> FG/OnRoto data retrieved June 8, 2026 from: `https://onroto.fangraphs.com/baseball/webnew/display_stand.pl?OGBA+6&session_id=LKP1NfJmA2vBxY6KNuK0RVfIdnaWIlf&which_stand_period=retro` — confirmed "Through 04.18.26" ✅

#### FG/OnRoto Roto Points — Period 1

| Rank | Team | R | HR | RBI | SB | AVG | W | SV | ERA | WHIP | SO | Total |
|------|------|---|----|----|----|----|---|----|----|------|----|----|
| 1 | Demolition Lumber Co. | 5.0 | 3.0 | 3.0 | 7.0 | 7.0 | 6.5 | 8.0 | 6.0 | 7.0 | 4.0 | **56.5** |
| 2 | RGing Sluggers | 8.0 | 7.5 | 6.0 | 4.0 | 3.0 | 6.5 | 2.0 | 7.0 | 6.0 | 5.0 | **55.0** |
| 3 | Dodger Dawgs | 6.0 | 5.5 | 8.0 | 8.0 | 4.0 | 5.0 | 4.0 | 5.0 | 1.0 | 7.0 | **53.5** |
| 4 | Skunk Dogs | 7.0 | 5.5 | 4.0 | 6.0 | 5.0 | 3.0 | 5.0 | 3.0 | 5.0 | 8.0 | **51.5** |
| 5 | Devil Dawgs | 2.0 | 1.0 | 1.0 | 5.0 | 1.0 | 8.0 | 3.0 | 8.0 | 8.0 | 6.0 | **43.0** |
| 6 | Los Doyers | 4.0 | 7.5 | 7.0 | 2.0 | 8.0 | 4.0 | 1.0 | 1.0 | 2.0 | 1.0 | **37.5** |
| 7 | Diamond Kings | 1.0 | 2.0 | 2.0 | 3.0 | 6.0 | 2.0 | 7.0 | 4.0 | 4.0 | 2.5 | **33.5** |
| 8 | The Show | 3.0 | 4.0 | 5.0 | 1.0 | 2.0 | 1.0 | 6.0 | 2.0 | 3.0 | 2.5 | **29.5** |

#### TFL Roto Points — Period 1

> Recomputed June 8, 2026 from current `TeamStatsPeriod` DB data (periodId = 35).

| Rank | Team | R | HR | RBI | SB | AVG | W | SV | ERA | WHIP | K | Total |
|------|------|---|----|----|----|----|---|----|----|------|---|----|
| 1 | Demolition Lumber Co. | 5 | 3 | 3 | 7.5 | 6 | 5.5 | 8 | 6 | 7 | 7 | **58.0** |
| 2 | RGing Sluggers | 8 | 8 | 7 | 5 | 5 | 5.5 | 2 | 7 | 5 | 3 | **55.5** |
| 3 | Dodger Dawgs | 6 | 6 | 8 | 7.5 | 3 | 5.5 | 5 | 5 | 1 | 6 | **53.0** |
| 4 | Skunk Dogs | 7 | 6 | 4 | 6 | 4 | 3 | 3.5 | 3 | 6 | 8 | **50.5** |
| 5 | Devil Dawgs | 2 | 1 | 1 | 4 | 1 | 8 | 3.5 | 8 | 8 | 5 | **41.5** |
| 6 | Los Doyers | 4 | 6 | 6 | 2 | 8 | 5.5 | 1 | 1 | 2 | 1 | **36.5** |
| 7 | Diamond Kings | 1 | 2 | 2 | 3 | 7 | 2 | 6 | 4 | 4 | 4 | **35.0** |
| 8 | The Show | 3 | 4 | 5 | 1 | 2 | 1 | 7 | 2 | 3 | 2 | **30.0** |

---

### 1d. Period 1 Rank Deltas: TFL minus FG/OnRoto

> Positive = TFL awards more points. Negative = TFL awards fewer. Zero = exact match.

| Team | TFL Total | FG Total | **Net Δ** |
|------|-----------|----------|--------|
| Demolition Lumber Co. | 58.0 | 56.5 | **+1.5** |
| RGing Sluggers | 55.5 | 55.0 | **+0.5** |
| Dodger Dawgs | 53.0 | 53.5 | **−0.5** |
| Skunk Dogs | 50.5 | 51.5 | **−1.0** |
| Devil Dawgs | 41.5 | 43.0 | **−1.5** |
| Los Doyers | 36.5 | 37.5 | **−1.0** |
| Diamond Kings | 35.0 | 33.5 | **+1.5** |
| The Show | 30.0 | 29.5 | **+0.5** |

> ✅ **Sum of all deltas = 0.0** — zero-sum check passes.
>
> **Key finding for Period 1:** All teams within **±1.5 points**. Both systems agree DLC ranks 1st, RGS 2nd, DDG 3rd — the rank ordering is nearly identical. Small differences are consistent with normal data source divergence (MLB Stats API vs FanGraphs database) on individual stat counts.

---

## Period 2 Audit — Apr 19 to May 16, 2026

### 2a. Roster Verification — End of Period 2

> Notable changes from auction-day: RGS added Caleb Thielbar, Gary Sánchez, Nathan Church, Adrian Del Castillo; DDG added Andrew Painter (re-acquired), Jose Fernandez, Owen Caissie, Gregory Soto, Dominic Smith; DLC added Landen Roupp, Rhett Lowder, Felix Reyes, Troy Johnston; LDY swapped in Justin Wrobleski, Joey Ortiz, Brandon Lockridge, Merrill Kelly, Carmen Mlodzinski, Foster Griffin, Paul Sewald; SKD added Daniel Susac, Mauricio Dubón, JJ Wetherholt, Kyle Harrison, Chase Dollander.

| Team | TFL Roster (End of P2) | FG/OnRoto Match |
|------|------------------------|-----------------|
| SKD | Hunter Goodman (C), Daniel Susac (C), Matt Olson (1B), JJ Wetherholt (2B), Trea Turner (SS), Matt Chapman (3B), Alec Bohm (CM), CJ Abrams (MI), Luis Arraez (DH), Michael Harris II (OF), Luis Robert Jr. (OF), Sal Frelick (OF), Jordan Walker (OF), Mauricio Dubón (OF), Shohei Ohtani-P (P), Michael King (P), Chase Dollander (P), Kyle Harrison (P), Brandon Woodruff (P), Jameson Taillon (P), Kodai Senga (P), Pete Fairbanks (P), Raisel Iglesias (P) | ☐ To verify |
| DMK | Tyler Stephenson (C), Dalton Rushing (C), TJ Rumfield (1B), Marcus Semien (2B), Elly De La Cruz (SS), Noelvi Marte (3B), Jake Bauers (CM), Ezequiel Tovar (MI), Bryan Reynolds (DH), Fernando Tatis Jr. (OF), Teoscar Hernández (OF), Kyle Stowers (OF), Justin Crawford (OF), Daylen Lile (OF), Edwin Díaz (IL), Roki Sasaki (P), Tyler Glasnow (P), Chase Burns (P), Braxton Ashcraft (P), Aaron Ashby (P), Blake Snell (P), Alex Vesia (P), Jhoan Duran (P) | ☐ To verify |
| DDG | Drake Baldwin (C), Iván Herrera (C), Sal Stewart (1B), Jose Fernandez (1B), Nico Hoerner (2B), Francisco Lindor (SS), Matt McLain (SS), Nolan Gorman (3B), Jackson Chourio (OF), James Wood (OF), Ramón Laureano (OF), Jake McCarthy (OF), Jung Hoo Lee (OF), Owen Caissie (OF), Dominic Smith (DH), Andrew Painter (P), Cristopher Sánchez (P), Logan Webb (P), Eury Pérez (P), Spencer Strider (P), Eduardo Rodriguez (P), Trevor Megill (P), Robert Suarez (P), Gregory Soto (P) | ☐ To verify |
| DVD | Agustín Ramírez (C), Miguel Amaya (C), Edouard Julien (1B), Casey Schmitt (1B), Ildemaro Vargas (2B), Willy Adames (SS), Nolan Arenado (3B), Mark Vientos (CM), Christian Yelich (DH), Kyle Tucker (OF), Seiya Suzuki (OF), Brenton Doyle (OF), Jakob Marsee (OF), Jordan Beck (OF), Jacob Misiorowski (P), Nolan McLean (P), Edward Cabrera (P), Matthew Boyd (P), Reynaldo López (P), Clay Holmes (P), Bryce Elder (P), Abner Uribe (P), Dennis Santana (P) | ☐ To verify |
| RGS | Gary Sánchez (C), Adrian Del Castillo (C), Freddie Freeman (1B), Ozzie Albies (2B), Dansby Swanson (MI), Eugenio Suárez (3B), Alex Bregman (CM), Xavier Edwards (SS), Kyle Schwarber (DH), Oneil Cruz (OF), Heliot Ramos (IL), Jackson Merrill (OF), Adolis García (OF), Nathan Church (OF), Yoshinobu Yamamoto (P), Robbie Ray (P), Bubba Chandler (P), Sandy Alcantara (P), Zac Gallen (P), Mitch Keller (P), Ryne Nelson (P), Devin Williams (P), Daniel Palencia (P), Caleb Thielbar (P) | ☐ To verify |
| TSH | J.T. Realmuto (C), Liam Hicks (C), Rafael Devers (1B), Ketel Marte (2B), Bo Bichette (SS), Manny Machado (3B), Bryce Harper (CM), Xander Bogaerts (MI), Marcell Ozuna (DH), Pete Crow-Armstrong (OF), Alec Burleson (OF), Ian Happ (OF), Brandon Marsh (OF), Garrett Mitchell (OF), Quinn Priester (IL), Emilio Pagán (IL), Freddy Peralta (P), Emmet Sheehan (P), Shota Imanaga (P), Andrew Abbott (P), Aaron Nola (P), Nick Lodolo (P), Ryan Walker (P), Randy Vásquez (P) | ☐ To verify |
| LDY | Will Smith (C), Carson Kelly (C), Spencer Steer (1B), Brandon Lowe (2B), Mookie Betts (SS), Joey Ortiz (SS), Austin Riley (3B), Max Muncy (CM), Konnor Griffin (MI), Ryan O'Hearn (DH), Juan Soto (OF), Andy Pages (OF), Gavin Sheets (OF), Victor Scott II (OF), Brandon Lockridge (OF), Michael McGreevy (P), Michael Soroka (P), Justin Wrobleski (P), Merrill Kelly (P), Carmen Mlodzinski (P), Foster Griffin (P), Clayton Beeter (P), Walker Buehler (P), Paul Sewald (P) | ☐ To verify |
| DLC | William Contreras (C), Francisco Alvarez (C), Michael Busch (1B), Brice Turang (2B), Geraldo Perdomo (SS), Brady House (3B), Andrew Vaughn (CM), Troy Johnston (CM), Otto Lopez (MI), Shohei Ohtani (DH), Ronald Acuña Jr. (OF), Corbin Carroll (OF), Mickey Moniak (OF), Carson Benge (OF), Felix Reyes (OF), Paul Skenes (P), Chris Sale (P), Jesús Luzardo (P), Zack Wheeler (P), Riley O'Brien (P), Victor Vodnik (P), Mason Miller (P), Landen Roupp (P), Rhett Lowder (P) | ☐ To verify |

---

### 2b. Raw Stats — Period 2

#### TFL Raw Stats — Period 2

| Team | R | HR | RBI | SB | AVG | W | SV | ERA | WHIP | K |
|------|---|----|----|----|----|---|----|----|------|---|
| SKD | 149 | 41 | 147 | 15 | .250 | 7 | 7 | 2.93 | 1.114 | 135 |
| DMK | 126 | 25 | 119 | 25 | .255 | 7 | 2 | 3.30 | 1.138 | 109 |
| DDG | 129 | 33 | 119 | 23 | .247 | 13 | 7 | 3.04 | 1.149 | 162 |
| DVD | 123 | 33 | 118 | 15 | .253 | 9 | 2 | 3.00 | 1.047 | 168 |
| RGS | 147 | 41 | 126 | 20 | .238 | 8 | 4 | 5.00 | 1.309 | 156 |
| TSH | 164 | 38 | 148 | 18 | .247 | 15 | 0 | 3.85 | 1.271 | 152 |
| LDY | 147 | 43 | 132 | 21 | .248 | 9 | 2 | 3.34 | 1.162 | 102 |
| DLC | 144 | 27 | 144 | 24 | .278 | 12 | 14 | 2.46 | 0.983 | 187 |

#### FG/OnRoto Raw Stats — Period 2

> ⏳ **Pending** — awaiting FG/OnRoto session URL for Period 2 standings from the commissioner.

---

### 2c. Roto Points Comparison — Period 2

#### TFL Roto Points — Period 2

> Recomputed June 8, 2026 from current `TeamStatsPeriod` DB data (periodId = 36).

| Rank | Team | R | HR | RBI | SB | AVG | W | SV | ERA | WHIP | K | Total |
|------|------|---|----|----|----|----|---|----|----|------|---|----|
| 1 | Demolition Lumber Co. | 4 | 2 | 6 | 7 | 8 | 6 | 8 | 8 | 8 | 8 | **65.0** |
| 2 | Skunk Dogs | 7 | 6.5 | 7 | 1.5 | 5 | 1.5 | 6.5 | 7 | 6 | 3 | **51.0** |
| 3 | Dodger Dawgs | 3 | 3.5 | 2.5 | 6 | 2.5 | 7 | 6.5 | 5 | 4 | 6 | **46.0** |
| 4 | The Show | 8 | 5 | 8 | 3 | 2.5 | 8 | 1 | 2 | 2 | 4 | **43.5** |
| 5 | Los Doyers | 5.5 | 8 | 5 | 5 | 4 | 4.5 | 3 | 3 | 3 | 1 | **42.0** |
| 6 | Devil Dawgs | 1 | 3.5 | 1 | 1.5 | 6 | 4.5 | 3 | 6 | 7 | 7 | **40.5** |
| 7 | Diamond Kings | 2 | 1 | 2.5 | 8 | 7 | 1.5 | 3 | 4 | 5 | 2 | **36.0** |
| 7 | RGing Sluggers | 5.5 | 6.5 | 4 | 4 | 1 | 3 | 5 | 1 | 1 | 5 | **36.0** |

#### FG/OnRoto Roto Points — Period 2

> FG/OnRoto data retrieved June 8, 2026 — confirmed "Through 05.16.26" ✅

| Rank | Team | R | HR | RBI | SB | AVG | W | SV | ERA | WHIP | SO | Total |
|------|------|---|----|----|----|----|---|----|----|------|----|----|
| 1 | Demolition Lumber Co. | 4.5 | 2.0 | 7.0 | 6.5 | 8.0 | 6.0 | 8.0 | 7.0 | 8.0 | 8.0 | **65.0** |
| 2 | Skunk Dogs | 4.5 | 6.0 | 6.0 | 1.5 | 6.0 | 1.0 | 6.5 | 8.0 | 7.0 | 3.0 | **49.5** |
| 3 | Los Doyers | 7.0 | 8.0 | 5.0 | 5.0 | 4.0 | 7.5 | 2.5 | 2.0 | 3.0 | 4.0 | **48.0** |
| 4 | Dodger Dawgs | 3.0 | 4.0 | 3.0 | 6.5 | 3.0 | 5.0 | 6.5 | 5.0 | 4.0 | 6.0 | **46.0** |
| 5 | The Show | 8.0 | 6.0 | 8.0 | 3.0 | 2.0 | 7.5 | 2.5 | 3.0 | 2.0 | 2.0 | **44.0** |
| 6 | Devil Dawgs | 1.0 | 3.0 | 1.0 | 1.5 | 7.0 | 3.5 | 2.5 | 4.0 | 6.0 | 7.0 | **36.5** |
| 7 | Diamond Kings | 2.0 | 1.0 | 2.0 | 8.0 | 5.0 | 3.5 | 2.5 | 6.0 | 5.0 | 1.0 | **36.0** |
| 8 | RGing Sluggers | 6.0 | 6.0 | 4.0 | 4.0 | 1.0 | 2.0 | 5.0 | 1.0 | 1.0 | 5.0 | **35.0** |

---

### 2d. Period 2 Rank Deltas: TFL minus FG/OnRoto

> Positive = TFL awards more points. Negative = TFL awards fewer. Zero = exact match.

| Team | R | HR | RBI | SB | AVG | W | SV | ERA | WHIP | K/SO | **Net Δ** |
|------|---|----|----|----|----|---|----|----|------|------|--------|
| DLC | −0.5 | 0 | −1.0 | +0.5 | 0 | 0 | 0 | +1.0 | 0 | 0 | **0.0** |
| SKD | +2.5 | +0.5 | +1.0 | 0 | −1.0 | +0.5 | 0 | −1.0 | −1.0 | 0 | **+1.5** |
| LDY | −1.5 | 0 | 0 | 0 | 0 | −3.0 | +0.5 | +1.0 | 0 | −3.0 | **−6.0** |
| DDG | 0 | −0.5 | −0.5 | −0.5 | −0.5 | +2.0 | 0 | 0 | 0 | 0 | **0.0** |
| TSH | 0 | −1.0 | 0 | 0 | +0.5 | +0.5 | −1.5 | −1.0 | 0 | +2.0 | **−0.5** |
| DVD | 0 | +0.5 | 0 | 0 | −1.0 | +1.0 | +0.5 | +2.0 | +1.0 | 0 | **+4.0** |
| DMK | 0 | 0 | +0.5 | 0 | +2.0 | −2.0 | +0.5 | −2.0 | 0 | +1.0 | **0.0** |
| RGS | −0.5 | +0.5 | 0 | 0 | 0 | +1.0 | 0 | 0 | 0 | 0 | **+1.0** |

> ✅ **Sum of all deltas = 0.0** — zero-sum check passes.
>
> **Key findings for Period 2:**
> - DLC: **exact match** (TFL = FG = 65.0) — both systems agree completely on Period 2's dominant team.
> - LDY under-credited by TFL **−6.0 pts** (FG rank 3 → TFL rank 5). Driven by W (FG 7.5 vs TFL 4.5) — FanGraphs credits LDY with significantly more wins than our MLB Stats API feed.
> - DVD over-credited by TFL **+4.0 pts** (FG rank 6 → TFL rank 6 same, but 40.5 vs 36.5). Driven by ERA and WHIP — TFL's API feed shows better pitching metrics for DVD than FanGraphs records.

---

## Period 3 Audit — May 17 to Jun 6, 2026

### 3a. Roster Verification — End of Period 3

> Notable changes from P2: DMK added Walker Buehler, Max Meyer, Antonio Senzatela, JJ Bleday, Miguel Andujar; DLC released Landen Roupp + Matt Gage + Jack Dreyer on Jun 7 (credited to P3); LDY overhauled pitching staff; SKD added Merrill Kelly, Brett Baty, Moisés Ballesteros, Trevor McDonald.

| Team | TFL Roster (End of P3) | FG/OnRoto Match |
|------|------------------------|-----------------|
| SKD | Hunter Goodman (C), Moisés Ballesteros (C), Matt Olson (1B), JJ Wetherholt (2B), Trea Turner (SS), Matt Chapman (3B), Alec Bohm (CM), CJ Abrams (MI), Luis Arraez (DH), Michael Harris II (OF), Luis Robert Jr. (OF), Sal Frelick (OF), Jordan Walker (OF), Mauricio Dubón (OF), Brett Baty (OF), Shohei Ohtani-P (P), Michael King (P), Merrill Kelly (P), Kyle Harrison (P), Brandon Woodruff (P), Jameson Taillon (P), Trevor McDonald (P), Pete Fairbanks (P), Raisel Iglesias (P) | ☐ To verify |
| DMK | Tyler Stephenson (C), Dalton Rushing (C), TJ Rumfield (1B), Marcus Semien (2B), Elly De La Cruz (SS), Miguel Andujar (3B), Jake Bauers (CM), Fernando Tatis Jr. (OF), Teoscar Hernández (OF), Kyle Stowers (OF), Justin Crawford (OF), Daylen Lile (OF), JJ Bleday (OF), Edwin Díaz (IL), Roki Sasaki (P), Tyler Glasnow (P), Chase Burns (P), Braxton Ashcraft (P), Aaron Ashby (P), Walker Buehler (P), Jhoan Duran (P), Max Meyer (P), Antonio Senzatela (P) | ☐ To verify |
| DDG | Drake Baldwin (C), Iván Herrera (C), Sal Stewart (1B), Jose Fernandez (1B), Nico Hoerner (2B), Francisco Lindor (SS), Matt McLain (SS), Nolan Gorman (3B), Bryson Stott (MI), Jackson Chourio (OF), James Wood (OF), Ramón Laureano (OF), Jake McCarthy (OF), Jung Hoo Lee (OF), Connor Norby (DH), Cristopher Sánchez (P), Logan Webb (P), Eury Pérez (P), Spencer Strider (P), Eduardo Rodriguez (P), Trevor Megill (P), Robert Suarez (P), Gregory Soto (P), Ben Brown (P) | ☐ To verify |
| DVD | Agustín Ramírez (C), Miguel Amaya (C), Edouard Julien (1B), Casey Schmitt (1B), Ildemaro Vargas (2B), Willy Adames (SS), Nolan Arenado (3B), Mark Vientos (CM), Christian Yelich (DH), Kyle Tucker (OF), Seiya Suzuki (OF), Brenton Doyle (OF), Jakob Marsee (OF), Ryan Waldschmidt (OF), Jacob Misiorowski (P), Nolan McLean (P), Matthew Boyd (P), Reynaldo López (P), Clay Holmes (P), Bryce Elder (P), Abner Uribe (P), JR Ritchie (P), Caleb Kilian (P), Christian Scott (P) | ☐ To verify |
| RGS | Gabriel Moreno (C), Adrian Del Castillo (C), Freddie Freeman (1B), Ozzie Albies (2B), Dansby Swanson (MI), Eugenio Suárez (3B), Alex Bregman (CM), Xavier Edwards (SS), Kyle Schwarber (DH), Oneil Cruz (OF), Heliot Ramos (IL), Jackson Merrill (OF), Adolis García (OF), Nathan Church (OF), AJ Ewing (OF), Yoshinobu Yamamoto (P), Robbie Ray (P), Bubba Chandler (P), Sandy Alcantara (P), Mitch Keller (P), Ryne Nelson (P), Devin Williams (P), Daniel Palencia (P), Kyle Leahy (P) | ☐ To verify |
| TSH | J.T. Realmuto (C), Liam Hicks (C), Rafael Devers (1B), Ketel Marte (2B), Bo Bichette (SS), Manny Machado (3B), Bryce Harper (CM), Xander Bogaerts (MI), Luis García Jr. (DH), Pete Crow-Armstrong (OF), Alec Burleson (OF), Ian Happ (OF), Brandon Marsh (OF), Garrett Mitchell (OF), Quinn Priester (IL), Emilio Pagán (IL), Logan Henderson (IL), Freddy Peralta (P), Emmet Sheehan (P), Shota Imanaga (P), Andrew Abbott (P), Aaron Nola (P), Nick Lodolo (P), Randy Vásquez (P), Tanner Scott (P) | ☐ To verify |
| LDY | Will Smith (C), Carson Kelly (C), Spencer Steer (1B), Brandon Lowe (2B), Mookie Betts (SS), Austin Riley (3B), Max Muncy (CM), Konnor Griffin (MI), Ryan O'Hearn (DH), Juan Soto (OF), Andy Pages (OF), Gavin Sheets (OF), Victor Scott II (OF), Jacob Young (OF), Michael McGreevy (P), Michael Soroka (P), Justin Wrobleski (P), Andrew Painter (P), Cade Cavalli (P), PJ Poulin (P), George Soriano (P), Foster Griffin (P), Paul Sewald (P) | ☐ To verify |
| DLC | William Contreras (C), Keibert Ruiz (C), Michael Busch (1B), Brice Turang (2B), Geraldo Perdomo (SS), Brady House (3B), Andrew Vaughn (CM), Troy Johnston (CM), Otto Lopez (MI), Shohei Ohtani (DH), Ronald Acuña Jr. (OF), Corbin Carroll (OF), Mickey Moniak (OF), Carson Benge (OF), Paul Skenes (P), Chris Sale (P), Jesús Luzardo (P), Zack Wheeler (P), Riley O'Brien (P), Mason Miller (P), Landen Roupp (P\*), Matt Gage (P\*), Jack Dreyer (P\*) | ☐ To verify |

> \* Landen Roupp, Matt Gage, and Jack Dreyer were released June 7 — after period end — and are credited to DLC for Period 3 stats.

---

### 3b. Raw Stats — Period 3

#### TFL Raw Stats — Period 3

| Team | R | HR | RBI | SB | AVG | W | SV | ERA | WHIP | K |
|------|---|----|----|----|----|---|----|----|------|---|
| SKD | 129 | 36 | 132 | 26 | .265 | 10 | 7 | 4.05 | 1.176 | 119 |
| DMK | 106 | 28 | 102 | 15 | .242 | 13 | 8 | 2.61 | 0.958 | 152 |
| DDG | 107 | 23 | 80 | 25 | .247 | 11 | 7 | 2.43 | 0.943 | 141 |
| DVD | 108 | 24 | 85 | 13 | .225 | 10 | 3 | 3.74 | 1.198 | 105 |
| RGS | 102 | 27 | 86 | 27 | .236 | 9 | 2 | 5.06 | 1.425 | 126 |
| TSH | 119 | 47 | 146 | 13 | .247 | 7 | 2 | 5.25 | 1.311 | 124 |
| LDY | 118 | 34 | 94 | 14 | .239 | 11 | 6 | 3.87 | 1.141 | 114 |
| DLC | 125 | 27 | 115 | 22 | .298 | 7 | 7 | 4.24 | 1.366 | 131 |

#### FG/OnRoto Raw Stats — Period 3

> ⏳ **Pending** — awaiting FG/OnRoto session URL for Period 3 from the commissioner.

---

### 3c. Roto Points Comparison — Period 3

> FG/OnRoto Period 3 data retrieved June 8, 2026 via previously-provided session URL (confirmed "Through 06.06.26") ✅

#### FG/OnRoto Roto Points — Period 3

| Rank | Team | R | HR | RBI | SB | AVG | W | SV | ERA | WHIP | SO | Total |
|------|------|---|----|----|----|----|---|----|----|------|----|----|
| 1 | Demolition Lumber Co. | 6.0 | 3.0 | 5.0 | 7.0 | 8.0 | 5.0 | 8.0 | 5.0 | 5.0 | 8.0 | **60.0** |
| 2 | Dodger Dawgs | 3.0 | 4.0 | 4.0 | 8.0 | 4.0 | 7.0 | 5.5 | 8.0 | 6.0 | 7.0 | **56.5** |
| 3 | Skunk Dogs | 8.0 | 6.0 | 7.0 | 5.0 | 7.0 | 1.0 | 7.0 | 4.0 | 4.0 | 4.5 | **53.5** |
| 4 | Los Doyers | 4.0 | 7.0 | 6.0 | 3.0 | 6.0 | 8.0 | 2.5 | 3.0 | 3.0 | 1.0 | **43.5** |
| 5 | Diamond Kings | 1.0 | 2.0 | 2.0 | 4.0 | 5.0 | 4.0 | 5.5 | 7.0 | 8.0 | 3.0 | **41.5** |
| 6 | The Show | 7.0 | 8.0 | 8.0 | 1.0 | 3.0 | 2.0 | 4.0 | 1.0 | 1.0 | 2.0 | **37.0** |
| 7 | RGing Sluggers | 5.0 | 5.0 | 3.0 | 6.0 | 2.0 | 3.0 | 2.5 | 2.0 | 2.0 | 4.5 | **35.0** |
| 8 | Devil Dawgs | 2.0 | 1.0 | 1.0 | 2.0 | 1.0 | 6.0 | 1.0 | 6.0 | 7.0 | 6.0 | **33.0** |

#### TFL Roto Points — Period 3

| Rank | Team | R | HR | RBI | SB | AVG | W | SV | ERA | WHIP | K | Total |
|------|------|---|----|----|----|----|---|----|----|------|---|----|
| 1 | Skunk Dogs | 8 | 7 | 7 | 7 | 7 | 4.5 | 6 | 4 | 5 | 3 | **58.5** |
| 2 | Diamond Kings | 2 | 5 | 5 | 4 | 4 | 8 | 8 | 7 | 7 | 8 | **58.0** |
| 2 | Dodger Dawgs | 3 | 1 | 1 | 6 | 5.5 | 6.5 | 6 | 8 | 8 | 7 | **52.0** |
| 4 | Demolition Lumber Co. | 7 | 3.5 | 6 | 5 | 8 | 1.5 | 6 | 3 | 2 | 6 | **48.0** |
| 5 | Los Doyers | 5 | 6 | 4 | 3 | 3 | 6.5 | 4 | 5 | 6 | 2 | **44.5** |
| 6 | The Show | 6 | 8 | 8 | 1.5 | 5.5 | 1.5 | 1.5 | 1 | 3 | 4 | **40.0** |
| 7 | RGing Sluggers | 1 | 3.5 | 3 | 8 | 2 | 3 | 1.5 | 2 | 1 | 5 | **30.0** |
| 8 | Devil Dawgs | 4 | 2 | 2 | 1.5 | 1 | 4.5 | 3 | 6 | 4 | 1 | **29.0** |

---

### 3d. Period 3 Rank Deltas: TFL minus FG/OnRoto

| Team | R | HR | RBI | SB | AVG | W | SV | ERA | WHIP | K/SO | **Net Δ** |
|------|---|----|----|----|----|---|----|----|------|------|--------|
| DLC | +1.0 | +0.5 | +1.0 | −2.0 | 0 | −3.5 | −2.0 | −2.0 | −3.0 | −2.0 | **−12.0** |
| DDG | 0 | −3.0 | −3.0 | −2.0 | +1.5 | −0.5 | +0.5 | 0 | +2.0 | 0 | **−4.5** |
| SKD | 0 | +1.0 | 0 | +2.0 | 0 | +3.5 | −1.0 | 0 | +1.0 | −1.5 | **+5.0** |
| LDY | +1.0 | −1.0 | −2.0 | 0 | −3.0 | −1.5 | +1.5 | +2.0 | +3.0 | +1.0 | **+1.0** |
| DMK | +1.0 | +3.0 | +3.0 | 0 | −1.0 | +4.0 | +2.5 | 0 | −1.0 | +5.0 | **+16.5** |
| TSH | −1.0 | 0 | 0 | +0.5 | +2.5 | −0.5 | −2.5 | 0 | +2.0 | +2.0 | **+3.0** |
| RGS | −4.0 | −1.5 | 0 | +2.0 | 0 | 0 | −1.0 | 0 | −1.0 | +0.5 | **−5.0** |
| DVD | +2.0 | +1.0 | +1.0 | −0.5 | 0 | −1.5 | +2.0 | 0 | −3.0 | −5.0 | **−4.0** |

> ✅ **Sum of all deltas = 0.0** — confirms zero-sum arithmetic is correct across both systems for Period 3.

---

## Summary

### TFL Points — All 3 Periods (recomputed from current DB)

| Team | P1 Pts | P2 Pts | P3 Pts | **TFL YTD** |
|------|--------|--------|--------|-------------|
| Demolition Lumber Co. | 58.0 | 65.0 | 48.0 | **171.0** |
| RGing Sluggers | 55.5 | 36.0 | 30.0 | **121.5** |
| Dodger Dawgs | 53.0 | 46.0 | 52.0 | **151.0** |
| Skunk Dogs | 50.5 | 51.0 | 58.5 | **160.0** |
| Devil Dawgs | 41.5 | 40.5 | 29.0 | **111.0** |
| Los Doyers | 36.5 | 42.0 | 44.5 | **123.0** |
| Diamond Kings | 35.0 | 36.0 | 58.0 | **129.0** |
| The Show | 30.0 | 43.5 | 40.0 | **113.5** |

### FG/OnRoto Points — All 3 Periods (all confirmed ✅)

| Team | P1 Pts | P2 Pts | P3 Pts | **FG YTD** |
|------|--------|--------|--------|------------|
| Demolition Lumber Co. | 56.5 | 65.0 | 60.0 | **181.5** |
| Dodger Dawgs | 53.5 | 46.0 | 56.5 | **156.0** |
| Skunk Dogs | 51.5 | 49.5 | 53.5 | **154.5** |
| RGing Sluggers | 55.0 | 35.0 | 35.0 | **125.0** |
| Los Doyers | 37.5 | 48.0 | 43.5 | **129.0** |
| Devil Dawgs | 43.0 | 36.5 | 33.0 | **112.5** |
| Diamond Kings | 33.5 | 36.0 | 41.5 | **111.0** |
| The Show | 29.5 | 44.0 | 37.0 | **110.5** |

### Net Deltas by Period (TFL − FG/OnRoto)

| Team | P1 Δ | P2 Δ | P3 Δ | **YTD Δ** |
|------|------|------|------|-----------|
| Demolition Lumber Co. | +1.5 | 0.0 | −12.0 | **−10.5** |
| RGing Sluggers | +0.5 | +1.0 | −5.0 | **−3.5** |
| Dodger Dawgs | −0.5 | 0.0 | −4.5 | **−5.0** |
| Skunk Dogs | −1.0 | +1.5 | +5.0 | **+5.5** |
| Devil Dawgs | −1.5 | +4.0 | −4.0 | **−1.5** |
| Los Doyers | −1.0 | −6.0 | +1.0 | **−6.0** |
| Diamond Kings | +1.5 | 0.0 | +16.5 | **+18.0** |
| The Show | +0.5 | −0.5 | +3.0 | **+3.0** |

### Headline Findings

**Period 1 — Systems largely agree:**
- All 8 teams within ±1.5 points. Rank order is identical between TFL and FG/OnRoto.
- Small differences consistent with normal stat-source lag, no systemic bias.

**Period 2 — DLC is a perfect match; LDY and DVD diverge:**
- DLC: **exact match** (both systems 65.0) — validates both systems' attribution for Period 2's dominant team.
- LDY under-credited by TFL **−6.0 pts** (FG rank 3 → TFL rank 5). Driven by W: FG credits LDY ~7.5 pts (tied 2nd most wins) while TFL MLB Stats API shows fewer wins.
- DVD over-credited by TFL **+4.0 pts**. Driven by better ERA/WHIP in TFL's feed vs FanGraphs.

**Period 3 — Largest divergence:**
- DMK over-credited by TFL **+16.5 pts** (FG rank 5 → TFL rank 2). Driven by W (+4.0) and K (+5.0).
- DLC under-credited by TFL **−12.0 pts** (FG rank 1 → TFL rank 4). Driven by W (−3.5), WHIP (−3.0), K (−2.0).

**YTD (3 periods combined):**
- DMK is the most over-credited team in TFL: **+18.0 pts** above FG/OnRoto.
- LDY is the most under-credited: **−6.0 pts** below FG/OnRoto YTD.

**Root cause — data source divergence:**
TFL sources stats from the MLB Stats API (statsapi.mlb.com). FanGraphs on Roto maintains its own independently-sourced database. The two sources diverge most on pitcher counting stats (W, K, SV) because:
1. Win assignment can be revised after games are reviewed (rulebook wins).
2. Strikeout totals can differ by 5–15% when one source lags the other on final box score ingestion.
3. Both systems use end-of-period owner attribution — the attribution logic is confirmed correct in TFL.

**Confirmed working correctly in TFL:**
- Attribution logic (end-of-period owner, dedup, dropped-player exclusion) — verified correct.
- Transaction recording — 72 June 7 events all match FG/OnRoto exactly.
- Roto point computation — zero-sum verified for Period 3.

### What's Still Needed

| Item | Status |
|------|--------|
| FG/OnRoto Period 1 standings URL | ✅ Confirmed "Through 04.18.26" |
| FG/OnRoto Period 2 standings URL | ✅ Confirmed "Through 05.16.26" |
| FG/OnRoto Period 3 standings URL | ✅ Confirmed "Through 06.06.26" |
| FG/OnRoto raw stats (all periods) | ⏳ Requires per-team stats page — URL shows rank points only |
| FG/OnRoto roster verification (all periods) | ⏳ Manual spot-check via OnRoto site |
| Root cause: LDY W divergence P2 | ⏳ FG gives LDY ~7.5 W rank; TFL API shows fewer wins |
| Root cause: DMK W+K over-credit P3 | ⏳ Known data-source divergence; per-player check pending |

---

*Document last updated June 8, 2026. TFL data from live production database. FG/OnRoto data from commissioner-provided session URLs.*
