---
status: pending
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
