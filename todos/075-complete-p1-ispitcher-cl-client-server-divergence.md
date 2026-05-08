---
status: complete
priority: p1
issue_id: "075"
tags: [code-review, architecture, data-correctness]
dependencies: []
---

# isPitcher / PITCHER_CODES — "CL" missing from client sportConfig

## Problem Statement
Server `isPitcher()` now recognizes "CL" (closer) as a pitcher position, but the client's `isPitcher()` does not. `PITCHER_CODES` on both client and server also omits "CL". A player with position "CL" would be classified as a hitter on the client, potentially bypassing pitcher roster limits during auction nomination.

## Findings
- **Server** `server/src/lib/sportConfig.ts:130-133`: includes "CL" ✅
- **Client** `client/src/lib/sportConfig.ts:72-75`: missing "CL" ❌
- **PITCHER_CODES** on both client/server: `["P", "SP", "RP", "TWP"]` — missing "CL" ❌
- **positionToSlots** does not handle "CL" — returns empty array
- Same pattern checked in 4+ places: mlb-feed/routes, auction/routes, keeper-prep, commissioner

## Proposed Solutions

### Solution A: Add "CL" to all three locations (Recommended)
Add "CL" to `PITCHER_CODES`, client `isPitcher()`, and `positionToSlots` (map "CL" → ["P"]).
- **Pros**: Complete fix, all code paths consistent
- **Cons**: Need to check if any downstream logic depends on CL being excluded
- **Effort**: Small
- **Risk**: Low

## Recommended Action
_To be filled during triage_

## Technical Details
- **Affected files**: `client/src/lib/sportConfig.ts`, `server/src/lib/sportConfig.ts`
- **Components**: isPitcher, PITCHER_CODES, positionToSlots

## Acceptance Criteria
- [ ] Client `isPitcher("CL")` returns `true`
- [ ] `PITCHER_CODES` includes "CL" on both client and server
- [ ] `positionToSlots("CL")` returns `["P"]` on both client and server
- [ ] Existing tests pass

## Work Log
| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-24 | Created from code review | 5-agent review identified server/client divergence |

## Resources
- PR scope: commits after 2d0e0cb on main
