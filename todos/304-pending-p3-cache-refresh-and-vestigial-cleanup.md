---
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
- 2026-11-15: Worked items 1 and 2; item 3 awaits owner. (1) Verified: Player.mlbTeam is already refreshed for existing ids by the daily `syncAllPlayers` cron (12:00 UTC, roster reads cached 10 min), so the staleness window is <= ~24h; the JSON cache (`data/mlbTeamCache.ts`) and `DataService.getNormalizedSeasonStats` have no callers (dead). Per-player team lookups TTL cut 24h -> 1h (`PLAYER_TEAM_TTL`); tests pin the DB refresh + TTLs. Known gap: a player released from every 40-man is never updated. (2) `TradingBlock` table is now the single source: the 3 `/api/teams/*trade-block*` endpoints read/write it; `Team.tradeBlockPlayerIds` is no longer touched (marked deprecated in schema, column NOT dropped). Tests are real supertest + query-arg assertions. (3) Nothing reads `TeamStatsSeason` (only `deleteMany` in admin league reset + seed script); owner must run the check + DELETE in the report. Left: owner approves/runs DELETE; follow-up migrations to drop `Team.tradeBlockPlayerIds` and the `TeamStatsSeason` model; delete dead mlbTeamCache code. Also: no migration in repo creates `TradingBlock` (schema-only) - confirm table exists in prod.
