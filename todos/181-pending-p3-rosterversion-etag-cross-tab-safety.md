---
status: pending
priority: p3
issue_id: "181"
tags: [v3-hub, deferred, schema, concurrency, api]
dependencies: []
---

# `rosterVersion` etag for cross-tab safety on roster PATCH

## Problem Statement

The v3 roster hub queues per-row swap mutations (slot changes, FA adds, IL stash/activate)
in `usePendingChanges` and flushes them as a batch via PATCH calls. Today there is **no
optimistic-concurrency guard**: if the same owner has the team open in two tabs (or
commissioner + owner are both editing), the second-flusher wins blindly and silently
clobbers the first-flusher's changes.

There is no inline TODO comment for this one — it lives only in the memory entry
`roster_hub_v3_shipped.md` "What's deferred" section. Spun out of #128 to give it a
discoverable home and pin down the schema decision.

## Findings

- No inline TODO yet — first cite once a design lands. Likely call sites:
  - `client/src/features/teams/pages/Team.tsx` (saveFn `~line 568`)
  - `client/src/features/teams/api.ts` (`updateRosterPosition`)
  - `server/src/features/teams/routes.ts` (PATCH roster endpoint)
- Memory: `roster_hub_v3_shipped.md` flags `rosterVersion` etag as deferred
- Related: `feedback_partial_browser_verification.md` — multi-tab regression class

## Proposed Solutions

### Option 1: Team-level monotonic counter (recommended)

**Approach:**
1. Add `Team.rosterVersion Int @default(0)`.
2. Every roster-mutating endpoint (PATCH roster slot, claim, drop, IL stash, IL activate,
   trade processing, waiver finalize) increments the team's counter inside the same
   transaction.
3. Client reads `rosterVersion` from `getTeamRosterHub` response, sends it on every PATCH:
   `If-Match: <rosterVersion>`. Server returns `409 Conflict` when stale; client
   re-fetches and replays the diff modal so the owner can confirm against the new state.
4. Existing `SaveDiffPreviewModal` already shows DiffRows — reuse it for the conflict
   path.

**Pros:**
- Single field, single source of truth
- Survives cross-tab + cross-actor (owner + commissioner) races
- Re-uses the existing diff modal as the conflict-resolution surface
- Cheap to read (one column on a tiny table)

**Cons:**
- Every roster-mutation path needs to increment the counter (audit risk if missed)
- Schema migration; needs rollback runbook per project convention
- Need to define what counts as a "roster mutation" — does daily sync count? (No: only
  user-initiated mutations to `Roster` rows.)

### Option 2: Use existing `Roster.updatedAt`

**Approach:** Compare client's stored timestamp against server's max(updatedAt) for the
team's rows.

**Pros:** No schema change.

**Cons:**
- Postgres timestamp resolution + clock skew make ties possible
- Must scan all team's roster rows to compute max; less crisp than a single counter

### Option 3: Computed hash of Roster row IDs + slots

**Approach:** Compute a hash over the team's current roster snapshot.

**Cons:** Hash collisions, expensive to recompute, opaque to debug. Don't.

## Recommended Action

Option 1 — explicit monotonic counter is the cleanest pattern; #181 finalizes the field
name and the increment audit.

## Technical Details

- `prisma/schema.prisma` — `Team.rosterVersion Int @default(0)`
- Server: extend every roster-mutating service to increment in transaction
- `shared/api/teams.ts` — add `rosterVersion: number` to `RosterHubResponseSchema`
- Client: add `If-Match` header in `updateRosterPosition` + claim/drop/IL endpoints; surface 409 via the existing diff modal

## Acceptance Criteria

- [ ] `Team.rosterVersion` lands with backfill (set to 0 for all teams) + rollback runbook
- [ ] Every roster-mutating server path increments the counter atomically
- [ ] Client sends `If-Match` and replays diff modal on 409
- [ ] Browser smoke: open a team in two tabs, mutate in tab A, attempt mutate in tab B → diff modal triggers
- [ ] Add a unit test for the conflict path in `usePendingChanges.atomic.integration.test.tsx`

## Resources

- **Source:** Spun out of todo #128 (deferred v3-hub follow-ups)
- **Memory:** `roster_hub_v3_shipped.md` "What's deferred"

## Work Log

### 2026-05-07 — Spun out of #128
- **By:** consolidation pass (todo #128 → 4 dedicated tracking todos)
