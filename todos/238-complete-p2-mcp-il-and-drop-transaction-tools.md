# #238 — MCP IL-stash, IL-activate, and drop transaction tools

**Priority:** P2
**Status:** pending
**Surfaced by:** PR #359 (Activate-from-IL drawer + commissioner roster tool redesign) — exposed an agent-native gap where the MCP fbst-app server can drive add/drop claims but not IL-stash, IL-activate, or plain drop. An agent acting as a commissioner can't currently perform these roster moves via tools.

## Goal

Close the agent-native gap on roster-move surfaces. Mirror the existing `transactionTools.ts` pattern (`transactions_preview_claim` / `transactions_execute_claim`) for IL stash, IL activate, and drop.

## Tools to register (5)

| Tool name | HTTP | Endpoint |
|---|---|---|
| `transactions_preview_il_stash` | POST | `/api/transactions/il-stash/preview` |
| `transactions_execute_il_stash` | POST | `/api/transactions/il-stash` |
| `transactions_preview_il_activate` | POST | `/api/transactions/il-activate/preview` |
| `transactions_execute_il_activate` | POST | `/api/transactions/il-activate` |
| `transactions_execute_drop` | POST | `/api/transactions/drop` |

Skip `transactions_sync_il_status` for this PR (separate, lower-priority surface).

## Acceptance

- Input schemas reuse `IlStashRequestSchema`, `IlActivateRequestSchema`, `DropRequestSchema` from `shared/api/rosterMoves.ts` via `.shape.*` (same pattern as `ClaimRequestSchema` usage in the existing tools).
- One smoke test per tool in `mcp-servers/fbst-app/__tests__/transactions.test.ts` (or sibling), verifying the registered tool issues the expected HTTP method, path, and body shape.
- `npm run build` from `mcp-servers/fbst-app/` succeeds.
- `TRANSACTION_TOOL_NAMES` extended to 8 entries; existing tests still pass.
- `CLAUDE.md` "FBST App Tools" table updated with the new 5 rows.

## Out of scope

- `transactions_sync_il_status` (POST `/api/transactions/sync-il-status`) — separate todo.
- Drop preview — endpoint does not exist server-side; not adding one in this PR.
