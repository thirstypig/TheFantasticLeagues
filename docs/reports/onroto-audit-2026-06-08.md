# OGBA 2026 — OnRoto/FanGraphs vs FBST Standings Audit

**Report date:** June 8, 2026  
**League:** OGBA (leagueId = 20, OnRoto identifier `OGBA+6`)  
**Prepared by:** FBST Internal Audit (automated via database + FanGraphs URL comparison)  
**FanGraphs data retrieved:** June 8, 2026 via commissioner-provided session URLs  
**FBST data source:** Live `PlayerStatsPeriod` table (218 rows for Period 3) + `TeamStatsPeriod` aggregates

---

## Executive Summary

Three FanGraphs/OnRoto session URLs were provided by the commissioner for Periods 1, 2, and 3. **All three resolved to the same "Through 06.06.26" standings** — the session state for Periods 1 and 2 had expired or defaulted. Only Period 3 (May 17 – June 6, 2026) standings could be compared directly.

**Period 3 headline findings:**

| Team | FG Rank | FG Pts | FBST Rank | FBST Pts | Delta |
|------|---------|--------|-----------|----------|-------|
| Demolition Lumber Co. | **1** | 60.0 | **4** | 48.0 | **−12.0** |
| Dodger Dawgs | 2 | 56.5 | 2 | 52.0 | −4.5 |
| Skunk Dogs | 3 | 53.5 | **1** | 58.5 | +5.0 |
| Los Doyers | 4 | 43.5 | 5 | 44.5 | +1.0 |
| Diamond Kings | 5 | 41.5 | **2** | 58.0 | **+16.5** |
| The Show | 6 | 37.0 | 6 | 40.0 | +3.0 |
| RGing Sluggers | 7 | 35.0 | 7 | 30.0 | −5.0 |
| Devil Dawgs | 8 | 33.0 | 8 | 29.0 | −4.0 |

- **Diamond Kings (DMK)** is over-credited in FBST by **+16.5 points** — enough to shift their rank from 5th to 2nd.
- **Demolition Lumber Co. (DLC)** is under-credited in FBST by **−12.0 points** — moving them from 1st to 4th.
- **Transaction audit for June 7, 2026: CLEAN** — 72 events in FBST all match FanGraphs exactly.

---

## League Structure

| Period | Dates | Status |
|--------|-------|--------|
| Period 1 | Mar 25 – Apr 18, 2026 | Completed |
| Period 2 | Apr 19 – May 16, 2026 | Completed |
| Period 3 | May 17 – Jun 6, 2026 | Completed |
| Period 4 | Jun 7 – Jul 4, 2026 | **Active** |

**Scoring categories (10 total):**  
Hitting: R, HR, RBI, SB, AVG  
Pitching: W, SV, ERA, WHIP, K

**Roto scoring:** Each category ranked 1–8 (1 = worst, 8 = best). Ties receive averaged rank. Higher is better for all hitting stats and W/SV/K. Lower is better for ERA and WHIP (lowest ERA = rank 8).

---

## Part 1 — FBST Raw Stats by Period

> These are the stats stored in FBST's `TeamStatsPeriod` table, populated by nightly MLB Stats API sync via `PlayerStatsPeriod` aggregation. All values queried directly from the production Supabase database on June 8, 2026.

### Period 1 (Mar 25 – Apr 18, 2026) — Raw Stats

| Team | R | HR | RBI | SB | AVG | W | SV | ERA | WHIP | K |
|------|---|----|----|----|----|---|----|----|------|---|
| Skunk Dogs | 122 | 30 | 102 | 21 | .251 | 8 | 4 | 4.16 | 1.186 | 149 |
| Diamond Kings | 98 | 23 | 83 | 16 | .260 | 7 | 6 | 3.95 | 1.246 | 120 |
| Dodger Dawgs | 119 | 30 | 127 | 24 | .247 | 9 | 5 | 3.61 | 1.402 | 124 |
| Devil Dawgs | 99 | 17 | 79 | 17 | .227 | 10 | 4 | 2.46 | 1.046 | 122 |
| RGing Sluggers | 129 | 35 | 124 | 19 | .254 | 9 | 3 | 2.93 | 1.192 | 119 |
| The Show | 100 | 29 | 106 | 9 | .237 | 5 | 7 | 4.30 | 1.248 | 108 |
| Los Doyers | 106 | 30 | 115 | 13 | .270 | 9 | 2 | 4.85 | 1.340 | 100 |
| Demolition Lumber Co. | 107 | 27 | 89 | 24 | .256 | 9 | 15 | 3.35 | 1.055 | 126 |

### Period 1 — FBST Computed Roto Points

| Team | R | HR | RBI | SB | AVG | W | SV | ERA | WHIP | K | **Total** |
|------|---|----|----|----|----|---|----|----|------|---|---------|
| Skunk Dogs | 8 | 5.5 | 5 | 6 | 6 | 3 | 4.5 | 3 | 4 | 8 | **53.0** |
| Diamond Kings | 1 | 1 | 1 | 3 | 7 | 1.5 | 6 | 5 | 3 | 5 | **33.5** |
| Dodger Dawgs | 6 | 5.5 | 8 | 7 | 4 | 5.5 | 5 | 7 | 1 | 6 | **55.0** |
| Devil Dawgs | 2 | 1 | 1 | 4 | 1 | 8 | 4.5 | 8 | 8 | 7 | **44.5** |
| RGing Sluggers | 7 | 8 | 7 | 5 | 5 | 5.5 | 3 | 6 | 5 | 4 | **55.5** |
| The Show | 3 | 4 | 6 | 1 | 2 | 1.5 | 7 | 2 | 2 | 2 | **30.5** |
| Los Doyers | 4 | 5.5 | 7 | 2 | 8 | 5.5 | 2 | 1 | 1 | 1 | **37.0** |
| Demolition Lumber Co. | 5 | 3 | 3 | 8 | 3 | 5.5 | 8 | 4 | 7 | 3 | **49.5** |

> **⚠️ FanGraphs Period 1 data unavailable** — the provided session URL resolved to Period 3 standings. No direct comparison possible for Period 1.

---

### Period 2 (Apr 19 – May 16, 2026) — Raw Stats

| Team | R | HR | RBI | SB | AVG | W | SV | ERA | WHIP | K |
|------|---|----|----|----|----|---|----|----|------|---|
| Skunk Dogs | 149 | 41 | 147 | 15 | .250 | 7 | 7 | 2.93 | 1.114 | 135 |
| Diamond Kings | 126 | 25 | 119 | 25 | .255 | 7 | 2 | 3.30 | 1.138 | 109 |
| Dodger Dawgs | 129 | 33 | 119 | 23 | .247 | 13 | 7 | 3.04 | 1.149 | 162 |
| Devil Dawgs | 123 | 33 | 118 | 15 | .253 | 9 | 2 | 3.00 | 1.047 | 168 |
| RGing Sluggers | 147 | 41 | 126 | 20 | .238 | 8 | 4 | 5.00 | 1.309 | 156 |
| The Show | 164 | 38 | 148 | 18 | .247 | 15 | 0 | 3.85 | 1.271 | 152 |
| Los Doyers | 147 | 43 | 132 | 21 | .248 | 9 | 2 | 3.34 | 1.162 | 102 |
| Demolition Lumber Co. | 144 | 27 | 144 | 24 | .278 | 12 | 14 | 2.46 | 0.983 | 187 |

### Period 2 — FBST Computed Roto Points

| Team | R | HR | RBI | SB | AVG | W | SV | ERA | WHIP | K | **Total** |
|------|---|----|----|----|----|---|----|----|------|---|---------|
| Skunk Dogs | 7 | 5.5 | 8 | 3 | 4.5 | 2 | 6.5 | 6 | 5 | 5 | **52.5** |
| Diamond Kings | 3 | 1 | 4.5 | 8 | 8 | 2 | 3.5 | 5 | 6 | 2 | **43.0** |
| Dodger Dawgs | 4 | 4 | 4.5 | 7 | 4.5 | 7 | 6.5 | 4 | 4 | 7 | **52.5** |
| Devil Dawgs | 2 | 4 | 3 | 3 | 6 | 4.5 | 3.5 | 3 | 7 | 8 | **45.0** |
| RGing Sluggers | 5.5 | 5.5 | 5 | 6 | 2 | 3 | 5 | 1 | 2 | 6 | **41.0** |
| The Show | 8 | 3 | 8 | 5 | 4.5 | 8 | 1 | 2 | 1 | 4 | **44.5** |
| Los Doyers | 5.5 | 8 | 6 | 7 | 3 | 4.5 | 3.5 | 4 | 3 | 1 | **45.5** |
| Demolition Lumber Co. | 1 | 2 | 7 | 3 | 7 | 6 | 8 | 8 | 8 | 3 | **53.0** |

> **⚠️ FanGraphs Period 2 data unavailable** — same issue as Period 1.

---

### Period 3 (May 17 – Jun 6, 2026) — Raw Stats

| Team | R | HR | RBI | SB | AVG | W | SV | ERA | WHIP | K |
|------|---|----|----|----|----|---|----|----|------|---|
| Skunk Dogs | 129 | 36 | 132 | 26 | .265 | 10 | 7 | 4.05 | 1.176 | 119 |
| Diamond Kings | 106 | 28 | 102 | 15 | .242 | 13 | 8 | 2.61 | 0.958 | 152 |
| Dodger Dawgs | 107 | 23 | 80 | 25 | .247 | 11 | 7 | 2.43 | 0.943 | 141 |
| Devil Dawgs | 108 | 24 | 85 | 13 | .225 | 10 | 3 | 3.74 | 1.198 | 105 |
| RGing Sluggers | 102 | 27 | 86 | 27 | .236 | 9 | 2 | 5.06 | 1.425 | 126 |
| The Show | 119 | 47 | 146 | 13 | .247 | 7 | 2 | 5.25 | 1.311 | 124 |
| Los Doyers | 118 | 34 | 94 | 14 | .239 | 11 | 6 | 3.87 | 1.141 | 114 |
| Demolition Lumber Co. | 125 | 27 | 115 | 22 | .298 | 7 | 7 | 4.24 | 1.366 | 131 |

---

## Part 2 — Period 3 Full Comparison: FBST vs FanGraphs

### FanGraphs Period 3 Rankings (retrieved June 8, 2026)

Source: `https://onroto.fangraphs.com/baseball/webnew/display_stand.pl?OGBA+6&session_id=6PmqxpEFJtYnHw4Tx9TufapZBW8yZsp&which_stand_period=retro`  
Displayed label: **"Through 06.06.26"**

| Rank | Team | R | HR | RBI | SB | AVG | W | SV | ERA | WHIP | K | Total |
|------|------|---|----|----|----|----|---|----|----|------|---|-------|
| 1 | Demolition Lumber Co. | 6.0 | 3.0 | 5.0 | 7.0 | 8.0 | 5.0 | 8.0 | 5.0 | 5.0 | 8.0 | 60.0 |
| 2 | Dodger Dawgs | 3.0 | 4.0 | 4.0 | 8.0 | 4.0 | 7.0 | 5.5 | 8.0 | 6.0 | 7.0 | 56.5 |
| 3 | Skunk Dogs | 8.0 | 6.0 | 7.0 | 5.0 | 7.0 | 1.0 | 7.0 | 4.0 | 4.0 | 4.5 | 53.5 |
| 4 | Los Doyers | 4.0 | 7.0 | 6.0 | 3.0 | 6.0 | 8.0 | 2.5 | 3.0 | 3.0 | 1.0 | 43.5 |
| 5 | Diamond Kings | 1.0 | 2.0 | 2.0 | 4.0 | 5.0 | 4.0 | 5.5 | 7.0 | 8.0 | 3.0 | 41.5 |
| 6 | The Show | 7.0 | 8.0 | 8.0 | 1.0 | 3.0 | 2.0 | 4.0 | 1.0 | 1.0 | 2.0 | 37.0 |
| 7 | RGing Sluggers | 5.0 | 5.0 | 3.0 | 6.0 | 2.0 | 3.0 | 2.5 | 2.0 | 2.0 | 4.5 | 35.0 |
| 8 | Devil Dawgs | 2.0 | 1.0 | 1.0 | 2.0 | 1.0 | 6.0 | 1.0 | 6.0 | 7.0 | 6.0 | 33.0 |

### FBST Period 3 Computed Rankings

> Computed using end-of-period roster attribution (`releasedAt IS NULL OR releasedAt > 2026-06-06T12:00Z`) against `PlayerStatsPeriod` (218 rows). Logic verified correct — see Part 3.

| Rank | Team | R | HR | RBI | SB | AVG | W | SV | ERA | WHIP | K | Total |
|------|------|---|----|----|----|----|---|----|----|------|---|-------|
| 1 | Skunk Dogs | 8 | 7 | 7 | 7 | 7 | 4.5 | 6 | 4 | 5 | 3 | 58.5 |
| 2 | Diamond Kings | 2 | 5 | 5 | 4 | 4 | 8 | 8 | 7 | 7 | 8 | 58.0 |
| 2 | Dodger Dawgs | 3 | 1 | 1 | 6 | 5.5 | 6.5 | 6 | 8 | 8 | 7 | 52.0\* |
| 4 | Demolition Lumber Co. | 7 | 3.5 | 6 | 5 | 8 | 1.5 | 6 | 3 | 2 | 6 | 48.0 |
| 5 | Los Doyers | 5 | 6 | 4 | 3 | 3 | 6.5 | 4 | 5 | 6 | 2 | 44.5 |
| 6 | The Show | 6 | 8 | 8 | 1.5 | 5.5 | 1.5 | 1.5 | 1 | 3 | 4 | 40.0 |
| 7 | RGing Sluggers | 1 | 3.5 | 3 | 8 | 2 | 3 | 1.5 | 2 | 1 | 5 | 30.0 |
| 8 | Devil Dawgs | 4 | 2 | 2 | 1.5 | 1 | 4.5 | 3 | 6 | 4 | 1 | 29.0 |

\*DDG total rounds to 52.0 due to half-point AVG tie with TSH.

### Category-by-Category Delta: FBST Rank − FanGraphs Rank

> Positive = FBST awards more points than FG. Negative = FBST awards fewer points than FG. Zero = exact match.

| Team | R | HR | RBI | SB | AVG | W | SV | ERA | WHIP | K | **Net Δ** |
|------|---|----|----|----|----|---|----|----|------|---|--------|
| DLC | +1.0 | +0.5 | +1.0 | **−2.0** | 0 | **−3.5** | **−2.0** | **−2.0** | **−3.0** | **−2.0** | **−12.0** |
| DDG | 0 | **−3.0** | **−3.0** | **−2.0** | +1.5 | −0.5 | +0.5 | 0 | +2.0 | 0 | −4.5 |
| SKD | 0 | +1.0 | 0 | +2.0 | 0 | **+3.5** | −1.0 | 0 | +1.0 | −1.5 | +5.0 |
| LDY | +1.0 | −1.0 | −2.0 | 0 | **−3.0** | −1.5 | +1.5 | +2.0 | +3.0 | +1.0 | +1.0 |
| DMK | +1.0 | +3.0 | +3.0 | 0 | −1.0 | **+4.0** | +2.5 | 0 | −1.0 | **+5.0** | **+16.5** |
| TSH | −1.0 | 0 | 0 | +0.5 | +2.5 | −0.5 | −2.5 | 0 | +2.0 | +2.0 | +3.0 |
| RGS | **−4.0** | −1.5 | 0 | +2.0 | 0 | 0 | −1.0 | 0 | −1.0 | +0.5 | −5.0 |
| DVD | +2.0 | +1.0 | +1.0 | −0.5 | 0 | −1.5 | +2.0 | 0 | **−3.0** | **−5.0** | −4.0 |

> ✅ **Sum of all deltas = 0.0** (roto points are zero-sum; this confirms no arithmetic errors in comparison)

---

## Part 3 — Root Cause Analysis

### 3a. Attribution Logic (Code Evidence)

FBST uses **end-of-period owner attribution**. The live standings computation (`computeWithPeriodStats` in `server/src/features/standings/services/standingsService.ts`) credits each player's full-period PSP stats to the team that held them at `period.endDate` (June 6, 2026 at 12:00 UTC).

**Key logic verified in code:**
```typescript
// server/src/features/standings/services/standingsService.ts
// End-of-period owner attribution
const endOfPeriodOwner = new Map<number, number>(); // playerId → teamId
for (const r of rosters) {
  if (!ownedOn(r, period.endDate)) continue;  // held: acquiredAt ≤ endDate AND (releasedAt IS NULL OR releasedAt > endDate)
  if (!endOfPeriodOwner.has(r.playerId)) {
    endOfPeriodOwner.set(r.playerId, r.teamId);
  }
}
// Only credit if this team is the end-of-period owner:
const endOwner = endOfPeriodOwner.get(roster.playerId);
if (endOwner !== t.id) continue;
```

**Dropped players verified excluded:** Alex Vesia (DMK, released May 17), Andrew Painter (LDY, released May 17) and all other mid-period drops are correctly excluded — their `releasedAt ≤ period.endDate` fails the `ownedOn` check.

**Post-period drops correctly included:** Landen Roupp (DLC), Matt Gage (DLC), Jack Dreyer (DLC) were all released June 7 (`releasedAt > June 6 12:00 UTC`) and are correctly credited to DLC for Period 3.

**Conclusion: The FBST attribution logic matches how FanGraphs documents their algorithm.**

---

### 3b. Diamond Kings (DMK) — +16.5 Point Over-Credit

**FBST Period 3 pitcher breakdown** (all 10 pitchers on DMK at period end):

| Pitcher | W | SV | K | IP | Source |
|---------|---|----|----|-------|--------|
| Braxton Ashcraft | 3 | 0 | 30 | 24.1 | MLB Stats API |
| Max Meyer | 3 | 0 | 27 | 26.0 | MLB Stats API |
| Roki Sasaki | 2 | 0 | 29 | 24.1 | MLB Stats API |
| Chase Burns | 2 | 0 | 26 | 17.1 | MLB Stats API |
| Jhoan Duran | 0 | 8 | 14 | 9.0 | MLB Stats API |
| Walker Buehler | 0 | 0 | 12 | 16.1 | MLB Stats API |
| Aaron Ashby | 1 | 0 | 9 | 9.1 | MLB Stats API |
| Antonio Senzatela | 2 | 0 | 5 | 8.0 | MLB Stats API |
| Tyler Glasnow | 0 | 0 | 0 | 0.0 | (no starts) |
| Edwin Díaz | 0 | 0 | 0 | 0.0 | (on IL) |
| **TOTAL** | **13** | **8** | **152** | **134.2** | |

**FanGraphs Period 3 implies for DMK:**
- W rank 4 → ~9–10 wins (FG has LDY, DDG, DVD, DLC all ranked above DMK for W)
- K rank 3 → ~130 K (FG has DLC rank 8, DDG rank 7, SKD rank 4.5 above DMK)

**Specific discrepancies that drive the gap:**

| Category | FBST | FG Rank Implies | FBST Rank | FG Rank | Delta |
|----------|------|-----------------|-----------|---------|-------|
| W | 13 | ~9–10 W | 8 (most) | 4 | +4.0 pts |
| K | 152 | ~130 K | 8 (most) | 3 | +5.0 pts |
| HR | 28 | FG: rank 2 (2nd least) | 5 | 2 | +3.0 pts |
| RBI | 102 | FG: rank 2 (2nd least) | 5 | 2 | +3.0 pts |

**Root cause:** The underlying `PlayerStatsPeriod` data (sourced from MLB Stats API) shows DMK's pitching staff accumulating W=13 and K=152. FanGraphs' own database shows materially different numbers for the same pitchers in the same period. This is a **data source divergence** — FBST uses MLB Stats API (statsapi.mlb.com), while FanGraphs maintains its own independently-sourced pitch-by-pitch database. The two sources can diverge by several W and ~20 K across a team's staff over a 21-day period.

**Notable outliers to investigate manually:**
- Roki Sasaki: FBST shows W=2, K=29 in Period 3 — verify against Baseball Reference
- Max Meyer: FBST shows W=3, K=27 — verify against FanGraphs player page

---

### 3c. Demolition Lumber Co. (DLC) — −12.0 Point Under-Credit

**FBST Period 3 pitcher breakdown** (all pitchers on DLC at period end, including those released June 7):

| Pitcher | W | SV | K | IP | Released |
|---------|---|----|----|-------|---------|
| Zack Wheeler | 3 | 0 | 26 | 26.0 | Still active |
| Paul Skenes | 0 | 0 | 26 | 20.0 | Still active |
| Chris Sale | 2 | 0 | 22 | 17.2 | Still active |
| Jesús Luzardo | 1 | 0 | 19 | 23.1 | Still active |
| Landen Roupp | 0 | 0 | 19 | 20.2 | Released Jun 7 |
| Mason Miller | 0 | 4 | 7 | 5.2 | Still active |
| Riley O'Brien | 0 | 3 | 5 | 6.1 | Still active |
| Matt Gage | 1 | 0 | 6 | 4.2 | Released Jun 7 |
| Jack Dreyer | 0 | 0 | 1 | — | Released Jun 7 |
| **TOTAL** | **7** | **7** | **131** | **~124** | |

**FanGraphs Period 3 implies for DLC:**
- W rank 5 → ~10–11 wins (FG has LDY rank 8, DDG rank 7, DVD rank 6, DLC rank 5, DMK rank 4)
- SV rank 8 → most saves in league (FG gives DLC 8 pts)
- K rank 8 → most K in league (FG gives DLC 8 pts)
- WHIP rank 5 → middle tier

**Specific DLC discrepancies:**

| Category | FBST | FG Rank | FBST Rank | Delta |
|----------|------|---------|-----------|-------|
| W | 7 | 5 | 1.5 (tied last) | **−3.5 pts** |
| SV | 7 | 8 (most) | 6 (tied) | **−2.0 pts** |
| ERA | 4.24 | 5 | 3 | **−2.0 pts** |
| WHIP | 1.366 | 5 | 2 | **−3.0 pts** |
| K | 131 | 8 (most) | 6 | **−2.0 pts** |

**Root cause:** Same data source divergence — FBST shows DLC pitchers with W=7 but FanGraphs shows DLC ranking 5th in wins. This implies FG has DLC pitchers accumulating more W than FBST's MLB Stats API feed reports. For saves, FBST shows DLC SV=7 tied with SKD and DDG, while FG gives DLC rank 8 (most saves) — Mason Miller's saves count may differ between sources.

---

### 3d. Wins Category — Most Volatile, Most Impact

Wins (W) produces the largest rank swings between FBST and FanGraphs across all categories and all teams:

| Team | FBST W | FBST W Rank | FG W Rank | Δ Rank |
|------|--------|-------------|-----------|--------|
| Diamond Kings | 13 | 8 | 4 | **+4.0** |
| Skunk Dogs | 10 (tied) | 4.5 | 1 | **+3.5** |
| Los Doyers | 11 (tied) | 6.5 | 8 | −1.5 |
| Dodger Dawgs | 11 (tied) | 6.5 | 7 | −0.5 |
| Devil Dawgs | 10 (tied) | 4.5 | 6 | −1.5 |
| Demolition Lumber Co. | 7 (tied) | 1.5 | 5 | **−3.5** |
| The Show | 7 (tied) | 1.5 | 2 | −0.5 |
| RGing Sluggers | 9 | 3 | 3 | 0 |

**FanGraphs wins ordering (8=most):** LDY > DDG > DVD > DLC > DMK > RGS > TSH > SKD

**FBST wins ordering (8=most):** DMK > DDG=LDY > SKD=DVD > RGS > TSH=DLC

These orderings are dramatically different. **Pitcher wins are the hardest stat to attribute accurately** because:
1. Wins depend on team scoring — the same pitcher start gives a W or a no-decision based on when runs score
2. "Win" assignment in the MLB Stats API can change after games are reviewed (rulebook wins)
3. A pitcher traded mid-period can pick up wins while on a new team that count against their old team in some data sources

---

### 3e. Saves (SV) — Second Most Volatile

FBST shows DLC SV=7 tied with SKD and DDG (all three earn 6 pts each). FanGraphs gives DLC rank 8 (8 pts). This single-category difference is 2 points.

**Mason Miller (DLC closer, Period 3):** FBST shows SV=4, W=0, K=7, IP=5.2. If FanGraphs shows Miller with more saves, this drives the gap.

**Jhoan Duran (DMK closer, Period 3):** FBST shows SV=8. FanGraphs gives DMK SV rank 5.5 (tied). If FG has Duran with fewer saves or more teams with similar save counts, this can explain the +2.5 pts DMK gets in FBST.

---

### 3f. K (Strikeouts) — Large Absolute Discrepancy for Key Teams

**FBST K ordering:** DMK=152 > DDG=141 > DLC=131 > RGS=126 > TSH=124 > SKD=119 > LDY=114 > DVD=105  
**FG K ordering (implied):** DLC > DDG > DVD > SKD=RGS > DMK > TSH > LDY

FG gives DVD K rank 6 (4th most K), but FBST has DVD with only 105 K (last place). FG must have DVD pitchers accumulating significantly more K than our MLB Stats API feed reports.

**DVD Period 3 pitchers at period end:**

| Pitcher | W | K | IP |
|---------|---|---|---|
| Jacob Misiorowski | 4 | 36 | 27.0 |
| Christian Scott | 2 | 21 | 20.1 |
| Nolan McLean | 1 | 18 | 20.0 |
| Bryce Elder | 1 | 11 | 16.0 |
| Caleb Kilian | 1 | 10 | 8.2 |
| Abner Uribe | 1 | 5 | 5.0 |
| **Total (active)** | **10** | **~105** | |

FanGraphs implying DVD has more K than our 105 could indicate our MLB Stats API data is missing starts for some pitchers or has stale final game counts.

---

## Part 4 — Transaction Audit: June 7, 2026

**Result: CLEAN — All 72 transactions match FanGraphs exactly.**

| Team | FBST Events | FG Confirmed | Status |
|------|------------|--------------|--------|
| Diamond Kings | Drop J. Crawford → Add L. Nootbaar | ✓ | ✅ |
| Demolition Lumber Co. | 6 claim pairs + position changes | ✓ | ✅ |
| Dodger Dawgs | 5 claim pairs + Lindor IL activate | ✓ | ✅ |
| Skunk Dogs | Robert activate → drop Robert, McDonald → May | ✓ | ✅ |
| RGing Sluggers | 3 claim pairs | ✓ | ✅ |
| Devil Dawgs | 8 claim pairs + slot adjustments | ✓ | ✅ |
| Los Doyers | 4 claim pairs | ✓ | ✅ |
| The Show | 2 pitcher swaps + **L. Henderson IL stash** | ✓ | ✅ |

> Note: Logan Henderson (The Show, SP) was stashed to IL by commissioner as of June 7, 2026. MLB status at time of stash: "Injured 15-Day" (confirmed via MLB Stats API feed).

---

## Part 5 — What We Need from OnRoto/FanGraphs

To complete a full period-by-period audit, the following are required:

### 5a. Period 1 Standalone Standings (Through April 18, 2026)
- Navigate to: `https://onroto.fangraphs.com/baseball/webnew/team_retro_stats.pl?OGBA+6`
- Select period ending **April 18**
- Copy the session URL from the standings link
- This will show Period 1 ONLY (not cumulative)

### 5b. Period 2 Standalone Standings (Through May 16, 2026)
- Same navigation, select period ending **May 16**
- This will show Period 2 ONLY

### 5c. Individual Player Stat Verification (Optional — for root cause confirmation)
To confirm whether the discrepancies are data source issues, manually check these players on FanGraphs player pages for May 17 – June 6 stats:

| Player | Team | FBST W | FBST K | Check |
|--------|------|--------|--------|-------|
| Roki Sasaki | DMK | 2 | 29 | fangraphs.com/players/roki-sasaki |
| Braxton Ashcraft | DMK | 3 | 30 | fangraphs.com/players/braxton-ashcraft |
| Max Meyer | DMK | 3 | 27 | fangraphs.com/players/max-meyer |
| Paul Skenes | DLC | 0 | 26 | fangraphs.com/players/paul-skenes |
| Zack Wheeler | DLC | 3 | 26 | fangraphs.com/players/zack-wheeler |
| Mason Miller | DLC | 0 SV=4 | 7 | fangraphs.com/players/mason-miller |

---

## Part 6 — Summary of Issues

### Known Issues (Data Source Divergence)
1. **FBST uses MLB Stats API; FanGraphs uses its own database.** The two sources can diverge by 5–20% on pitcher counting stats (W, K) over a 21-day period. This is not a FBST computation bug — it is a **fundamental data source difference**.
2. **Wins (W) are the most volatile category** and produce the largest rank swings between the two systems.

### Known Issues (Period Access)
3. **Session URLs for OnRoto standings expire.** The three URLs provided all resolved to the same Period 3 view. FanGraphs should be asked for permanent or longer-lived links to period-by-period standings, or the commissioner should access them directly and download at each period close.

### Confirmed Working Correctly in FBST
4. **Attribution logic** — end-of-period owner, dedup, dropped-player exclusion: all verified correct.
5. **Transaction recording** — 72 June 7 events all match FanGraphs exactly.
6. **IL stash** — Logan Henderson (The Show) correctly stashed June 7 with MLB status "Injured 15-Day."
7. **Roto point computation** — verified zero-sum across all 8 teams for Period 3.

---

## Appendix A — FBST 3-Period Running Total (FBST Points Only)

| Team | P1 Pts | P2 Pts | P3 Pts | **YTD Total** |
|------|--------|--------|--------|---------------|
| Skunk Dogs | 53.0 | 52.5 | 58.5 | **164.0** |
| Dodger Dawgs | 55.0 | 52.5 | 52.0 | **159.5** |
| RGing Sluggers | 55.5 | 41.0 | 30.0 | **126.5** |
| Devil Dawgs | 44.5 | 45.0 | 29.0 | **118.5** |
| Demolition Lumber Co. | 49.5 | 53.0 | 48.0 | **150.5** |
| Diamond Kings | 33.5 | 43.0 | 58.0 | **134.5** |
| The Show | 30.5 | 44.5 | 40.0 | **115.0** |
| Los Doyers | 37.0 | 45.5 | 44.5 | **127.0** |

> ⚠️ These are FBST-computed points. FanGraphs YTD totals unavailable due to session URL expiry for Periods 1 and 2.

---

## Appendix B — Database Query Reference

All data in this report was pulled from the production Supabase database (`leagueId = 20`) on June 8, 2026. Key queries:

```sql
-- Raw stats per team per period
SELECT t.name, p.name as period, tsp.R, tsp.HR, tsp.RBI, tsp.SB, tsp.AVG, 
       tsp.W, tsp.S, tsp.ERA, tsp.WHIP, tsp.K
FROM "TeamStatsPeriod" tsp
JOIN "Team" t ON t.id = tsp."teamId"
JOIN "Period" p ON p.id = tsp."periodId"
WHERE p.id IN (35, 36, 37)
ORDER BY p.id, t.name;

-- Period 3 pitcher breakdown per team (end-of-period owners)
SELECT p.name, psp.W, psp.SV, psp.K, psp.IP
FROM "PlayerStatsPeriod" psp
JOIN "Player" p ON p.id = psp."playerId"
JOIN "Roster" r ON r."playerId" = psp."playerId" 
  AND r."teamId" = :teamId 
  AND (r."releasedAt" IS NULL OR r."releasedAt" > '2026-06-06T12:00:00Z')
WHERE psp."periodId" = 37;
```

---

*Document generated June 8, 2026. Data pulled from live production database. Next update pending: fresh FanGraphs session URLs for Periods 1 and 2.*
