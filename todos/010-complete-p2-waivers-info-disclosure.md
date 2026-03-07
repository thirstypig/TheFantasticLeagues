---
status: complete
priority: p2
issue_id: "010"
tags: [code-review, security]
dependencies: []
---

# Waivers GET Endpoint Exposes All Pending Claims Without Scoping

## Problem Statement
`GET /api/waivers` returns ALL pending waiver claims (including bid amounts) for all teams if no `teamId` query parameter is provided. This reveals confidential FAAB bidding information.

## Findings
- **Security Sentinel**: Rated HIGH — any authenticated user can see all bids

## Proposed Solutions

### Option A: Scope to user's teams by default
- If no `teamId`, scope to user's own teams
- If `teamId` provided, verify ownership
- Only admins see all claims
- **Effort**: Small | **Risk**: Low

## Acceptance Criteria
- [ ] Unauthenticated request returns 401
- [ ] Authenticated request without teamId returns only user's team claims
- [ ] Admin can see all claims
