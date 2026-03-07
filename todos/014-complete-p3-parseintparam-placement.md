---
status: complete
priority: p3
issue_id: "014"
tags: [code-review, architecture]
dependencies: []
---

# Move parseIntParam from auth.ts to utils.ts

## Problem Statement
`parseIntParam` is a generic utility function that doesn't relate to auth. It lives in `server/src/middleware/auth.ts` but belongs in `server/src/lib/utils.ts`.

## Findings
- **Architecture Strategist**: Breaks single responsibility of auth module
- **Performance Oracle**: Also accepts floats despite name suggesting parseInt
- **TypeScript Reviewer**: Uses `any` param type, should be `unknown`

## Proposed Solutions
- Move to `server/src/lib/utils.ts`
- Change param type from `any` to `unknown`
- Add `Math.floor(n) === n` check for integer validation
- **Effort**: Small
