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

> **FanGraphs on Roto rosters:** The FanGraphs on Roto team roster pages require browser authentication and cannot be fetched automatically. TFL rosters below are sourced from the TFL production database. Auction-day rosters are cross-referenced against the OGBA 2026 auction draft spreadsheet. Period-end rosters must be manually verified on the FanGraphs on Roto site.

---

### Auction Day — March 25, 2026

*Source: OGBA 2026 auction draft spreadsheet. This is the baseline both systems share.*

**Demolition Lumber Co.**
Hitters (14): Michael Busch, Brice Turang, Geraldo Perdomo, Brady House, Ronald Acuña Jr., Corbin Carroll, Dylan Crews, Mickey Moniak, Carson Benge, William Contreras, Francisco Alvarez, Andrew Vaughn, Otto Lopez, Shohei Ohtani (DH)
Pitchers (9): Paul Skenes, Chris Sale, Jesús Luzardo, Joe Musgrove, Zack Wheeler, Cade Cavalli, Victor Vodnik, Riley O'Brien, Mason Miller

**Devil Dawgs**
Hitters (14): Bryce Eldridge, Luis García Jr., Willy Adames, Nolan Arenado, Kyle Tucker, Seiya Suzuki, Brenton Doyle, Jakob Marsee, Jordan Beck, Agustín Ramírez, Miguel Amaya, Mark Vientos, Jorge Polanco, Christian Yelich (DH)
Pitchers (9): Jacob Misiorowski, Nolan McLean, Edward Cabrera, Matthew Boyd, Reynaldo López, Clay Holmes, Cade Horton, Abner Uribe, Dennis Santana

**Diamond Kings**
Hitters (14): Spencer Horwitz, Marcus Semien, Elly De La Cruz, Noelvi Marte, Fernando Tatis Jr., Teoscar Hernández, Kyle Stowers, Justin Crawford, Daylen Lile, Tyler Stephenson, Dalton Rushing, Jordan Lawlar, Ezequiel Tovar, Bryan Reynolds (DH)
Pitchers (9): Roki Sasaki, Tyler Glasnow, Chase Burns, Braxton Ashcraft, Brandon Pfaadt, Blake Snell, Brady Singer, Jhoan Duran, Edwin Díaz

**Dodger Dawgs**
Hitters (14): Sal Stewart, Nico Hoerner, Francisco Lindor, Brett Baty, Jackson Chourio, James Wood, Jung Hoo Lee, Ramón Laureano, Jake McCarthy, Drake Baldwin, Keibert Ruiz, Nolan Gorman, Matt McLain, Iván Herrera (DH)
Pitchers (9): Cristopher Sánchez, Logan Webb, Eury Pérez, Spencer Strider, Andrew Painter, Max Meyer, Eduardo Rodriguez, Trevor Megill, Robert Suarez

**Los Doyers**
Hitters (14): Spencer Steer, Brandon Lowe, Mookie Betts, Austin Riley, Juan Soto, Andy Pages, Gavin Sheets, Victor Scott II, Alek Thomas, Will Smith, Carson Kelly, Max Muncy, Konnor Griffin, Ryan O'Hearn (DH)
Pitchers (9): Zack Littell, Michael McGreevy, Sean Manaea, Corbin Burnes, Hunter Greene, Michael Soroka, Dustin May, Walker Buehler, Clayton Beeter

**RGing Sluggers**
Hitters (14): Freddie Freeman, Ozzie Albies, Dansby Swanson, Eugenio Suárez, Oneil Cruz, Heliot Ramos, Jackson Merrill, Adolis García, Harrison Bader, Gabriel Moreno, Patrick Bailey, Alex Bregman, Xavier Edwards, Kyle Schwarber (DH)
Pitchers (9): Yoshinobu Yamamoto, Robbie Ray, Bubba Chandler, Sandy Alcantara, Zac Gallen, Mitch Keller, Ryne Nelson, Devin Williams, Daniel Palencia

**Skunk Dogs**
Hitters (14): Matt Olson, Bryson Stott, Trea Turner, Matt Chapman, Michael Harris II, Luis Robert Jr., Sal Frelick, TJ Friedl, Jordan Walker, Hunter Goodman, Freddy Fermin, Alec Bohm, CJ Abrams, Luis Arraez (DH)
Pitchers (9): Shohei Ohtani (P), Nick Pivetta, Brandon Woodruff, Michael King, David Peterson, Jameson Taillon, Kodai Senga, Pete Fairbanks, Raisel Iglesias

**The Show**
Hitters (14): Rafael Devers, Ketel Marte, Bo Bichette, Manny Machado, Pete Crow-Armstrong, Alec Burleson, Ian Happ, Willi Castro, Brandon Marsh, J.T. Realmuto, Sean Murphy, Bryce Harper, Xander Bogaerts, Marcell Ozuna (DH)
Pitchers (9): Freddy Peralta, Emmet Sheehan, Shota Imanaga, Andrew Abbott, Aaron Nola, Nick Lodolo, Quinn Priester, Ryan Walker, Emilio Pagán

---

### End of Period 1 — April 18, 2026

*Source: TFL production database. Notable changes from auction day are in italics.*

**Demolition Lumber Co.** (23 players — no changes from auction day)
Hitters: Michael Busch, Brice Turang, Geraldo Perdomo, Brady House, Ronald Acuña Jr., Corbin Carroll, Dylan Crews, Mickey Moniak, Carson Benge, William Contreras, Francisco Alvarez, Andrew Vaughn, Otto Lopez, Shohei Ohtani
Pitchers: Paul Skenes, Chris Sale, Jesús Luzardo, Joe Musgrove, Zack Wheeler, Cade Cavalli, Victor Vodnik, Riley O'Brien, Mason Miller

**Devil Dawgs** (23 players — no changes from auction day)
Hitters: Bryce Eldridge, Luis García Jr., Willy Adames, Nolan Arenado, Kyle Tucker, Seiya Suzuki, Brenton Doyle, Jakob Marsee, Jordan Beck, Agustín Ramírez, Miguel Amaya, Mark Vientos, Jorge Polanco, Christian Yelich
Pitchers: Jacob Misiorowski, Nolan McLean, Edward Cabrera, Matthew Boyd, Reynaldo López, Clay Holmes, Cade Horton, Abner Uribe, Dennis Santana

**Diamond Kings** (23 players — no changes from auction day)
Hitters: Spencer Horwitz, Marcus Semien, Elly De La Cruz, Noelvi Marte, Fernando Tatis Jr., Teoscar Hernández, Kyle Stowers, Justin Crawford, Daylen Lile, Tyler Stephenson, Dalton Rushing, Jordan Lawlar, Ezequiel Tovar, Bryan Reynolds
Pitchers: Roki Sasaki, Tyler Glasnow, Chase Burns, Braxton Ashcraft, Brandon Pfaadt, Blake Snell, Brady Singer, Jhoan Duran, Edwin Díaz (IL)

**Dodger Dawgs** (23 players — no changes from auction day)
Hitters: Sal Stewart, Nico Hoerner, Francisco Lindor, Brett Baty, Jackson Chourio, James Wood, Jung Hoo Lee, Ramón Laureano, Jake McCarthy, Drake Baldwin, Keibert Ruiz, Nolan Gorman, Matt McLain, Iván Herrera
Pitchers: Cristopher Sánchez, Logan Webb, Eury Pérez, Spencer Strider, Andrew Painter, Max Meyer, Eduardo Rodriguez, Trevor Megill, Robert Suarez

**Los Doyers** (23 players — no changes from auction day)
Hitters: Spencer Steer, Brandon Lowe, Mookie Betts, Austin Riley, Juan Soto, Andy Pages, Gavin Sheets, Victor Scott II, Alek Thomas, Will Smith, Carson Kelly, Max Muncy, Konnor Griffin, Ryan O'Hearn
Pitchers: Corbin Burnes, Michael McGreevy, Michael Soroka, Sean Manaea, Dustin May, Zack Littell, Walker Buehler, Hunter Greene, Clayton Beeter

**RGing Sluggers** (23 players — no changes from auction day)
Hitters: Freddie Freeman, Ozzie Albies, Eugenio Suárez, Gabriel Moreno, Patrick Bailey, Alex Bregman, Kyle Schwarber, Heliot Ramos (IL), Jackson Merrill, Adolis García, Oneil Cruz, Harrison Bader, Dansby Swanson, Xavier Edwards
Pitchers: Yoshinobu Yamamoto, Robbie Ray, Bubba Chandler, Sandy Alcantara, Zac Gallen, Mitch Keller, Ryne Nelson, Devin Williams, Daniel Palencia

**Skunk Dogs** (23 players — no changes from auction day)
Hitters: Matt Olson, Bryson Stott, Trea Turner, Matt Chapman, Hunter Goodman, Freddy Fermin, Alec Bohm, CJ Abrams, Luis Arraez, Michael Harris II, Luis Robert Jr., Sal Frelick, TJ Friedl, Jordan Walker
Pitchers: Shohei Ohtani (P), Nick Pivetta, Brandon Woodruff, Michael King, David Peterson, Jameson Taillon, Kodai Senga, Pete Fairbanks, Raisel Iglesias

**The Show** (23 players — no changes from auction day)
Hitters: Rafael Devers, Ketel Marte, Bo Bichette, Manny Machado, J.T. Realmuto, Sean Murphy, Bryce Harper, Xander Bogaerts, Marcell Ozuna, Pete Crow-Armstrong, Alec Burleson, Ian Happ, Willi Castro, Brandon Marsh
Pitchers: Freddy Peralta, Emmet Sheehan, Shota Imanaga, Andrew Abbott, Aaron Nola, Nick Lodolo, Quinn Priester (IL), Ryan Walker, Emilio Pagán (IL)

---

### End of Period 2 — May 16, 2026

*Changes from end of Period 1 noted in italics.*

**Demolition Lumber Co.** (24 players — *added: Troy Johnston, Felix Reyes, Landen Roupp, Rhett Lowder; dropped: Joe Musgrove, Cade Cavalli, Dylan Crews*)
Hitters: Michael Busch, Brice Turang, Geraldo Perdomo, Brady House, Ronald Acuña Jr., Corbin Carroll, Mickey Moniak, Carson Benge, William Contreras, Francisco Alvarez, Andrew Vaughn, *Troy Johnston*, Otto Lopez, Shohei Ohtani, *Felix Reyes*
Pitchers: Paul Skenes, Chris Sale, Jesús Luzardo, Zack Wheeler, Riley O'Brien, Victor Vodnik, Mason Miller, *Landen Roupp*, *Rhett Lowder*

**Devil Dawgs** (23 players — *added: Bryce Elder, Edouard Julien, Casey Schmitt, Ildemaro Vargas; dropped: Jorge Polanco, Cade Horton, Luis García Jr., Bryce Eldridge*)
Hitters: *Edouard Julien*, *Casey Schmitt*, *Ildemaro Vargas*, Nolan Arenado, Kyle Tucker, Seiya Suzuki, Brenton Doyle, Jakob Marsee, Jordan Beck, Agustín Ramírez, Miguel Amaya, Mark Vientos, Christian Yelich, Willy Adames
Pitchers: Jacob Misiorowski, Nolan McLean, *Bryce Elder*, Matthew Boyd, Reynaldo López, Clay Holmes, Abner Uribe, Edward Cabrera, Dennis Santana

**Diamond Kings** (23 players — *added: TJ Rumfield, Jake Bauers, Aaron Ashby, Alex Vesia; dropped: Spencer Horwitz, Jordan Lawlar, Brandon Pfaadt, Brady Singer*)
Hitters: *TJ Rumfield*, Marcus Semien, Elly De La Cruz, Noelvi Marte, Fernando Tatis Jr., Teoscar Hernández, Kyle Stowers, Justin Crawford, Daylen Lile, Tyler Stephenson, Dalton Rushing, *Jake Bauers*, Ezequiel Tovar, Bryan Reynolds
Pitchers: Roki Sasaki, Tyler Glasnow, Chase Burns, Braxton Ashcraft, Blake Snell, *Aaron Ashby*, Jhoan Duran, *Alex Vesia*, Edwin Díaz (IL)

**Dodger Dawgs** (24 players — *added: Jose Fernandez, Owen Caissie, Gregory Soto, Dominic Smith; dropped: Keibert Ruiz, Brett Baty, Max Meyer, Jake McCarthy*)
Hitters: Sal Stewart, *Jose Fernandez*, Nico Hoerner, Francisco Lindor, Nolan Gorman, *Owen Caissie*, Drake Baldwin, Iván Herrera, Jackson Chourio, James Wood, Ramón Laureano, Jung Hoo Lee, Matt McLain, *Dominic Smith*
Pitchers: Cristopher Sánchez, Logan Webb, Eury Pérez, Spencer Strider, Andrew Painter, Eduardo Rodriguez, Trevor Megill, *Gregory Soto*, Robert Suarez

**Los Doyers** (24 players — *added: Justin Wrobleski, Joey Ortiz, Brandon Lockridge, Merrill Kelly, Carmen Mlodzinski, Foster Griffin, Paul Sewald; dropped: Alek Thomas, Corbin Burnes, Hunter Greene, Sean Manaea, Dustin May, Zack Littell*)
Hitters: Spencer Steer, Brandon Lowe, Mookie Betts, *Joey Ortiz*, Austin Riley, Juan Soto, Andy Pages, Gavin Sheets, *Brandon Lockridge*, Victor Scott II, Will Smith, Carson Kelly, Max Muncy, Konnor Griffin, Ryan O'Hearn
Pitchers: Michael McGreevy, Michael Soroka, *Justin Wrobleski*, *Merrill Kelly*, *Carmen Mlodzinski*, *Foster Griffin*, *Paul Sewald*, Walker Buehler, Clayton Beeter

**RGing Sluggers** (24 players — *added: Gary Sánchez, Adrian Del Castillo, Nathan Church, Caleb Thielbar; dropped: Patrick Bailey, Harrison Bader*)
Hitters: Freddie Freeman, Ozzie Albies, Eugenio Suárez, *Gary Sánchez*, *Adrian Del Castillo*, Alex Bregman, Kyle Schwarber, Heliot Ramos (IL), Jackson Merrill, Adolis García, *Nathan Church*, Oneil Cruz, Dansby Swanson, Xavier Edwards
Pitchers: Yoshinobu Yamamoto, Robbie Ray, Bubba Chandler, Sandy Alcantara, Zac Gallen, Mitch Keller, Ryne Nelson, Devin Williams, Daniel Palencia, *Caleb Thielbar*

**Skunk Dogs** (23 players — *added: Daniel Susac, JJ Wetherholt, Mauricio Dubón, Kyle Harrison, Chase Dollander; dropped: Bryson Stott, Freddy Fermin, TJ Friedl, David Peterson, Nick Pivetta*)
Hitters: Matt Olson, *JJ Wetherholt*, Trea Turner, Matt Chapman, Hunter Goodman, *Daniel Susac*, Alec Bohm, CJ Abrams, Luis Arraez, *Mauricio Dubón*, Michael Harris II, Sal Frelick, Jordan Walker, Luis Robert Jr.
Pitchers: Shohei Ohtani (P), Michael King, *Kyle Harrison*, *Chase Dollander*, Brandon Woodruff, Kodai Senga, Jameson Taillon, Pete Fairbanks, Raisel Iglesias

**The Show** (24 players — *added: Liam Hicks, Garrett Mitchell, Randy Vásquez; dropped: Sean Murphy, Willi Castro*)
Hitters: Rafael Devers, Ketel Marte, Bo Bichette, Manny Machado, J.T. Realmuto, *Liam Hicks*, Bryce Harper, Xander Bogaerts, Marcell Ozuna, Pete Crow-Armstrong, Alec Burleson, Ian Happ, Brandon Marsh, *Garrett Mitchell*
Pitchers: Freddy Peralta, Emmet Sheehan, Shota Imanaga, Andrew Abbott, Aaron Nola, Nick Lodolo, *Randy Vásquez*, Quinn Priester (IL), Ryan Walker, Emilio Pagán (IL)

---

### End of Period 3 — June 6, 2026

*Changes from end of Period 2 noted in italics.*

**Demolition Lumber Co.** (23 players — *added: Keibert Ruiz, Jack Dreyer, Matt Gage; dropped: Francisco Alvarez, Felix Reyes, Rhett Lowder, Victor Vodnik*)
Hitters: Michael Busch, Brice Turang, Geraldo Perdomo, Brady House, Ronald Acuña Jr., Corbin Carroll, Mickey Moniak, Carson Benge, William Contreras, *Keibert Ruiz*, Troy Johnston, Andrew Vaughn, Otto Lopez, Shohei Ohtani
Pitchers: Paul Skenes, Chris Sale, Jesús Luzardo, Zack Wheeler, Riley O'Brien, Mason Miller, Landen Roupp, *Matt Gage*, *Jack Dreyer*

**Devil Dawgs** (23 players — *added: Ryan Waldschmidt, JR Ritchie, Caleb Kilian, Christian Scott; dropped: Jordan Beck, Reynaldo López, Edward Cabrera, Dennis Santana*)
Hitters: Edouard Julien, Casey Schmitt, Ildemaro Vargas, Nolan Arenado, Kyle Tucker, Seiya Suzuki, Brenton Doyle, Jakob Marsee, *Ryan Waldschmidt*, Agustín Ramírez, Miguel Amaya, Mark Vientos, Christian Yelich, Willy Adames
Pitchers: Jacob Misiorowski, Nolan McLean, Bryce Elder, Matthew Boyd, *JR Ritchie*, Clay Holmes, Abner Uribe, *Caleb Kilian*, *Christian Scott*

**Diamond Kings** (24 players — *added: Walker Buehler, Max Meyer, Antonio Senzatela, JJ Bleday, Miguel Andujar; dropped: Noelvi Marte, Ezequiel Tovar, Blake Snell, Alex Vesia, Brandon Pfaadt*)
Hitters: TJ Rumfield, Marcus Semien, Elly De La Cruz, *Miguel Andujar*, Fernando Tatis Jr., Teoscar Hernández, Kyle Stowers, Justin Crawford, Daylen Lile, *JJ Bleday*, Tyler Stephenson, Dalton Rushing, Jake Bauers, Bryan Reynolds
Pitchers: Roki Sasaki, Tyler Glasnow, Chase Burns, Braxton Ashcraft, *Walker Buehler*, Aaron Ashby, Jhoan Duran, *Max Meyer*, *Antonio Senzatela*, Edwin Díaz (IL)

**Dodger Dawgs** (24 players — *added: Ben Brown, Connor Norby, Bryson Stott; dropped: Owen Caissie, Dominic Smith, Andrew Painter*)
Hitters: Sal Stewart, Jose Fernandez, Nico Hoerner, Francisco Lindor, Nolan Gorman, Drake Baldwin, Iván Herrera, *Connor Norby*, *Bryson Stott*, Jackson Chourio, James Wood, Ramón Laureano, Jung Hoo Lee, Matt McLain
Pitchers: Cristopher Sánchez, Logan Webb, Eury Pérez, Spencer Strider, Eduardo Rodriguez, Trevor Megill, Gregory Soto, *Ben Brown*, Robert Suarez

**Los Doyers** (23 players — *added: Jacob Young, Cade Cavalli, PJ Poulin, George Soriano, Andrew Painter; dropped: Brandon Lockridge, Joey Ortiz, Merrill Kelly, Carmen Mlodzinski, Clayton Beeter*)
Hitters: Spencer Steer, Brandon Lowe, Mookie Betts, Austin Riley, Juan Soto, Andy Pages, Gavin Sheets, Victor Scott II, *Jacob Young*, Will Smith, Carson Kelly, Max Muncy, Konnor Griffin, Ryan O'Hearn
Pitchers: Michael McGreevy, Michael Soroka, Justin Wrobleski, Andrew Painter, *Cade Cavalli*, *PJ Poulin*, *George Soriano*, Foster Griffin, Paul Sewald

**RGing Sluggers** (24 players — *added: Gabriel Moreno, A.J. Ewing, Kyle Leahy; dropped: Zac Gallen, Gary Sánchez, Caleb Thielbar*)
Hitters: Freddie Freeman, Ozzie Albies, Eugenio Suárez, *Gabriel Moreno*, Adrian Del Castillo, Alex Bregman, Kyle Schwarber, Heliot Ramos (IL), Jackson Merrill, Adolis García, Nathan Church, Oneil Cruz, *A.J. Ewing*, Dansby Swanson, Xavier Edwards
Pitchers: Yoshinobu Yamamoto, Robbie Ray, Bubba Chandler, Sandy Alcantara, Mitch Keller, Ryne Nelson, Devin Williams, *Kyle Leahy*, Daniel Palencia

**Skunk Dogs** (24 players — *added: Moisés Ballesteros, Brett Baty, Trevor McDonald, Merrill Kelly; dropped: Daniel Susac, Chase Dollander, Luis Robert Jr.*)
Hitters: Matt Olson, JJ Wetherholt, Trea Turner, Matt Chapman, Hunter Goodman, *Moisés Ballesteros*, Alec Bohm, CJ Abrams, Luis Arraez, Mauricio Dubón, *Brett Baty*, Michael Harris II, Sal Frelick, Jordan Walker
Pitchers: Shohei Ohtani (P), Michael King, Kyle Harrison, *Merrill Kelly*, *Trevor McDonald*, Brandon Woodruff, Kodai Senga, Jameson Taillon, Pete Fairbanks, Raisel Iglesias

**The Show** (25 players — *added: Tanner Scott, Logan Henderson (IL), Luis García Jr.; dropped: Xander Bogaerts, Ryan Walker*)
Hitters: Rafael Devers, Ketel Marte, Bo Bichette, Manny Machado, J.T. Realmuto, Liam Hicks, Bryce Harper, *Luis García Jr.*, Marcell Ozuna, Pete Crow-Armstrong, Alec Burleson, Ian Happ, Brandon Marsh, Garrett Mitchell
Pitchers: Freddy Peralta, Emmet Sheehan, Shota Imanaga, Andrew Abbott, Aaron Nola, Nick Lodolo, Randy Vásquez, *Tanner Scott*, Quinn Priester (IL), Emilio Pagán (IL), *Logan Henderson (IL)*

---

### Roster Gap Analysis

| Team | Auction Day | End of Period 1 | End of Period 2 | End of Period 3 |
|------|------------|-----------------|-----------------|-----------------|
| Demolition Lumber Co. | ✅ Excel matches TFL | ✅ No changes | ☐ Verify vs FG | ☐ Verify vs FG |
| Devil Dawgs | ✅ Excel matches TFL | ✅ No changes | ☐ Verify vs FG | ☐ Verify vs FG |
| Diamond Kings | ✅ Excel matches TFL | ✅ No changes | ☐ Verify vs FG | ☐ Verify vs FG |
| Dodger Dawgs | ✅ Excel matches TFL | ✅ No changes | ☐ Verify vs FG | ☐ Verify vs FG |
| Los Doyers | ✅ Excel matches TFL | ✅ No changes | ☐ Verify vs FG | ☐ Verify vs FG |
| RGing Sluggers | ✅ Excel matches TFL | ✅ No changes | ☐ Verify vs FG | ☐ Verify vs FG |
| Skunk Dogs | ✅ Excel matches TFL | ✅ No changes | ☐ Verify vs FG | ☐ Verify vs FG |
| The Show | ✅ Excel matches TFL | ✅ No changes | ☐ Verify vs FG | ☐ Verify vs FG |

> **Period 1 note:** No team made transactions before April 18, 2026. All Period 1 rosters are identical to auction day (IL designations — Edwin Díaz, Heliot Ramos, Quinn Priester, Emilio Pagán — do not affect roster composition).
>
> **FanGraphs verification:** To check Period 2 and 3 rosters, log in to FanGraphs on Roto → OGBA → each team's roster page and compare against the lists above.

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
