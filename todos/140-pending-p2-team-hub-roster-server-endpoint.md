---
status: pending
priority: p2
issue_id: "140"
tags: [code-review, architecture, teams, shared-api]
dependencies: []
---

# Collapse Team.tsx's two-request join with a server-side `GET /api/teams/:id/hub-roster`

## Problem Statement

`client/src/features/teams/pages/Team.tsx:200-258` calls `getTeamDetails` AND `getPlayerSeasonStats` in parallel, then joins them client-side by Prisma `Player.id`. The join uses `(stat as any).assignedPosition`, `(stat as any).mlb_team` (cast cluster captured separately in #131). The server already has all the data; the join is duplicated work split across the wire.

This split-brain is exactly the seedbed for the `_dbPlayerId` enrichment leak (#116) and the `_dbId` reintroduction (#142). One server endpoint that returns the exact `RosterHubPlayer` shape eliminates the join-on-the-client problem permanently.

## Findings

- `client/src/features/teams/pages/Team.tsx:200-258` — 2-request join
- `client/src/features/teams/lib/toHubPlayer.ts` — currently a client-side mapper; would become a server-side mapper
- `client/src/api/types.ts:68-111` (`TeamDetailResponse`) hand-written — would be replaced by inferred type from `shared/api/teamHub.ts`

## Proposed Solutions

### Option 1: New `GET /api/teams/:id/hub-roster` endpoint + `shared/api/teamHub.ts` (recommended)

Server returns the exact `RosterHubPlayer[]` shape (or grouped: hitters/pitchers/il). Define `shared/api/teamHub.ts` with `RosterHubPlayerSchema` + `HubRosterResponseSchema`. `toHubPlayer` becomes a server-side function. Team.tsx makes one call, eliminating the join + cast cluster.

**Pros:**
- Eliminates cast cluster (#131)
- Pre-empts `_dbPlayerId` propagation
- Sets the precedent for collapsing TeamDetailResponse joins everywhere

**Cons:**
- Touches the page's data lifecycle; needs care around loading/error states
- Two consumers (Team.tsx, eventually TeamLegacy if it lives) need migration

**Effort:** Medium (~half day to ~1 day). **Risk:** Low-medium — well-tested mapper just shipped.

### Option 2: Defer; just fix #131 casts client-side

Cheaper now, but the architectural smell remains.

**Effort:** Small. **Risk:** Low.

## Recommended Action

Option 1. Pairs naturally with #142 (deprecate `_dbId`/`_dbPlayerId` enrichment) and #131 (cast cleanup falls out for free).

## Technical Details

- New: `shared/api/teamHub.ts`
- New: `server/src/features/teams/services/buildHubRoster.ts` (move toHubPlayer here)
- New: route at `server/src/features/teams/routes.ts`
- Update: `client/src/features/teams/pages/Team.tsx` — single fetch
- Delete: `client/src/features/teams/lib/toHubPlayer.ts` (move to server)
- Update: `client/src/features/teams/lib/__tests__/toHubPlayer.test.ts` → server-side equivalent

## Acceptance Criteria

- [ ] Server endpoint returns `RosterHubPlayer[]` (typed via `z.infer`)
- [ ] Team.tsx makes one network call instead of two
- [ ] All cast clusters in Team.tsx (#131) eliminated as a byproduct
- [ ] Browser smoke `/teams/<code>` — identical render

## Resources

- Architecture review under /ce:review 2026-04-30
- Todo #131 (cast cluster), #142 (enrichment deprecation), #116 (panel data shape)

## Work Log

### 2026-04-30 — Initial Discovery
- architecture-strategist flagged during /ce:review re-run.
