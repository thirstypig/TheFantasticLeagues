---
status: pending
priority: p2
issue_id: "219"
tags: [code-review, agent-native, mcp, teams, period-roster]
dependencies: []
---

# No MCP tool for `GET /api/teams/:id/period-roster` — agents can't analyze team period performance

## Problem Statement

The Team page now defaults to the most recent period and correctly displays period-specific rosters. But there is no MCP tool for `GET /api/teams/:id/period-roster`. An agent asked to "verify who was on the Doyers during Period 2" or "audit period 3 stats for each team" has no tool to access this endpoint.

The endpoint is the authoritative source for in-season per-period analysis (stats per player per period, with correct IL exclusions and boundary handling). Agents currently have no way to replicate this analysis.

## Findings

- **Server endpoint:** `GET /api/teams/:id/period-roster?periodId=:periodId`
- **File:** `server/src/features/teams/routes.ts` lines ~411–502
- **Response:** `{ period: { id, startDate, endDate }, roster: PeriodRosterEntry[] }`
- Boundary note: server returns rows with `releasedAt >= period.startDate` (intentional for stats attribution). Rows where `releasedAt === period.startDate` are boundary rows — they should be excluded from "active during period" display but are included for stats.
- **MCP server:** no `team_get_period_roster` tool

## Proposed Solutions

### Option A — Add `team_get_period_roster` tool (Recommended)
```typescript
server.tool(
  "team_get_period_roster",
  "Get the roster for a team during a specific period. Returns player stats for that period " +
  "and the period boundaries. NOTE: entries where releasedAt === period.startDate are " +
  "boundary rows (released at the opening moment) — exclude them from 'active during period' " +
  "display, but they are included for stats attribution.",
  { teamId: z.number(), periodId: z.number() },
  async ({ teamId, periodId }) => {
    const res = await client.get(`/api/teams/${teamId}/period-roster`, { params: { periodId } });
    return { content: [{ type: "text", text: JSON.stringify(res.data) }] };
  }
);
```

Register in `commissionerTools.ts` (or a new `teamTools.ts` if preferred).
- **Effort:** Small
- **Risk:** None — read-only endpoint

## Recommended Action

Option A. Ship alongside todos #211/#218 in the commissioner tools PR.

## Acceptance Criteria
- [ ] `team_get_period_roster` tool registered in MCP server
- [ ] Tool description documents boundary row semantics (`releasedAt === period.startDate` → boundary)
- [ ] Tool smoke test added
- [ ] `tsc` clean in MCP server

## Work Log
- 2026-05-18: Identified by Agent-Native reviewer. Period-by-period roster audits are inaccessible to agents without this tool.
