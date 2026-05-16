---
status: pending
priority: p1
issue_id: "195"
tags: [code-review, standings, correctness, attribution]
dependencies: []
---

# `countedPlayers.add` fires before attribution guard — can silently zero out active player

## Problem Statement

In `computeWithPeriodStats`, the `countedPlayers` dedup Set is populated **before** the `activePlayerTeam` guard runs. If Prisma returns the released roster entry before the active one in `teamRosters`, the released entry claims the "counted" slot, the `activePlayerTeam` check skips it (`currentTeam !== t.id` → released entry's team ≠ current team, actually wait... both entries are in `teamRosters` only if `teamId === t.id`). Let me be precise:

For a player released-and-re-acquired by the SAME team: two entries exist in `teamRosters`. If the released entry comes first:
1. `countedPlayers.has` → false → add to set
2. `wasOnIlAtPeriodStart` → likely false → continue
3. `activePlayerTeam.get(playerId)` → returns `t.id` (the re-acquired entry has `releasedAt=null`)
4. `currentTeam === t.id` → **passes attribution guard** → stats counted on the released entry's `assignedPosition`

This is actually the wrong `assignedPosition` — the slot used for two-way player logic is from the RELEASED entry, not the ACTIVE one.

For a free-agent scenario (player released from team T, no re-acquire): if the released entry comes first, `countedPlayers.add` marks it, `currentTeam` is undefined → skip. Active entry never arrives (there is none). Correct result but for the wrong reason.

The real bug: `countedPlayers.add` executes before `currentTeam !== t.id` check, so for a **re-acquired player**, the wrong position (from the released entry) controls the two-way pitcher stat split. This is silent wrong output, not a crash.

## Findings

- **File:** `server/src/features/standings/services/standingsService.ts` lines 581–594
- The test file (`standingsService.releaseAt.test.ts`) does not cover "released and re-acquired by same team" — that case is the only path where this ordering matters
- The `countedPlayers` comment on line 576 explicitly calls out "traded away and back" as the motivating case — but the guard is placed in the wrong position to handle it correctly

## Proposed Solutions

### Option A — Move `countedPlayers.add` after all guards (Recommended)
```typescript
for (const roster of teamRosters) {
  if (countedPlayers.has(roster.playerId)) continue;

  if (wasOnIlAtPeriodStart(roster.playerId, period.startDate, ilWindowsByPlayer)) continue;

  const currentTeam = activePlayerTeam.get(roster.playerId);
  if (currentTeam !== t.id) continue;

  countedPlayers.add(roster.playerId);  // only claim slot when actually crediting stats

  const stats = statsMap.get(roster.playerId);
  if (!stats) continue;
  // ... rest of accumulation
}
```
- **Pros:** Correct ordering; active entry wins over released entry; no behavior change for the common cases
- **Cons:** None — the Set's purpose (deduplicate per team) is still achieved
- **Effort:** Small
- **Risk:** Low — tests still pass; fixes the "wrong position for two-way" silent bug

### Option B — Build `activeRosterEntry` map explicitly
Pre-build a `Map<playerId, rosterEntry>` keyed to the active (`releasedAt=null`) entry per player, then use that in the team loop instead of iterating `teamRosters` at all.
- **Pros:** Eliminates the need for `countedPlayers` entirely; always uses the correct entry
- **Cons:** More refactor; `teamRosters` loop still needed to discover which players to credit
- **Effort:** Medium

### Option C — Add explicit Prisma `orderBy` on the roster query
Add `orderBy: { releasedAt: { sort: 'desc', nulls: 'first' } }` so active entries always come first in `rostersByTeam`. Combined with Option A this is belt-and-suspenders.
- **Pros:** Defensive; removes ordering dependency
- **Cons:** Small DB overhead; doesn't fix the underlying guard ordering issue alone
- **Effort:** Small

## Recommended Action

Option A — move `countedPlayers.add` after all guards. Add a test case for "released and re-acquired by same team" to `standingsService.releaseAt.test.ts`.

## Acceptance Criteria
- [ ] `countedPlayers.add(roster.playerId)` appears AFTER `wasOnIlAtPeriodStart` and `currentTeam !== t.id` checks
- [ ] New test: player released + re-acquired by same team mid-period — verify stats credited once with active entry's position
- [ ] All existing `standingsService.releaseAt.test.ts` tests still pass

## Work Log
- 2026-05-15: Identified by code review agents (TS reviewer + Architecture reviewer). Not caught by existing tests because mock returns active entry first.
