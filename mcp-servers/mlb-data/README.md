# MLB Data Proxy -- MCP Server

A Model Context Protocol (MCP) server that acts as an intelligent caching proxy between FBST and the MLB Stats API (`statsapi.mlb.com`). It centralizes rate limiting, persistent caching, and retry/circuit-breaker logic in one place.

## Overview

- **8 tools** for querying MLB player, team, standings, and schedule data
- **2 resources** for static team list and cache health
- **SQLite persistent cache** with per-endpoint TTL (survives server restarts)
- **Token bucket rate limiter** with request queuing
- **Circuit breaker** with exponential backoff retries
- **Shared cache** -- both the MCP server and the FBST Express server read/write the same SQLite database

## Architecture

```
+-------------------------------------------------+
|  Claude Code CLI                                |
|  (calls tools directly in conversation)         |
+-----------------+-------------------------------+
                  | MCP protocol (stdio)
+-----------------v-------------------------------+
|  MCP Server: mlb-data                           |
|                                                 |
|  +-------------+  +--------------+              |
|  | Rate Limiter|  | Cache Layer  |              |
|  | (token      |  | (SQLite via  |              |
|  |  bucket)    |  | better-      |              |
|  |             |  | sqlite3)     |              |
|  +------+------+  +------+------+              |
|         |                |                      |
|  +------v----------------v------+               |
|  |  MLB API Client              |               |
|  |  - fetchWithRetry (3x)       |               |
|  |  - circuit breaker           |               |
|  |  - exponential backoff       |               |
|  +-------------+----------------+               |
+-----------------+-------------------------------+
                  | HTTPS (rate-limited)
+-----------------v-------------------------------+
|  statsapi.mlb.com                               |
+-------------------------------------------------+

+-------------------------------------------------+
|  FBST Express Server                            |
|  (reads/writes same SQLite cache via            |
|   server/src/lib/mlbCache.ts)                   |
+-------------------------------------------------+
```

## Tools

| Tool | Description | Parameters | Cache TTL |
|------|-------------|------------|-----------|
| `get-player-info` | Look up an MLB player by ID | `playerId: number` | 24h |
| `get-player-stats` | Get season batting or pitching stats | `playerId: number`, `season?: number`, `group?: "hitting"\|"pitching"` | 1h |
| `search-players` | Search for players by name (fuzzy) | `query: string`, `limit?: number` | 1h |
| `get-team-roster` | Get the roster for an MLB team | `teamId: number`, `rosterType?: "40Man"\|"active"` | 6h |
| `get-mlb-standings` | Get MLB standings by division | `season?: number`, `leagueId?: number` (103=AL, 104=NL) | 15min |
| `get-mlb-schedule` | Get game schedule for a date | `date?: string` (YYYY-MM-DD), `teamId?: number` | 5min |
| `sync-player-teams` | Batch resolve player IDs to team abbreviations | `playerIds: number[]` | 24h |
| `cache-status` | View cache statistics or clear cache | `clear?: boolean` | -- |

## Resources

| URI | Description |
|-----|-------------|
| `mlb://teams` | All 30 MLB teams (ID, name, abbreviation, division) |
| `mlb://cache-stats` | Cache health metrics (entries, hit rate, size) |

## Cache TTL Strategy

| Endpoint Type | TTL | Rationale |
|--------------|-----|-----------|
| Teams list | 24h | Rarely changes |
| Player info | 24h | Trades happen but infrequently |
| Player stats | 1h | Stats update after each game |
| Rosters | 6h | Roster moves happen daily |
| Standings | 15min | Changes after each game |
| Schedule | 5min | Live game status |

The cache is stored in a SQLite database (`cache/mlb-data.db`) using WAL (Write-Ahead Logging) mode for better concurrent read performance. Cache entries are keyed by full URL and include a `fetched_at` timestamp and `ttl_seconds` value for expiration checks.

## Rate Limiting

| Setting | Value |
|---------|-------|
| Capacity (burst) | 20 tokens |
| Refill rate | 10 tokens/second |
| Max queue size | 50 pending requests |
| Circuit breaker threshold | 5 consecutive failures |
| Circuit breaker reset | 60 seconds |
| Retry attempts | 3 per request |
| Retry backoff | Exponential (1s, 2s, 4s) |
| Request timeout | 10 seconds |

The rate limiter uses a token bucket algorithm. When tokens are exhausted, requests are queued (up to 50). Requests beyond the queue limit are rejected immediately. The circuit breaker opens after 5 consecutive API failures, blocking all outgoing requests for 60 seconds to allow the MLB API to recover.

## Setup

### Prerequisites

- Node.js 18+
- npm

### Install and Build

```bash
cd mcp-servers/mlb-data
npm install
npm run build
```

### Run Manually

```bash
node dist/index.js
```

The server communicates over stdio (MCP protocol). It is normally spawned automatically by Claude Code via `.mcp.json`.

### Development

```bash
npm run dev    # tsx watch mode (auto-rebuild)
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CACHE_PATH` | `./cache/mlb-data.db` | Path to SQLite cache database file |

### Claude Code Configuration (`.mcp.json`)

The MCP server is configured in the project root `.mcp.json`:

```json
{
  "mcpServers": {
    "mlb-data": {
      "command": "node",
      "args": ["mcp-servers/mlb-data/dist/index.js"],
      "cwd": "/path/to/fbst",
      "env": {
        "CACHE_PATH": "/path/to/fbst/mcp-servers/mlb-data/cache/mlb-data.db"
      }
    }
  }
}
```

### Shared Cache with Express Server

Both this MCP server and the FBST Express server (`server/src/lib/mlbCache.ts`) share the same SQLite database file. This means:

- API responses cached by the MCP server are available to Express routes
- Express server MLB API calls also populate the cache for MCP tools
- Configure the path with the `MLB_CACHE_PATH` env var in the server's `.env` file:

```
MLB_CACHE_PATH=/path/to/fbst/mcp-servers/mlb-data/cache/mlb-data.db
```

## Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Run a specific test file
npx vitest run __tests__/integration.test.ts
```

### Test Coverage (50 tests)

| File | Tests | Description |
|------|-------|-------------|
| `cache.test.ts` | 8 | get/set, TTL expiry, invalidation, clear, stats |
| `rateLimiter.test.ts` | 5 | Token bucket, queue, rejection, metrics, refill |
| `tools.test.ts` | 16 | All 8 tools with mocked MLB API responses |
| `integration.test.ts` | 21 | Cache round-trip, rate limiter integration, tool registry, end-to-end scenarios |

## File Structure

```
mcp-servers/mlb-data/
+-- package.json
+-- tsconfig.json
+-- README.md
+-- src/
|   +-- index.ts          # MCP server entry (tool/resource registration)
|   +-- cache.ts          # SQLite cache layer (better-sqlite3, WAL mode)
|   +-- rateLimiter.ts    # Token bucket rate limiter with request queue
|   +-- mlbClient.ts      # MLB API client (fetch, retry, circuit breaker)
+-- cache/                # SQLite DB file (gitignored)
|   +-- mlb-data.db
+-- dist/                 # Compiled output (gitignored)
+-- __tests__/
    +-- cache.test.ts
    +-- rateLimiter.test.ts
    +-- tools.test.ts
    +-- integration.test.ts
```

## Dependencies

| Package | Purpose |
|---------|---------|
| `@modelcontextprotocol/sdk` | MCP server framework |
| `better-sqlite3` | Persistent SQLite cache (WAL mode, zero-config) |
| `zod` | Input validation (via MCP SDK) |
