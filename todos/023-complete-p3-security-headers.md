---
status: complete
priority: p3
issue_id: "023"
tags: [code-review, security]
dependencies: []
---

# Add Security Headers (helmet) and Reduce JSON Body Limit

## Problem Statement
The Express app has no security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, etc.) and the JSON body limit is 50MB, which is excessive for API endpoints.

## Findings
- **Security Sentinel**: Flagged missing `helmet` middleware and large body limit
- `server/src/index.ts:71` — `express.json({ limit: "50mb" })`

## Proposed Solutions
1. Install and configure `helmet` middleware
2. Reduce default JSON body limit to 1MB
3. Keep higher limits only on file upload routes (already handled by multer)

**Effort**: Small (30 min)

## Work Log
- 2026-03-06: Created from code review synthesis
