---
status: complete
priority: p2
issue_id: "021"
tags: [code-review, quality]
dependencies: []
---

# Add requireAuth Before requireAdmin for Consistency

## Problem Statement
Two endpoints use `requireAdmin` without `requireAuth` first. While `requireAdmin` internally checks `req.user`, the CLAUDE.md convention says all write endpoints should use `requireAuth`.

## Findings
- `server/src/features/trades/routes.ts:138` — `POST /:id/process` uses only `requireAdmin`
- `server/src/features/waivers/routes.ts:98` — `POST /process` uses only `requireAdmin`

## Proposed Solutions
Add `requireAuth` before `requireAdmin` on both endpoints.

**Effort**: Trivial (5 min)

## Work Log
- 2026-03-06: Created from code review synthesis
