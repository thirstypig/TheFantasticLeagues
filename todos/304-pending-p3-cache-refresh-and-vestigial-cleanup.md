---
status: pending
priority: p3
issue_id: 304
tags: [cache, drift, cleanup, mlb-team, vestigial-data]
dependencies: []
---

## Problem Statement
(1) `data/mlbTeamCache.ts:141` never refreshes existing ids and the SQLite team-map TTL is 24h (`lib/mlbApi.ts:12`) — a traded player's `Player.mlbTeam` can stay wrong for a day-plus (or forever in the JSON cache). (2) `Team.tradeBlockPlayerIds` JSON can diverge from the `TradingBlock` table with no consistency check. (3) 8 deprecated `TeamStatsSeason` rows sit in prod, read by nothing. Evidence: `docs/reports/pipeline-staleness-audit-2026-07-02.md` Finding 7.

## Proposed Solutions
Refresh mlbTeamCache/team-map on trades (or shorten TTL). Add a consistency check (or single source) for tradeBlockPlayerIds vs TradingBlock. Drop the vestigial TeamStatsSeason rows.

## Acceptance Criteria
- Traded player's mlbTeam updates within a bounded window (document it).
- tradeBlockPlayerIds reconciles to TradingBlock (query #5 returns 0 rows) or is single-sourced.
- TeamStatsSeason rows removed.
- `git mv` this todo from pending → complete.
