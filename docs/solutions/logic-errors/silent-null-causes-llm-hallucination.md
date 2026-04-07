---
title: "Case-sensitive Prisma query returned null standings, causing AI to hallucinate entire league digest"
date: 2026-04-06
category: logic-errors
tags: [prisma-query, case-sensitivity, ai-hallucination, data-integrity, prompt-engineering, string-mismatch]
modules: [mlb-feed, standings]
symptoms:
  - "AI digest contained fabricated player stats (e.g., 6 SBs for a player with 0)"
  - "Power rankings diverged wildly from actual standings (up to 5 spots off)"
  - "Major injuries (Mookie Betts IL) not mentioned despite being significant news"
  - "Category movers section cited made-up weekly numbers"
  - "Period query returned null due to status string mismatch, leaving digest with zero real data"
severity: high
---

# Silent Null Causes LLM Hallucination in League Digest

## Problem Statement

The weekly AI-generated league digest was full of fabricated statistics. A user noticed:
- "Scott II's incredible 6 SBs this week" — he actually had 0 SBs
- Los Doyers ranked #2 in power rankings despite being #7 in actual standings
- Mookie Betts going on IL wasn't mentioned despite being a major concern
- Category movers cited made-up weekly numbers

The digest looked plausible — real player names, realistic-sounding numbers — which made it hard to detect without manual verification.

## Root Cause

A case-sensitive string mismatch in a Prisma query. Line 213 of `server/src/features/mlb-feed/services/digestService.ts`:

```typescript
// BUG: DB stores "active" (lowercase), query used "ACTIVE" (uppercase)
prisma.period.findFirst({ where: { leagueId, status: "ACTIVE" } })
```

PostgreSQL string comparison is case-sensitive: `"ACTIVE" !== "active"`. The query returned `null`, so the `if (activePeriod)` block that computes standings data never ran. Every team's `statsLine` was empty.

The standings route (`standings/routes.ts`) already used the correct lowercase `"active"` — the inconsistency was confined to the digest service.

**This required two failures to become user-visible:**
1. A case mismatch causing a silent null (data layer)
2. An LLM that confidently fabricated data instead of admitting it had none (AI layer)

## Solution

### 1. Fix the Prisma query (digestService.ts)

```diff
- prisma.period.findFirst({ where: { leagueId, status: "ACTIVE" } })
+ prisma.period.findFirst({ where: { leagueId, status: "active" } })
```

### 2. Harden the AI prompt (aiAnalysisService.ts)

The prompt was restructured based on LLM attention patterns:

- **Moved accuracy rules to the top** — LLMs weight early instructions more heavily (primacy bias). Previously buried at rule #11 of 15+.
- **Added explicit "DATA FORMAT" section** — labels stats as "SEASON CUMULATIVE TOTALS" so the model cannot misinterpret them as weekly deltas.
- **Elevated injury rules from #11 to #4** — marked HIGH PRIORITY so injury data actually gets surfaced.
- **Added hard power rankings constraint** — maximum 2-spot deviation from actual standings.
- **Changed "FINAL CHECK" to self-audit** — "If ANY number doesn't appear in the data, DELETE and rewrite."

### 3. Verification

- Regenerated digest with real data — all stats traceable to DB values
- Power rankings now within 2 spots of standings
- Injuries prominently featured in commentary

## Key Insight: The Silent Data Absence Pattern

When an LLM prompt has missing data sections, the LLM fills them in with **plausible hallucinations** rather than saying "I don't have data." This makes silent data pipeline failures particularly dangerous in LLM-powered features because:

1. The output looks correct at first glance (real names, reasonable numbers)
2. There's no error, warning, or empty state — just wrong data
3. Only manual fact-checking by a domain expert catches it

## Prevention Strategies

### Database Layer

1. **Use Prisma enums** instead of raw strings for status fields — compile-time enforcement prevents mismatches entirely
2. **Create canonical constants** (`PERIOD_STATUS.ACTIVE = "active"`) and ban raw string literals in queries
3. **Normalize on write, not on read** — validate casing at ingestion boundaries

### LLM Pipeline Layer

1. **Validate data sufficiency BEFORE calling the LLM** — if standings count is 0, return "data unavailable" instead of generating
2. **Include data counts in the prompt** with a refusal instruction ("if any count is 0, respond with error JSON")
3. **Validate output against input programmatically** — verify team names, player names, and stat ranges post-generation
4. **Track the data-to-output ratio** — if the LLM mentions more entities than the input contains, it's hallucinating

### Testing Layer

1. **Integration test with real enum values** — seed DB with actual status strings and verify the query returns data
2. **"Zero data" assertion test** — call the digest pipeline with no seeded data and verify it does NOT produce a full report
3. **"Hallucination canary" test** — feed deliberately empty data and assert the output is an error, not a plausible report

### Monitoring Layer

1. **Log input data counts** for every AI generation — alert when counts are zero
2. **Post-generation audit** — cross-reference mentioned players/stats against DB
3. **Confidence metadata** on persisted insights — display warnings when data was thin

## Files Changed

| File | Change |
|------|--------|
| `server/src/features/mlb-feed/services/digestService.ts:213` | `"ACTIVE"` → `"active"` |
| `server/src/services/aiAnalysisService.ts:187-243` | Complete prompt rewrite (accuracy-first, injury priority, power ranking constraints) |

## Applicability

This pattern applies to **any feature where a data pipeline feeds an LLM**. The defense-in-depth approach is:

1. Ensure the data pipeline actually delivers data (fix the root cause)
2. Gate the LLM call on data sufficiency (prevent empty-data generation)
3. Validate LLM output against input data (catch hallucinations)
4. Monitor data-to-output ratios in production (detect drift)

Fixing either the data layer OR the AI layer independently would have prevented user impact. Fix both for resilience.
