---
status: complete
priority: p2
issue_id: "028"
tags: [code-review, architecture, auction]
dependencies: []
---

# Auction State Not League-Scoped

## Problem Statement
The auction module uses in-memory state that is not scoped per league. If multiple leagues run auctions simultaneously, they would share state and interfere with each other.

## Findings
- **Source**: architecture-strategist
- **Location**: `server/src/features/auction/routes.ts` — module-level state variables
- Current single-league deployment masks this issue

## Proposed Solutions

### Option A: Scope state with Map<leagueId, AuctionState>
- Replace module-level variables with a Map keyed by leagueId
- **Pros**: Multi-league safe, moderate refactor
- **Effort**: Medium
- **Risk**: Medium (touches active auction logic)

### Option B: Move auction state to DB/Redis
- Persist state externally for crash recovery
- **Pros**: Survives server restarts
- **Effort**: Large
- **Risk**: Medium

## Acceptance Criteria
- [ ] Auction state isolated per league
- [ ] No cross-league state leakage
- [ ] Existing auction tests still pass

## Work Log
| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-05 | Created from code review | Found by architecture-strategist |
