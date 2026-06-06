---
status: pending
priority: p3
issue_id: 283
tags: [code-review, agent-native, posGames, hub, schema]
dependencies: []
---

## Problem Statement

The `gamesByPos` field in the hub roster response looks identical whether the data comes from the MLB Stats API (real) or from the 60/40 synthetic fallback. Agents and UI consumers cannot distinguish between "3B: 8 games" (real, from MLB API) and "3B: 8 games" (synthetic, coincidentally the right number). This matters for agents doing position-value analysis — they cannot know whether to trust the number.

## Proposed Solutions

Add `posGamesSource: "real" | "synthetic"` to `RosterHubRowSchema` in `shared/api/teams.ts`:

```typescript
posGamesSource: z.enum(["real", "synthetic"]).optional(),
```

Emit it from `buildGamesByPos` in `teamService.ts`:
```typescript
// The function currently returns Record<string, number>
// Return an object instead, or add it alongside gamesByPos in the mapper
gamesByPos: ...,
posGamesSource: isPosGamesRecord(r.player.posGames) && Object.keys(r.player.posGames as object).length > 0 ? "real" : "synthetic",
```

Agents can then caveat their analysis: "Based on real MLB fielding data: Correa has 8 games at 2B this season."

## Technical Details

- **Files:** `shared/api/teams.ts` (schema), `server/src/features/teams/services/teamService.ts` (emit)
- **Effort:** Small

## Acceptance Criteria

- [ ] `posGamesSource` field added to `RosterHubRowSchema` in `shared/api/teams.ts`
- [ ] `teamService.ts` emits `"real"` when `posGames` is cron-populated, `"synthetic"` for fallback
- [ ] MCP tool description (todo #282) references `posGamesSource` for agents

## Work Log

### 2026-06-05 — Flagged by agent-native-reviewer (PR #378 review)
