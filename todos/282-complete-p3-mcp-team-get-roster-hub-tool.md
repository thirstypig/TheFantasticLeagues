---
status: pending
priority: p3
issue_id: 282
tags: [code-review, agent-native, mcp, posGames, hub]
dependencies: []
---

## Problem Statement

PR #378 ships real `gamesByPos` GP data in the hub roster response, but no MCP tool exposes this endpoint. The hub roster (`GET /api/teams/:id/roster-hub`) is the richest player-context payload in the app (stats, slot, eligibility, `gamesByPos`, IL status, price, keeper flag) and is entirely dark to agents. An agent asked "how many games has Manny Machado played at 3B this season?" cannot answer from any available tool.

Agent-native reviewer score: 4 of 5 PR-relevant capabilities are NOT agent-accessible. Context parity with the UI is missing for the new posGames data.

## Proposed Solutions

Add a `team_get_roster_hub` tool to `mcp-servers/fbst-app/src/` wrapping `GET /api/teams/:id/roster-hub?teamId=<id>`:

```typescript
// Input: { teamId: number }
// Endpoint: GET /api/teams/:teamId/roster-hub
// Returns: full RosterHubResponse including gamesByPos, periodStats, slot, etc.
```

No new server endpoint needed — the route already exists. Input validation can reuse `z.object({ teamId: z.number().int().positive() })`.

## Technical Details

- **File:** `mcp-servers/fbst-app/src/commissionerTools.ts` or a new `teamTools.ts`
- **Endpoint:** `GET /api/teams/:teamId/roster-hub`
- **Existing auth:** Uses `FBST_AUTH_TOKEN` env var (same as all MCP tools)

## Acceptance Criteria

- [ ] `team_get_roster_hub` tool registered in `mcp-servers/fbst-app/src/index.ts`
- [ ] Returns `gamesByPos` for each roster row
- [ ] Input: `teamId: number`
- [ ] Tool description notes that `gamesByPos` may be synthetic (60/40 fallback) until the daily cron populates real data

## Work Log

### 2026-06-05 — Flagged by agent-native-reviewer (PR #378 review)
