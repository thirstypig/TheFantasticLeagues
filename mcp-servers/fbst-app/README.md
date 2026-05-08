# fbst-app MCP server

Exposes FBST app actions as Claude-callable tools. v1 ships **12 tools wrapping the wire-list feature** (owner CRUD + commissioner reducer).

This is the second MCP server in the repo — companion to [`mcp-servers/mlb-data/`](../mlb-data/), which is read-only MLB API proxy. fbst-app instead drives mutations against the local Express API, so an agent can run the same flows a human owner or commissioner would.

## Tools (12)

### Owner reads
| Tool | Endpoint |
|------|---------|
| `wire_list_get_active_period` | `GET /api/wire-list/periods/active?leagueId=` |
| `wire_list_list_adds` | `GET /api/wire-list/periods/:periodId/adds?teamId=` |
| `wire_list_list_drops` | `GET /api/wire-list/periods/:periodId/drops?teamId=` |
| `wire_list_get_results` | `GET /api/wire-list/periods/:periodId/results` |

### Owner writes
| Tool | Endpoint |
|------|---------|
| `wire_list_create_add` | `POST /api/wire-list/periods/:periodId/adds` |
| `wire_list_create_drop` | `POST /api/wire-list/periods/:periodId/drops` |
| `wire_list_reorder_entries` | `POST /api/wire-list/periods/:periodId/reorder` |

### Commissioner reducer
| Tool | Endpoint |
|------|---------|
| `wire_list_lock_period` | `POST /api/wire-list/periods/:periodId/lock` |
| `wire_list_succeed_add` | `POST /api/wire-list/adds/:id/succeed` |
| `wire_list_fail_add` | `POST /api/wire-list/adds/:id/fail` |
| `wire_list_skip_add` | `POST /api/wire-list/adds/:id/skip` |
| `wire_list_finalize_period` | `POST /api/wire-list/periods/:periodId/finalize` |

## Schema reuse

Input validators are sourced from `shared/api/wireList.ts` — the same Zod
schemas the React client and Express validator use. This is the contract
pilot's payoff: one schema, three callers.

## Auth

Reads a Supabase JWT from the `FBST_AUTH_TOKEN` env var. Tools fail clean
with a clear message if it's not set.

`FBST_API_BASE` defaults to `http://localhost:4010` (Express dev server per
`MASTER-PORTS.md`). Set to the production URL for prod use.

## Install + build

```bash
cd mcp-servers/fbst-app
npm install
npm run build
```

## Register with Claude Code

Add to `.mcp.json` at repo root:

```json
{
  "mcpServers": {
    "fbst-app": {
      "command": "node",
      "args": ["mcp-servers/fbst-app/dist/mcp-servers/fbst-app/src/index.js"],
      "cwd": "/absolute/path/to/thefantasticleagues-app",
      "env": {
        "FBST_API_BASE": "http://localhost:4010",
        "FBST_AUTH_TOKEN": "<paste-supabase-jwt-here>"
      }
    }
  }
}
```

(The deeply-nested `dist/` path is because `rootDir` is set to the worktree
root so the shared Zod schemas at `shared/api/wireList.ts` can be imported.)

## Tests

```bash
cd mcp-servers/fbst-app && npx vitest run
```

Two test files:
- `apiClient.test.ts` — auth header attachment, base URL, error code surfacing, JSON serialization
- `tools.test.ts` — registration sanity (all 12 tools register, names unique)

## Out of scope for v1

The `GET /api/wire-list/teams/:teamId/status` aggregate endpoint mentioned in
todo #176 is a separate work item — it requires a new server-side route, not
just an MCP wrapper. That's a follow-up PR.
