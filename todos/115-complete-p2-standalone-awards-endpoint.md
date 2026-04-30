---
status: complete
priority: p2
issue_id: "115"
tags: [code-review, agent-native, api, awards]
dependencies: []
---

# MVP/Cy Young z-score rankings are ephemeral — not independently queryable

## Problem Statement

The z-score composite MVP/Cy Young computation in `digestService.ts:366-500` produces rankings that are formatted as strings for the AI prompt, then discarded. The AI's interpretation (which may reorder or hallucinate) is what gets persisted in the digest. The raw computed data (z-scores, composite scores, stat lines) is the most valuable artifact but is thrown away.

## Proposed Solutions

### Solution 1: Extract + expose via endpoint (recommended)
Extract the MVP/Cy Young computation into a standalone function in `standingsService.ts`. Expose via `GET /api/standings/awards?leagueId=N`. The digest builder calls the same function.

- **Effort**: Medium (~30 min)

### Solution 2: Persist computed rankings alongside AI output
Store the raw z-score rankings in the `AiInsight.data` JSON blob alongside the AI interpretation. Agents read from the persisted data.

- **Effort**: Small (~15 min)

## Work Log
- **2026-04-18**: Flagged by agent-native-reviewer.
- **2026-04-30**: Shipped on `feat/agent-native-extended-stats-and-awards`. Took a hybrid of both proposed solutions:
  - **Extract**: New `server/src/features/mlb-feed/services/awardsService.ts` exports `computeAwardsRankings(leagueId, weekKey)` returning a typed `AwardsRankings` (mvp + cyYoung arrays with raw stats and per-component z-scores). Pure compute helpers `formatMvpForPrompt` / `formatCyYoungForPrompt` reproduce the legacy AI-prompt strings so digest behavior is unchanged.
  - **Persist**: `digestService.buildDigestContext` now calls the new service and threads `awardsRankings` onto the digest context. `digestRoutes.ts` writes the structured awards into the `AiInsight.data.awards` JSON when persisting a fresh digest, so each weekly snapshot includes the raw z-score breakdown (no schema migration — JSON column).
  - **Endpoint**: New `awardsRouter` mounted at `/api/leagues` exposes `GET /api/leagues/:leagueId/awards?weekKey=YYYY-WNN`. Read order: persisted digest → on-demand compute fallback (covers pre-#115 digests + ad-hoc queries before Sunday completes).
  - **No new table**: chose the smaller change per the brief — `AiInsight.data` already stores arbitrary JSON and is keyed by `(type, leagueId, teamId, weekKey)`.
  - **Tests**: 8 in `awardsService.test.ts` (empty league, MVP ranking, Cy Young ranking, z-score signs, prompt formatters); 5 in `awardsRoutes.test.ts` covering 400 / persisted round-trip / on-demand fallback / pre-#115 digest fallback / default weekKey.
