---
status: complete
priority: p2
issue_id: "143"
tags: [code-review, performance, standings, cache, transactions]
dependencies: []
---

# `getSeasonStandings` cache not invalidated on roster mutations; staleness now visible from v3 hub

## Problem Statement

`server/src/features/standings/services/standingsService.ts:608-645` wraps season standings in a 2-min in-memory cache (stampede-protected, good). None of the new transaction handlers in PR #180/#181/#184 call `clearStandingsCache(leagueId)` after roster mutations. After a claim/il-stash/il-activate, the standings can be 2 minutes stale.

This was likely true before the stack but the new "Roster Moves" hub at `/teams/:code/manage/...` increases the click-path frequency from "occasional" to "every transaction." Users will notice.

## Findings

- `server/src/features/standings/services/standingsService.ts:608-645` — cache + invalidation helper
- `server/src/features/transactions/routes.ts` — claim/il-stash/il-activate handlers do not call `clearStandingsCache`
- Adjacent: `getCategoryStandings` may have similar exposure (verify during fix)

## Proposed Solutions

### Option 1: Plumb `clearStandingsCache(leagueId)` from each transaction handler (recommended)

Call after the tx commits (not inside it). One line per handler.

**Effort:** Small (~30 min). **Risk:** Low.

### Option 2: Event-bus / outbox pattern

Cleaner long-term but premature for this codebase.

**Effort:** Medium. **Risk:** Low.

## Recommended Action

Option 1.

## Technical Details

- `server/src/features/transactions/routes.ts:225-385, 630-755, 893-989` — three handlers
- `server/src/features/standings/services/standingsService.ts` — verify export of `clearStandingsCache`

## Acceptance Criteria

- [ ] All three transaction handlers call `clearStandingsCache(leagueId)` after commit
- [ ] Test: after a successful claim, next standings request bypasses cache
- [ ] No regression on stampede protection

## Resources

- Performance review under /ce:review 2026-04-30

## Work Log

### 2026-04-30 — Initial Discovery
- performance-oracle flagged during /ce:review re-run.
