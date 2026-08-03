# Standings audit — Period 5

**Overall verdict: FINDINGS** (period leg: PASS · season leg: FINDINGS)

## Period 5 — FBST vs MLB statsapi

**Verdict: PASS**

Players checked: 219 · fetch errors: 0 · mismatches: 0 · PSP coverage gaps: 0


## Season to date — FBST vs FanGraphs

FanGraphs values are season-to-date (through 08.02.26), matched against FBST season-to-date totals summed across every active/completed period (Period 1, Period 2, Period 3, Period 4, Period 5, Period 6), with IL-exclusion divergences accumulated across all of those periods before residuals are computed.

# Standings audit — Season to date — FBST vs FanGraphs

**Verdict: FINDINGS**

Players checked: 336 · skipped: 0
FanGraphs leg: **team-level**
Sources reached: fbst=yes · mlb=yes · fg=yes · bbref=yes

| Team | Explained by model difference | Unexplained residual |
|---|---|---|
| Skunk Dogs | — | — |
| Diamond Kings | — | — |
| Dodger Dawgs | R +4, HR +1, RBI +4, SB +1 | R +4, HR +1, RBI +4, SB +1 |
| Devil Dawgs | R +5, HR +2, RBI +3 | R +5, HR +2, RBI +3 |
| RGing Sluggers | SV +2, K +4, R +5, HR +2, RBI +3 | R +5, HR +2, RBI +3, SV +2, K +4 |
| The Show | K +1 | K +1 |
| Los Doyers | R +3, HR +2, RBI +2, K +1 | R +3, HR +2, RBI +2, K +1 |
| Demolition Lumber Co.  | R +10, HR +3, RBI +7, SV +2, K +4 | R -1, RBI -2, SB -2, SV +2, K +8 |

## Attributed divergences

- **Skunk Dogs** — Quinn Priester (il_exclusion): —. IL window 2026-04-19..open covers start of period 36 (2026-04-19); FBST excludes, OnRoto counts YTD
- **Skunk Dogs** — Quinn Priester (il_exclusion): —. IL window 2026-04-19..open covers start of period 37 (2026-05-17); FBST excludes, OnRoto counts YTD
- **Skunk Dogs** — Luis Robert Jr. (il_exclusion): —. IL window 2026-05-17..2026-06-07 covers start of period 37 (2026-05-17); FBST excludes, OnRoto counts YTD
- **Skunk Dogs** — Quinn Priester (il_exclusion): —. IL window 2026-04-19..open covers start of period 38 (2026-06-07); FBST excludes, OnRoto counts YTD
- **Diamond Kings** — Edwin Díaz (il_exclusion): —. IL window 2026-05-17..2026-07-05 covers start of period 37 (2026-05-17); FBST excludes, OnRoto counts YTD
- **Diamond Kings** — Edwin Díaz (il_exclusion): —. IL window 2026-05-17..2026-07-05 covers start of period 38 (2026-06-07); FBST excludes, OnRoto counts YTD
- **Dodger Dawgs** — Jackson Chourio (il_exclusion): R +4, HR +1, RBI +4, SB +1. IL window 2026-04-19..2026-05-17 covers start of period 36 (2026-04-19); FBST excludes, OnRoto counts YTD
- **Dodger Dawgs** — Francisco Lindor (il_exclusion): —. IL window 2026-05-17..2026-06-07 covers start of period 37 (2026-05-17); FBST excludes, OnRoto counts YTD
- **Devil Dawgs** — Heliot Ramos (il_exclusion): —. IL window 2026-05-17..2026-07-05 covers start of period 37 (2026-05-17); FBST excludes, OnRoto counts YTD
- **Devil Dawgs** — Heliot Ramos (il_exclusion): R +5, HR +2, RBI +3. IL window 2026-05-17..2026-07-05 covers start of period 38 (2026-06-07); FBST excludes, OnRoto counts YTD
- **RGing Sluggers** — Daniel Palencia (il_exclusion): SV +2, K +4. IL window 2026-04-19..2026-05-17 covers start of period 36 (2026-04-19); FBST excludes, OnRoto counts YTD
- **RGing Sluggers** — Heliot Ramos (il_exclusion): —. IL window 2026-05-17..2026-07-05 covers start of period 37 (2026-05-17); FBST excludes, OnRoto counts YTD
- **RGing Sluggers** — Heliot Ramos (il_exclusion): R +5, HR +2, RBI +3. IL window 2026-05-17..2026-07-05 covers start of period 38 (2026-06-07); FBST excludes, OnRoto counts YTD
- **The Show** — Quinn Priester (il_exclusion): —. IL window 2026-04-19..open covers start of period 36 (2026-04-19); FBST excludes, OnRoto counts YTD
- **The Show** — Emilio Pagán (il_exclusion): —. IL window 2026-05-17..2026-07-05 covers start of period 37 (2026-05-17); FBST excludes, OnRoto counts YTD
- **The Show** — Quinn Priester (il_exclusion): —. IL window 2026-04-19..open covers start of period 37 (2026-05-17); FBST excludes, OnRoto counts YTD
- **The Show** — Emilio Pagán (il_exclusion): K +1. IL window 2026-05-17..2026-07-05 covers start of period 38 (2026-06-07); FBST excludes, OnRoto counts YTD
- **The Show** — Quinn Priester (il_exclusion): —. IL window 2026-04-19..open covers start of period 38 (2026-06-07); FBST excludes, OnRoto counts YTD
- **Los Doyers** — Mookie Betts (il_exclusion): R +3, HR +2, RBI +2. IL window 2026-04-19..2026-05-17 covers start of period 36 (2026-04-19); FBST excludes, OnRoto counts YTD
- **Los Doyers** — Emilio Pagán (il_exclusion): —. IL window 2026-05-17..2026-07-05 covers start of period 37 (2026-05-17); FBST excludes, OnRoto counts YTD
- **Los Doyers** — Emilio Pagán (il_exclusion): K +1. IL window 2026-05-17..2026-07-05 covers start of period 38 (2026-06-07); FBST excludes, OnRoto counts YTD
- **Los Doyers** — Konnor Griffin (il_exclusion): —. IL window 2026-08-02..open covers start of period 40 (2026-08-02); FBST excludes, OnRoto counts YTD
- **Los Doyers** — Will Smith (il_exclusion): —. IL window 2026-08-02..open covers start of period 40 (2026-08-02); FBST excludes, OnRoto counts YTD
- **Demolition Lumber Co. ** — Andrew Vaughn (il_exclusion): R +5, HR +1, RBI +5. IL window 2026-04-19..2026-05-17 covers start of period 36 (2026-04-19); FBST excludes, OnRoto counts YTD
- **Demolition Lumber Co. ** — Daniel Palencia (il_exclusion): SV +2, K +4. IL window 2026-04-19..2026-05-17 covers start of period 36 (2026-04-19); FBST excludes, OnRoto counts YTD
- **Demolition Lumber Co. ** — Ronald Acuña Jr. (il_exclusion): R +5, HR +2, RBI +2. IL window 2026-07-05..2026-08-02 covers start of period 39 (2026-07-05); FBST excludes, OnRoto counts YTD

> Any non-zero residual requires the four-way tie-break (MLB statsapi + Baseball Reference) before stating a verdict. Do not round it away.