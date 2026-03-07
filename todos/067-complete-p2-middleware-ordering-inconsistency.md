---
status: pending
priority: p2
issue_id: "067"
tags: [code-review, architecture]
dependencies: []
---

# Middleware Ordering Inconsistency: validate-then-authorize vs authorize-then-validate

## Problem Statement
Auction routes use `validateBody` BEFORE `requireTeamOwner`, while commissioner and admin routes use the opposite order. This inconsistency means a user who doesn't own a team can receive detailed validation errors about the request shape rather than a 403.

## Findings
- **Architecture Strategist**: Flagged inconsistency across route files
- Auction `/nominate`: `requireAuth, validateBody(nominateSchema), requireTeamOwner("nominatorTeamId")`
- Commissioner routes: `requireAuth, requireCommissionerOrAdmin(), validateBody(...)`
- Minor information disclosure: unauthorized users learn about valid request shapes

## Proposed Solutions

### Option A: Standardize to authorize-then-validate
- Move `requireTeamOwner` before `validateBody` in auction routes
- Document convention in CLAUDE.md
- **Effort**: Small | **Risk**: Low (auction nominate/bid would need teamId before body validation)
- **Con**: requireTeamOwner reads from req.body, which needs parsing first — may need express.json() to be applied before

### Option B: Standardize to validate-then-authorize (current auction pattern)
- Accept that validation runs before authorization everywhere
- Document the convention
- **Effort**: Small | **Risk**: Low

## Technical Details
- **Affected files**: `server/src/features/auction/routes.ts`, CLAUDE.md

## Acceptance Criteria
- [ ] Convention documented in CLAUDE.md
- [ ] All routes follow the chosen convention consistently
