---
status: pending
priority: p3
issue_id: 230
tags: [code-review, agent-native, mcp, transactions]
---

# Add MCP Tools for Direct Add/Drop Claim Flow

## Problem Statement

The wire-list async waiver flow has 10+ MCP tools. The direct same-day add/drop claim flow has zero. An agent asked to "claim Player X and drop Player Y" cannot complete this operation at all. The agent-native gap predates PR #349 but is made more visible by the BFS chain logic, which exists only in client-side React state with no server endpoint or MCP tool equivalent.

Missing tools (in priority order):

1. `transactions_preview_claim` — wraps `POST /api/transactions/claim/preview`
2. `transactions_execute_claim` — wraps `POST /api/transactions/claim`
3. `transactions_get_drop_candidates` — new server endpoint + MCP tool; runs the BFS server-side using DB data
4. `players_get_eligible_slots` — wraps existing `GET /api/players/:mlbId/eligible-slots` (endpoint already exists, just needs an MCP wrapper)
5. `team_get_current_roster` — wraps `GET /api/teams/:id/roster-hub` for current active roster
6. `players_list_free_agents` — wraps `GET /api/players?leagueId=X` filtered to free agents

## Implementation Notes

- `ClaimRequestSchema` is in `shared/api/rosterMoves.ts` — reuse directly for tools 1 and 2
- Pattern is established in `mcp-servers/fbst-app/src/wireList.ts` — thin HTTP proxy wrapping the shared Zod schema
- `GET /api/players/:mlbId/eligible-slots` already exists at `server/src/features/players/routes.ts` and was explicitly built for agent use (comment: "lets agents and the v3 client ask which slots is this player eligible for?")
- `transactions_get_drop_candidates` requires a new server endpoint; the BFS logic from `AddDropPanel.tsx` should be extracted to a shared utility function and called from both the server endpoint and the client component

## Acceptance Criteria
- [ ] `transactions_preview_claim` MCP tool added and smoke-tested
- [ ] `transactions_execute_claim` MCP tool added and smoke-tested  
- [ ] `players_get_eligible_slots` MCP tool added (one-liner wrapper of existing endpoint)
- [ ] (Stretch) `team_get_current_roster` MCP tool added
- [ ] MCP CI test in `.github/workflows/ci.yml` covers the new tools
