---
title: "Trading Block + Waiver Position Fix"
type: feat
status: active
date: 2026-04-01
---

# Trading Block + Waiver Position Fix

## Overview

Two related features:
1. **Trading Block** — public board where owners flag players they're willing to trade. Browsable by all league members. New tab on Activity page.
2. **Waiver Position Fix** — trade proposals involving waiver position must reference the actual upcoming waiver processing period, not abstract round numbers. Wire the `round` field end-to-end.

## 1. Trading Block

### Concept

Each team owner can mark roster players as "on the block" — publicly visible to the entire league. Think of it as a "For Sale" sign. Other owners browse the block to find trade partners.

**How it differs from Watchlist:**
- **Watchlist** = "Players I WANT" (private to the owner)
- **Trading Block** = "Players I'm WILLING TO GIVE UP" (public to the league)

When a player on someone's Trading Block matches a player on your Watchlist → potential trade match (future AI feature).

### Data Model

```prisma
model TradingBlock {
  id         Int      @id @default(autoincrement())
  teamId     Int
  playerId   Int
  askingFor   String?  @db.VarChar(200)  // "Looking for pitching" or "Need SB"
  createdAt  DateTime @default(now())

  team       Team     @relation(fields: [teamId], references: [id], onDelete: Cascade)
  player     Player   @relation(fields: [playerId], references: [id], onDelete: Cascade)

  @@unique([teamId, playerId])
  @@index([teamId])
}
```

**Key fields:**
- `teamId` — who's offering (scoped to team, so league-scoped implicitly)
- `playerId` — the player on the block
- `askingFor` — optional note: "Need SP", "Looking for SB+speed", "Open to offers"

### API Endpoints

```
GET    /api/trading-block?leagueId=X         → all players on the block (league-wide)
GET    /api/trading-block/my?teamId=X        → my team's block entries
POST   /api/trading-block                    → add player { teamId, playerId, askingFor? }
PATCH  /api/trading-block/:id                → update askingFor
DELETE /api/trading-block/:playerId?teamId=X → remove from block
```

**GET response shape (league-wide):**
```json
{
  "items": [
    {
      "id": 1,
      "teamId": 141,
      "teamName": "Skunk Dogs",
      "teamCode": "SKD",
      "player": {
        "id": 71,
        "name": "Hunter Goodman",
        "posPrimary": "C",
        "mlbTeam": "COL",
        "mlbId": 696100
      },
      "askingFor": "Need SP depth",
      "createdAt": "2026-04-01T12:00:00Z"
    }
  ],
  "count": 5
}
```

### Client UI

#### Activity Page — New "Trading Block" Tab
```
[ Add/Drop ] [ Trades ] [ Waivers ] [ Trading Block ] [ Watchlist ]
```

The Trading Block tab shows:
- **League-wide view** — all players on the block, grouped by team
- Each entry shows: player name, position, MLB team, headshot, owner team, "asking for" note
- **Quick action**: "Propose Trade" button → opens trade form pre-filled with that player
- **My Block section** at top — toggle players on/off, edit "asking for" notes

#### Team Page — "On The Block" Badge
Players marked as on the block show a small badge (e.g., 🔄 or "BLOCK") next to their name on:
- Team roster view (when viewing other teams)
- Player Detail Modal
- Players page

#### Adding to the Block
On your own Team page, each roster player gets a context action:
- Click player row → expanded view shows "Put on Trading Block" button
- Or: in the Trading Block tab, search/select from your roster

### Authorization
- Any league member can VIEW the full trading block
- Only the team OWNER can add/remove their own players
- `requireAuth` + `requireLeagueMember` on GET
- `requireAuth` + `requireTeamOwner` on POST/PATCH/DELETE

---

## 2. Waiver Position Fix

### Current Problem

The Trade Asset Selector shows "1st Round / 2nd Round / 3rd Round" waiver position toggles, but:
1. The `round` field is **never sent to the server** (dropped during item mapping in `handlePropose`)
2. The server's `tradeItemSchema` has no `round` field
3. The Prisma `TradeItem` model has no `round` column
4. The server's trade processing just swaps `waiverPriorityOverride` globally — no per-round concept

### What It Should Be

Waiver position in a trade should reference the **next upcoming waiver processing period**, not abstract round numbers. In this league:
- Waivers process weekly (or on-demand by commissioner)
- "Waiver position" means "I give you my priority spot for the next waiver run"

### Proposed Fix

**Option A: Simple — Remove per-round selection (recommended for now)**

The current league has a single waiver priority (not per-round). Simplify the UI back to a single toggle:
- "Include Waiver Priority Position" (yes/no)
- The server already handles this correctly with `waiverPriorityOverride` swap

This matches what the server actually does. The per-round UI was premature.

**Option B: Full per-round support (future)**

If the league later adopts multi-round waivers:
- Add `round Int?` to `TradeItem` schema
- Update `tradeItemSchema` to accept `round`
- Update `handlePropose` to include `round` in item mapping
- Update trade processing to swap priority per-round

**Recommendation:** Go with Option A now. The per-round UI confused the data flow and was identified as a P1 finding in the code review. Simplify to match server reality.

### Fix Details (Option A)

1. **`TradeAssetSelector.tsx`** — revert waiver section to single toggle (was changed to per-round in Session 53)
2. **Remove dead `budget` state** — `budget` is fetched but never displayed (P2 from code review)
3. **Verify server processing** — `waiverPriorityOverride` swap in trade processing is correct as-is

---

## Implementation Estimate

| Component | Effort |
|-----------|--------|
| **Trading Block** | |
| Prisma model + migration | Small (15 min) |
| Server routes (CRUD) | Small (30 min) |
| Activity page tab | Medium (45 min) |
| Team page badges | Small (20 min) |
| "Propose Trade" pre-fill | Small (15 min) |
| **Waiver Position Fix** | |
| Simplify TradeAssetSelector | Small (15 min) |
| Remove dead budget state | Small (5 min) |
| **Total** | **~2.5 hours** |

## Acceptance Criteria

- [ ] `TradingBlock` Prisma model with migration
- [ ] CRUD API endpoints with proper auth (owner can add/remove, league can view)
- [ ] "Trading Block" tab on Activity page showing league-wide entries
- [ ] Owners can add/remove their players and set "asking for" notes
- [ ] "Propose Trade" quick action from Trading Block entries
- [ ] Badge on players who are on the block (visible on other teams' rosters)
- [ ] Waiver position in trades simplified to single toggle (matches server)
- [ ] Dead `budget` state removed from TradeAssetSelector

## Future Enhancements

- **AI Trade Matcher** — "Player X on Skunk Dogs' block matches your Watchlist + category needs. Propose this trade?"
- **Notification** — "A player you're watching was put on the Trading Block by [team]"
- **Trading Block expiry** — auto-remove after 14 days if no action
- **Block visibility settings** — commissioner can disable block during certain periods
