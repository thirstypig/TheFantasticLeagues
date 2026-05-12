---
status: pending
priority: p2
issue_id: "192"
tags: [code-review, wire-list, mcp, agent-native]
dependencies: [185]
---

# wire_list_revert_add MCP tool missing from fbst-app server

## Problem Statement

The wire-list processor has a 4th commissioner-action endpoint (`POST /api/wire-list/adds/:id/revert`) that is not exposed as an MCP tool. The current fbst-app MCP server (v1, 12 tools) covers `succeed`, `fail`, and `skip` but omits `revert`. An agent driving the commissioner workflow cannot undo an erroneously succeeded add.

## Findings

- **Server**: `server/src/features/wire-list/processor.ts` — `revert` action confirmed live
- **Route**: `POST /api/wire-list/adds/:id/revert`
- **MCP tools file**: `mcp-servers/fbst-app/src/tools.ts` — missing `wire_list_revert_add`
- **Related todo**: #185 (`wire-list-mcp-delete-update-tools`) covers delete/update tools; this is a distinct gap on the commissioner reducer path
- Agent-native parity: commissioner agent can succeed/fail/skip but cannot revert — partial coverage

## Proposed Solution

Add `wire_list_revert_add` tool to `mcp-servers/fbst-app/src/tools.ts`:

```ts
{
  name: "wire_list_revert_add",
  description: "Commissioner: revert a previously succeeded add entry back to PENDING.",
  inputSchema: z.object({ id: z.number().int() }),
  handler: async ({ id }) => post(`/api/wire-list/adds/${id}/revert`, {}),
}
```

Update tool count in README and CLAUDE.md (12 → 13).

## Acceptance Criteria

- [ ] `wire_list_revert_add` tool added to `mcp-servers/fbst-app/src/tools.ts`
- [ ] Tool smoke-tested against local server (adds/:id/revert route)
- [ ] README + CLAUDE.md tool count updated
- [ ] tsc clean for mcp-servers/fbst-app

## Work Log

- 2026-05-11: Identified in PR #333 `/ce:review` agent-native pass. Distinct from todo #185 (that covers owner-side delete/update; this covers commissioner reducer revert).
