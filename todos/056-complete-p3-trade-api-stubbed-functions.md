---
status: pending
priority: p3
issue_id: "056"
tags: [code-review, quality]
dependencies: []
---

# Stubbed Trade API Functions (cancelTrade, voteOnTrade)

## Problem Statement
`cancelTrade()` and `voteOnTrade()` in `client/src/features/trades/api.ts` are stubbed with `console.warn` and return `{ success: false }`. If the UI calls them, users get silent failures.

## Findings
- **TypeScript Reviewer**: M17 — dead stubs with `Promise<any>` return
- **Agent-Native Reviewer**: Action Parity gap
- **Architecture Strategist**: Client/server contract mismatch

## Proposed Solutions
### Option A: Implement server endpoints
### Option B: Remove functions and disable UI buttons (Recommended for now)
- **Effort**: Small (B) or Large (A) | **Risk**: Low

## Acceptance Criteria
- [ ] Either server endpoints work OR UI buttons disabled/hidden

## Work Log
| Date | Action | Notes |
|------|--------|-------|
| 2026-03-06 | Created | Found by 3 review agents |
