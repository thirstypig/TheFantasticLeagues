---
status: pending
priority: p2
issue_id: "155"
tags: [code-review, standings, correctness, fantasy-rules]
dependencies: []
---

# Standings: IL-slotted players' stats still count toward team totals

## Problem Statement

In OGBA-style fantasy baseball, the IL slot is a "stash" mechanism — a real-world-injured player keeps their roster spot without consuming an active position, and their stats while IL-slotted should NOT count toward the team's category totals. That's the whole point of having an IL slot distinct from a bench/active slot.

The current standings engine ignores `assignedPosition === "IL"` when summing per-day stats. The IL slot is treated like any other slot: the player's daily stats are accumulated into team totals for the entire ownership window.

In practice this is usually benign because injured players have zero MLB-level stats while injured. But the moment an IL'd player returns to the field while still in the fantasy IL slot — which is exactly the supported use case — those stats incorrectly credit the team. The fantasy manager gets free stats from a slot that's supposed to be frozen.

## Findings

**Daily-stats path (precise):**
`server/src/features/standings/services/standingsService.ts:459-491` (`computeWithDailyStats`):

```ts
for (const roster of rosters) {
  // ...
  const pos = (roster.assignedPosition ?? roster.player.posPrimary ?? "").toUpperCase();
  const assignedAsP = PITCHER_CODES.some(code => code === pos);
  // pos is read ONLY to decide pitcher-vs-hitter for two-way players.
  // No `if (pos === "IL") continue;` filter.
  // ...
  for (const [dateMs, ds] of playerDailyStats) {
    // ...accumulate into team totals
  }
}
```

**Cumulative path (fallback):**
`server/src/features/standings/services/standingsService.ts:556-582` (`computeWithPeriodStats`) has the same gap — `assignedPosition` is read for two-way classification only.

**Roster query** at line 388-405 doesn't filter by slot either; it returns IL-slotted rows alongside active ones.

## Proposed Solutions

### Option 1: Skip IL-slotted ownership windows (recommended)
Add a single guard at the top of each per-roster loop in both code paths:
```ts
if ((roster.assignedPosition ?? "").toUpperCase() === "IL") continue;
```
This treats the IL window as zero-credit. Player's stats while in the IL slot don't accumulate to the team. If the player is later activated (slot flips from IL → active), the daily attribution from the activation date forward continues to credit the team correctly because the per-day window math still uses `acquiredAt`/`releasedAt`, not slot.

**Caveat:** `assignedPosition` is current-state, not historical. If a player was IL'd mid-period and later activated, this approach attributes stats based on *current* slot only — not the slot they had on each historical day. To attribute correctly mid-period, we'd need to derive IL stints from `TransactionEvent` rows (the schema already has `@@index([leagueId, transactionType, effDate])` for stint derivation per the 2026-04-21 roster-rules-plan).

**Effort:** Small (1-line filter + tests). **Risk:** Low — every team with a healthy IL'd player gets a small stat decrease. **Scope:** Behavior changes for live standings; document in changelog.

### Option 2: Full stint derivation from TransactionEvent
Build a per-day, per-player slot-history map by replaying IL_STASH / IL_ACTIVATE events ordered by `effDate`. Sum stats only on days the player was NOT in the IL slot. Captures the historical correctness Option 1 misses.

**Effort:** Medium (~4h with tests). **Risk:** Medium — replays are subtle when events are backdated (like the 4/18 entry submitted 4/28). Need defined precedence rules. **Scope:** Bigger PR; touches `transactions/services/ilFeeService.ts`-adjacent stint logic.

### Option 3: Defer and document as known-issue
Currently most IL-stashed players are genuinely injured and producing zero stats. Add a `/* TODO(#155) */` comment at the loops and ship nothing else.

**Effort:** Trivial. **Risk:** Continued silent miscredit when IL'd players return mid-rehab.

## Recommended Action

Start with **Option 1** for the standings live-correctness fix; track Option 2 as a follow-up if backdated stint accuracy is needed for retroactive standings audits.

## Technical Details

**Affected files:**
- `server/src/features/standings/services/standingsService.ts` (both compute paths)
- `server/src/features/standings/__tests__/standingsService.test.ts` (new IL-exclusion test cases)
- Cache invalidation: existing `clearStandingsCache(leagueId)` in transaction routes already covers IL_STASH/IL_ACTIVATE because both go through the transaction routes.

**Data implications:**
- Live `standingsCache` (in-memory, 2-min TTL) — bust on deploy.
- `TeamStatsPeriod` snapshots — recomputed lazily on next read of period-category-standings, so they self-heal once the code change is deployed. May want a one-shot script to delete snapshots for any active period to force immediate refresh.

## Acceptance Criteria

- [ ] Player assigned to IL slot is excluded from team R/HR/RBI/SB/AVG/W/S/ERA/WHIP/K totals for the period
- [ ] Activating a player from IL mid-period restores their stat contribution from `assignedPosition` flip date forward (Option 1 caveat: actually from "now" onward — historical days they were on IL will not retroactively count, but going forward it's right)
- [ ] Existing two-way-player pitcher/hitter classification still works
- [ ] Test: team with one healthy IL'd player on the roster has lower R/HR/etc. than the same team with that player active
- [ ] Test: ERA/WHIP not divided by zero when all pitchers are IL'd

## Work Log

- 2026-05-05 — Surfaced during a stat-correctness audit after the Doyers test-churn reversal. Verified: `computeWithDailyStats` at `standingsService.ts:459-491` and `computeWithPeriodStats` at `standingsService.ts:556-582` both lack IL exclusion. `assignedPosition` is read only for two-way pitcher classification.

## Resources

- `server/src/features/standings/services/standingsService.ts:423` (computeWithDailyStats)
- `server/src/features/standings/services/standingsService.ts:508` (computeWithPeriodStats)
- Roster-rules-plan stint indexes (`prisma/schema.prisma`, TransactionEvent model)
