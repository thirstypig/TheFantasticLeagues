# MLB Data Proxy — MCP Server

Local MCP server that acts as an intelligent caching proxy between FBST and the MLB Stats API (`statsapi.mlb.com`).

## Setup

```bash
cd mcp-servers/mlb-data
npm install
npm run build
```

## Usage

### Via Claude Code (automatic)

Configured in `.mcp.json` at the project root. Claude Code spawns the server automatically via stdio.

### Manual testing

```bash
node dist/index.js
```

The server communicates via stdio (MCP protocol), not HTTP.

## Tools

| Tool | Input | Cache TTL |
|------|-------|-----------|
| `get-player-info` | `{ playerId: number }` | 24h |
| `get-player-stats` | `{ playerId, season?, group? }` | 1h |
| `search-players` | `{ query: string, limit? }` | 1h |
| `get-team-roster` | `{ teamId, rosterType? }` | 6h |
| `get-mlb-standings` | `{ season?, leagueId? }` | 15min |
| `get-mlb-schedule` | `{ date?, teamId? }` | 5min |
| `sync-player-teams` | `{ playerIds: number[] }` | 24h |
| `cache-status` | `{ clear?: boolean }` | — |

## Resources

- `mlb://teams` — All 30 MLB teams (ID, name, abbreviation, division)
- `mlb://cache-stats` — Cache health metrics

## Architecture

```
Claude Code CLI ──(stdio)──> MCP Server
                                │
                          ┌─────┴─────┐
                          │ Rate      │ Token bucket: 10/s, burst 20
                          │ Limiter   │ Queue: up to 50 pending
                          └─────┬─────┘
                          ┌─────┴─────┐
                          │ Cache     │ SQLite (better-sqlite3, WAL mode)
                          │ Layer     │ File: cache/mlb-data.db
                          └─────┬─────┘
                          ┌─────┴─────┐
                          │ MLB API   │ Circuit breaker (5 failures, 60s reset)
                          │ Client    │ Retry with exponential backoff
                          └─────┬─────┘
                                │
                     statsapi.mlb.com
```

### Shared Cache

Both this MCP server and the FBST Express server (`server/src/lib/mlbCache.ts`) share the same SQLite database file. This means:

- API responses cached by the MCP server are available to Express routes
- Express server MLB API calls also populate the cache for MCP tools
- Configurable via `MLB_CACHE_PATH` env var (default: `mcp-servers/mlb-data/cache/mlb-data.db`)

## Cache TTL Strategy

| Endpoint | During Season | Rationale |
|----------|---------------|-----------|
| Teams | 24h | Rarely changes |
| Player info | 24h | Trades are infrequent |
| Player stats | 1h | Updates after each game |
| Rosters | 6h | Roster moves happen daily |
| Standings | 15min | Changes after each game |
| Schedule | 5min | Live game status |

## Rate Limiting

- **Token bucket**: 10 tokens/second, burst capacity 20
- **Queue**: Up to 50 pending requests; rejects beyond that
- **Circuit breaker**: Opens after 5 consecutive failures, resets after 60 seconds
- **Backoff**: Exponential (1s, 2s, 4s) on retries

## Testing

```bash
npx vitest run
```

29 tests covering cache layer, rate limiter, and all 8 tools.

## Dependencies

| Package | Purpose |
|---------|---------|
| `@modelcontextprotocol/sdk` | MCP server framework |
| `better-sqlite3` | Persistent SQLite cache |
| `zod` | Parameter validation (via MCP SDK) |
