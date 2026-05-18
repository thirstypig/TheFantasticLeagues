---
status: pending
priority: p1
issue_id: "211"
tags: [code-review, agent-native, mcp, commissioner, position-eligibility]
dependencies: []
---

# No MCP tool for commissioner roster position edit — agents cannot correct slot assignments

## Problem Statement

The commissioner can now reassign a player's `assignedPosition` via `PATCH /api/commissioner/:leagueId/roster/:rosterId`. The server enforces eligibility via `isEligibleForSlot(roster.player.posList, targetSlot)`. But there is no MCP tool wrapping this endpoint.

Agents asked to "fix Trout's slot to OF" or "audit and correct all mispositioned players" cannot do so. This is the highest-friction agent-native gap: it's a common in-season commissioner task, the enforcement is now live and correct server-side, and the tool would get eligibility validation for free.

Additionally, agents have no way to discover eligible positions before attempting a slot change. `GET /api/commissioner/:leagueId/rosters` now returns `player.posList` — but there's no MCP tool for that read either (see todo #218). Without the read tool, agents would hit `POSITION_INELIGIBLE` 400s and retry blindly.

## Findings

- **Server endpoint:** `PATCH /api/commissioner/:leagueId/roster/:rosterId`
- **File:** `server/src/features/commissioner/routes.ts` lines 784–858
- **Inputs:** `{ leagueId, rosterId, assignedPosition?, price?, source? }`
- **Error codes:** `POSITION_INELIGIBLE` (400), `ROSTER_NOT_FOUND` (400), `NOT_IN_LEAGUE` (400)
- **MCP server location:** `mcp-servers/fbst-app/src/tools.ts`
- **Pattern to follow:** `registerWireListTools` in `mcp-servers/fbst-app/src/wireListTools.ts`
- **0 of 4 new changed capabilities have MCP coverage**

## Proposed Solutions

### Option A — Add `commissioner_edit_roster_entry` tool (Recommended)
Create `mcp-servers/fbst-app/src/commissionerTools.ts`:

```typescript
export function registerCommissionerTools(server: McpServer, client: AxiosInstance) {
  server.tool(
    "commissioner_edit_roster_entry",
    "Edit a roster entry's assigned position, price, or source. " +
    "Validates position eligibility server-side — will return POSITION_INELIGIBLE " +
    "if the slot is not in the player's posList. Call commissioner_get_rosters first " +
    "to read player.posList and determine valid slots.",
    {
      leagueId: z.number(),
      rosterId: z.number(),
      assignedPosition: z.string().max(5).optional(),
      price: z.number().optional(),
      source: z.string().optional(),
    },
    async ({ leagueId, rosterId, ...updates }) => {
      const res = await client.patch(`/api/commissioner/${leagueId}/roster/${rosterId}`, updates);
      return { content: [{ type: "text", text: JSON.stringify(res.data) }] };
    }
  );
}
```

Register via `registerCommissionerTools(server, client)` in `index.ts`.

- **Effort:** Small (follow existing pattern)
- **Risk:** None — server already enforces eligibility; tool just wraps the endpoint

### Option B — Add the tool inline in `tools.ts` without extracting
- **Pros:** Minimal diff
- **Cons:** `tools.ts` is already large; the wire-list tools are extracted to their own file

## Recommended Action

Option A — new `commissionerTools.ts` file, following the `wireListTools.ts` pattern.

## Acceptance Criteria
- [ ] `commissioner_edit_roster_entry` tool registered in MCP server
- [ ] Tool description documents `POSITION_INELIGIBLE` error and instructs callers to read `posList` first
- [ ] `commissionerTools.ts` added, registered in `index.ts`
- [ ] Tool smoke test added to MCP server test suite
- [ ] MCP server builds and smoke-test passes in CI

## Work Log
- 2026-05-18: Identified by Agent-Native reviewer. 0/4 new capabilities have MCP coverage; this is the highest-value write-path tool to add.
