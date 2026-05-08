---
status: pending
priority: p2
issue_id: "136"
tags: [code-review, agent-native, shared-api, transactions, drift]
dependencies: []
---

# Lift roster-move request schemas into `shared/api/rosterMoves.ts` and echo mlbId in success responses

## Problem Statement

Two related agent-native gaps in the manage flow. Both extend the work captured in todo #126 but are distinct findings:

1. **Request schemas are server-private.** `claimSchema`, `ilStashSchema`, `ilActivateSchema` (`server/src/features/transactions/routes.ts:79-86, 498-508, 795-802`) live inline. `shared/api/rosterMoves.ts` only contains the *eligible-slots response* shape. An external agent or future MCP tool writing a roster-move client has to re-derive the body shape from English prose. Server can drift silently.
2. **`mlbId` accepted on input but not echoed on success.** Routes return `{ success, playerId }` (DB id) — agents that issued the call by `mlbId` need a second round-trip to confirm the right player was claimed. Todo #126 captures `appliedReassignments.mlbId`; this captures the *top-level* response.

## Findings

- `server/src/features/transactions/routes.ts:79-86, 498-508, 795-802` — inline request schemas
- `server/src/features/transactions/routes.ts:491, 791` — success bodies omit mlbId
- `shared/api/rosterMoves.ts` — only response shape (`EligibleSlotsResponseSchema`) currently shared
- The XOR `addPlayerId | addMlbId` `.refine` rule is invisible to anything not reading the route source

## Proposed Solutions

### Option 1: Lift schemas + echo mlbId in one PR (recommended)

- Add `ClaimRequestSchema`, `IlStashRequestSchema`, `IlActivateRequestSchema` to `shared/api/rosterMoves.ts`
- `validateBody()` imports them
- Each success envelope adds `{ mlbId, name }` (already in handler scope from earlier Prisma read)
- Add response schemas too (`ClaimResponseSchema`, etc.) for full round-trip typing

**Effort:** Small (~2h). **Risk:** Low.

### Option 2: Schemas only; defer response echo to #126 follow-up

Half the win, defers the rest.

**Effort:** Small. **Risk:** Low.

## Recommended Action

Option 1.

## Technical Details

- `shared/api/rosterMoves.ts` — add request + response schemas
- `server/src/features/transactions/routes.ts` — import from shared, echo mlbId in returns
- `client/src/features/transactions/api.ts` — switch to inferred types
- `client/src/features/transactions/__tests__/api.test.ts` — update fixtures

## Acceptance Criteria

- [ ] Roster-move request bodies typed via `z.infer<...>` everywhere
- [ ] Success bodies include `mlbId` and `name` for the claimed/stashed/activated player
- [ ] All transactions tests still pass; new tests cover the response envelope shape
- [ ] No `as any` in `routes.ts` body validation paths

## Resources

- Todo #126 (agent-native polish — companion)
- Agent-native review under /ce:review 2026-04-30

## Work Log

### 2026-04-30 — Initial Discovery
- agent-native-reviewer flagged during /ce:review re-run.
