---
status: complete
priority: p2
issue_id: 267
tags: [code-review, typescript, schema, rosterMoves, agent-native]
dependencies: []
---

## Problem Statement

PR #377 adds `mlbId: number | null` to the `AppliedReassignment` interface in `autoResolveLineup.ts`, so the server includes `mlbId` in the JSON response. However the shared Zod wire schema `AppliedReassignmentSchema` in `shared/api/rosterMoves.ts` was not updated. This creates schema/type drift: (a) any client code that tries to use `reassignment.mlbId` will get a TypeScript compile error because `z.infer<typeof AppliedReassignmentSchema>` does not include `mlbId`; (b) MCP tools that consume the `appliedReassignments` array won't expose `mlbId` to agents even though the server now sends it.

## Findings

From `server/src/features/transactions/lib/autoResolveLineup.ts` (PR #377):
```typescript
interface AppliedReassignment {
  mlbId: number | null;  // ← new field
  rosterId: number;
  playerName: string;
  oldSlot: string;
  newSlot: string;
}
```

From `shared/api/rosterMoves.ts` (NOT updated in PR #377):
```typescript
export const AppliedReassignmentSchema = z.object({
  rosterId: z.number(),
  playerId: z.number(),
  playerName: z.string(),
  oldSlot: z.string(),
  newSlot: z.string(),
  // mlbId: missing
});
```
- TypeScript reviewer and agent-native reviewer both flagged this independently.
- Client code reading `reassignment.mlbId` will fail to compile.

## Proposed Solutions

### Option A — Add mlbId to the shared schema (Recommended)
```typescript
export const AppliedReassignmentSchema = z.object({
  rosterId: z.number(),
  playerId: z.number(),
  playerName: z.string(),
  oldSlot: z.string(),
  newSlot: z.string(),
  mlbId: z.number().nullable().optional(),  // ← add this
});
```
**Pros:** Client can use `reassignment.mlbId`; MCP tools expose it to agents; atomic alignment. **Cons:** None. **Effort:** Trivial. **Risk:** None.

## Recommended Action

Option A. One-line addition to the shared schema. Mark it `optional()` so old clients still compile before the server-side change ships.

## Technical Details

- **Files to update:**
  - `shared/api/rosterMoves.ts` — `AppliedReassignmentSchema` definition
- **Related:** The `playerMlbIds: Map<number, number | null>` field on the interface is an internal computation helper — do NOT add it to the wire schema (it shouldn't be serialized to JSON)

## Acceptance Criteria

- [ ] `AppliedReassignmentSchema` includes `mlbId: z.number().nullable().optional()`
- [ ] `cd client && npx tsc --noEmit` clean (client can use `reassignment.mlbId`)
- [ ] `cd server && npx tsc --noEmit` clean

## Work Log

### 2026-06-05 — Surfaced by kieran-typescript-reviewer and agent-native-reviewer
