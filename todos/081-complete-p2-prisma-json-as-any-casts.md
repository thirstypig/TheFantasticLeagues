---
status: complete
priority: p2
issue_id: "081"
tags: [code-review, typescript, type-safety]
dependencies: []
---

# as any casts on Prisma JSON fields — define narrow types

## Problem Statement
`(league.rules as any)?.leagueType` (line 375) and `prevDigest.data as any` (line 364) use `as any` for Prisma `Json` fields. This hides shape changes and prevents autocomplete.

## Proposed Solutions

### Solution A: Define narrow interfaces (Recommended)
```typescript
interface LeagueRulesPartial { leagueType?: string; }
interface DigestData { votes?: Record<string, string>; [key: string]: unknown; }
```
- **Effort**: Small (define 2 interfaces, replace 2 casts)

## Technical Details
- **Affected files**: `server/src/features/mlb-feed/routes.ts`

## Acceptance Criteria
- [ ] `as any` replaced with typed interfaces for rules and digest data
- [ ] No functional behavior change

## Work Log
| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-24 | Created from TypeScript + security review | |
