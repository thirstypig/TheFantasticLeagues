---
status: complete
priority: p1
issue_id: "118"
tags: [code-review, drift, awards, mlb-feed, contract]
dependencies: []
---

# Awards endpoint shipped without `shared/api/awards.ts` — recreates the exact drift class PR #183 just fixed

## Problem Statement

PR #178 split into two halves on contract discipline:

- ✅ The extended-stats half (`OBP`/`SLG`/`OPS` etc.) added the new fields to `shared/api/playerSeasonStats.ts` Zod schema in the same PR. Drift impossible.
- ❌ The awards-endpoint half defines `MvpCandidate`, `CyYoungCandidate`, `AwardsRankings` as **bare TypeScript interfaces** in `server/src/features/mlb-feed/services/awardsService.ts:21-107`. Not in `shared/api/`. No Zod. No runtime validation.

Worse, the route reads the persisted JSON blob with a blind cast: `const awards = data.awards as AwardsRankings | null | undefined` (`awardsRoutes.ts:47`) — pre-#115 digests with malformed `data.awards` could ship garbage to consumers without falling through to compute.

The endpoint is explicitly *agent-native* per the docblock — which makes the absence of a wire contract worse, not better. Agents have no schema to plan against. When a UI consumer eventually adopts it (Home AI hub is the obvious destination), they'll hand-write a type, drift will appear, and we'll re-run the PR #183 movie.

## Findings

- `server/src/features/mlb-feed/services/awardsService.ts:21-107` — interfaces, no Zod
- `server/src/features/mlb-feed/awardsRoutes.ts:20` — imports types from service
- `server/src/features/mlb-feed/awardsRoutes.ts:45-48` — unsafe `as AwardsRankings` cast on JSON-column read
- `shared/api/index.ts` — only exports `playerSeasonStats` and `rosterMoves`; no `awards`
- Solution doc `docs/solutions/logic-errors/under-declared-ts-type-hid-server-fields.md` (authored this session) prescribes `shared/api/` Zod source-of-truth as the prevention pattern — this PR establishes the precedent and immediately violates it.

## Proposed Solutions

### Option 1: Lift to `shared/api/awards.ts` with full Zod schemas (recommended)

**Approach:**
1. Create `shared/api/awards.ts` with `MvpCandidateSchema`, `CyYoungCandidateSchema`, `AwardsRankingsSchema`, plus `AwardsResponseSchema` (rankings + `source: "persisted" | "computed"` + optional `digestGeneratedAt`).
2. `awardsService.ts` re-exports inferred types instead of defining its own interfaces.
3. `awardsRoutes.ts:47` — replace blind cast with `AwardsRankingsSchema.safeParse(data.awards)`. On failure, fall through to `computeAwardsRankings` instead of returning malformed data.
4. Add `shared/api/index.ts` export.

**Pros:**
- Closes the drift class before any UI consumer ships
- Stale-digest payloads fall through to compute instead of breaking consumers
- Matches `playerSeasonStats.ts` + `rosterMoves.ts` pilot pattern

**Cons:**
- ~30-45 min of work; touches 4 files

**Effort:** Small-Medium (~45 min)

**Risk:** Low — additive; backwards-compatible

### Option 2: Discriminated-union response schema

**Approach:** Same as Option 1, but `AwardsResponseSchema` is a discriminated union on `source`:
```ts
z.discriminatedUnion("source", [
  z.object({ source: z.literal("persisted"), ...rankings, digestGeneratedAt: z.string() }),
  z.object({ source: z.literal("computed"), ...rankings }),
])
```

**Pros:**
- Forces consumers to handle both branches at compile time
- Most precise wire contract

**Cons:**
- Slight ergonomic friction for consumers that don't care about source

**Effort:** Same as Option 1

**Risk:** Low

## Recommended Action

Option 1 with discriminated union from Option 2. ~45 min total.

## Technical Details

**Affected files:**
- `shared/api/awards.ts` (new)
- `shared/api/index.ts` (add export)
- `server/src/features/mlb-feed/services/awardsService.ts:21-107` (replace interfaces with re-exports)
- `server/src/features/mlb-feed/awardsRoutes.ts:45-48` (replace cast with `safeParse`)

**No DB changes.** The persisted blob shape doesn't need to change — Zod just validates it on read.

## Acceptance Criteria

- [ ] `shared/api/awards.ts` exists with Zod schemas
- [ ] `awardsService` exports types via `z.infer`
- [ ] `awardsRoutes` validates persisted blob via `safeParse`; falls through to compute on validation failure
- [ ] Existing 13 awards tests still pass
- [ ] Add 1 test: malformed persisted blob → falls through to computed path
- [ ] Server `npx tsc --noEmit` clean; client `npx tsc --noEmit` clean

## Resources

- **Source:** Kieran-typescript-reviewer P1 #2 + architecture-strategist P1 #2 + agent-native-reviewer P3
- **Solution doc:** `docs/solutions/logic-errors/under-declared-ts-type-hid-server-fields.md`
- **Pilot precedents:** `shared/api/playerSeasonStats.ts`, `shared/api/rosterMoves.ts`
- **PR #178:** Original endpoint
- **PR #183:** The drift fix this is preventing recurrence of

## Work Log

### 2026-04-30 — Initial Discovery
- **By:** /ce:review (3 of 9 agents flagged independently)
- **Actions:** TS reviewer flagged the missing schema; architecture reviewer flagged the dependency direction; agent-native reviewer flagged the contract discoverability.
- **Learnings:** When a single PR adopts a pattern in one half and ignores it in the other, the ignored half is the higher-priority follow-up.
