---
status: complete
priority: p2
issue_id: 294
tags: [code-review, types, standings, correctness, week2]
dependencies: []
---

## Problem Statement

The `as TeamStatRow` cast added in `aggregateSeasonStatsFromCsv` launders a real runtime absence. `TeamStatRow` now declares `AVG`, `ERA`, `WHIP` as **required** `number`, but the CSV path populates them only conditionally:

```ts
if (ab > 0) rateStats["AVG"] = h / ab;   // standingsService.ts:284
if (ip > 0) rateStats["ERA"] = (er/ip)*9; // :288
if (ip > 0) rateStats["WHIP"] = bb_h/ip;  // :291
```

A team with `AB === 0` (or `IP === 0`) produces a row with **no `AVG`/`ERA`/`WHIP` key at runtime**, yet `... as TeamStatRow` (`:306`) asserts they're present numbers — the cast exists precisely because it suppresses TS's correct "property 'AVG' is missing" error. The DB paths (`computeWithDailyStats:651-663`, `mergeTeamStatRows:554-567`) construct the row explicitly with `… ? … : 0` fallbacks and need no cast — they're sound; only the CSV path lies.

It is latent (not crashing) because consumers defensively guard: `computeCategoryRows:137` and `getTeamStatValue:330` do `typeof === "number" ? … : 0`. Hence P2, not P1.

## Findings

- **File**: `server/src/features/standings/services/standingsService.ts:284-291, 298-306` (cast); type decl `:31-39`.
- **Severity**: P2 — correctness/contract integrity on the standings path; currently masked by defensive callers.
- **Architectural note (from architecture-strategist):** the re-pinned MLB members (`R…WHIP` required) also re-entrench baseball assumptions against the in-progress sport-agnostic Week-2 refactor — a non-baseball `TeamStatRow` built via `computeCategoryRows` won't have these keys, yet the type guarantees them. The cast is the seam where sport-specific bugs will hide.
- **Known Pattern**: [[standings_stats_architecture]], [[week2_standings_refactor]]; ranking reads dynamically (`s[dbField]`) so the engine itself never needs the named members.

## Proposed Solutions

### Option A (interim, recommended now) — construct explicitly, drop the cast
Make the CSV path build the row like the DB paths: `AVG: ab > 0 ? h/ab : 0`, `ERA: ip > 0 ? (er/ip)*9 : 0`, `WHIP: ip > 0 ? bb_h/ip : 0`, spreading the counting stats explicitly. Removes the only cast in the file; all three constructors become consistent; the contract stops lying.
- **Effort**: Small. **Risk**: Low (matches existing DB-path behavior; callers already tolerate 0).

### Option B (end-state, ties to Week 2) — nested `stats: Record<string, number>`
```ts
interface TeamStatRow { team: {...}; stats: Record<string, number>; }
```
Readers use `row.stats[key]` (dynamic) and `row.stats.R` (arithmetic). Removes the index-signature `{team}|undefined` widening that actually broke tsc, removes the cast, and removes the MLB-required-member lie — genuinely sport-agnostic. Larger diff but the flat access points are few/centralized.
- **Effort**: Medium. **Risk**: Medium. **Recommendation**: do this as part of the Week-2 `computeTeamStats()` refactor; until then ship Option A and mark the required `AVG/ERA/WHIP` as the interim debt.

## Recommended Action

(blank — triage)

## Technical Details

- Affected: `server/src/features/standings/services/standingsService.ts`.
- If staying with the hybrid interim, alternatively mark `AVG?/ERA?/WHIP?` optional to match the conditional population — but Option A (0-defaults) is preferred for caller simplicity.

## Acceptance Criteria

- [ ] CSV path constructs `AVG/ERA/WHIP` with explicit `: 0` fallbacks; `as TeamStatRow` cast removed.
- [ ] All three row constructors consistent; server tsc clean; standings tests green.
- [ ] Week-2 nested-`stats` end-state captured in `docs/WEEK2_PROGRESS.md` as the target shape.
- [ ] `git mv` this todo to complete.

## Work Log

- 2026-06-29: Filed from `/ce:review` (kieran-typescript-reviewer P2 + architecture-strategist P2, same root). Introduced as a pragmatic CI unblock this session; flagged so the interim pin doesn't harden into the permanent shape.
- 2026-06-29: RESOLVED interim (PR fix/review-followups). CSV path now emits `AVG/ERA/WHIP` with `0` fallbacks unconditionally (`ab>0 ? h/ab : 0`, etc.), so the required rate members can no longer be missing at runtime — the laundered-absence bug is gone. The `as TeamStatRow` cast is RETAINED (re-documented honestly): it bridges the dynamic `...team.stats` Record→named members, a type-system limitation, not a runtime absence. Full cast removal is deferred to the Week-2 nested `stats: Record<string,number>` end-state (Option B), captured here and in week2_standings_refactor. Standings tests green.
