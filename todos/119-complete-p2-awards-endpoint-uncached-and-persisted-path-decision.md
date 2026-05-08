---
status: pending
priority: p2
issue_id: "119"
tags: [code-review, performance, awards, cache]
dependencies: []
---

# `GET /api/leagues/:id/awards` is uncached + decide whether persisted-snapshot path earns its keep

## Problem Statement

Two related concerns surface from review:

**1. Uncached.** The endpoint has no in-memory TTL and no stampede coalescing. Hitting it without `weekKey` defaults to current week. For pre-#178 digests for that week (which have no `data.awards`), every poll falls through to `computeAwardsRankings` → 4 DB queries per request. Even when the persisted blob exists, the lookup itself is uncached — every call does `aiInsight.findFirst`. The home page is the natural consumer; 5+ users polling = 5+ DB hits/sec.

**2. Persisted-snapshot path may not earn its keep.** The route does `findFirst` on `AiInsight`, branches on `data.awards` presence, and returns one of two shapes (`source: "persisted"` vs `source: "computed"`). All historical digests fall through to compute. The branching also forces every consumer to handle both shapes for marginal benefit — `computeAwardsRankings` runs ms of z-score math on already-loaded data.

These are coupled: if persistence stays, it needs cache. If persistence goes, just-cache-the-compute is simpler.

## Findings

- `server/src/features/mlb-feed/awardsRoutes.ts:30-61` — no cache, two-tier read
- `server/src/features/mlb-feed/services/awardsService.ts:137-340` — compute path: `period.findMany` + `team.findMany(include: rosters → player)` + 2 `playerStatsPeriod.groupBy` calls
- `server/src/features/standings/services/standingsService.ts:597-645` — pattern to copy (TTL + `pending` Promise coalescing, shipped in PR #179)
- Test 3 in `awardsRoutes.test.ts` explicitly proves the fallback fires for pre-#115 rows
- The persisted path saves at most one z-score compute pass — milliseconds of work — at the cost of a branch + a `source` discriminator + 3 of 5 awardsRoutes tests dedicated to branching

## Proposed Solutions

### Option 1: Cache the endpoint, keep persistence (recommended for now)

**Approach:** Mirror `standingsService` cache pattern with 5-min TTL + in-flight Promise coalescing keyed on `${leagueId}:${weekKey}`. Awards data only changes on digest regen / stats sync, both daily — 5 min is fine.

**Pros:**
- Matches existing pattern; low cognitive overhead
- Closes the immediate perf concern
- Preserves persistence-as-snapshot semantics (digest prose references match the endpoint)

**Cons:**
- Still carries the two-tier read complexity
- Discriminated `source` field still in every response

**Effort:** Small (~30 min)

**Risk:** Low

### Option 2: Delete persistence, just cache the compute

**Approach:** Always run `computeAwardsRankings`. Cache result in-memory 5-15 min. Drop the `findFirst` + `source` branching + the `data.awards` write in `digestService`.

**Pros:**
- Simpler endpoint; one code path
- Smaller persisted JSON blob in `AiInsight`
- Awards always reflect current state (good agent-native property)

**Cons:**
- Digest prose can drift from endpoint output if stats sync between digest gen and a query
- 3 tests need deletion / rewrite

**Effort:** Small (~30 min)

**Risk:** Medium-low — only matters if digest prose specifically references player ranks that need to match what the leaderboard shows

### Option 3: Commit to persistence

**Approach:** Always persist awards inside `digestService`; awards endpoint reads-only from `AiInsight`. Compute fallback only fires when row genuinely missing. Drop the `source` field.

**Pros:**
- Clearest semantics: leaderboard pinned to digest-generation moment
- Eliminates compute-on-read entirely for persisted weeks

**Cons:**
- Digest cron must be reliable (already is)
- Ad-hoc queries for past weeks before-#178 still need compute fallback — branch doesn't fully disappear

**Effort:** Small (~45 min)

**Risk:** Low

## Recommended Action

Option 1 today (fastest fix to live perf concern). Option 2 if simplicity-reviewer's broader "persistence isn't load-bearing" claim holds up under more thought — review whether digest prose actually references specific player ranks that would visibly break if the endpoint computes fresh values.

## Technical Details

**Affected files:**
- `server/src/features/mlb-feed/awardsRoutes.ts` — add cache layer
- `server/src/features/mlb-feed/services/awardsService.ts` — possibly extract cached wrapper

**No schema changes.**

## Acceptance Criteria

- [ ] Endpoint cached with TTL + stampede coalescing (or Option 2 chosen and persistence path deleted)
- [ ] 5+ concurrent requests for same `(leagueId, weekKey)` produce 1 compute, not 5
- [ ] Cache invalidates when stats sync runs (call from cron)
- [ ] Existing tests pass; test added for cache hit path

## Resources

- **Source:** Performance-oracle P1 #2; simplicity-reviewer P1 #2 (deletion option)
- **Reference impl:** `standingsService.ts:597-645` (PR #179)
- **PR #178:** Endpoint introduction

## Work Log

### 2026-04-30 — Initial Discovery
- **By:** /ce:review performance-oracle + code-simplicity-reviewer
- **Learnings:** Two reviewers split on the path forward — perf says cache; simplicity says delete the persistence branch. Deciding between them needs product judgment about whether digest prose pins specific player ranks.
