---
status: pending
priority: p3
issue_id: "183"
tags: [v3-hub, deferred, ux, batching, mutations]
dependencies: []
---

# Pending-changes save/revert flow — finalize per-row PATCH semantics

## Problem Statement

`<PendingChangeBar>` is wired into the v3 hub and `usePendingChanges` (with persistence,
`kindBreakdown`, atomic save scaffolding) is in place. The save reducer is comprehensive —
swap, FA add, drop, IL stash, IL activate are all `PendingChange` kinds — but the **per-row
PATCH semantics on Save are not finalized**:

1. **Order of operations across kinds.** A batch may contain a FA add + a swap on the
   added player — those must execute in order.
2. **Atomicity story.** Direction-lock #4 captured in `Team.tsx:563-567` says "if any
   single mutation fails, fail the whole batch and keep the queue in place; we don't
   rollback successful mutations". That's documented; the question is whether it's
   the right user model — ​partial-success leaves the user with a hybrid UI state where
   PendingChangeBar still shows "3 changes" but 2 already landed.
3. **Revert semantics.** What does "Revert" do? Today it clears the queue. If 2 PATCHes
   landed and 1 failed, "Revert" doesn't undo the 2 successes — it just discards the
   pending state.
4. **Race vs. cron / commissioner mutations.** Overlaps with todo #181 (rosterVersion
   etag) — without a counter, "Save" can clobber concurrent edits.
5. **PendingChangeBatchError surface.** `Team.tsx:1742` references this but the
   recovery UX (which row failed? retry just that row?) is not designed.

Spun out of #128 to land the design before more PendingChange kinds get added.

## Findings

- `client/src/features/teams/hooks/usePendingChanges.ts` — reducer + persistence
- `client/src/features/teams/components/RosterHub/PendingChangeBar.tsx` — the bar UI
- `client/src/features/teams/components/RosterHub/SaveDiffPreviewModal.tsx` — diff preview before save
- `client/src/features/teams/pages/Team.tsx:560-575` — saveFn comment captures direction-lock #4
- `client/src/features/teams/pages/Team.tsx:1742` — `// if the save attempt surfaced a PendingChangeBatchError`
- `client/src/features/teams/hooks/__tests__/usePendingChanges.atomic.integration.test.tsx` — atomic save tests already exist; this is where new design lands
- Memory: `roster_hub_v3_shipped.md` "What's deferred"

## Proposed Solutions

### Option 1: Server-side transactional batch endpoint (recommended for atomicity)

**Approach:**
1. New `POST /api/teams/:teamId/roster/batch` accepts a `PendingChange[]` payload, runs
   all mutations inside a single Prisma transaction, returns the new `rosterVersion`
   (paired with #181) plus `Roster` snapshot.
2. Client `saveFn` calls the batch endpoint instead of N parallel PATCHes.
3. Failure semantics: server-side rollback is automatic; client `usePendingChanges`
   keeps the queue + surfaces the error row in the diff modal.
4. Revert means "drop pending changes" — never "undo committed changes" — which is a
   coherent contract because nothing committed unless the whole batch did.

**Pros:**
- Real atomicity; no half-applied state
- Single network call → faster on flaky mobile
- Pairs naturally with #181 (rosterVersion etag — server returns new version)
- Eliminates the partial-success UX problem

**Cons:**
- Server-side composition of FA add + swap + IL stash needs careful ordering
  (eligibility re-check at each step, FA-availability check at the moment of execution)
- Bigger surface to test
- Not strictly required for v1.0 — current per-row flow works for the common case

### Option 2: Keep per-row PATCH; document partial-success contract

**Approach:**
1. Accept that partial-success exists; surface it in the UI:
   - PendingChangeBar shows green checks on rows that committed
   - Failed rows highlight red, show "Retry" button
   - "Revert" only clears the still-pending rows
2. Direction-lock #4's "fail the whole batch" framing is tightened to "stop on first
   failure; show what landed and what didn't".

**Pros:**
- No new endpoint; ships faster
- Each PATCH is independently retryable

**Cons:**
- Partial-success state is real and visible to users
- More UI surface for failure modes

## Recommended Action

Option 1, scoped after #181 (rosterVersion etag) lands so the batch endpoint can return
the new version atomically. If #181 is delayed, ship Option 2 with explicit
partial-success UI; revisit when #181 is unblocked.

## Technical Details

- New: `POST /api/teams/:teamId/roster/batch` (server)
- New: `shared/api/rosterMoves.ts` — batch payload schema (re-uses existing PendingChange shapes)
- Update: `client/src/features/teams/pages/Team.tsx:568-575` saveFn rewrite
- Update: `client/src/features/teams/hooks/usePendingChanges.ts` — atomic-success path simpler
- Tests: extend `usePendingChanges.atomic.integration.test.tsx`

## Acceptance Criteria

- [ ] Direction-lock #4 either (A) replaced by atomic-batch contract or (B) tightened to a partial-success UX with retry
- [ ] Save flow handles a 5-change batch (mix of swap + FA add + IL stash) end-to-end
- [ ] Failure mid-batch leaves a coherent UI state (no orphan checks, no double-counting)
- [ ] Revert button has documented behavior matching the chosen option
- [ ] Browser smoke: queue 3 changes, kill the network, attempt save — recovery is clear
- [ ] Tests in `usePendingChanges.atomic.integration.test.tsx` cover the new contract

## Resources

- **Source:** Spun out of todo #128 (deferred v3-hub follow-ups)
- **Memory:** `roster_hub_v3_shipped.md` "What's deferred"
- **Depends on:** #181 (rosterVersion etag) — strongly preferred to land first
- **Pairs with:** #182 (drag-to-mutate) — drag is a queue producer; this todo is the queue consumer

## Work Log

### 2026-05-07 — Spun out of #128
- **By:** consolidation pass (todo #128 → 4 dedicated tracking todos)
