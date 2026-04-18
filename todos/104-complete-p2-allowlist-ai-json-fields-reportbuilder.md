---
status: complete
priority: p2
issue_id: "104"
tags: [code-review, security, reports, ai]
dependencies: []
---

# Allowlist AI JSON fields in reportBuilder output

## Problem Statement

`server/src/features/reports/services/reportBuilder.ts` passes `AiInsight.data` JSON blobs through to clients as `Record<string, unknown>` with no field filtering (lines 113, 141). The `AiInsight` model stores whatever the LLM returns. If a future prompt change or LLM hallucination includes sensitive data (roster prices, budget figures, user identifiers) in the JSON blob, that data would be forwarded to all league members.

CLAUDE.md rules say "NO auction prices, draft costs, or budget amounts" in weekly digests — but this is a prompt-level constraint, not code-level enforcement.

## Findings

### Agent: security-sentinel
- M1: Unbounded AI JSON passthrough. Prompt-level constraints are not security controls. A code-level allowlist prevents information leakage if AI output drifts.

### Agent: learnings-researcher
- Related: `docs/solutions/logic-errors/ai-grading-zero-data-random-standings.md` documents how AI can hallucinate from null data. Guards should be multi-layered: prompt + code validation.

## Proposed Solutions

### Solution 1: Server-side field allowlist (recommended)
Add a utility that strips unrecognized top-level keys from AI data before sending to clients:

```typescript
const DIGEST_SAFE_KEYS = new Set([
  "weekInOneSentence", "powerRankings", "hotTeam", "coldTeam",
  "statOfTheWeek", "categoryMovers", "proposedTrade", "boldPrediction",
]);

function filterAiData(data: Record<string, unknown>, safeKeys: Set<string>) {
  const filtered: Record<string, unknown> = {};
  for (const key of safeKeys) {
    if (key in data) filtered[key] = data[key];
  }
  return filtered;
}
```

- **Pros**: Defense-in-depth. Only known-safe fields reach the client.
- **Cons**: Requires updating the allowlist when new digest sections are added.
- **Effort**: Small (~15 min)
- **Risk**: Low — only affects reportBuilder output, not the stored AiInsight rows.

### Solution 2: Do nothing (prompt-level only)
- **Pros**: Zero effort.
- **Cons**: No defense if prompt constraints fail. Single point of failure.
- **REJECT** for a security finding.

## Recommended Action

Solution 1.

## Acceptance Criteria

- [ ] Digest data filtered through allowlist before inclusion in report response
- [ ] Team insights data filtered through allowlist before inclusion
- [ ] Unrecognized fields are silently dropped (not errored)
- [ ] New digest sections documented: add key to allowlist when adding sections

## Work Log

- **2026-04-16** (Session 67 `/ce:review`): Flagged by security-sentinel (M1) and learnings-researcher.

## Resources

- `server/src/features/reports/services/reportBuilder.ts:113,141` (passthrough points)
- `server/src/services/aiAnalysisService.ts` (prompt templates with section names)
- CLAUDE.md "League Digest Rules" section
