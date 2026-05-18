---
status: pending
priority: p2
issue_id: "218"
tags: [code-review, agent-native, mcp, commissioner]
dependencies: ["211"]
---

# No MCP tool for `GET /api/commissioner/:leagueId/rosters` — agents can't read league roster state

## Problem Statement

`GET /api/commissioner/:leagueId/rosters` now returns `player.posList` and `assignedPosition` for every roster entry — the data an agent needs to determine valid slot options before calling `commissioner_edit_roster_entry` (todo #211). Without a read tool, an agent attempting a bulk position audit must make the edit blindly, relying entirely on `POSITION_INELIGIBLE` errors to learn what's valid.

This is the read-side complement to todo #211 (write tool). An agent workflow is: read all rosters → find mispositioned players → edit each to a valid slot. Both tools are needed for this workflow.

## Findings

- **Server endpoint:** `GET /api/commissioner/:leagueId/rosters`
- **File:** `server/src/features/commissioner/routes.ts` lines 864–882
- **Response shape:** `{ rosters: Array<{ id, teamId, assignedPosition, player: { id, name, posPrimary, posList, mlbId }, price, ... }> }`
- `player.posList` is the CSV string an agent passes to `slotsFor` to determine valid positions
- **MCP server:** `mcp-servers/fbst-app/src/tools.ts` — no commissioner tools registered

## Proposed Solutions

### Option A — Add `commissioner_get_rosters` tool in `commissionerTools.ts` (Recommended)
```typescript
server.tool(
  "commissioner_get_rosters",
  "Get all roster entries for a league. Response includes player.posList (CSV of valid " +
  "positions, e.g. '2B,SS') and assignedPosition. Use posList to determine eligible slots " +
  "before calling commissioner_edit_roster_entry.",
  { leagueId: z.number() },
  async ({ leagueId }) => {
    const res = await client.get(`/api/commissioner/${leagueId}/rosters`);
    return { content: [{ type: "text", text: JSON.stringify(res.data) }] };
  }
);
```
- **Effort:** Small — add alongside `commissioner_edit_roster_entry` (todo #211) in the same `commissionerTools.ts` file
- **Risk:** None — read-only endpoint

## Recommended Action

Option A. Ship together with todo #211 in one PR.

## Acceptance Criteria
- [ ] `commissioner_get_rosters` tool registered in MCP server
- [ ] Tool description documents `player.posList` field and how to use it for slot pre-screening
- [ ] Tool smoke test added
- [ ] Ships in same PR as todo #211

## Work Log
- 2026-05-18: Identified by Agent-Native reviewer. Read-side prerequisite for the position edit workflow.
