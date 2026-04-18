---
status: complete
priority: p2
issue_id: "105"
tags: [code-review, correctness, mlb-feed, player-matching]
dependencies: []
---

# Migrate YouTube/Reddit feeds to createPlayerNameMatcher

## Problem Statement

`server/src/features/mlb-feed/routes.ts` has two call sites that still use the old `String.includes()` pattern for player name matching — YouTube RSS and Reddit daily-headlines — despite `createPlayerNameMatcher` being created in PR #103 specifically to fix this class of false-positive bug (the "Will Smith problem").

The compound doc at `docs/solutions/logic-errors/player-news-false-positive-substring-match.md` explicitly calls this out as remaining work.

## Findings

### Agent: learnings-researcher
- Found solution doc: "Two call sites in `routes.ts` still use old `includes()` pattern — YouTube RSS and Reddit daily-headlines."
- The `createPlayerNameMatcher` module was built to solve exactly this problem. Using `includes()` for common surnames (Smith, Garcia, Martinez) produces false positives.

### Agent: code-simplicity-reviewer
- PlayerNameMatcher is well-designed (25 tests). Not migrating remaining call sites is inconsistency, not simplicity.

## Proposed Solutions

### Solution 1: Replace includes() with createPlayerNameMatcher (recommended)
In the YouTube RSS and Reddit daily-headlines handlers, replace:
```typescript
articles.filter(a => rosterNames.some(name => a.title.includes(name)))
```
with:
```typescript
const matchers = rosterNames.map(createPlayerNameMatcher);
articles.filter(a => matchers.some(m => m.matches(a.title)))
```

- **Pros**: Consistent matching logic. Eliminates false positives for common surnames. Already tested (25 tests).
- **Cons**: Slightly more regex overhead (negligible for <50 players).
- **Effort**: Small (~15 min)
- **Risk**: Low — same pattern already proven on the player-news endpoint.

## Recommended Action

Solution 1.

## Acceptance Criteria

- [ ] YouTube RSS handler uses `createPlayerNameMatcher` instead of `includes()`
- [ ] Reddit daily-headlines handler uses `createPlayerNameMatcher` instead of `includes()`
- [ ] No remaining `includes()` usage for player name matching in `mlb-feed/routes.ts`
- [ ] "Will Smith" articles don't show for non-Will-Smith roster players

## Work Log

- **2026-04-16** (Session 67 `/ce:review`): Flagged by learnings-researcher and code-simplicity-reviewer.

## Resources

- `server/src/features/mlb-feed/routes.ts` (YouTube RSS + Reddit handlers)
- `server/src/features/mlb-feed/services/playerNameMatcher.ts` (factory function)
- `docs/solutions/logic-errors/player-news-false-positive-substring-match.md`
