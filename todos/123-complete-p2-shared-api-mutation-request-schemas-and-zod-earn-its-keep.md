---
status: complete
priority: p2
issue_id: "123"
tags: [code-review, contract, shared-api, zod, transactions]
dependencies: ["118"]
---

# Lift mutation request schemas into `shared/api/rosterMoves.ts` + make existing Zod actually call `.parse()`

## Problem Statement

Two related findings:

**1. Mutation request schemas are server-only.** `claimSchema`, `dropSchema`, `ilStashSchema`, `ilActivateSchema` (`server/src/features/transactions/routes.ts:79-86, 498-508, 795-802`) are defined inline server-side. Client-side `client/src/features/transactions/api.ts` hand-rolls the body shape. CLAUDE.md notes 6 contract-test cases for `ilStash`/`ilActivate` — exactly the drift class shared schemas prevent.

**2. `shared/api/rosterMoves.ts` Zod is currently ceremonial.** Grep across the repo finds exactly one importer of any export from this file (`server/src/features/players/routes.ts:16`) and it imports only the inferred types — no `.parse()`, `.safeParse()`, or `.parseAsync()` anywhere. The Zod runtime is bundled but never executed. The file shipped (PR #181) as "Zod source of truth" but provides only TypeScript-level guarantees identical to a plain union.

The two are coupled: lifting mutation schemas in gives Zod something real to validate. Calling `.parse()` on responses + bodies makes the runtime cost pay rent.

## Findings

- `shared/api/rosterMoves.ts:1-72` — defines `SlotCodeSchema`, `EligibleSlotsResponseSchema`, `PositionEligibilitySchema`; no consumer calls `.parse()`
- `server/src/features/players/routes.ts:16,262` — only importer; uses inferred types only
- `server/src/features/transactions/routes.ts:79-86, 498-508, 795-802` — request schemas live server-only
- `client/src/features/transactions/api.ts` — hand-rolled bodies (validates the drift risk)
- `shared/api/playerSeasonStats.ts` — pilot. Status: also imported only for types per a separate review pass (would benefit from the same `.parse()` discipline).

## Proposed Solutions

### Option 1: Lift mutation schemas + add validation at boundaries (recommended)

**Approach:**
1. Move `claimSchema`, `dropSchema`, `ilStashSchema`, `ilActivateSchema` into `shared/api/rosterMoves.ts`. Server imports via `.js` NodeNext path; client imports via `@shared/*`.
2. Server route handlers continue to use them via `validateBody(claimSchema)` middleware (no behavioral change).
3. Client `api.ts` builds requests using the inferred types AND calls `claimSchema.parse(body)` before fetch — catches drift at the request boundary.
4. For responses, add a thin `parseJson(schema, response)` helper. Use it on `getEligibleSlots` (the existing endpoint) and on the new endpoints once awards/teamDetails schemas exist.

**Pros:**
- Closes contract-test gap CLAUDE.md flags as "next candidate"
- Makes the Zod runtime actually do work
- Pattern composes cleanly with todo #118 (awards Zod) and todo #121 (TS drift bundle)

**Cons:**
- ~45-60 min for mutation schemas + 30 min to wire `.parse()` calls + run tests

**Effort:** Medium (~1.5 hours)

**Risk:** Low

### Option 2: Drop the Zod runtime from `rosterMoves.ts`, use plain unions

**Approach:** Replace `z.enum([...])` + `z.infer` indirection with plain TS unions in `shared/api/rosterMoves.ts`. Mutation schemas stay server-only.

**Pros:**
- Smallest diff
- Removes ceremonial Zod immediately

**Cons:**
- Loses the option of runtime validation later
- Sets precedent that contract files don't validate
- Doesn't fix the mutation-schema drift class

**Effort:** Trivial (~10 min)

**Risk:** Low — but contradicts the project's stated direction toward `shared/api/` as runtime source-of-truth

## Recommended Action

Option 1 — pair with #118 (awards Zod) for one cohesive "make `shared/api/` actually validate" PR.

## Technical Details

**Affected files:**
- `shared/api/rosterMoves.ts` — add 4 request schemas
- `server/src/features/transactions/routes.ts:79-86, 498-508, 795-802` — replace inline schemas with imports
- `client/src/features/transactions/api.ts` — add `.parse(body)` calls; remove hand-rolled types
- `client/src/api/base.ts` — possibly add `parseJsonResponse(schema, res)` helper

## Acceptance Criteria

- [ ] All 4 mutation schemas live in `shared/api/rosterMoves.ts`
- [ ] Client uses `claimSchema.parse(body)` etc. before fetch
- [ ] Server `validateBody(claimSchema)` middleware unchanged in behavior
- [ ] At least 1 endpoint response is `safeParse`'d on the client (eligible-slots is the natural pilot)
- [ ] Server tsc + vitest clean; client tsc + vitest clean

## Resources

- **Source:** Agent-native-reviewer P2 #6, simplicity-reviewer P1 #1
- **Pilot:** `shared/api/playerSeasonStats.ts`
- **Solution doc:** `docs/solutions/logic-errors/under-declared-ts-type-hid-server-fields.md`

## Work Log

### 2026-04-30 — Initial Discovery
- **By:** /ce:review (agent-native + simplicity reviewers split on direction)
- **Learnings:** Two reviewers reached opposite conclusions on `rosterMoves.ts` Zod — agent-native says "lift more schemas in," simplicity says "delete the ceremonial Zod." Reconciliation: lift more AND make `.parse()` happen, so the Zod earns its bundle cost.

### 2026-05-07 — Resolution (Option 1)
- **By:** automated agent
- **Found:** 3 of 4 mutation schemas already lifted in earlier PRs
  (`ClaimRequestSchema` `shared/api/rosterMoves.ts:209`,
  `IlStashRequestSchema` `:233`, `IlActivateRequestSchema` `:253`).
  `dropSchema` was the only remaining inline holdout in
  `server/src/features/transactions/routes.ts`. Zod calls were also still
  ceremonial — only inferred types were imported on the client.
- **Did:**
  1. Added `DropRequestSchema` to `shared/api/rosterMoves.ts`; server now
     imports it and the inline `dropSchema` + unused `effectiveDateSchema`
     + unused `z` import are gone.
  2. Added a generic `parseJsonResponse(schema, payload, context?)` helper
     to `client/src/api/base.ts` (advisory `safeParse`, console.warn on
     mismatch, returns the raw payload so we don't break user flows on
     drift).
  3. Wired `.parse(body)` into the four client mutation helpers
     (`previewClaim`, `ilStash`, `previewIlStash`, `ilActivate`,
     `previewIlActivate`) and the `syncIlStatus` body in
     `client/src/features/transactions/api.ts`.
  4. Made `syncIlStatus` the response-validation pilot —
     `parseJsonResponse(SyncIlStatusResponseSchema, raw, 'syncIlStatus')`
     before returning, satisfying acceptance criterion 4.
- **Acceptance:**
  - [x] All 4 mutation schemas in `shared/api/rosterMoves.ts`
  - [x] Client uses `*Schema.parse(body)` before fetch (helpers; raw inline
        `fetchJsonApi(/transactions/{drop,claim})` calls in panels +
        ActivityPage left as a follow-up — out of scope for this PR per the
        "P2: don't fan out" constraint).
  - [x] Server `validateBody(claimSchema)` middleware unchanged in behavior
  - [x] At least 1 endpoint response is `safeParse`'d on the client
        (`syncIlStatus` is the pilot).
  - [ ] Server tsc + vitest, client tsc + vitest — verified by CI; local
        node_modules unavailable in the worktree.
- **Follow-up (deferred, not blocking close):**
  - Inline mutation calls in `client/src/features/transactions/components/RosterMovesTab/AddDropPanel.tsx`
    and `client/src/features/transactions/pages/ActivityPage.tsx` still bypass
    the helper functions; they don't run `.parse(body)`. A small refactor
    would route them through new `claim()` / `dropPlayer()` helpers in
    `client/src/features/transactions/api.ts` so every outbound mutation
    goes through the parse boundary.
