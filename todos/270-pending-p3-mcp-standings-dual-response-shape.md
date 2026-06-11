---
status: pending
priority: p3
issue_id: 270
tags: [code-review, mcp, standings, agent-native, architecture]
dependencies: []
---

## Problem Statement

PR #375 extends `standings_get_period` with an optional `periodId` parameter that routes to a different endpoint (`/api/standings/period-category-standings`) returning a structurally different response shape from the current-period path (`/api/standings/period/current`). A single MCP tool now returns two different schemas based on whether `periodId` is present. The `STANDINGS_TOOL_NAMES` constant at line 70 is documented as agent-grep stable — a stable name with two response shapes forces every agent caller to branch on presence of `periodId`, and makes the tool description misleading for the common case.

## Findings

From `mcp-servers/fbst-app/src/tools/standings.ts` (PR #375):
```typescript
server.tool("standings_get_period", "...", {
  ...LeagueIdInput,
  periodId: z.number().int().positive().optional(),
}, async ({ leagueId, periodId }) => {
  const data = periodId
    ? await client.request("GET", "/api/standings/period-category-standings", ...)
    // ↑ returns: { periodId, categories: [...], teamCount, totalDelta, computedAt }
    : await client.request("GET", "/api/standings/period/current", ...)
    // ↑ returns: { periodId, data: [{teamId, teamName, teamCode, points}], computedAt }
});
```
- Architecture reviewer: "MCP agents key on tool names as stable contracts. A single tool returning two different shapes based on an optional parameter forces every agent caller to branch on whether periodId was provided."
- The agent-native reviewer flagged the two different response shapes in the tool description.

## Proposed Solutions

### Option A — Split into two tools (Recommended per architecture reviewer)
```typescript
// Keep existing: current period only
server.tool("standings_get_period", "...", LeagueIdInput, ...);

// Add new: historical by ID
server.tool("standings_get_period_by_id", "...",
  { ...LeagueIdInput, periodId: z.number().int().positive() },
  ...
);
```
Add `"standings_get_period_by_id"` to `STANDINGS_TOOL_NAMES`. **Pros:** Each tool name maps to exactly one response shape; consistent with how `standings_get_season` is a separate tool. **Cons:** One more tool name for agents to know. **Effort:** Small. **Risk:** None.

### Option B — Keep one tool, add shape documentation (Accepted compromise)
Update the tool description to explain the two shapes:
```typescript
"Get period standings. Omit periodId for current period (returns { data: [{teamId, teamName, teamCode, points}] }). Provide periodId for historical category breakdown (returns { categories: [...], totalDelta })."
```
**Pros:** Fewer tools. **Cons:** Agent must branch on periodId presence for shape handling. **Effort:** Trivial. **Risk:** Low.

## Recommended Action

Option B as a fast fix; Option A as a follow-up if agent confusion is observed. The documentation improvement is a one-PR fix regardless.

## Technical Details

- **File:** `mcp-servers/fbst-app/src/tools/standings.ts`
- `STANDINGS_TOOL_NAMES` at line 70 must be updated if a new tool is added

## Acceptance Criteria

- [ ] Tool description clearly documents both response shapes (Option B minimum)
- [ ] If Option A: new `standings_get_period_by_id` tool added to `STANDINGS_TOOL_NAMES`
- [ ] `cd mcp-servers/fbst-app && npx tsc --noEmit` clean

## Work Log

### 2026-06-05 — Surfaced by architecture-strategist and agent-native-reviewer during session review
