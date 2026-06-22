# MCP Servers

## MLB Data Proxy (`mcp-servers/mlb-data/`)

Local MCP server that acts as an intelligent caching proxy between FBST and the MLB Stats API (`statsapi.mlb.com`). Configured in `.mcp.json` at project root.

### Tools (8)
| Tool | Description | Cache TTL |
|------|-------------|-----------|
| `get-player-info` | Player lookup by MLB ID | 24h |
| `get-player-stats` | Season hitting/pitching stats | 1h |
| `search-players` | Fuzzy name search | 1h |
| `get-team-roster` | 40-man or active roster | 6h |
| `get-mlb-standings` | Division standings | 15min |
| `get-mlb-schedule` | Game schedule by date | 5min |
| `sync-player-teams` | Batch player ID → team abbr mapping | 24h |
| `cache-status` | View/clear cache stats | — |

### Resources
- `mlb://teams` (all 30 MLB teams)
- `mlb://cache-stats`

### Architecture
- SQLite persistent cache via `better-sqlite3` (WAL mode)
- Token bucket rate limiter (10 req/s, burst 20, queue 50)
- Circuit breaker (opens after 5 failures, resets in 60s)
- **Shared cache**: Both MCP server and Express server read/write the same `mcp-servers/mlb-data/cache/mlb-data.db` via `server/src/lib/mlbCache.ts`
- Configurable DB path via `MLB_CACHE_PATH` env var

### Running
Spawned automatically by Claude Code CLI via `.mcp.json`. For manual testing:
```bash
cd mcp-servers/mlb-data && npm run build && node dist/index.js
```

### Tests
50 tests (8 cache + 5 rate limiter + 16 tool tests + 21 integration tests):
```bash
cd mcp-servers/mlb-data && npx vitest run
```

**Detailed plan:** `docs/MCP-MLB-API-PLAN.md`

## FBST App Tools (`mcp-servers/fbst-app/`)

Companion MCP server that exposes FBST app actions as Claude-callable tools. v1 ships **12 wire-list tools** (owner CRUD + commissioner reducer) wrapping the live Express API, so agents can drive the same flows a human owner or commissioner would. Lands the agent-native promise of "every user action is also a tool" for the wire-list module (todo #176).

### Tools (24)

| Category | Tool | Endpoint |
|----------|------|---------|
| Read | `wire_list_get_active_period` | `GET /api/wire-list/periods/active?leagueId=` |
| Read | `wire_list_list_adds` | `GET /api/wire-list/periods/:periodId/adds?teamId=` |
| Read | `wire_list_list_drops` | `GET /api/wire-list/periods/:periodId/drops?teamId=` |
| Read | `wire_list_get_results` | `GET /api/wire-list/periods/:periodId/results` |
| Owner write | `wire_list_create_add` | `POST /api/wire-list/periods/:periodId/adds` |
| Owner write | `wire_list_create_drop` | `POST /api/wire-list/periods/:periodId/drops` |
| Owner write | `wire_list_reorder_entries` | `POST /api/wire-list/periods/:periodId/reorder` |
| Owner write | `wire_list_delete_add` | `DELETE /api/wire-list/adds/:id` |
| Owner write | `wire_list_delete_drop` | `DELETE /api/wire-list/drops/:id` |
| Owner write | `wire_list_update_drop` | `PATCH /api/wire-list/drops/:id` |
| Commissioner | `wire_list_lock_period` | `POST /api/wire-list/periods/:periodId/lock` |
| Commissioner | `wire_list_succeed_add` | `POST /api/wire-list/adds/:id/succeed` |
| Commissioner | `wire_list_fail_add` | `POST /api/wire-list/adds/:id/fail` |
| Commissioner | `wire_list_skip_add` | `POST /api/wire-list/adds/:id/skip` |
| Commissioner | `wire_list_revert_add` | `POST /api/wire-list/adds/:id/revert` |
| Commissioner | `wire_list_finalize_period` | `POST /api/wire-list/periods/:periodId/finalize` |
| Transactions | `players_get_eligible_slots` | `GET /api/players/:mlbId/eligible-slots` |
| Transactions | `transactions_preview_claim` | `POST /api/transactions/claim/preview` |
| Transactions | `transactions_execute_claim` | `POST /api/transactions/claim` |
| Transactions | `transactions_preview_il_stash` | `POST /api/transactions/il-stash/preview` |
| Transactions | `transactions_execute_il_stash` | `POST /api/transactions/il-stash` |
| Transactions | `transactions_preview_il_activate` | `POST /api/transactions/il-activate/preview` |
| Transactions | `transactions_execute_il_activate` | `POST /api/transactions/il-activate` |
| Transactions | `transactions_execute_drop` | `POST /api/transactions/drop` |

### Architecture
- Input validators reuse `shared/api/wireList.ts` Zod schemas (one schema → client + server + MCP)
- Auth: Supabase JWT via `FBST_AUTH_TOKEN` env var; tools fail clean if unset
- Base URL: `FBST_API_BASE` (default `http://localhost:4010`)
- No cache, no rate limiter — straight HTTP proxy to Express. Errors include the stable `code` from `WireListErrorCodeSchema`.

**Out of scope for v1:** the `GET /api/wire-list/teams/:teamId/status` aggregate endpoint from todo #176 is a follow-up PR.

### Running
Build (`npm install && npm run build` from `mcp-servers/fbst-app/`) then register in `.mcp.json` (snippet in `mcp-servers/fbst-app/README.md`).
