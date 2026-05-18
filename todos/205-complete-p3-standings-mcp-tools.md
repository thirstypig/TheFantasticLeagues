# 205 · standings MCP tools [P3]

## Status: COMPLETE

## What
Add 3 standings tools to the fbst-app MCP server so agents can query waiver priority,
current-period standings, and season standings without needing to call the API directly.

## Why
Agents running wire-list processing need waiver priority to determine claim order.
Having `standings_get_waiver_priority` as a first-class tool makes the intent explicit
and keeps the agent prompt clean.

## Files changed
- `mcp-servers/fbst-app/src/tools/standings.ts` (new) — `registerStandingsTools`, `STANDINGS_TOOL_NAMES`
- `mcp-servers/fbst-app/src/index.ts` — call `registerStandingsTools(server, client)`
- `mcp-servers/fbst-app/__tests__/standings.test.ts` (new) — 5 smoke tests

## Tools added
| Tool | Endpoint |
|------|---------|
| `standings_get_waiver_priority` | `GET /api/standings/waiver-priority?leagueId=` |
| `standings_get_period` | `GET /api/standings/period/current?leagueId=` |
| `standings_get_season` | `GET /api/standings/season?leagueId=` |
