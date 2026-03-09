---
status: pending
priority: p3
issue_id: "057"
tags: [code-review, security]
dependencies: []
---

# CORS Localhost Origins Included Unconditionally

## Problem Statement
Hardcoded `localhost:3010`, `localhost:3011`, `localhost:4173` in CORS origins are included even in production. Should be gated to development only.

## Findings
- **Security Sentinel**: L3 — unlikely to be exploitable but not best practice
- **Location**: `server/src/index.ts` lines 61-65

## Proposed Solutions
### Option A: Gate behind NODE_ENV check
- **Effort**: Small | **Risk**: Low

## Acceptance Criteria
- [ ] Localhost origins only included when not in production

## Work Log
| Date | Action | Notes |
|------|--------|-------|
| 2026-03-06 | Created | Found by security-sentinel |
