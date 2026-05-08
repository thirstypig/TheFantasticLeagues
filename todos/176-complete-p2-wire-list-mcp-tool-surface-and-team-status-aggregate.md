---
status: pending
priority: p2
issue_id: "176"
tags: [code-review, wire-list, agent-native, mcp]
dependencies: []
---

# Wire List: zero MCP tool coverage + missing team-status aggregate endpoint

## Problem Statement

Per `CLAUDE.md`'s `compound-engineering:agent-native-architecture` value, every user action should be an agent-callable tool. The wire-list feature ships 18 endpoints (owner CRUD + commissioner reducer + period management) and exposes **zero** MCP bindings. The existing MCP server at `mcp-servers/mlb-data/` is a read-only MLB API proxy; nothing maps to wire-list mutations or queries.

Separately, the home page (`Home.tsx:36-251`) synthesizes a "team wire-list status" banner from three separate API calls — exactly the kind of derived view that benefits from a server-side aggregate, both for UI simplification and as agent context.

## Findings

- `mcp-servers/mlb-data/` — 8 tools, all MLB API proxies; no wire-list tools
- 18 wire-list endpoints across `routes.ts` + `processor.ts`
- `client/src/pages/Home.tsx:36-251` — synthesizes per-team wire-list status from `listPeriods`, `getPeriodResults`, `getMyAdds`/`getMyDrops`-equivalents
- No `GET /api/wire-list/teams/:teamId/status` aggregate endpoint exists

## Proposed Solutions

### Option 1: Aggregate endpoint + commissioner-reducer MCP tools first (recommended)
Phase 1 (small):
- Add `GET /api/wire-list/teams/:teamId/status` returning `{ activePeriod, myAdds, myDrops, deadlineAt, lockedAt }` in one call. Refactor Home banner to use it.

Phase 2 (medium):
- Extend `mcp-servers/` (or a new `mcp-servers/wire-list/`) with tools wrapping the highest-leverage endpoints first: `succeed-add`, `fail-add`, `skip-add`, `revert-add`, `finalize-period`. Owner-side tools (`add-entry`, `reorder-add`, `drop-entry`) follow.

**Effort:** Medium (Phase 1 ~3h, Phase 2 ~6h). **Risk:** Low. Phase 1 alone is a clear UX/perf win.

### Option 2: Aggregate endpoint only; defer MCP
Captures the immediate Home page win; leaves agent-native gap.

**Effort:** Small. **Risk:** None.

### Option 3: MCP-only; no aggregate endpoint
Inverse — closes the agent-native gap, leaves Home synthesizing.

**Effort:** Medium. **Risk:** Low.

## Recommended Action

**Option 1**, with Phase 1 shipped first as a standalone PR (immediate user-visible value), Phase 2 in a follow-up sized to fit the next session.

## Technical Details

- New endpoint: `GET /api/wire-list/teams/:teamId/status` in `server/src/features/wire-list/routes.ts`
- Auth: `requireAuth` + `requireTeamOwnerOrCommissioner`
- New MCP server (Phase 2): `mcp-servers/wire-list/` mirroring the structure of `mcp-servers/mlb-data/` (cache + tools + tests)
- Update `.mcp.json` at project root to register the new server
- Update `CLAUDE.md` MCP Servers section

## Acceptance Criteria

- [ ] `GET /api/wire-list/teams/:teamId/status` returns the aggregated payload in one call
- [ ] Home page wire-list banner uses the aggregate (one fetch, not three)
- [ ] (Phase 2) MCP tools for `succeed`, `fail`, `skip`, `revert`, `finalize` registered and tested
- [ ] (Phase 2) `.mcp.json` updated; agent-callable from Claude Code CLI
- [ ] CLAUDE.md updated for both new endpoint and (Phase 2) new MCP server

## Work Log

_(empty — created during /ce:review on 2026-05-07)_

## Resources

- `CLAUDE.md` — agent-native-architecture skill reference
- `mcp-servers/mlb-data/` — existing pattern
- `client/src/pages/Home.tsx:36-251` — aggregate-endpoint consumer
- Past wire-list PRs: https://github.com/thirstypig/TheFantasticLeagues/pulls?q=wire-list+is%3Amerged
