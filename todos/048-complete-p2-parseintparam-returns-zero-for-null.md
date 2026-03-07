---
status: pending
priority: p2
issue_id: "048"
tags: [code-review, quality]
dependencies: []
---

# parseIntParam Returns 0 for Null/Empty Inputs Instead of Null

## Problem Statement
`parseIntParam(null)`, `parseIntParam(undefined)`, and `parseIntParam("")` all return `0` instead of `null` because `Number("") === 0`. This is dangerous for route param parsing — a missing `leagueId` would query the DB with `id: 0` instead of being rejected.

## Findings
- **TypeScript Reviewer**: Classified as Critical (C1)
- **Location**: `server/src/lib/utils.ts` line ~80
- The function also accepts floats (e.g., `parseIntParam("3.14")` returns `3.14`) despite the name implying integers.

## Proposed Solutions

### Option A: Return null for empty/null, use Number.isInteger (Recommended)
```typescript
export function parseIntParam(v: unknown): number | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isInteger(n) ? n : null;
}
```
- **Effort**: Small | **Risk**: Low (update ~8 tests in utils.test.ts)

## Acceptance Criteria
- [ ] `parseIntParam(null)` returns `null`
- [ ] `parseIntParam(undefined)` returns `null`
- [ ] `parseIntParam("")` returns `null`
- [ ] `parseIntParam("3.14")` returns `null`
- [ ] `parseIntParam("42")` returns `42`
- [ ] Tests updated

## Work Log
| Date | Action | Notes |
|------|--------|-------|
| 2026-03-06 | Created | Found by kieran-typescript-reviewer |
