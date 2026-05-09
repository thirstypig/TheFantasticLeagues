---
status: complete
priority: p3
issue_id: "129"
tags: [code-review, cleanup, nits]
dependencies: []
---

# Cleanup nits — 7 small items that didn't merit individual todos

## Problem Statement

Smaller findings from the 9-agent review pass. Each is a 5-30 minute fix; none individually justifies its own todo, but bundled they're a productive afternoon's work.

## Findings

1. **`Team.tsx:456` — `void totalSpent;` dead computation.** Computing a value just to throw it away. Either commit to displaying it or delete the `useMemo`.

2. **`server/src/features/admin/services/dashboardService.ts:425-440` — `countByModel` record allocates per call.** `Record<SparklineModel, () => Promise<number>>` constructed inside `Array.from` callback = 91 closures per call. Hoist to a switch or out of the loop. Trivial perf, but signals the abstraction is misshapen. *(Will be subsumed by todo #120's `GROUP BY` rewrite — defer until/if #120 is declined.)*

3. **`server/src/features/mlb-feed/services/awardsService.ts:307` — `as "SP" | "RP"` cast suppresses inference.** `role: (isRelief ? "RP" : "SP") as "SP" | "RP"` — the conditional already produces the union. Drop cast; use `as const` per branch.

4. **`server/src/features/mlb-feed/services/awardsService.ts:653-658` — `zScores` doesn't guard NaN/Infinity.** Inputs come from Prisma `_sum` which is `number | null`. `?? 0` defaults are correct but `Number.isFinite` belt-and-suspenders is cheap.

5. **`server/src/features/mlb-feed/digestRoutes.ts:111, 148` — `as any` on Prisma JSON column writes.** Replace with `as Prisma.InputJsonValue`. If TS complains, fix the shape.

6. **`server/src/features/mlb-feed/services/awardsService.ts:176-191` — two `groupBy` calls could be one.** Same `where`, same `by`, just different `_sum` columns. Combine to save 1 RTT per awards compute. *(Trivial after todo #119 caches the endpoint anyway — defer.)*

7. **`client/src/features/teams/lib/__tests__/toHubPlayer.test.ts:266-273` — test casts `1 as unknown as boolean` to test boolean coercion that the type system disallows.** Either tighten test (drop, accept boolean coercion is dead code) or widen `RosterPlayerInput.isPitcher: boolean | number`. Don't keep both.

8. **Trim `toHubPlayer.test.ts` from 17 → ~9 tests** — code-simplicity-reviewer flagged 8 tests as testing JS spread/`||` semantics or hypothetical-CSV-import edge cases with no caller. *(Skip if user values the regression-pin coverage; my read is the user prefers the pins per their MEMORY note about test fixtures, so this should probably stay 17.)*

## Recommended Action

Pick whichever items the next implementer wants. #1, #3, #4, #5 are all 5-min wins. #2 and #6 will be mooted by todos #120 and #119. #7 needs a design decision. #8 is debatable.

## Acceptance Criteria

- Each item independently testable
- No new failures from these changes

## Resources

- **Source:** Multiple agents (kieran-typescript P2 #10, P3 #13, P3 #15; simplicity-reviewer P3, P2 #3)

## Work Log

### 2026-04-30 — Initial Discovery
- Bundled to keep todos/ from exploding past readability.
