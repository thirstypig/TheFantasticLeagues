---
title: "feat: Enforce per-position limits on auction nominate and bid"
type: feat
status: active
date: 2026-03-22
---

# feat: Enforce per-position limits on auction nominate and bid

## Overview

Currently, the auction only enforces **total pitcher/hitter counts** (9P / 14H) on bids, and does **nothing** on nominations. Per-position limits (C:2, SS:1, MI:1, OF:5, etc.) exist in the config but are informational only.

The league rule is: **if a team has all eligible slots filled for a position, they cannot nominate OR bid on players at that position.** For example, if a team has both SS and MI filled, they cannot nominate or bid on SS players.

## Position Mapping

A player's position maps to one or more eligible slots via `positionToSlots()`:

| Player Position | Eligible Slots | Blocked when... |
|----------------|---------------|-----------------|
| C | C | C slots full (2) |
| 1B | 1B, CI | Both 1B (1) AND CI (1) full |
| 2B | 2B, MI | Both 2B (1) AND MI (1) full |
| 3B | 3B, CI | Both 3B (1) AND CI (1) full |
| SS | SS, MI | Both SS (1) AND MI (1) full |
| LF/CF/RF | OF | OF slots full (5) |
| DH | DH | DH slot full (1) |
| P | P | P slots full (9) |

**Key rule:** A player is blocked only when **ALL** their eligible slots are full. A SS can still be nominated/bid on if MI has an opening, even if SS is full.

## Default Limits

From `server/src/lib/sportConfig.ts:54-62`:
```
C:2, 1B:1, 2B:1, 3B:1, SS:1, MI:1, CI:1, OF:5, DH:1 (14 hitters)
P:9 (9 pitchers)
```

## Proposed Changes

### 1. Enhance `checkPositionLimit()` — Server

**File:** `server/src/features/auction/routes.ts` (line 265-284)

Currently only checks pitcher/hitter totals. Add per-position slot checking:

```typescript
function checkPositionLimit(
  teamId: number,
  isPitcher: boolean,
  state: AuctionState,
  positions?: string,  // NEW: player's position string (e.g., "SS/3B")
): string | null {
  const teamObj = state.teams.find(t => t.id === teamId);
  if (!teamObj) return null;

  // Existing: check pitcher/hitter totals
  if (isPitcher && teamObj.pitcherCount >= state.config.pitcherCount) {
    return `Team already has ${state.config.pitcherCount} pitchers (max)`;
  }
  if (!isPitcher && teamObj.hitterCount >= state.config.batterCount) {
    return `Team already has ${state.config.batterCount} hitters (max)`;
  }

  // NEW: check per-position limits
  const limits = state.config.positionLimits;
  if (limits && positions && !isPitcher) {
    const primaryPos = positions.split('/')[0]?.toUpperCase() || '';
    const eligibleSlots = positionToSlots(primaryPos);

    // Player is blocked if ALL eligible slots are full
    const allFull = eligibleSlots.every(slot => {
      const limit = limits[slot];
      const current = teamObj.positionCounts[slot] || 0;
      return limit !== undefined && current >= limit;
    });

    if (allFull) {
      return `All eligible slots (${eligibleSlots.join(', ')}) are full for ${primaryPos}`;
    }
  }

  return null;
}
```

### 2. Add position check to `/nominate` — Server

**File:** `server/src/features/auction/routes.ts` (line 647)

Currently says "position limits are NOT checked on nomination." Change to enforce:

```typescript
// Check position limits for the nominating team
const nomPosError = checkPositionLimit(
  nominatorTeamId, isPitcher, state, positions
);
if (nomPosError) return res.status(400).json({ error: nomPosError });
```

### 3. Pass `positions` to `checkPositionLimit` on `/bid` — Server

**File:** `server/src/features/auction/routes.ts` (line 736)

Currently passes only `isPitcher`. Add the nomination's position info:

```typescript
const posError = checkPositionLimit(
  bidderTeamId, state.nomination.isPitcher, state, state.nomination.positions
);
```

### 4. Also check on proxy bid resolution — Server

**File:** `server/src/features/auction/routes.ts` — `processProxyBids()` function

Add position check before auto-bidding for a proxied team.

### 5. Client-side: disable bid button when position full

**File:** `client/src/features/auction/components/AuctionStage.tsx`

Currently bid buttons are disabled only for budget. Add position check using the team's `positionCounts` from auction state:

```typescript
const isPositionFull = useMemo(() => {
  if (!myTeam || !nomination || !auctionConfig?.positionLimits) return false;
  if (nomination.isPitcher) return myTeam.pitcherCount >= (auctionConfig.pitcherCount || 9);
  const primaryPos = (nomination.positions || '').split('/')[0]?.toUpperCase();
  const slots = positionToSlots(primaryPos);
  return slots.every(slot => {
    const limit = auctionConfig.positionLimits?.[slot];
    return limit !== undefined && (myTeam.positionCounts[slot] || 0) >= limit;
  });
}, [myTeam, nomination, auctionConfig]);
```

Disable bid buttons and show message: "Position full — all eligible slots filled"

### 6. Client-side: nominate button already partially implemented

**File:** `client/src/features/auction/components/PlayerPoolTab.tsx` (line 164-196)

The `isPositionFullForMyTeam()` function already checks per-position limits and grays out the button. But it's visual-only — the button is still clickable. Make it truly disabled (`disabled={true}`) and ensure the server also rejects.

---

## Acceptance Criteria

- [ ] Server: `/nominate` rejects when nominating team has all eligible position slots full
- [ ] Server: `/bid` rejects when bidding team has all eligible position slots full
- [ ] Server: proxy bid resolution skips teams with full position slots
- [ ] Client: bid buttons disabled with message when position slots full for current nomination
- [ ] Client: nominate button truly disabled (not just grayed) when position slots full
- [ ] Multi-position players (SS/3B) are only blocked when ALL eligible slots are full
- [ ] Pitcher limit (9) still enforced as before
- [ ] Hitter total limit (14) still enforced as before
- [ ] All existing auction tests pass
- [ ] New tests for per-position limit on nominate and bid

## Files to Modify

| File | Changes |
|------|---------|
| `server/src/features/auction/routes.ts` | Enhance `checkPositionLimit()`, add check to `/nominate`, pass positions to `/bid` check, update proxy bid resolution |
| `client/src/features/auction/components/AuctionStage.tsx` | Disable bid buttons when position full |
| `client/src/features/auction/components/PlayerPoolTab.tsx` | Make nominate button truly disabled |
| `server/src/features/auction/__tests__/routes.test.ts` | Add per-position limit tests |

## Edge Cases

- **Multi-position player (SS/3B):** SS slot full but CI has opening → player CAN be nominated/bid on (3B maps to CI)
- **Ohtani (DH + P):** Treated as two separate roster entries. DH Ohtani blocked by DH slot, P Ohtani blocked by pitcher count
- **No position limits configured:** If `positionLimits` is null, fall back to pitcher/hitter totals only (current behavior)
- **Bench players:** Players with `assignedPosition: "BN"` don't count against position limits
