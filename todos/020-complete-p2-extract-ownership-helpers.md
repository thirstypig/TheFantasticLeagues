---
status: complete
priority: p2
issue_id: "020"
tags: [code-review, architecture]
dependencies: []
---

# Extract Shared Ownership Helpers (DRY)

## Problem Statement
Ownership check logic is duplicated in multiple places:
1. Roster routes duplicate the team-by-code ownership check (lines 25-30 and 44-51)
2. Waivers GET inlines the dual-table team lookup (`Team.ownerUserId` + `TeamOwnership`) that `isTeamOwner` already handles for single teams
3. The waivers queries run sequentially when they could be parallelized

## Findings
- **Architecture Strategist, TypeScript Reviewer, Performance Oracle, Code Simplicity Reviewer**: All flagged the duplication
- Files affected:
  - `server/src/features/roster/routes.ts` — lines 25-30 and 44-51 (identical blocks)
  - `server/src/features/waivers/routes.ts` — lines 37-49 (dual-table lookup)

## Proposed Solutions

### Option A: Extract two helpers into auth.ts (Recommended)

1. `getOwnedTeamIds(userId)` — returns all team IDs a user owns (via both tables, parallelized with Promise.all)
2. `verifyTeamOwnerByCode(code, userId)` — local helper in roster routes for the code-to-team lookup

**Pros**: DRY, parallelizes queries, single source of truth for ownership logic.
**Cons**: Slightly more code in auth.ts.
**Effort**: Small (45 min)
**Risk**: Low

## Acceptance Criteria
- [ ] `getOwnedTeamIds(userId)` extracted to auth.ts with `Promise.all`
- [ ] Roster routes use a shared helper instead of duplicated blocks
- [ ] Waivers GET uses `getOwnedTeamIds` instead of inline dual-table lookup
- [ ] Tests pass

## Work Log
- 2026-03-06: Created from code review synthesis
