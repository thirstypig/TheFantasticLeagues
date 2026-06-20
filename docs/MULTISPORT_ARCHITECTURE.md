# Multi-Sport Architecture

The Fantastic Leagues Phase 2 expansion adds NFL and NBA support alongside the existing MLB infrastructure.

## Sports Supported

- **MLB** (live) — fully operational, league creation and gameplay active
- **NFL** (Phase 2) — dashboard live at `/nfl`, league creation coming Phase 3
- **NBA** (Phase 2) — dashboard live at `/nba`, league creation coming Phase 3

## Stats APIs

| Sport | API Source | Notes |
|-------|-----------|-------|
| MLB | MLB Stats API | Live data, team rosters, player stats |
| NFL | nflfastR | Free, open source, historical data only (no live scores yet) |
| NBA | stats.nba.com | Free, official NBA stats, 600 requests/hour rate limit |

## Test Routes (Staging Only)

Test route endpoints for manual API validation:

```
GET /api/test/nfl/teams
  Response: Array of NFL teams (32 total)

GET /api/test/nfl/players/:teamAbbr
  Example: /api/test/nfl/players/KC
  Response: Array of players on Kansas City Chiefs

GET /api/test/nba/teams
  Response: Array of NBA teams (30 total)

GET /api/test/nba/players/:teamId
  Example: /api/test/nba/players/1610612738
  Response: Array of players on the Celtics (NBA team ID)
```

## Sport Accent Colors

Each sport uses a unique accent color for UI theming:

| Sport | Color Name | Hex | CSS Variable |
|-------|-----------|-----|--------------|
| MLB | Outfield Green | #1f5a3d | `--am-accent` (default) |
| NFL | Gold | #854d0e | `.sport-nfl` override |
| NBA | Purple | #4c1d95 | `.sport-nba` override |

Sport-specific accents are applied via AuroraShell navigation: when users navigate to `/nfl` or `/nba`, the root div gets the sport class which overrides the accent token for buttons, links, and highlights.

## Dashboard URLs

- `/mlb` → MLB hub (Standings, Players, Trades)
- `/nfl` → NFL Dashboard (Standings, This Week's Matchups, Top Performers)
- `/nba` → NBA Dashboard (Standings, Weekly Matchups, Category Leaders)

All dashboards use hardcoded mock data. Real data integration with team rosters and live stats is a Phase 3 task.

## Known Limitations

- **NBA stats.nba.com timeout on staging** — network restrictions prevent the staging environment from reaching stats.nba.com. Works on production. Use test routes to validate API contract.
- **nflfastR historical data only** — nflfastR provides historical stats but no live game scores. Live NFL data requires a separate provider (ESPN API or NFL's official feed).
- **NFL/NBA league creation not yet supported** — Phase 3 task. Dashboards are read-only for now; users see "Coming Soon" notice when attempting to create a league.

## Staging Environment

### Connection Details

- **Project ID:** kfxdgcxiawwhzooexqtm
- **Database:** PostgreSQL on Supabase (tfl-staging)
- **URL:** https://kfxdgcxiawwhzooexqtm.supabase.co

### Test Account

```
Email:    commissioner@staging.tfl
Password: Staging123!@#
```

Other staging users: `admin@staging.tfl`, `player1@staging.tfl` through `player8@staging.tfl` (same password).

### Seeding

Run the staging seed script to populate test users, league, teams, and live MLB player data:

```bash
npm run seed:staging
```

Results: 10 users, 1 league (OGBA Staging), 10 teams, 1,345 MLB players synced from live API.

**Note:** The seed script updates (not inserts) existing users, making it safe to run multiple times.

### Auth Configuration

- **Provider:** Email + Password
- **Email Confirmation:** Disabled (auto-verified on signup)
- **Session Duration:** 1 hour
- **Refresh Token:** Persisted in browser localStorage

No OAuth providers configured on staging; email/password is the sole auth method.
