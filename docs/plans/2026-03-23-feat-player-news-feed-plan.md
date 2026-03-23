---
title: "feat: Player news feed — RotoWire RSS + ESPN + MLB Transactions"
type: feat
status: active
date: 2026-03-23
---

# Player News Feed — Three Sources Per Player

## Overview

Add a per-player news feed combining three free sources into a unified timeline on the PlayerDetailModal and Team pages:

1. **RotoWire RSS** — Fantasy-relevant editorial (injury updates, role changes, analysis)
2. **ESPN Player News** — Undocumented ESPN API for per-player news/notes
3. **MLB Stats API Transactions** — Official IL moves, roster moves, trades, assignments (already partially implemented via `/players/:mlbId/news`)

## Data Sources

### Source 1: RotoWire Free RSS

**URL:** `https://www.rotowire.com/rss/news.php?sport=MLB`
- RSS 2.0, TTL 10 min, free tier = 5 most recent items
- Title format: `"Player Name: Headline"` — parse on `: `
- Link contains RotoWire player slug (e.g., `/baseball/player/zack-wheeler-10951`)
- No per-player filtering on free tier — must poll and match by name
- Fantasy-focused content (exactly what managers want)

**Integration:**
- [ ] Poll every 10 min via cron or on-demand
- [ ] Parse RSS XML, extract player name from title
- [ ] Fuzzy match player name to `Player.name` in DB
- [ ] Store in `PlayerNews` table (dedup by guid)
- [ ] Serve via API: `GET /api/players/:mlbId/news?source=rotowire`

### Source 2: ESPN Player News (Undocumented API)

**URL pattern:** `https://site.api.espn.com/apis/common/v3/sports/baseball/mlb/athletes/{espnId}/news`
- JSON response with per-player news articles
- Includes: headline, description, published date, images, links
- No auth required (public API)
- Needs ESPN player ID mapping (different from MLB ID)

**Alternative ESPN endpoint:** `https://site.web.api.espn.com/apis/common/v3/sports/baseball/mlb/news?player={espnId}`

**ESPN ID mapping challenge:**
- ESPN uses its own player IDs (not MLB IDs)
- Options: (a) build a mapping table, (b) search ESPN API by name, (c) scrape ESPN player pages
- Simplest: `https://site.api.espn.com/apis/common/v3/sports/baseball/mlb/athletes?search={playerName}` — returns ESPN athlete ID

**Integration:**
- [ ] Add `espnId` field to Player model (optional, populated on first lookup)
- [ ] On first news request, search ESPN for player name → cache ESPN ID
- [ ] Fetch per-player news from ESPN API
- [ ] Parse JSON, normalize into unified news format
- [ ] Cache in `PlayerNews` table or in-memory with TTL

### Source 3: MLB Stats API Transactions (Existing)

**URL:** `https://statsapi.mlb.com/api/v1/transactions?playerId={mlbId}&startDate=...&endDate=...`
- Already partially implemented in `/players/:mlbId/news` endpoint
- Direct `person.id` → `Player.mlbId` matching
- Official roster moves, IL placements, trades, assignments
- Rich structured data (type codes, team info, dates)

**Enhancement:**
- [ ] Expand date range (currently last 30 days → last 90 days or full season)
- [ ] Include transaction type labels (IL, Trade, Assignment, Status Change)
- [ ] Merge into unified news feed alongside RotoWire and ESPN

## Unified News Schema

```typescript
interface PlayerNewsItem {
  id: string;              // unique across sources (e.g., "rw:mlb993891", "espn:42345", "mlb:tx123456")
  source: "rotowire" | "espn" | "mlb_transactions";
  mlbId: number;           // linked player
  headline: string;        // "Still tracking toward April return"
  summary: string;         // 1-2 sentence body
  url?: string;            // link to source article
  imageUrl?: string;       // article image (ESPN provides these)
  publishedAt: Date;       // when the news was published
  category?: string;       // "injury" | "roster_move" | "analysis" | "transaction"
  fetchedAt: Date;         // when we fetched it
}
```

## Database

```prisma
model PlayerNews {
  id          Int      @id @default(autoincrement())
  externalId  String   @unique  // "rw:mlb993891", "espn:42345"
  source      String             // "rotowire", "espn", "mlb_transactions"
  playerId    Int?               // FK to Player (nullable if name match fails)
  mlbId       Int?               // MLB ID for direct matching
  headline    String
  summary     String
  url         String?
  imageUrl    String?
  category    String?
  publishedAt DateTime
  fetchedAt   DateTime @default(now())

  player      Player?  @relation(fields: [playerId], references: [id])

  @@index([mlbId])
  @@index([playerId])
  @@index([publishedAt])
}
```

Also add to Player model:
```prisma
model Player {
  // ... existing fields
  espnId    Int?     // ESPN athlete ID (populated on first lookup)
  news      PlayerNews[]
}
```

## API Endpoints

### `GET /api/players/:mlbId/news`
Already exists — currently fetches MLB transactions only. Enhance to:
- [ ] Query `PlayerNews` table for all sources
- [ ] If no cached news or cache is stale (>30 min), fetch from all 3 sources
- [ ] Return unified timeline sorted by `publishedAt` desc
- [ ] Query params: `?source=rotowire,espn,mlb` (filter by source), `?limit=20`

### `POST /api/admin/sync-news`
Admin endpoint to trigger a bulk news sync:
- [ ] Fetch RotoWire RSS, parse and store all 5 items
- [ ] For rostered players, fetch ESPN news (batch by team to reduce calls)
- [ ] Fetch recent MLB transactions for all rostered players
- [ ] Return sync summary

## Server Implementation

### RotoWire RSS Parser
```
server/src/features/players/services/newsService.ts
```
- [ ] `fetchRotoWireNews()` — fetch RSS, parse XML, extract player name + headline
- [ ] `matchPlayerByName(name)` — fuzzy match against Player table
- [ ] Store matched items in PlayerNews table

### ESPN News Fetcher
- [ ] `resolveEspnId(mlbId, playerName)` — search ESPN API, cache result on Player.espnId
- [ ] `fetchEspnPlayerNews(espnId)` — fetch per-player news JSON
- [ ] Normalize ESPN response into PlayerNewsItem format

### Cron Integration
- [ ] Add to existing daily cron schedule (or every 30 min during season)
- [ ] RotoWire: poll every 10 min (their TTL), store in DB
- [ ] ESPN: fetch on-demand per player (not bulk — to avoid rate limits)
- [ ] MLB Transactions: fetch daily for all rostered players

## Client UI

### PlayerDetailModal — News Tab
- [ ] Add "News" tab to existing PlayerDetailModal
- [ ] Show unified timeline with source badges (🔴 RotoWire, 🔵 ESPN, ⚾ MLB)
- [ ] Each item: headline, summary preview (expandable), source badge, relative time
- [ ] "Load more" pagination
- [ ] Empty state: "No recent news for this player"

### Team Page — News Feed Section
- [ ] Add collapsible "Player News" section below roster
- [ ] Show latest news for all rostered players, merged and sorted by date
- [ ] Limit to 10 most recent, with "View all" link

### AI Hub Integration
- [ ] Add "Player News Summary" AI feature to AI Hub
- [ ] AI summarizes recent news for a team's roster into 3-5 bullet points
- [ ] Uses the news data as context for the LLM prompt

## Acceptance Criteria

- [ ] PlayerDetailModal shows news from all 3 sources in unified timeline
- [ ] RotoWire news items matched to correct players via name parsing
- [ ] ESPN news fetched per-player with cached ESPN ID mapping
- [ ] MLB transactions enhanced with type labels and longer date range
- [ ] News items stored in DB for fast retrieval (no re-fetching on every page load)
- [ ] Source badges distinguish where each news item came from
- [ ] Works for all rostered players + any player viewed via search
- [ ] Graceful degradation: if one source fails, others still show

## Files to Create/Modify

| File | Action |
|------|--------|
| `prisma/schema.prisma` | **Modify** — add PlayerNews model, espnId to Player |
| `server/src/features/players/services/newsService.ts` | **New** — RotoWire + ESPN + MLB transaction fetchers |
| `server/src/features/players/routes.ts` | **Modify** — enhance `/news` endpoint |
| `server/src/features/admin/routes.ts` | **Modify** — add `/admin/sync-news` |
| `client/src/components/shared/PlayerDetailModal.tsx` | **Modify** — add News tab |
| `client/src/features/teams/pages/Team.tsx` | **Modify** — add news section |

## Effort Estimate

| Component | Effort |
|-----------|--------|
| Schema + migration | 15 min |
| RotoWire RSS parser + name matching | 45 min |
| ESPN ID resolution + news fetcher | 45 min |
| MLB transactions enhancement | 20 min |
| Unified API endpoint | 30 min |
| Client News tab in PlayerDetailModal | 45 min |
| Team page news section | 30 min |
| **Total** | **~4 hours** |
