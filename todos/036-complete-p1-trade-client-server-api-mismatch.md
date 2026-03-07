---
status: complete
priority: p1
issue_id: "036"
tags: [code-review, api, trades]
dependencies: []
---

# Trade Client-Server API Endpoint Mismatch

## Problem Statement
The client trade API (`client/src/features/trades/api.ts`) calls endpoints that don't match the server routes (`server/src/features/trades/routes.ts`). The trade UI is completely non-functional.

## Findings
- **Source**: agent-native-reviewer
- **Mismatches**:
  - Client calls `POST /api/trades/propose` → Server has `POST /api/trades/`
  - Client calls `POST /api/trades/:id/response` with `{ action: "ACCEPT"|"REJECT" }` → Server has separate `POST /api/trades/:id/accept` and `POST /api/trades/:id/reject`
  - Client calls `POST /api/trades/:id/cancel` → **No server endpoint exists**
  - Client calls `POST /api/trades/:id/vote` → **No server endpoint exists**
- **Impact**: Trade propose, accept, reject flows are broken for both UI users and API consumers

## Proposed Solutions

### Option A: Align client to match server routes
- Update `client/src/features/trades/api.ts` to call correct server endpoints
- Remove client calls to cancel/vote (or stub them)
- **Pros**: Minimal server changes
- **Cons**: Loses cancel/vote functionality
- **Effort**: Small
- **Risk**: Low

### Option B: Update server to match client expectations + add missing endpoints
- Add `POST /api/trades/:id/cancel` (proposer can cancel own trade)
- Add `POST /api/trades/:id/vote` (league members vote on trades)
- Make server accept the unified `/response` pattern or keep separate accept/reject
- **Pros**: Full feature parity
- **Cons**: More work, new endpoints need auth/ownership checks
- **Effort**: Medium
- **Risk**: Medium

## Technical Details
- **Affected files**: `client/src/features/trades/api.ts`, `server/src/features/trades/routes.ts`

## Acceptance Criteria
- [ ] Client trade API calls match server route definitions
- [ ] Trade propose flow works end-to-end
- [ ] Trade accept/reject flows work end-to-end
- [ ] Cancel and vote features either work or are cleanly removed from client
