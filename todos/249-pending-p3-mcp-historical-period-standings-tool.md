---
status: pending
priority: p3
issue_id: 247
tags: [code-review, agent-native, mcp, standings]
dependencies: []
---

## Problem Statement

The `GET /api/standings/period-category-standings?periodId=` endpoint exists and the commissioner UI uses it to display historical period breakdowns — but there is no MCP tool wrapping it. An agent can see current-period standings via `standings_get_period`, but cannot fetch standings for a specific historical period by ID. Surfaced during PR #368 agent-native review.

## Findings

- Three MCP standings tools exist in `mcp-servers/fbst-app/src/tools/standings.ts`: `standings_get_period`, `standings_get_waiver_priority`, `standings_get_season`.
- The endpoint `GET /api/standings/period-category-standings` supports `?periodId=` query param (confirmed in agent-native review of #368).
- This is a pre-existing gap — not introduced by PR #368 — but the review surfaced it as the one case where a human can see something the agent cannot.

## Proposed Solutions

**Option A — Add `standings_get_period_by_id` tool to `mcp-servers/fbst-app/src/tools/standings.ts`**

Wraps the existing endpoint with a `periodId` parameter. Input: `{ leagueId, periodId }`. Output: per-team category stats for that period.

**Option B — Extend `standings_get_period` to accept an optional `periodId`**

Keep one tool, add optional param. If omitted, returns current period (existing behavior). If provided, returns the specified period. Fewer tools = simpler agent interface.

**Recommended:** Option B. Backward-compatible and fewer tools for the agent to reason about.

## Acceptance Criteria

- [ ] `standings_get_period` accepts an optional `periodId` parameter
- [ ] When `periodId` is provided, returns category-level standings for that period
- [ ] When omitted, behavior is identical to current (returns current active period)
- [ ] Tool schema updated in `mcp-servers/fbst-app/`
- [ ] Smoke test added to MCP test suite
- [ ] No regression in existing `standings_get_period` behavior

## Resources

- `mcp-servers/fbst-app/src/tools/standings.ts`
- `server/src/features/standings/routes.ts` — `period-category-standings` route
- PR #283 — MCP CI gap fix (reference for MCP test patterns)
