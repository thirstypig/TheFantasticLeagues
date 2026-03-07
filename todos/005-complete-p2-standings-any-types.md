---
status: completed
priority: p2
issue_id: "005"
tags: [code-review, typescript, quality]
dependencies: []
---

# Pervasive `any` Usage in Standings Service and Routes

## Problem Statement
`standingsService.ts` uses `any[]` for all function signatures despite well-known data shapes. This propagates untyped data through routes, tests, and client consumers, defeating TypeScript's purpose.

## Findings
- **TypeScript Reviewer**: Every public function uses `any[]` params/returns
- The data shapes are fully known (CSV columns, team aggregation objects)
- Route handlers also have unnecessary `(r: any)` annotations

## Proposed Solutions

### Option A: Define proper interfaces
- Create `CsvStatRow`, `TeamStatRow`, `StandingsResult` interfaces
- Type all function signatures in standingsService.ts
- Remove unnecessary `any` annotations in routes.ts
- **Effort**: Medium | **Risk**: Low

## Technical Details
- **Affected files**: `server/src/features/standings/services/standingsService.ts`, `server/src/features/standings/routes.ts`

## Acceptance Criteria
- [ ] No `any` types in standingsService.ts function signatures
- [ ] No unnecessary `any` casts in routes.ts
- [ ] TypeScript compiler passes with stricter types
