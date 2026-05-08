---
status: complete
priority: p2
issue_id: "175"
tags: [code-review, wire-list, architecture, dedup, security]
dependencies: []
---

# Wire List: free-agent detection duplicated; reuse via transactions/lib

## Problem Statement

`assertPlayerIsFA` in `server/src/features/wire-list/routes.ts:110-134` re-implements free-agent detection that already lives in the `transactions/` feature. The `transactions/` module has add/drop logic and `transactions/lib/positionInherit.ts` is already imported by `wire-list/processor.ts:27`, so the architectural pattern (shared `transactions/lib/`) exists — it just hasn't been extended to FA detection.

This is the exact failure mode documented in project memory `position_eligibility_layers.md` for position rules: three layers diverged because logic was copy-pasted instead of extracted. We should not repeat that mistake.

Additionally, the current implementation **fails open** when `mlbTeam === ""`: an empty string is treated as "free agent" (not on any MLB team → eligible). It should fail closed (treat empty/null as ineligible) to prevent any data-cleanliness edge from silently allowing bogus claims.

## Findings

- `server/src/features/wire-list/routes.ts:110-134` — `assertPlayerIsFA` reimplements FA check
- `server/src/features/wire-list/routes.ts:128-132` — fail-open on empty `mlbTeam`
- `server/src/features/wire-list/processor.ts:27` — already imports from `transactions/lib/positionInherit`
- `transactions/` feature has the existing add/drop logic but no `freeAgent.ts` helper yet

Per memory `position_eligibility_layers.md`: when the same logic lives in 3 places, drift is when, not if.

## Proposed Solutions

### Option 1: Extract `transactions/lib/freeAgent.ts` (recommended)
- Create `server/src/features/transactions/lib/freeAgent.ts` with `assertPlayerIsFreeAgent(playerId, leagueId, tx?)` returning `{ ok: true } | { ok: false; reason: string }`.
- Reuse from wire-list, legacy waivers, and transactions feature.
- Fail-closed on empty/null `mlbTeam`.

**Effort:** Small-medium (~2-3h with tests). **Risk:** Low.

### Option 2: Inline fail-closed fix only
Patch the immediate fail-open bug; leave duplication. Drift continues.

**Effort:** Trivial. **Risk:** Drift, fewer eyes on shared invariant.

### Option 3: Defer extraction; fix fail-open only
Same as Option 2.

## Recommended Action

**Option 1.** Extraction is cheap and the failure-mode precedent is documented. Pair with a brief check that legacy `waivers/routes.ts` is using the same logic — if so, migrate it too.

## Technical Details

- New file: `server/src/features/transactions/lib/freeAgent.ts`
- Update: `server/src/features/wire-list/routes.ts:110-134` to call shared helper
- Update: `server/src/features/waivers/routes.ts` if it has equivalent logic
- Fail-closed: treat `mlbTeam == null || mlbTeam === ""` as ineligible
- Update `CLAUDE.md` cross-feature import table

## Acceptance Criteria

- [ ] `transactions/lib/freeAgent.ts` is the single source of truth for FA detection
- [ ] Wire-list, legacy waivers, transactions all use the shared helper
- [ ] Player with empty/null `mlbTeam` is rejected (not silently treated as FA)
- [ ] Tests cover: rostered → reject; FA → accept; empty `mlbTeam` → reject
- [ ] CLAUDE.md cross-feature deps table updated

## Work Log

_(empty — created during /ce:review on 2026-05-07)_

## Resources

- Project memory: `position_eligibility_layers.md` (precedent for layer drift)
- File: `server/src/features/wire-list/routes.ts:110-134`
- File: `server/src/features/transactions/lib/positionInherit.ts` (existing shared lib)
