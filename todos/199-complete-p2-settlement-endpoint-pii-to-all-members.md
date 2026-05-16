---
status: pending
priority: p2
issue_id: "199"
tags: [code-review, security, standings, pii, authorization]
dependencies: []
---

# Settlement endpoint returns payment handles + email to any league member

## Problem Statement

`GET /api/standings/settlement/:leagueId` returns each team owner's `email`, `venmoHandle`, `zelleHandle`, and `paypalHandle` to any authenticated league member. The route uses `requireAuth + requireLeagueMember` but not `requireCommissionerOrAdmin`. Any member who joins a league can enumerate all other members' payment handles.

**File:** `server/src/features/standings/routes.ts` lines ~353–396

```typescript
ownerUser: { select: { id, name, email, venmoHandle, zelleHandle, paypalHandle } }
```

## Proposed Solutions

### Option A — Add `requireCommissionerOrAdmin` guard (Recommended)
Add `requireCommissionerOrAdmin("leagueId")` middleware. Only commissioners and admins can view the full settlement data.
- **Pros:** Minimal change; matches the use case (commissioner manages payouts)
- **Cons:** Non-commissioner members lose visibility into their own payout info

### Option B — Strip PII from non-commissioner responses
Return `email`/handles only if `req.user.isAdmin || memberRole === "COMMISSIONER"`. Other members get a redacted view.
- **Pros:** Members can still see partial settlement info (e.g., amounts owed) without exposing handles
- **Effort:** Medium

### Option C — Return only own payment handle
Each member can see their own handle but not others'. Commissioner sees all.
- **Pros:** Best privacy model
- **Effort:** Larger

## Recommended Action

Option A. Commissioners are the only users of the settlement view.

## Acceptance Criteria
- [ ] Non-commissioner league members receive 403 on `GET /api/standings/settlement/:leagueId`
- [ ] Commissioners and admins can still access the full settlement data
- [ ] Test updated to cover the auth change

## Work Log
- 2026-05-15: Identified by Security reviewer.
