# Standings audit — Period 6

**Overall verdict: FINDINGS** (period leg: PASS · season leg: FINDINGS)

## Period 6 — FBST vs MLB statsapi

**Verdict: PASS**

Players checked: 212 · fetch errors: 0 · mismatches: 0 · PSP coverage gaps: 0


## Season to date — FBST vs FanGraphs

FanGraphs values are season-to-date (through 08.30.26), matched against FBST season-to-date totals summed across every active/completed period (Period 1, Period 2, Period 3, Period 4, Period 5, Period 6, Period 7). Residuals are the raw FBST-minus-FG difference: no divergence-explanation layer is applied, because no proposed mechanism has survived testing against the teams that reconcile exactly.

# Standings audit — Season to date — FBST vs FanGraphs

**Verdict: FINDINGS**

Players checked: 355 · skipped: 0
FanGraphs leg: **team-level**
Sources reached: fbst=yes · mlb=yes · fg=yes · bbref=yes

| Team | Explained by model difference | Unexplained residual |
|---|---|---|
| Skunk Dogs | — | — |
| Diamond Kings | — | R +2, HR +1, RBI +2, W +1, K +3 |
| Dodger Dawgs | — | — |
| Devil Dawgs | — | W +1, K +18 |
| RGing Sluggers | — | R +1, RBI +1, SB +1 |
| The Show | — | R +20, HR +8, RBI +24, SB +1, W +1, K +20 |
| Los Doyers | — | W +3, K +27 |
| Demolition Lumber Co.  | — | R +7, HR +2, RBI +12, W -2, SV -4, K -5 |

> Any non-zero residual requires the four-way tie-break (MLB statsapi + Baseball Reference) before stating a verdict. Do not round it away.