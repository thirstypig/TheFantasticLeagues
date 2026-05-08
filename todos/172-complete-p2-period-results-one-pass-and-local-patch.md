---
status: complete
priority: p2
issue_id: "172"
tags: [code-review, wire-list, performance]
dependencies: []
---

# Wire List: getPeriodResults filters O(teams×entries); client full-reloads after every click

## Problem Statement

Two compounding inefficiencies on the commissioner page:

1. **Server.** `getPeriodResults` builds the per-team grouping with three nested `filter()` passes — O(teams × (adds + drops)). Fine at 12×80 today, but the structure should be a one-pass `Map<teamId, ...>`.
2. **Client.** The commissioner page calls `reload()` after every succeed/fail/skip click, refetching teams + listPeriods + getPeriodResults. With ~12 teams × ~5 adds × 3 possible clicks per row, a single processing session fires ~36 full reloads and feels sluggish.

## Findings

**Server:** `server/src/features/wire-list/processor.ts:643-648` — three `filter()` calls per team to build `byTeam`.

**Client:** `client/src/features/wire-list/pages/WireListCommissionerPage.tsx:121-140` — `reload()` is called after every outcome mutation. The mutation already returns the updated entry, so a local patch would suffice for succeed/fail/skip.

`/revert` is the one case where a full reload is warranted (a revert can flip another row's drop status).

## Proposed Solutions

### Option 1: Server one-pass groupBy + client local patch (recommended)
- **Server:** single `Map<number, { adds: AddEntry[], drops: DropEntry[] }>` populated in one pass over the merged entries.
- **Client:** mutation returns the patched entry; commissioner page splices it into local `byTeam` state without re-fetching. Only `/revert` triggers the full reload.

**Effort:** Small (~2h). **Risk:** Low.

### Option 2: Server-only fix
Cheaper but doesn't address the perceived UI sluggishness (full reload latency dominates).

**Effort:** Trivial. **Risk:** None.

### Option 3: Client-only fix
Server stays O(teams×entries); fine at current scale.

**Effort:** Small. **Risk:** None.

## Recommended Action

**Option 1.** Both sides are cheap; perceived latency on the commissioner page is the user-visible win.

## Technical Details

- Server file: `server/src/features/wire-list/processor.ts:643-648`
- Client file: `client/src/features/wire-list/pages/WireListCommissionerPage.tsx:121-140`
- No schema changes
- Mutation responses already return the updated entry — verify shape includes everything the row renders

## Acceptance Criteria

- [ ] `getPeriodResults` groups entries in a single pass (no nested `filter`)
- [ ] Succeed/fail/skip click patches local state without re-fetch
- [ ] Revert still triggers full reload
- [ ] Browser-verified: clicking outcomes feels instant; no flicker

## Work Log

_(empty — created during /ce:review on 2026-05-07)_

## Resources

- Server: `server/src/features/wire-list/processor.ts:643-648`
- Client: `client/src/features/wire-list/pages/WireListCommissionerPage.tsx:121-140`
