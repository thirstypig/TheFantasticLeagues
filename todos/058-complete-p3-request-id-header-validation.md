---
status: pending
priority: p3
issue_id: "058"
tags: [code-review, security]
dependencies: []
---

# Request ID Header Accepted Without Validation

## Problem Statement
Server trusts client-provided `x-request-id` header without length/format validation. Malicious clients could inject long strings or log-injection payloads.

## Findings
- **Security Sentinel**: L4
- **Location**: `server/src/index.ts` line 78

## Proposed Solutions
### Option A: Validate format and truncate
```typescript
const clientId = String(req.headers["x-request-id"] || "").slice(0, 64);
(req as any).requestId = /^[a-zA-Z0-9_-]+$/.test(clientId) ? clientId : crypto.randomUUID();
```
- **Effort**: Small | **Risk**: Low

## Acceptance Criteria
- [ ] Request ID validated for format and length
- [ ] Invalid IDs replaced with server-generated UUID

## Work Log
| Date | Action | Notes |
|------|--------|-------|
| 2026-03-06 | Created | Found by security-sentinel |
