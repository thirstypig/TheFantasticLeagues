---
status: complete
priority: p1
issue_id: "111"
tags: [code-review, security, performance]
dependencies: []
---

# fetchJsonPublic missing 30s AbortController timeout

## Problem Statement

`client/src/api/base.ts:161` — `fetchJsonPublic` has no timeout while `fetchJsonApi` correctly uses `AbortSignal.timeout(30_000)`. Stalled MLB API connections can hang indefinitely.

## Proposed Solutions

Add `signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)` to the fetch call in `fetchJsonPublic`. 1-line fix.

- **Effort**: Trivial

## Work Log
- **2026-04-17**: Flagged by security-sentinel, performance-oracle, kieran-typescript-reviewer.
- **2026-04-30**: Added `signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)` to the `fetch()` call inside `fetchJsonPublic` (`client/src/api/base.ts`). Mirrors the existing 30s ceiling on `fetchJsonApi` so RSS / MLB stats endpoints can no longer hang the calling effect indefinitely.
