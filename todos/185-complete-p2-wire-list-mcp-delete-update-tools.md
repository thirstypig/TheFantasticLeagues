---
status: pending
priority: p2
issue_id: "185"
tags: [code-review, wire-list, mcp, agent-native]
dependencies: []
---

# Add 3 missing MCP tools: wire_list_delete_add, wire_list_delete_drop, wire_list_update_drop

## Problem Statement

PR #333 shipped `MobileWireList` with remove (×) and drop-mode toggle (REL/IL) buttons — but the FBST MCP server has no tools for these three operations. An agent cannot remove a wire list entry or flip a drop from RELEASE to IL_STASH. 9/12 owner actions are agent-accessible; these 3 are the gap.

## Findings

Agent-native reviewer (PR #333 review) confirmed the gap via `grep` on `mcp-servers/fbst-app/src/tools.ts`.

**Missing tools:**
| Tool | Endpoint |
|------|----------|
| `wire_list_delete_add` | `DELETE /api/wire-list/adds/:id` |
| `wire_list_delete_drop` | `DELETE /api/wire-list/drops/:id` |
| `wire_list_update_drop` | `PATCH /api/wire-list/drops/:id` (dropMode field) |

## Proposed Solution

Add to `mcp-servers/fbst-app/src/tools.ts` following the existing tool pattern. Each is ~10 lines. Reuse `WaiverDropMode` enum from `shared/api/wireList.ts` for the update tool schema. Update `WIRE_LIST_TOOL_NAMES` export and the README tool table. Bump the CLAUDE.md tool count from 12 to 15.

Also verify whether `revertAdd` (`POST /api/wire-list/adds/:id/revert`) has a live server route — if yes, add `wire_list_revert_add` too; if no, remove the dead client function in `client/src/features/wire-list/api.ts`.

## Acceptance Criteria

- [ ] `wire_list_delete_add`, `wire_list_delete_drop`, `wire_list_update_drop` in tools.ts
- [ ] `WIRE_LIST_TOOL_NAMES` updated
- [ ] MCP server CI passes (`cd mcp-servers/fbst-app && npx vitest run`)
- [ ] `revertAdd` dead-code question resolved
- [ ] CLAUDE.md tool count updated

## Work Log

- 2026-05-11: Identified during PR #333 agent-native review.
