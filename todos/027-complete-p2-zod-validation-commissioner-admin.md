---
status: complete
priority: p2
issue_id: "027"
tags: [code-review, security, validation]
dependencies: []
---

# Missing Zod Validation on Commissioner/Admin Endpoints

## Problem Statement
Commissioner and admin write endpoints accept request body parameters without schema validation. Malformed or extra fields pass through unchecked to Prisma queries.

## Findings
- **Source**: security-sentinel, architecture-strategist
- **Location**: `server/src/features/commissioner/routes.ts`, `server/src/features/admin/routes.ts`
- Several POST/PATCH endpoints destructure `req.body` without validation

## Proposed Solutions

### Option A: Add Zod schemas per endpoint
- Define input schemas, parse req.body with `.parse()` or `.safeParse()`
- **Pros**: Type-safe, auto-strips extra fields
- **Effort**: Medium
- **Risk**: Low

## Acceptance Criteria
- [ ] All write endpoints in commissioner routes validate input with Zod
- [ ] All write endpoints in admin routes validate input with Zod
- [ ] Invalid input returns 400 with field-level errors
- [ ] Extra fields are stripped (not passed to Prisma)

## Work Log
| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-05 | Created from code review | Found by security and architecture agents |
