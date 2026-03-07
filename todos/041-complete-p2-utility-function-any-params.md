---
status: complete
priority: p2
issue_id: "041"
tags: [code-review, typescript, quality]
dependencies: []
---

# Utility Function Signatures Use `any` Instead of `unknown`

## Problem Statement
Functions in `server/src/lib/utils.ts` (`toNum`, `toBool`, `norm`, `normCode`, `parseIntParam`) accept `any` parameters when they should use `unknown`. Also `parseCsv` returns `Record<string, any>[]` when values are always strings.

## Findings
- **Source**: kieran-typescript-reviewer
- **Impact**: No compile-time feedback if complex objects are passed where scalars are expected
- **Fix**: Mechanical change — `Number(v)`, `String(v)`, `typeof v` all work with `unknown`

## Acceptance Criteria
- [ ] All utility input params changed from `any` to `unknown`
- [ ] `parseCsv` returns `Record<string, string>[]`
- [ ] All tests pass
