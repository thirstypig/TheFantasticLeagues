---
status: complete
priority: p3
issue_id: 295
tags: [code-review, quality, standings, dry]
dependencies: []
---

## Problem Statement

`PITCHER_CODES` is defined independently in two places that must stay in lockstep for stat attribution to agree between production and the audit cross-check:

- Production: a **Set** in `standingsService.ts` (used via `.has`, ~line 741).
- Audit: an **array** in `fangraphs-audit.ts:35` (used via `.includes`).

Same values today, but they're separate literals. If one gains a code (e.g. a new reliever slot) and the other doesn't, the FanGraphs audit silently diverges from production attribution — defeating the audit's purpose as an independent check.

## Findings

- **Files**: `server/src/features/standings/services/standingsService.ts` (`PITCHER_CODES` Set); `server/src/scripts/fangraphs-audit.ts:35` (array).
- **Severity**: P3 — no current bug; latent drift risk on the pitcher hitting/pitching split.
- Note (architecture-strategist): the audit's accumulation loop should NOT be consolidated with production's (they use intentionally different attribution models — end-of-period-owner vs ownership-overlap). Only the mechanical shared bits (`PITCHER_CODES`, and optionally a `creditSplit(roster)` two-way/IL helper) are safe to share.

## Proposed Solution

Export a single canonical `PITCHER_CODES` (Set) from `server/src/lib/sportConfig.ts` and import it in both standingsService and fangraphs-audit. Adjust the audit's `.includes` to `.has`.

- **Effort**: Small. **Risk**: Low.

## Recommended Action

(blank — triage)

## Acceptance Criteria

- [ ] One `PITCHER_CODES` exported from `lib/sportConfig.ts`; both call sites import it.
- [ ] Audit + standings tests green; FG audit output unchanged.
- [ ] `git mv` this todo to complete.

## Work Log

- 2026-06-29: Filed from `/ce:review` (architecture-strategist P3). Do NOT consolidate the accumulation algorithms — only the shared constant.
- 2026-06-29: RESOLVED (PR fix/review-followups). The audit's local array was ALSO stale — it had only `["P","SP","RP","CL"]`, missing `TWP` (two-way pitcher) which the canonical `PITCHER_CODES_SET` in sportConfig includes. So this was a live divergence, not just a hygiene risk. Removed the local array; `fangraphs-audit.ts` now imports `PITCHER_CODES_SET` from `lib/sportConfig.js` and uses `.has`. Audit + standings tests green.
