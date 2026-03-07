---
status: complete
priority: p2
issue_id: "017"
tags: [code-review, typescript]
dependencies: []
---

# Replace `any` Types in Prisma Where Clauses

## Problem Statement
Four instances of `let where: any = {}` bypass TypeScript's type checking on Prisma query filters. A typo like `teamid` instead of `teamId` would silently compile and return wrong results.

## Findings
- **TypeScript Reviewer**: Flagged 4 instances
- Locations:
  1. `server/src/features/teams/routes.ts:22` — `let where: any = {}`
  2. `server/src/features/waivers/routes.ts:25` — `let where: any = { status: "PENDING" }`
  3. `server/src/features/transactions/routes.ts:32` — `const where: any = { leagueId }`
  4. `server/src/features/waivers/routes.ts:113` — `async (tx: any)` in `$transaction`

## Proposed Solutions

### Option A: Use Prisma-generated WhereInput types (Recommended)
```typescript
import { Prisma } from "@prisma/client";
let where: Prisma.TeamWhereInput = {};
let where: Prisma.WaiverClaimWhereInput = { status: "PENDING" };
const where: Prisma.TransactionEventWhereInput = { leagueId };
// For $transaction, remove the `any` — Prisma infers the type
await prisma.$transaction(async (tx) => { ... });
```

**Pros**: Full type safety on queries. Catches typos at compile time.
**Cons**: None.
**Effort**: Small (15 min)
**Risk**: None

## Acceptance Criteria
- [ ] No `any` types on Prisma where clauses
- [ ] `$transaction` callback parameter type inferred (no explicit `any`)
- [ ] TypeScript compiles clean
- [ ] Tests pass

## Work Log
- 2026-03-06: Created from code review synthesis
