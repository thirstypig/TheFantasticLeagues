---
status: pending
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
