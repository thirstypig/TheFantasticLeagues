---
status: pending
priority: p3
issue_id: "180"
tags: [v3-hub, deferred, schema, players, cron, dx]
dependencies: []
---

# Real per-position GP via `Player.posGames` JSON column + `syncPositionEligibility` cron update

## Problem Statement

The v3 roster hub renders per-position games-played (GP) suffixes in eligibility chips
(e.g. "OF 12 · 2B 3"), but the values fed to the renderer are **synthetic** — the server
fakes a 60/40 split between the player's primary position and any secondary position
rather than reading real per-position fielding totals.

Real per-position GP comes from the MLB Stats API `fieldingByPosition` payload that the
daily `syncPositionEligibility(season, 3)` cron already fetches to drive Rule 1
(≥3 GP triggers eligibility). Today the cron throws those numbers away after the
eligibility decision; the v3 hub then re-creates a fake distribution downstream.

This is the start of TODO-rot — the hub UI implies precision the data doesn't have.
Spun out of #128 (consolidation of 4 deferred v3-hub follow-ups).

## Findings

- `client/src/features/teams/lib/toHubPlayer.ts:32` — `gamesByPos?: Record<string, number>` JSDoc:
  `"Per-position GP — synthetic today, real when Player.posGames lands."`
- `client/src/features/teams/lib/toHubPlayer.ts:64` — JSDoc on `playerId`:
  `"per-player API calls (eligible-slots, posGames) key off this"`
- `shared/api/rosterMoves.ts:95` — comment in `EligibleSlotsResponseSchema` JSDoc:
  `"the GP suffixes come from a sibling endpoint (Player.posGames) shipped in a later PR."`
- Memory: `roster_hub_v3_shipped.md` — "What's deferred" section flags this as deferred follow-up

## Proposed Solutions

### Option 1: Add `Player.posGames` JSON column + persist from cron (recommended)

**Approach:**
1. Schema migration — add `posGames Json?` to `Player` (Prisma) plus `IF NOT EXISTS` index for queries that filter on position.
2. `syncPositionEligibility` (server) — instead of discarding the `fieldingByPosition`
   buckets after the eligibility decision, persist the bucket to `Player.posGames` keyed by
   slot code (e.g. `{ "OF": 12, "2B": 3 }`). Preserve the existing daily-sync invariant
   (don't clobber if MLB returns empty for a player).
3. New endpoint or extend `GET /api/players/:mlbId/eligible-slots` so the per-position GP
   accompanies the eligibility list (already foreshadowed by `EligibleSlotsResponseSchema`'s
   JSDoc).
4. Server-side `TeamService.buildGamesByPos` (consumer of the synthetic 60/40) reads from
   `Player.posGames` instead. The wire shape is already `Record<string, number>` so client
   code in `toHubPlayer` doesn't change.
5. Update the JSDoc in `toHubPlayer.ts:32` and `shared/api/rosterMoves.ts:95` to drop the
   "synthetic today" caveat.

**Pros:**
- Replaces a literal lie ("OF 12") with the real number
- Re-uses the existing daily MLB fetch — no new API calls
- Matches what the eligibility cron already computes
- Wire format is already in place

**Cons:**
- Schema migration on `Player` (~3k rows in OGBA, low risk)
- Need to backfill existing rows — 1-shot script that calls the same fielding endpoint
- Need rollback runbook per project convention

**Effort:** Medium (~half day). **Risk:** Low — Player table is read-heavy, write-light;
JSON column is additive; no consumers are blocked on this landing.

### Option 2: Drop the GP suffixes from the hub entirely

Cheaper now, but the hub already ships the visual affordance and users notice when chips
look like decoration vs. data.

**Effort:** Small. **Risk:** Low; UX regression.

## Recommended Action

Option 1 — the eligibility cron already does the work, just plumb the bucket through.

## Technical Details

- `prisma/schema.prisma` — `Player.posGames Json?`
- `server/src/features/players/services/syncPositionEligibility.ts` — extend to persist
- `server/src/features/teams/services/teamService.ts` — `buildGamesByPos` reads `posGames`
- `shared/api/rosterMoves.ts` — extend `EligibleSlotsResponseSchema` with `gamesByPos` field (optional, additive)
- Client mapper `toHubPlayer.ts:32` — drop the "synthetic today" caveat from the JSDoc

## Acceptance Criteria

- [ ] `Player.posGames` column lands with backfill script + rollback runbook
- [ ] `syncPositionEligibility` persists the per-position GP bucket
- [ ] `TeamService.buildGamesByPos` returns the persisted values, not the synthetic split
- [ ] Browser smoke `/teams/:code` — GP suffixes match MLB.com fielding totals for a sample player
- [ ] JSDoc in `toHubPlayer.ts:32` + `shared/api/rosterMoves.ts:95` no longer say "synthetic today" / "in a later PR"

## Resources

- **Source:** Spun out of todo #128 (deferred v3-hub follow-ups)
- **Memory:** `roster_hub_v3_shipped.md` "What's deferred"
- **Related:** Position eligibility layers (Rules 1/2/3 — see memory entry of the same name)

## Work Log

### 2026-05-07 — Spun out of #128
- **By:** consolidation pass (todo #128 → 4 dedicated tracking todos)
