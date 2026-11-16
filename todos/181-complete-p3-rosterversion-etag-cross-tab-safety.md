---
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

### 2026-08-31 — IMPLEMENTED but NOT VERIFIED; scope narrowed to what is left

Audited against the code. **Option 1 shipped in full** — this todo's "Proposed Solutions" and
"Technical Details" are done and should not be re-designed:

| Piece | Where |
|---|---|
| `Team.rosterVersion Int @default(0)` | `prisma/schema.prisma:447` |
| `parseIfMatch` / `bumpRosterVersionIfCurrent` / `incrementRosterVersion(s)` / `StaleRosterError` | `server/src/lib/rosterVersion.ts` (originally `teams/lib/rosterVersionGuard.ts`, moved in the fix round) |
| 409 on stale PATCH (compare-and-set inside the tx) | `server/src/features/teams/routes.ts`, the `PATCH /:teamId/roster/:rosterId` handler |
| Counter bumped in the claim / drop / IL-stash / IL-activate txs and the roster PATCH | `transactions/routes.ts`, `teams/routes.ts` (**CORRECTED 2026-11-15: this row originally claimed "every mutation tx". Trades, the wire-list processor and the commissioner edit paths did NOT bump until the fix round below.**) |
| `rosterVersion` on the hub response | `teams/services/teamService.ts:313` |
| Client sends `If-Match` | `client/src/features/teams/api.ts:70` |
| Client handles 409 | `client/src/features/teams/pages/Team.tsx:616` |

**What is genuinely still open — and it is verification, not implementation:**

1. **The conflict-path test does not exist.** The acceptance criteria name
   `usePendingChanges.atomic.integration.test.tsx`; there is no such file, and no 409/rosterVersion
   test anywhere under `client/src/features/teams/__tests__/`. The whole optimistic-concurrency
   path is currently untested.
2. **The two-tab browser smoke was never run.** Mutate in tab A, attempt in tab B, expect the diff
   modal.
3. **`If-Match` is still optional server-side.** `checkRosterVersion` returns `{ stale: false }`
   when the header is absent ("optional during rollout" — `rosterVersionGuard.ts:28`). Until it is
   required, a client that forgets the header silently gets the old clobbering behaviour. Decide
   whether to enforce it now that both callers send it.

**Do not close this as done on the strength of the implementation table above** — an untested
concurrency guard is the kind that works until the day it matters.

### 2026-11-15 — Conflict path tested, If-Match required, one real bug fixed

- **Bug found while testing:** `Team.tsx` sent the batch-start `rosterVersion` on BOTH halves of a
  swap. The first PATCH bumps the counter, so the second always 409'd (half-applied swap, then a
  "changed by another tab" reload). Now each call sends the version returned by the previous PATCH;
  a swap that follows a claim/IL change in the same batch sends `If-Match: *` (those routes bump
  the counter without returning it).
- **409 no longer silently succeeds:** `saveFn` used to `return` on 409, which `usePendingChanges`
  treats as success and drops the queued changes. It now throws, so the queue is kept and the
  error banner shows after the hub reloads.
- **If-Match is REQUIRED** on `PATCH /api/teams/:teamId/roster/:rosterId` (the only endpoint that
  calls `checkRosterVersion`): missing header returns 428, stale returns 409, `*` matches any.
  Callers audited: Team.tsx and MobileTeam.tsx send the real version; TeamLegacy, DraftReportPage,
  RosterGrid and TeamRosterManager have no hub version and send `*`. No caller in server/,
  mcp-servers/ or scripts/.
- **Tests:** server `lib/__tests__/rosterVersion.test.ts` (was `rosterVersionGuard.test.ts`), `rosterPatchVersion.test.ts`; client
  `Team.rosterConflict.test.tsx`, `rosterVersionApi.test.ts`, two cases in `MobileTeam.test.tsx`.
  Server 409/428 paths mutation-checked (break, fail, restore).
- **Still open:** the two-tab browser smoke (controller). Known gap: the version check runs before
  the transaction, so two PATCHes landing within milliseconds can both pass; a conditional
  `updateMany({ where: { id, rosterVersion } })` inside the tx would close it.

### 2026-11-15 (fix round) — every in-season roster writer now bumps; race closed

- **Counter now bumped, inside the tx, by:** trades (process + reverse, both teams per player),
  wire-list `finalizePeriod` (once per touched team), commissioner force-drop, roster-row edit,
  `assignPlayer` (receiving team + team that lost the player), `releasePlayer` (both branches,
  now in a tx), `executeTrade` (both teams), bulk IL stash. Helper moved to
  `server/src/lib/rosterVersion.ts` (no new cross-feature imports; baseline shrank by one).
- **Deliberately NOT bumped (pre-season / admin / not hub-visible):** `deleteTeam` (team row is
  deleted), CommissionerService `importRosters`, auction (`auctionImport`, lifecycle routes,
  state manager), draft, keeper-prep, leagues keeper flag (`isKeeper` only), admin league reset,
  seed. These run before the season or wipe the league; no owner is editing the hub then.
- **Race closed:** the PATCH does a compare-and-set `team.updateMany({ where: { id, rosterVersion } })`
  as the first statement in its tx; zero rows throws `StaleRosterError`, the tx rolls back, the route
  answers 409 with a fresh read. The pre-tx read is gone.
- **claim / il-stash / il-activate responses carry `rosterVersion`**, so the hub batch and the
  mobile page chain real tokens (no `+1` guess; `*` remains only as the fallback when a response omits the version). Mobile moves are serialized.

### 2026-11-15 (fix round 2)

- Mobile IL activate now sets the token from its own response (a lagging hub refetch can no
  longer move it backwards); the 409 refetch is awaited inside the queued task.
- **Lock order:** the roster PATCH locks Team then Roster. Trades (process, reverse), `executeTrade`,
  `assignPlayer`, wire-list finalize, `releasePlayer`, force-drop, row edit and bulk IL stash now bump
  the Team version BEFORE their first Roster write (multi-team paths in ascending team-id order via
  `incrementRosterVersions`), so a concurrent PATCH cannot deadlock (40P01).
- **Follow-ups, not done here:**
  1. A season guard or version bump for `importRosters` and admin reset-rosters.
  2. Tests for the `releasePlayer`, force-drop, roster-row-edit and bulk-IL bumps (only trades,
     wire-list, `assignPlayer` and `executeTrade` are covered).
  3. Send the hub version (instead of `If-Match: *`) from the classic team page and the commissioner grid.
