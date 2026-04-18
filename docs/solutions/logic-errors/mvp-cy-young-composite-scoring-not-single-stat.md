---
title: "Fantasy MVP and Cy Young: Z-Score Composite Scoring, Not Single-Stat Ranking"
date: 2026-04-17
category: logic-errors
severity: medium
modules:
  - server/src/features/mlb-feed/services/digestService.ts
  - server/src/services/aiAnalysisService.ts
  - server/src/features/players/services/mlbStatsSyncService.ts
  - prisma/schema.prisma
symptoms:
  - MVP ranking showed players sorted by OPS only
  - Cy Young ranking showed pitchers sorted by ERA only
  - Single-stat approach did not reflect real award voting methodology
root_cause: Naive single-metric sort instead of multi-dimensional weighted composite
tags:
  - statistical-ranking
  - z-score
  - composite-scoring
  - fantasy-baseball
  - award-voting
  - mlb-api
---

# Fantasy MVP and Cy Young: Z-Score Composite Scoring

## The Bug

Initial implementation ranked Fantasy MVP candidates by OPS alone and Cy Young candidates by ERA alone. This produced misleading rankings — a player with .950 OPS but mediocre R/RBI/SB would outrank a more complete hitter, and a pitcher with low ERA but few strikeouts and high walk rate would lead the Cy Young race.

**User feedback**: "MVP is not determined just by OPS, and Cy Young is not determined just by ERA. MVP is determined by a combination of all the stats — all the hitting stats. Cy Young is a combination of all the pitching stats, even saves if that pitcher is doing really well."

## Root Cause

Two interconnected problems:

1. **Algorithmic**: Used `array.sort((a, b) => b.ops - a.ops)` for MVP — a single-metric sort that ignores 8 other hitting stats. Same pattern for Cy Young with ERA.

2. **Data gap**: The database schema only stored the 10 core fantasy categories (R, HR, RBI, SB, AVG, W, SV, K, ERA, WHIP). Additional stats needed for proper award evaluation (OBP, SLG, OPS, BB, TB, K/9, BB/9, etc.) were available in the MLB Stats API response but never extracted.

## The Fix

### Step 1: Extend the schema (16 new columns)

Added to both `PlayerStatsPeriod` and `PlayerStatsDaily`:

**Batting**: BB, HBP, SF, TB, DBL (doubles), TPL (triples), SO (strikeouts), OBP, SLG, OPS
**Pitching**: L (losses), GS (games started), QS (quality starts), K9, BB9, HR_A (HR allowed), BF (batters faced)

These fields were already in the MLB Stats API response — `parsePlayerStats()` just wasn't extracting them:

```typescript
// Previously ignored — now extracted
result.OBP = parseFloat(split.obp) || 0;
result.SLG = parseFloat(split.slg) || 0;
result.OPS = parseFloat(split.ops) || 0;
result.BB = split.baseOnBalls || 0;
result.TB = split.totalBases || 0;
result.K9 = parseFloat(split.strikeoutsPer9Inn) || 0;
// ... etc
```

### Step 2: Z-score normalization

Z-scores transform stats with different scales (HR: 0-50, AVG: .200-.350, ERA: 1.5-6.0) into a common unit: standard deviations above the league mean.

```typescript
const z = (vals: number[]) => {
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length) || 1;
  return vals.map(v => (v - mean) / sd);
};
```

A z-score of 1.0 means "one standard deviation above average" regardless of the stat. This makes cross-stat comparison meaningful.

For "lower is better" stats (ERA, WHIP, BB/9), the z-score is negated so that a low ERA produces a high positive score:

```typescript
const zERA = z(pitchers.map(p => p.era)).map(v => -v);
```

### Step 3: Weighted composite formulas

Weights derived from historical voting correlation research (FanGraphs community regression analyses, ESPN Cy Young Predictor formula, BBWAA voting patterns):

**Fantasy MVP** (min 50 AB):
```
MVP = (z_OPS × 3.0) + (z_HR × 2.5) + (z_OBP × 2.0)
    + (z_RBI × 1.5) + (z_R × 1.5) + (z_SB × 1.5)
    + (z_TB × 1.0) + (z_BB × 0.5) - (z_SO × 0.3)
```

**Fantasy Cy Young — Starters** (min 20 IP, 3+ GS):
```
CY_S = (z_ERA⁻¹ × 3.5) + (z_WHIP⁻¹ × 2.5) + (z_K × 2.0)
     + (z_K/9 × 1.5) + (z_IP × 1.5) + (z_W × 1.0)
     - (z_L × 0.5) - (z_HR_A × 0.5) + (z_BB/9⁻¹ × 0.5)
```

**Fantasy Cy Young — Relievers** (saves > 0, not a starter):
```
CY_R = (z_SV × 3.0) + (z_ERA⁻¹ × 3.0) + (z_WHIP⁻¹ × 2.0)
     + (z_K/9 × 1.5) + (z_K × 1.0) + (z_BB/9⁻¹ × 0.5) - (z_HR_A × 0.5)
```

Relievers receive a **0.7× discount** on their composite score before ranking alongside starters, reflecting the historical reality that relievers almost never win the Cy Young.

### Step 4: Integration with AI digest

The top 3 MVP and top 3 Cy Young candidates (with their composite scores and stat lines) are injected into the weekly digest AI prompt. The AI writes narrative analysis explaining why each player leads. Output is validated via Zod schema:

```typescript
fantasyMVP: z.array(z.object({
  rank: z.number().int().min(1),
  playerName: z.string().max(100),
  fantasyTeam: z.string().max(200),
  statLine: z.string().max(300),
  analysis: z.string().max(400),
})).max(3).optional(),
```

## Weight Rationale

| MVP Stat | Weight | Why |
|----------|--------|-----|
| OPS | 3.0 | Best single proxy for WAR (which we don't have). Combines power + discipline |
| HR | 2.5 | Historically ~1.77 pts per HR in FanGraphs MVP regression |
| OBP | 2.0 | Voters increasingly value plate discipline |
| RBI, R, SB | 1.5 each | Traditional counting stats, declining but still noticed |
| TB | 1.0 | Captures extra-base hit production beyond HR |
| BB | 0.5 | Extreme walk totals matter (partially captured in OBP) |
| SO | -0.3 | Mild penalty — voters slightly discount high-K hitters |

| CY Stat | Weight | Why |
|---------|--------|-----|
| ERA | 3.5 | #1 Cy Young stat historically. Winners avg 2.30 |
| WHIP | 2.5 | #2 rate stat. Winners avg 0.940 |
| K | 2.0 | Total strikeouts signal dominance. Winners avg 226 |
| K/9 | 1.5 | Rate-based strikeout efficiency |
| IP | 1.5 | Durability/workload. Voters reward 200+ IP |
| W | 1.0 | Dramatically declined in importance (Skenes won at 10-10) |

## Prevention: How to Avoid This Pattern

1. **Never rank by a single stat** when the real-world concept involves multiple dimensions. Ask: "What would a domain expert consider?"
2. **Z-score normalization** is the standard approach for multi-criteria ranking in fantasy sports analytics (FanGraphs, ESPN). It naturally handles different scales.
3. **Separate formulas for different roles** (starter vs reliever) — don't force fundamentally different positions into one ranking function.
4. **Minimum thresholds** prevent small-sample outliers (50 AB for hitters, 20 IP for starters).
5. **WAR is NOT in the MLB Stats API** — it requires FanGraphs ($15/mo) or Baseball Reference. Everything else (OBP, SLG, OPS, K/9, BB/9) is free from `statsapi.mlb.com`.

## Related Documentation

- [AI Grading Zero-Data Random Standings](ai-grading-zero-data-random-standings.md) — validate data meaningfulness before z-score computation
- [Silent Null Causes LLM Hallucination](silent-null-causes-llm-hallucination.md) — guard against empty stat arrays in AI prompts
- [Player News False-Positive Substring Match](player-news-false-positive-substring-match.md) — another case of naive algorithm → proper engineering

## Key Files

- `server/src/features/mlb-feed/services/digestService.ts:366-500` — z-score computation
- `server/src/services/aiAnalysisService.ts` — AI prompt + Zod schema
- `server/src/features/players/services/mlbStatsSyncService.ts:173-231` — extended stat extraction
- `prisma/schema.prisma` — PlayerStatsPeriod/Daily models with 16 new columns
