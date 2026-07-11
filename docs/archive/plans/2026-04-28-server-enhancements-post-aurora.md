# Server enhancements — post-Aurora known gaps

**Date:** 2026-04-28
**Status:** PROPOSAL — not implemented
**Owner:** TBD

Two known gaps surfaced during the Aurora rollout (Sessions 84–85). Both have UI in place that gracefully degrades; the server work below would unlock the full feature.

---

## Gap 1: Real boxscore stat lines on My Team Today

### Current state

`MyTeamTodayPanel.tsx` (Home page widget, shipped in PR #155) shows for each rostered player:
- Name + position + opponent + game time
- Game-status chip (LIVE / FINAL / Pending / DNP)
- A subtle ✦ Hot chip if the player had a "big game" — but this never fires because we don't have the line data

The server endpoint `GET /api/mlb/my-players-today?leagueId=N` (server/src/features/mlb-feed/routes.ts:984) currently returns:
```typescript
{ players: [{ playerName, mlbId, mlbTeam, gameTime, opponent, homeAway }] }
```

The component is forward-compatible — it expects `line.hitting` and `line.pitching` fields and will render real stat lines automatically when they're populated. There's a TODO comment in the component documenting the expected shape.

### What's needed

Extend the server response to include today's actual MLB stat line per player:

```typescript
interface PlayerToday {
  // ... existing fields
  line?: {
    hitting?: { AB: number; H: number; R: number; HR: number; RBI: number; SB: number; BB?: number; SO?: number };
    pitching?: { IP: number; H: number; R: number; ER: number; BB: number; K: number; W?: 0|1; L?: 0|1; SV?: 0|1; HLD?: 0|1 };
  };
  gameStatus?: "scheduled" | "live" | "final";
  gameStateDesc?: string;  // e.g. "TOP 5", "FINAL", "7:30 PM ET"
}
```

### Implementation plan

**Step 1**: For each rostered player, look up today's MLB game from the existing `mlbApi.ts` helpers. The MLB Stats API has a per-player game-log endpoint:
```
GET https://statsapi.mlb.com/api/v1/people/{personId}/stats?stats=gameLog&group=hitting,pitching&season={season}
```

Filter `splits[]` to the entry where `date` matches today (or yesterday after 10am rollover). Pull `stat.atBats / hits / runs / homeRuns / rbi / stolenBases` for hitters; `inningsPitched / strikeOuts / earnedRuns / baseOnBalls / wins / saves` for pitchers.

**Step 2**: Cache the per-player lookup with a short TTL (60-120s during live games, 24h once `gameStatus === "final"`). Use the existing `mcp-servers/mlb-data/cache` SQLite helper or the in-memory `mlbCache.ts`.

**Step 3**: Parallelize per-player fetches via `Promise.allSettled` so one failed lookup doesn't blank the whole panel.

### Risk

- **Rate limiting**: 25 rostered players × 12 owners × N polls/min = potential MLB API rate-limit hits during heavy-traffic windows. Mitigation: use the existing token-bucket rate limiter from the MCP server; cache aggressively.
- **Game state edge cases**: postponed games, suspended games, doubleheaders. Need to handle `gameDate vs officialDate` distinction.
- **DNP detection**: a player on the active roster who didn't play needs to render "DNP" not "Pending". Use `splits[].game.gameType !== "R"` filter or similar.

### Effort

~2 sessions. Server work is the bulk; client is already wired.

---

## Gap 2: True day-over-day deltas on category leaders

### Current state

`CategoryStandingsView.tsx` (shipped in PR #155, embedded in `/season` as the "By Category" tab) shows per-category leader cards with day-over-day % change indicators (▲ +2.3% / ▼ −1.1%).

The component currently uses `pointsDelta` — the change in **rank-points** for a team in that category — as a proxy for "movement". This is a reasonable approximation but it doesn't reflect raw stat % change (e.g., "Sluggers' HR went from 142 to 144 = +1.4%").

There's a `TODO(server)` comment in the component documenting that the proper data source would be a daily snapshot of team category totals.

### What's needed

A new table:

```prisma
model TeamStatsCategoryDaily {
  id        Int      @id @default(autoincrement())
  teamId    Int
  leagueId  Int
  date      DateTime @db.Date
  category  String   // "R" | "HR" | "RBI" | "SB" | "AVG" | "W" | "SV" | "K" | "ERA" | "WHIP"
  value     Float
  rank      Int
  rankPoints Int

  team   Team   @relation(fields: [teamId], references: [id])
  league League @relation(fields: [leagueId], references: [id])

  @@unique([teamId, leagueId, date, category])
  @@index([leagueId, date])
  @@index([teamId, category, date])
}
```

Populated by a new daily cron at 11:00 UTC (~6 AM PT, after stats sync at 13:00 UTC — confirm ordering):

```typescript
async function syncDailyCategorySnapshot(leagueId: number) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const teams = await prisma.team.findMany({ where: { leagueId } });
  const stats = await computeCurrentCategoryStandings(leagueId);  // existing helper
  for (const t of teams) {
    for (const cat of CATEGORY_KEYS) {
      await prisma.teamStatsCategoryDaily.upsert({
        where: { teamId_leagueId_date_category: { teamId: t.id, leagueId, date: today, category: cat } },
        create: { teamId: t.id, leagueId, date: today, category: cat, value: stats.byTeam[t.id][cat], rank: stats.ranks[t.id][cat], rankPoints: stats.points[t.id][cat] },
        update: { value: stats.byTeam[t.id][cat], rank: stats.ranks[t.id][cat], rankPoints: stats.points[t.id][cat] },
      });
    }
  }
}
```

Then a new endpoint:
```
GET /api/period-category-standings?periodId=X&leagueId=Y&compareDays=1
```

Returns each team's current value per category PLUS a `delta` field: difference (or %) vs the snapshot from `compareDays` ago.

### Risk

- **Backfill window**: until the snapshots accumulate, day-over-day fields will be `null`. Component already gracefully handles `null` (renders "—"). Plan a 7-day soak before showing rank-change UI prominently.
- **Migration**: adding a new table is a Railway deploy concern but `prisma migrate deploy` handles it. Backfill would need a one-shot script.
- **Storage**: 8 teams × 10 categories × 365 days × N leagues = 29,200 rows/league/year. Trivial.

### Effort

~1.5 sessions (Prisma migration + daily cron + new endpoint + client wiring of the `delta` field — already speculatively wired in the component).

---

## Recommended ordering

If both ship: do **Gap 2 first** (smaller, more contained, no new MLB API dependency). Gap 1 has more failure modes (rate limits, edge cases) and benefits from a cleaner design pass.

If only one ships: **Gap 2** has higher signal-to-noise — owners watch their categories every day during the season.
