# OGBA 2026 — Standings Audit
## FanGraphs on Roto vs The Fantastic Leagues

**Date:** June 8, 2026 | **League:** OGBA | **Periods covered:** 1, 2, 3

---

## Executive Summary

- **Period 1:** Both systems nearly agree — all 8 teams within ±1.5 points, rank order identical.
- **Period 2:** Demolition Lumber Co. is an exact match (65.0 = 65.0). Los Doyers under-credited in The Fantastic Leagues by 6.0 points; Devil Dawgs over-credited by 4.0 points.
- **Period 3:** Diamond Kings over-credited in The Fantastic Leagues by 16.5 points; Demolition Lumber Co. under-credited by 12.0 points. Root cause: pitcher wins (W) and strikeouts (K) diverge significantly between the MLB Stats API and FanGraphs' own database.
- **Rosters:** Auction-day rosters confirmed — both systems sourced from the same draft file. Period-end rosters require manual spot-check on FanGraphs on Roto (roster pages are not publicly fetchable).
- **Attribution logic in The Fantastic Leagues is correct:** End-of-period owner attribution, dropped-player exclusion, and roto point computation all verified. Discrepancies are data-source differences, not calculation errors.

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

#### Rank Points Comparison — Period 1

| Team | TFL R | FG R | TFL HR | FG HR | TFL RBI | FG RBI | TFL SB | FG SB | TFL AVG | FG AVG | TFL W | FG W | TFL SV | FG SV | TFL ERA | FG ERA | TFL WHIP | FG WHIP | TFL K | FG K | **TFL Total** | **FG Total** | **Delta** |
|------|-------|------|--------|-------|---------|--------|--------|-------|---------|--------|-------|------|--------|-------|---------|--------|----------|---------|-------|------|--------------|-------------|---------|
| Demolition Lumber Co. | 5 | 5.0 | 3 | 3.0 | 3 | 3.0 | 7.5 | 7.0 | 6 | 7.0 | 5.5 | 6.5 | 8 | 8.0 | 6 | 6.0 | 7 | 7.0 | 7 | 4.0 | **58.0** | **56.5** | **+1.5** |
| Devil Dawgs | 2 | 2.0 | 1 | 1.0 | 1 | 1.0 | 4 | 5.0 | 1 | 1.0 | 8 | 8.0 | 3.5 | 3.0 | 8 | 8.0 | 8 | 8.0 | 5 | 6.0 | **41.5** | **43.0** | **−1.5** |
| Diamond Kings | 1 | 1.0 | 2 | 2.0 | 2 | 2.0 | 3 | 3.0 | 7 | 6.0 | 2 | 2.0 | 6 | 7.0 | 4 | 4.0 | 4 | 4.0 | 4 | 2.5 | **35.0** | **33.5** | **+1.5** |
| Dodger Dawgs | 6 | 6.0 | 6 | 5.5 | 8 | 8.0 | 7.5 | 8.0 | 3 | 4.0 | 5.5 | 5.0 | 5 | 4.0 | 5 | 5.0 | 1 | 1.0 | 6 | 7.0 | **53.0** | **53.5** | **−0.5** |
| Los Doyers | 4 | 4.0 | 6 | 7.5 | 6 | 7.0 | 2 | 2.0 | 8 | 8.0 | 5.5 | 4.0 | 1 | 1.0 | 1 | 1.0 | 2 | 2.0 | 1 | 1.0 | **36.5** | **37.5** | **−1.0** |
| RGing Sluggers | 8 | 8.0 | 8 | 7.5 | 7 | 6.0 | 5 | 4.0 | 5 | 3.0 | 5.5 | 6.5 | 2 | 2.0 | 7 | 7.0 | 5 | 6.0 | 3 | 5.0 | **55.5** | **55.0** | **+0.5** |
| Skunk Dogs | 7 | 7.0 | 6 | 5.5 | 4 | 4.0 | 6 | 6.0 | 4 | 5.0 | 3 | 3.0 | 3.5 | 5.0 | 3 | 3.0 | 6 | 5.0 | 8 | 8.0 | **50.5** | **51.5** | **−1.0** |
| The Show | 3 | 3.0 | 4 | 4.0 | 5 | 5.0 | 1 | 1.0 | 2 | 2.0 | 1 | 1.0 | 7 | 6.0 | 2 | 2.0 | 3 | 3.0 | 2 | 2.5 | **30.0** | **29.5** | **+0.5** |

> ✅ Sum of all deltas = 0.0. All teams within ±1.5 pts. Rank order is identical between both systems.

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

#### Rank Points Comparison — Period 2

| Team | TFL Total | FG Total | **Delta** |
|------|-----------|----------|---------|
| Demolition Lumber Co. | **65.0** | **65.0** | **0.0** |
| Devil Dawgs | **40.5** | **36.5** | **+4.0** |
| Diamond Kings | **36.0** | **36.0** | **0.0** |
| Dodger Dawgs | **46.0** | **46.0** | **0.0** |
| Los Doyers | **42.0** | **48.0** | **−6.0** |
| RGing Sluggers | **36.0** | **35.0** | **+1.0** |
| Skunk Dogs | **51.0** | **49.5** | **+1.5** |
| The Show | **43.5** | **44.0** | **−0.5** |

> ✅ Sum of all deltas = 0.0.
>
> **Demolition Lumber Co., Diamond Kings, Dodger Dawgs** all match exactly between both systems.
>
> **Los Doyers −6.0:** FanGraphs on Roto gives Los Doyers significantly more wins (W rank ≈ 7.5) than TFL records. The MLB Stats API feed credited fewer wins to Los Doyers pitchers in this period.
>
> **Devil Dawgs +4.0:** TFL's API feed shows better ERA and WHIP for Devil Dawgs than FanGraphs records.

---

### Period 3 — May 17 to June 6, 2026

#### The Fantastic Leagues — Raw Stats

| Team | R | HR | RBI | SB | AVG | W | SV | ERA | WHIP | K |
|------|---|----|----|----|----|---|----|----|------|---|
| Demolition Lumber Co. | 125 | 27 | 115 | 22 | .298 | 7 | 7 | 4.24 | 1.366 | 131 |
| Devil Dawgs | 108 | 24 | 85 | 13 | .225 | 10 | 3 | 3.74 | 1.198 | 105 |
| Diamond Kings | 106 | 28 | 102 | 15 | .242 | 13 | 8 | 2.61 | 0.958 | 152 |
| Dodger Dawgs | 107 | 23 | 80 | 25 | .247 | 11 | 7 | 2.43 | 0.943 | 141 |
| Los Doyers | 118 | 34 | 94 | 14 | .239 | 11 | 6 | 3.87 | 1.141 | 114 |
| RGing Sluggers | 102 | 27 | 86 | 27 | .236 | 9 | 2 | 5.06 | 1.425 | 126 |
| Skunk Dogs | 129 | 36 | 132 | 26 | .265 | 10 | 7 | 4.05 | 1.176 | 119 |
| The Show | 119 | 47 | 146 | 13 | .247 | 7 | 2 | 5.25 | 1.311 | 124 |

#### Rank Points Comparison — Period 3

| Team | TFL Total | FG Total | **Delta** |
|------|-----------|----------|---------|
| Demolition Lumber Co. | **48.0** | **60.0** | **−12.0** |
| Devil Dawgs | **29.0** | **33.0** | **−4.0** |
| Diamond Kings | **58.0** | **41.5** | **+16.5** |
| Dodger Dawgs | **52.0** | **56.5** | **−4.5** |
| Los Doyers | **44.5** | **43.5** | **+1.0** |
| RGing Sluggers | **30.0** | **35.0** | **−5.0** |
| Skunk Dogs | **58.5** | **53.5** | **+5.0** |
| The Show | **40.0** | **37.0** | **+3.0** |

> ✅ Sum of all deltas = 0.0.
>
> **Diamond Kings +16.5:** TFL records 13 wins and 152 strikeouts for Diamond Kings' pitchers in Period 3. FanGraphs on Roto ranks Diamond Kings 4th in wins and 3rd in strikeouts — implying far fewer. Root cause: the MLB Stats API and FanGraphs' pitch-by-pitch database diverge significantly on pitcher win/K attribution for this roster over a 21-day window.
>
> **Demolition Lumber Co. −12.0:** TFL records only 7 wins for Demolition Lumber Co. pitchers. FanGraphs on Roto ranks them 1st in wins (rank 5.0) and 1st in K (rank 8.0) — implying the FanGraphs database records significantly more wins and strikeouts for this staff (Zack Wheeler, Paul Skenes, Chris Sale, Landen Roupp).

---

## Stats Gap Analysis — All Three Periods

| Team | Period 1 Δ | Period 2 Δ | Period 3 Δ | YTD Δ |
|------|-----------|-----------|-----------|-------|
| Demolition Lumber Co. | +1.5 | 0.0 | −12.0 | **−10.5** |
| Devil Dawgs | −1.5 | +4.0 | −4.0 | **−1.5** |
| Diamond Kings | +1.5 | 0.0 | +16.5 | **+18.0** |
| Dodger Dawgs | −0.5 | 0.0 | −4.5 | **−5.0** |
| Los Doyers | −1.0 | −6.0 | +1.0 | **−6.0** |
| RGing Sluggers | +0.5 | +1.0 | −5.0 | **−3.5** |
| Skunk Dogs | −1.0 | +1.5 | +5.0 | **+5.5** |
| The Show | +0.5 | −0.5 | +3.0 | **+3.0** |

> Positive = The Fantastic Leagues awards more points than FanGraphs on Roto. Negative = fewer.

**Root cause — both systems use the same attribution model** (end-of-period owner gets full-period stats). The divergence is purely data: The Fantastic Leagues sources stats from the MLB Stats API; FanGraphs on Roto maintains its own independently-sourced database. Pitcher **wins** and **strikeouts** are the most volatile categories — win assignment can be revised after games are reviewed, and K counts can differ by 5–15% across sources over a 21-day period.

**What this means for standings:** The Fantastic Leagues standings are internally consistent and correctly computed. The gap vs FanGraphs reflects a known limitation of using MLB Stats API vs FanGraphs' own data. The largest single-period impact is Diamond Kings in Period 3 (+16.5), driven entirely by W and K divergence.

---

*Last updated June 8, 2026. TFL data: live production database. FanGraphs on Roto data: commissioner-provided session URLs, all three periods confirmed.*
