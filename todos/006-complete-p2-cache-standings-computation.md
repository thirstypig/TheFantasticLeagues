---
status: completed
priority: p2
issue_id: "006"
tags: [code-review, performance]
dependencies: []
---

# Cache Standings Computation Results

## Problem Statement
Every HTTP request to standings endpoints recomputes results from CSV data, even though the data is static between server restarts. The `/season` endpoint does O(periods * csvRows) work per request with repeated filter passes.

## Findings
- **Performance Oracle**: Season endpoint filters 840-row array 6+ times per request
- `aggregateSeasonStatsFromCsv` creates 840 object copies via spread
- DataService already has a caching pattern (`normalizedSeasonStats`) that could be extended
- Current impact: sub-5ms, but wasteful for concurrent users

## Proposed Solutions

### Option A: Cache computed standings in DataService
- Follow existing `normalizedSeasonStats` pattern
- Compute once on first request, clear on data reload
- **Effort**: Small | **Risk**: Low

### Option B: Pre-group CSV rows by period
- Group once via Map, iterate groups instead of repeated filters
- **Effort**: Small | **Risk**: Low

## Acceptance Criteria
- [ ] Standings computation is cached and reused across requests
- [ ] Cache invalidates when CSV data is reloaded
