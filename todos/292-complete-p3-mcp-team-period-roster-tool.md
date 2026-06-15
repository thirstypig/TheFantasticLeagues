---
status: pending
priority: p3
issue_id: 292
tags: [code-review, mcp, agent-native, teams, roster]
dependencies: []
---

## Problem Statement

The FBST MCP server (`mcp-servers/fbst-app/`) exposes 24 tools covering wire-list management and transactions. There is no tool wrapping `GET /api/teams/:id/period-roster?periodId=X`, so agents cannot query historical roster composition by period.

Current agent capability: agents can inspect current roster state indirectly via `transactions_preview_claim` (roster embedded in preview response). They cannot answer "who was on team X during period Y?" for historical audit, standings verification, or commissioner review.

This gap does not block any current workflow — the write tools (wire-list, transactions) operate on current state. But it leaves a hole in agent-native read coverage for the teams module.

## Findings

- **File**: `mcp-servers/fbst-app/src/tools.ts`
- **Endpoint**: `GET /api/teams/:id/period-roster?periodId=`
- **Agent-native reviewer**: PASS on PR #400 (no new action introduced); P3 follow-up recommended
- **CLAUDE.md note**: "Out of scope for v1: `GET /api/wire-list/teams/:teamId/status` aggregate endpoint from todo #176 is a follow-up PR" — this tool slots into the same follow-up batch

## Proposed Solution

Add `team_get_period_roster` tool to `mcp-servers/fbst-app/src/tools.ts`:

```ts
{
  name: "team_get_period_roster",
  description: "Get the roster for a team during a specific scoring period (historical view). Returns players who owned at least one day of the period.",
  inputSchema: z.object({
    teamId: z.number().describe("Team DB id"),
    periodId: z.number().describe("Period DB id"),
  }),
  handler: async ({ teamId, periodId }) =>
    apiFetch(`/api/teams/${teamId}/period-roster?periodId=${periodId}`),
}
```

- **Effort**: Small (~15 lines)
- **Risk**: Low (read-only endpoint, auth via `FBST_AUTH_TOKEN`)

## Acceptance Criteria

- [ ] `team_get_period_roster` tool registered in `mcp-servers/fbst-app/src/tools.ts`
- [ ] Tool returns roster array for the given team × period
- [ ] MCP server builds without errors
- [ ] `git mv` this todo to complete

## Work Log

- **2026-06-13**: Created via code review of PR #400 (agent-native reviewer). Not blocking; batch with todo #176 follow-up work.
