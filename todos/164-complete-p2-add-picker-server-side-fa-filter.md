---
status: pending
priority: p2
issue_id: "164"
tags: [code-review, wire-list, performance, mobile]
dependencies: []
---

# Wire List AddPicker: pulls full league season-stats payload; filter FAs server-side

## Problem Statement

`AddPicker` opens with a full-league season-stats fetch (~600 rows for OGBA), then filters to free agents in the browser. On mobile, the round-trip dominates picker open latency, and re-opening the picker re-fetches the same payload (no client cache across opens). The picker only needs the FA subset plus an optional name query — sending 600 rows to render <50 is gratuitous.

## Findings

`client/src/features/wire-list/components/AddPicker.tsx:32-42` — `useEffect` on open calls `getPlayerSeasonStats(leagueId)`, awaiting the entire league payload before any client-side filter runs.

```ts
const all = await getPlayerSeasonStats(leagueId);
const fas = all.filter(p => p.teamCode == null);
setRows(fas);
```

No `useRef`/cache, no debounce on query input, no server-side filter. Re-opening the picker re-fetches.

## Proposed Solutions

### Option 1: Add server-side query params to existing endpoint (recommended)
Extend `GET /api/leagues/:leagueId/player-season-stats` with `?freeAgentsOnly=true&q=<name>&take=50`. Server applies `WHERE roster.teamId IS NULL AND name ILIKE '%q%' LIMIT 50`. Client passes `freeAgentsOnly=true` and debounced query string.

**Effort:** Small (~1h server + ~30min client). **Risk:** Low — additive params, default behavior unchanged.

### Option 2: Dedicated `/api/wire-list/leagues/:leagueId/free-agents` endpoint
Cleaner separation. Slightly more code; aligns with feature-module convention.

**Effort:** Small-medium (~2h with tests). **Risk:** Low.

### Option 3: Client-side cache only
Hold response in `useRef` keyed by `leagueId`. Doesn't fix first-open mobile latency.

**Effort:** Trivial. **Risk:** None but ineffective for the dominant cost.

## Recommended Action

**Option 1** — minimal surface area, mirrors past wins (sparkline GROUP BY, retention COUNT DISTINCT). Add the client-side `useRef` cache from Option 3 on top.

## Technical Details

- Server: `server/src/features/players/routes.ts` — extend `getPlayerSeasonStats` Zod query schema
- Client: `client/src/features/wire-list/components/AddPicker.tsx` — debounce query, pass params, cache by `leagueId`
- No schema changes
- No migration

## Acceptance Criteria

- [ ] AddPicker open fetches ≤50 rows (FAs only)
- [ ] Typing in the search box triggers debounced server-side query
- [ ] Re-opening picker within session reuses cached results when query unchanged
- [ ] Server endpoint preserves existing default behavior (no regression for non-wire-list callers)
- [ ] Tests cover the new query params

## Work Log

_(empty — created during /ce:review on 2026-05-07)_

## Resources

- Past PR (sparkline GROUP BY pattern): https://github.com/thirstypig/TheFantasticLeagues/pulls?q=wire-list+is%3Amerged
- Server endpoint: `server/src/features/players/routes.ts`
- Client caller: `client/src/features/wire-list/components/AddPicker.tsx:32-42`
