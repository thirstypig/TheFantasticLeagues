---
status: pending
priority: p2
issue_id: 278
tags: [code-review, type-safety, teamService]
dependencies: []
---

## Problem Statement

`TeamService.buildGamesByPos` in `teamService.ts` has no explicit return type annotation. Both branches return `Record<string, number>` today, but TypeScript infers this as a union of the two branches. If a future branch is added that returns a different shape, the inferred return type widens silently — callers in `toHubPlayer.ts` that expect `Record<string, number>` would compile without error even with a mismatch.

## Proposed Solutions

Add `: Record<string, number>` return type:
```typescript
static buildGamesByPos(
  posPrimary: string,
  posList: string | null,
  posGames?: Record<string, number> | null,
): Record<string, number> {
```

One-liner change. Makes the contract visible and catches any future branch that diverges.

## Technical Details

- **File:** `server/src/features/teams/services/teamService.ts` ~line 53
- **Effort:** Trivial

## Acceptance Criteria

- [ ] `buildGamesByPos` has explicit `: Record<string, number>` return type
- [ ] `cd server && npx tsc --noEmit` clean (zod false-negative expected for shared imports)

## Work Log

### 2026-06-05 — Flagged by kieran-typescript-reviewer (PR #378 review)
