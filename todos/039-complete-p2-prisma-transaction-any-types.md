---
status: complete
priority: p2
issue_id: "039"
tags: [code-review, typescript, quality]
dependencies: []
---

# Prisma $transaction Callbacks Typed as `any` (7 occurrences)

## Problem Statement
All `prisma.$transaction(async (tx: any) => ...)` callbacks use `any` for the transaction client, bypassing TypeScript checks on all operations within financial transactions (trade processing, FAAB budget deductions).

## Findings
- **Source**: kieran-typescript-reviewer
- **Locations**: `trades/routes.ts:171`, `waivers/routes.ts:113`, and 5 other transaction callbacks
- **Impact**: Typos in model names, wrong fields, or mismatched types compile silently and crash at runtime

## Proposed Solutions

### Option A: Use Prisma's generated TransactionClient type
```typescript
import type { PrismaClient } from "@prisma/client";
type TxClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];
await prisma.$transaction(async (tx: TxClient) => { ... });
```
- **Effort**: Small
- **Risk**: Low

## Acceptance Criteria
- [ ] All `$transaction` callbacks use proper Prisma types instead of `any`
- [ ] TypeScript catches model/field errors at compile time
