---
title: "Watchlist — Player Tracking for Trade Targets & Add/Drop Candidates"
type: feat
status: active
date: 2026-03-31
---

# Watchlist

## Overview

A persistent, server-backed watchlist for team owners to track players they're interested in — trade targets, potential add/drops, and players to monitor. Visible across all player-facing pages. Replaces the auction-only localStorage watchlist with a proper league-scoped feature.

## Problem Statement

Team owners currently have no way to bookmark players they're scouting. The auction module has a localStorage-based watchlist (`useWatchlist.ts`), but it:
- Only works during auction draft
- Disappears when you clear browser data
- Isn't visible on Players page, Team page, or Activity page
- Can't be shared or persisted across devices

Fantasy platforms (Yahoo, ESPN, Sleeper) all provide a persistent watchlist as a core feature. It's table-stakes for an in-season product.

## Proposed Solution

### Data Model

```prisma
model Watchlist {
  id        Int      @id @default(autoincrement())
  teamId    Int                    // scoped to a team (= league-scoped)
  playerId  Int                    // the player being watched
  note      String?  @db.VarChar(200) // optional short note ("trade target", "buy low")
  tags      String[] @default([])  // optional tags: "trade-target", "add-drop", "monitor"
  createdAt DateTime @default(now())

  team      Team     @relation(fields: [teamId], references: [id], onDelete: Cascade)
  player    Player   @relation(fields: [playerId], references: [id], onDelete: Cascade)

  @@unique([teamId, playerId])     // one entry per player per team
  @@index([teamId])
}
```

**Why per-team (not per-user):**
- A user in multiple leagues has different scouting needs per league
- Naturally supports multi-sport (football watchlist ≠ baseball watchlist)
- Watchlist players can be cross-referenced against the team's roster for "already owned" filtering

### API Endpoints

All endpoints require `requireAuth` + team ownership validation.

```
GET    /api/watchlist?teamId=X              → list all watchlisted players (with player details)
POST   /api/watchlist                       → add player { teamId, playerId, note?, tags? }
PATCH  /api/watchlist/:id                   → update note/tags { note?, tags? }
DELETE /api/watchlist/:playerId?teamId=X    → remove player from watchlist
```

**Response shape (GET):**
```json
{
  "items": [
    {
      "id": 42,
      "playerId": 660271,
      "player": {
        "name": "Shohei Ohtani",
        "posPrimary": "DH",
        "mlbTeam": "LAD",
        "posList": "DH,P"
      },
      "note": "Buy low — slow start",
      "tags": ["trade-target"],
      "createdAt": "2026-03-31T12:00:00Z",
      "isOwned": false,
      "ownerTeam": null
    }
  ],
  "count": 12
}
```

### Client UI

#### 1. Watchlist Icon (everywhere players appear)

A small star/eye icon next to player names that toggles watchlist membership. Appears on:
- **Players page** — in each player row
- **Team page** — in roster rows (for opponents' rosters)
- **Player Detail Modal** — in the header
- **Auction page** — replaces current localStorage watchlist

```
☆ Player Name    →  click  →  ★ Player Name (added)
★ Player Name    →  click  →  ☆ Player Name (removed)
```

#### 2. Watchlist Filter on Players Page

Add "Watchlist" as a filter option in the "All Fantasy Teams" dropdown:
```
All Fantasy Teams | My Team | Watchlist | Available | Skunk Dogs | ...
```

When selected, shows only watchlisted players with their notes/tags.

#### 3. Watchlist Tab on Activity Page

New tab alongside Add/Drop, Trades, Waivers:
```
[ Add/Drop ] [ Trades ] [ Waivers ] [ Watchlist ]
```

Shows the full watchlist with:
- Player name, position, MLB team
- Current fantasy owner (or "Available")
- Note (editable inline)
- Tags (trade-target, add-drop, monitor — toggleable chips)
- Quick actions: "Propose Trade" / "Submit Waiver Claim" / "Remove"

#### 4. Watchlist Highlights

Players on the watchlist get subtle visual treatment across the app:
- Thin left-border accent on player rows (like the news feed roster highlighting)
- Small star icon next to their name
- Optional: notification when a watchlisted player is traded/claimed by another team

### Auction Watchlist Migration

The existing `useWatchlist.ts` (localStorage) should be deprecated:
- On first load, migrate any localStorage watchlist items to the server
- Remove `useWatchlist.ts` and `useAuctionPrefs.ts` watchlist references
- The auction page reads from the same server-backed watchlist

This can be done in a follow-up PR to avoid disrupting the auction module.

## Technical Considerations

- **Performance:** `GET /api/watchlist` joins Player table. With ≤50 watchlist items per team, no pagination needed. Add pagination if watchlists grow beyond 100.
- **Real-time:** No WebSocket needed. Watchlist changes are low-frequency (manual user action). Simple optimistic updates on the client.
- **Offline:** Falls back gracefully — if the API fails, the toggle just doesn't persist. No localStorage fallback needed.
- **Authorization:** `requireAuth` + verify `teamId` belongs to the authenticated user's league membership. Cannot view other teams' watchlists.

## Acceptance Criteria

- [ ] `Watchlist` Prisma model with migration
- [ ] CRUD API endpoints (GET, POST, PATCH, DELETE) with auth
- [ ] Star/eye toggle icon on Players page rows
- [ ] "Watchlist" filter option on Players page
- [ ] Watchlist tab on Activity page with notes and tags
- [ ] Watchlist icon in Player Detail Modal
- [ ] Existing auction localStorage watchlist continues to work (migration in follow-up)
- [ ] Works across leagues (per-team scoping)

## Implementation Estimate

| Component | Effort |
|-----------|--------|
| Prisma model + migration | Small (15 min) |
| Server routes + validation | Small (30 min) |
| `useWatchlist` hook (server-backed) | Small (20 min) |
| Players page toggle + filter | Medium (30 min) |
| Activity page Watchlist tab | Medium (45 min) |
| Player Detail Modal integration | Small (15 min) |
| **Total** | **~2.5 hours** |

## Tags & Notes UX

**Predefined tags** (chip toggles, not free text):
- `trade-target` — "I want to trade for this player"
- `add-drop` — "I want to claim this player off waivers / free agency"
- `monitor` — "Just watching — injury recovery, breakout candidate, etc."

**Notes** — free-text, max 200 chars. Visible on hover or in the expanded Watchlist tab. Examples:
- "Buy low — slow start, elite underlying metrics"
- "Trade target if they drop below .250 by May"
- "Stash for second half — returning from TJ surgery"

## Future Enhancements (not in v1)

- Watchlist alerts: push notification when a watchlisted player is traded, claimed, or dropped
- Shared watchlists: commissioner can create a league-wide "available players to watch" list
- AI integration: "Based on your team's category needs, here are 5 players to add to your watchlist"
- Export watchlist as CSV
- Watchlist capacity limit on free tier (e.g., 20 players) vs unlimited on Pro
