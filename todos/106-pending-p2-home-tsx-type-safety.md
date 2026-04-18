---
status: pending
priority: p2
issue_id: "106"
tags: [code-review, typescript, quality, home]
dependencies: []
---

# Home.tsx type safety: extract hooks, eliminate 15+ `any` state variables

## Problem Statement

`client/src/pages/Home.tsx` contains 15+ `useState<any[]>` declarations and dozens of `(p: any)`, `(a: any)` callback params throughout its 700+ lines. Key offenders:

- `useState<any[]>([])` for playerVideos, redditPosts, yahooArticles, mlbArticles, espnArticles, rosterAlerts
- `(h.HR || 0) * 4` scoring logic with no type narrowing on hitting/pitching sub-objects
- `makeHeadline` function (~40 lines of template strings) trapped inside render tree, completely untestable
- The entire RSS/news feed state management duplicated inline

This is the largest concentration of untyped code in the codebase.

## Findings

### Agent: kieran-typescript-reviewer
- C1 (Critical): Home.tsx contains more `any` usage than the rest of the codebase combined in this diff. Extract: (1) `RosterStatPlayer` interface, (2) `makeHeadline` as standalone function, (3) news feed state into `useNewsFeeds(leagueId)` hook.

### Agent: performance-oracle
- REACT-4: ~25+ `useState` declarations. Each setter triggers a re-render of the entire Home component tree. Extract data-fetching into custom hooks and `React.memo` heavy sub-components.

## Proposed Solutions

### Solution 1: Incremental extraction (recommended)
1. Define `RosterStatPlayer` interface for the scored/filtered player data
2. Extract `makeHeadline(player: RosterStatPlayer): string` as a standalone exported function (testable)
3. Extract `useNewsFeeds(leagueId)` hook for RSS/news state (playerVideos, redditPosts, yahooArticles, etc.)
4. Type all remaining callback params

- **Pros**: Each step is independent and testable. Reduces Home.tsx by ~300 lines.
- **Cons**: Multiple touch points; risk of import shuffling.
- **Effort**: Large (~2 hours)
- **Risk**: Medium — visual regression possible. Screenshot verification needed.

### Solution 2: Full Home.tsx rewrite
Split into <HomeHeader>, <LeagueDigest>, <NewsFeeds>, <RosterAlerts> sub-components.

- **Pros**: Maximum separation of concerns.
- **Cons**: Very large diff. High regression risk.
- **Effort**: Very Large (~4+ hours)
- **Risk**: High

## Recommended Action

Solution 1, done incrementally across 2-3 sub-tasks.

## Acceptance Criteria

- [ ] Zero `any` in Home.tsx state declarations
- [ ] `makeHeadline` extracted and unit-tested
- [ ] `useNewsFeeds` hook extracted with typed state
- [ ] `RosterStatPlayer` interface defined
- [ ] All callback params typed (no `(p: any)`, `(a: any)`)
- [ ] Visual regression check at `/` page

## Work Log

- **2026-04-16** (Session 67 `/ce:review`): Flagged by kieran-typescript-reviewer (C1) and performance-oracle (REACT-4).

## Resources

- `client/src/pages/Home.tsx` (target)
- `client/src/hooks/usePlayerNews.ts` (reference: existing news hook pattern)
- `client/src/features/watchlist/hooks/useMyWatchlist.ts` (reference: well-typed hook)
