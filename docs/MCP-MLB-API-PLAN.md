# MCP Server Plan: MLB Data Proxy

## Overview

Build a local MCP (Model Context Protocol) server that acts as an intelligent caching proxy between FBST and the MLB Stats API (`statsapi.mlb.com`). This centralizes rate limiting, caching, and fallback logic in one place — replacing the current ad-hoc `mlbApi.ts` fetch-and-cache pattern.

## Why

- **MLB API has no published rate limits** — but they could throttle or block at any time
- **No API key required** — it's free and unauthenticated, but ToS restricts commercial/bulk use
- **Current caching is in-memory only** — lost on every server restart
- **No centralized rate control** — each caller manages its own retries independently
- **MCP tools double as Claude Code tools** — query MLB data directly from conversations

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Claude Code CLI                                │
│  (can call tools directly in conversation)      │
└──────────────────┬──────────────────────────────┘
                   │ MCP protocol (stdio)
┌──────────────────▼──────────────────────────────┐
│  MCP Server: mlb-data-proxy                     │
│                                                 │
│  ┌─────────────┐  ┌──────────────┐              │
│  │ Rate Limiter │  │ Cache Layer  │              │
│  │ (token       │  │ (SQLite or   │              │
│  │  bucket)     │  │  Redis)      │              │
│  └──────┬──────┘  └──────┬───────┘              │
│         │                │                      │
│  ┌──────▼────────────────▼──────┐               │
│  │  MLB API Client              │               │
│  │  - fetchWithRetry            │               │
│  │  - circuit breaker           │               │
│  │  - response normalization    │               │
│  └──────────────┬───────────────┘               │
│                 │                               │
│  Tools:         │                               │
│  ├── get-player-stats                           │
│  ├── get-player-info                            │
│  ├── search-players                             │
│  ├── get-team-roster                            │
│  ├── get-mlb-standings                          │
│  ├── get-mlb-schedule                           │
│  ├── sync-player-teams                          │
│  └── cache-status                               │
│                                                 │
│  Resources:                                     │
│  ├── mlb://teams (all 30 MLB teams)             │
│  └── mlb://cache-stats                          │
└──────────────────┬──────────────────────────────┘
                   │ HTTPS (rate-limited)
┌──────────────────▼──────────────────────────────┐
│  statsapi.mlb.com                               │
└─────────────────────────────────────────────────┘
```

## Detailed To-Do List

### Phase 1: Project Setup
- [x] Create `mcp-servers/mlb-data/` directory in the monorepo
- [x] Initialize with `package.json` (TypeScript, `@modelcontextprotocol/sdk`)
- [x] Set up `tsconfig.json` (ESM, strict mode)
- [x] Create entry point `src/index.ts` with MCP server scaffold
- [x] Add build script (`tsc`) and dev script (`tsx watch`)

### Phase 2: Core Infrastructure
- [x] **Cache layer** (`src/cache.ts`)
  - SQLite via `better-sqlite3` (zero-config, file-based, no Redis dependency needed)
  - Tables: `cache_entries (url TEXT PK, data JSON, fetched_at INT, ttl_seconds INT)`
  - Methods: `get(url)`, `set(url, data, ttl)`, `invalidate(pattern)`, `stats()`
  - Configurable TTL per endpoint type (teams=24h, rosters=1h, stats=15min, schedule=5min)
- [x] **Rate limiter** (`src/rateLimiter.ts`)
  - Token bucket algorithm (e.g., 10 requests/second, burst of 20)
  - Queue overflow requests instead of rejecting
  - Expose metrics: requests/min, queue depth, throttle count
- [x] **MLB API client** (`src/mlbClient.ts`)
  - Migrate `fetchWithRetry` + circuit breaker logic from `server/src/lib/mlbApi.ts`
  - Add response normalization (consistent field names across endpoints)
  - Structured logging (pino)

### Phase 3: MCP Tools
- [x] **`get-player-info`** — Look up player by MLB ID or name
  - Input: `{ playerId?: number, name?: string }`
  - Returns: name, team, position, jersey number, batting/throwing hand
  - Cache TTL: 24 hours
- [x] **`get-player-stats`** — Season stats for a player
  - Input: `{ playerId: number, season?: number, group?: "hitting" | "pitching" }`
  - Returns: season batting or pitching stats
  - Cache TTL: 1 hour (during season), 24 hours (offseason)
- [x] **`search-players`** — Search by name (fuzzy)
  - Input: `{ query: string, limit?: number }`
  - Returns: array of matching players with basic info
  - Cache TTL: 1 hour
- [x] **`get-team-roster`** — 40-man roster for an MLB team
  - Input: `{ teamId: number, rosterType?: "40Man" | "active" }`
  - Returns: array of players on the roster
  - Cache TTL: 6 hours
- [x] **`get-mlb-standings`** — Current MLB standings
  - Input: `{ season?: number, leagueId?: number }`
  - Returns: division standings with W/L/PCT/GB
  - Cache TTL: 15 minutes
- [x] **`get-mlb-schedule`** — Game schedule
  - Input: `{ date?: string, teamId?: number }`
  - Returns: games with scores, status, venues
  - Cache TTL: 5 minutes (during games), 1 hour otherwise
- [x] **`sync-player-teams`** — Batch update MLB team abbreviations for player IDs
  - Input: `{ playerIds: number[] }`
  - Returns: `{ [playerId]: teamAbbr }` mapping
  - This replaces `warmMlbTeamCache()` from the current codebase
  - Cache TTL: 24 hours
- [x] **`cache-status`** — View cache stats and optionally clear
  - Input: `{ clear?: boolean }`
  - Returns: entry count, hit rate, oldest entry, total size

### Phase 4: MCP Resources
- [x] **`mlb://teams`** — Static resource listing all 30 MLB teams (ID, name, abbreviation, division)
- [x] **`mlb://cache-stats`** — Dynamic resource showing cache health

### Phase 5: Integration with FBST Server
- [x] Added `better-sqlite3` to server dependencies
- [x] Created `server/src/lib/mlbCache.ts` — shared SQLite cache layer (same DB file as MCP server)
- [x] Updated `server/src/lib/mlbApi.ts` — replaced in-memory `Map` cache with persistent SQLite cache
  - Both MCP server and Express server now share the same `mcp-servers/mlb-data/cache/mlb-data.db`
  - Configurable path via `MLB_CACHE_PATH` env var
- [x] Simplified `warmMlbTeamCache()` — removed JSON file cache, now uses SQLite cache via `mlbGetJson()` with 24h TTL
  - Removed `readTeamCache()`, `writeTeamCache()`, `TEAM_CACHE_FILE`, `fs`/`path` imports
  - `mlbSyncService.ts` already uses `mlbGetJson()` which goes through SQLite cache — no changes needed
  - `players/routes.ts` fielding endpoint already uses `mlbGetJson()` — no changes needed

### Phase 6: Claude Code Configuration
- [x] Add MCP server config to `.mcp.json`:
  ```json
  {
    "mcpServers": {
      "mlb-data": {
        "command": "node",
        "args": ["mcp-servers/mlb-data/dist/index.js"],
        "env": { "CACHE_DIR": "./mcp-servers/mlb-data/cache" }
      }
    }
  }
  ```
- [ ] Test tools from Claude Code conversation (e.g., "look up Shohei Ohtani's stats")
- [ ] Add to CLAUDE.md under a new "MCP Servers" section

### Phase 7: Testing
- [x] Unit tests for cache layer (8 tests: get/set/invalidate/TTL expiry/stats)
- [x] Unit tests for rate limiter (5 tests: token bucket, queue behavior, rejection, metrics)
- [x] Unit tests for MCP tools (16 tests: all 8 tools + cache stats, mocked MLB API responses)
- [ ] Integration test: MCP server startup → tool call → cached response → cache hit
- [ ] Verify FBST server works with MCP enabled and disabled

### Phase 8: Documentation
- [ ] Update CLAUDE.md with MCP server section
- [ ] Update FEEDBACK.md with session progress
- [ ] Add README to `mcp-servers/mlb-data/` with setup/usage instructions
- [ ] Document cache TTL strategy and rate limit configuration

## Cache TTL Strategy

| Endpoint Type | During Season | Offseason | Rationale |
|--------------|---------------|-----------|-----------|
| Teams list | 24h | 7d | Rarely changes |
| Player info | 24h | 7d | Trades happen but infrequently |
| Player stats | 15min | 24h | Stats update after each game |
| Rosters | 6h | 24h | Roster moves happen daily |
| Standings | 15min | 24h | Changes after each game |
| Schedule | 5min | 1h | Live game status |

## Rate Limit Strategy

- **Token bucket**: 10 requests/second, burst capacity of 20
- **Queue**: Hold up to 50 pending requests; reject beyond that
- **Circuit breaker**: Open after 5 consecutive failures, reset after 60 seconds
- **Backoff**: Exponential (1s, 2s, 4s) on retries

## File Structure

```
mcp-servers/
└── mlb-data/
    ├── package.json
    ├── tsconfig.json
    ├── src/
    │   ├── index.ts          # MCP server entry point
    │   ├── cache.ts          # SQLite cache layer
    │   ├── rateLimiter.ts    # Token bucket rate limiter
    │   ├── mlbClient.ts      # MLB API client (fetch, retry, circuit breaker)
    │   ├── tools/            # One file per MCP tool
    │   │   ├── getPlayerInfo.ts
    │   │   ├── getPlayerStats.ts
    │   │   ├── searchPlayers.ts
    │   │   ├── getTeamRoster.ts
    │   │   ├── getStandings.ts
    │   │   ├── getSchedule.ts
    │   │   ├── syncPlayerTeams.ts
    │   │   └── cacheStatus.ts
    │   └── resources/
    │       └── teams.ts
    ├── cache/                # SQLite DB file (gitignored)
    └── __tests__/
        ├── cache.test.ts
        ├── rateLimiter.test.ts
        └── tools.test.ts
```

## Dependencies

| Package | Purpose |
|---------|---------|
| `@modelcontextprotocol/sdk` | MCP server framework |
| `better-sqlite3` | Persistent cache (zero-config) |
| `pino` | Structured logging |

## Open Questions

1. **SQLite vs Redis?** — SQLite is simpler (no separate process), Redis is already allocated (port 6381). Start with SQLite; migrate if needed.
2. **Season detection?** — Auto-detect whether season is active (for TTL adjustment) by checking MLB schedule, or use a manual env var?
3. **Scope creep** — Start with the 8 tools listed above. Don't add Statcast, projections, or historical data until needed.
