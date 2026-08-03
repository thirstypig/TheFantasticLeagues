# Standings audit — Period 5

**Verdict: FINDINGS**

Players checked: 219 · skipped: 0
FanGraphs leg: **team-level**
Sources reached: fbst=yes · mlb=yes · fg=yes · bbref=yes

| Team | Explained by model difference | Unexplained residual |
|---|---|---|
| Skunk Dogs | — | AB +999, H +261, R -570, HR -158, RBI -548, SB -85, W -34, SV -31, K -594, IP +137.66666666666666, ER +61, BB_H +164 |
| Diamond Kings | — | AB +1014, H +250, R -490, HR -120, RBI -469, SB -75, W -50, SV -25, K -629, IP +105.33333333333333, ER +61, BB_H +153 |
| Dodger Dawgs | — | AB +1117, H +293, R -572, HR -137, RBI -516, SB -107, W -45, SV -26, K -610, IP +155.6666666666667, ER +76, BB_H +214 |
| Devil Dawgs | — | AB +863, H +217, R -458, HR -96, RBI -383, SB -76, W -40, SV -13, K -647, IP +178, ER +73, BB_H +215 |
| RGing Sluggers | — | AB +1058, H +276, R -543, HR -156, RBI -518, SB -88, W -48, SV -14, K -611, IP +148.33333333333331, ER +46, BB_H +162 |
| The Show | — | AB +1119, H +282, R -618, HR -198, RBI -638, SB -64, W -37, SV -19, K -577, IP +156.33333333333331, ER +60, BB_H +188 |
| Los Doyers | — | AB +723, H +166, R -527, HR -151, RBI -521, SB -68, W -49, SV -15, K -559, IP +159.99999999999997, ER +76, BB_H +204 |
| Demolition Lumber Co.  | AB +22, H +3, R +5, HR +2, RBI +2 | AB +980, H +236, R -564, HR -132, RBI -521, SB -96, W -45, SV -47, K -688, IP +165, ER +57, BB_H +163 |

## Attributed divergences

- **Demolition Lumber Co. ** — Ronald Acuña Jr. (il_exclusion): AB +22, H +3, R +5, HR +2, RBI +2. IL window 2026-07-05..2026-08-02 covers start of period 39 (2026-07-05); FBST excludes, OnRoto counts YTD

> Any non-zero residual requires the four-way tie-break (MLB statsapi + Baseball Reference) before stating a verdict. Do not round it away.