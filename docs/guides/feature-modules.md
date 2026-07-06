# Feature Modules

The codebase is organized by **domain feature modules**. Each feature encapsulates its own routes, services, pages, components, and API client in a self-contained directory.

## Current Feature Modules (32)

| Module | Server | Client | Description |
|--------|--------|--------|-------------|
| `auth` | routes | 5 pages, api | Login, signup, password reset, landing |
| `leagues` | routes, rules-routes | api only | League CRUD, rules management (pages removed; API used by admin, commissioner, keeper-prep) |
| `teams` | routes, teamService | 2 pages, 4 components, api | Team management, roster views |
| `players` | routes, dataService | 1 page, 2 components, api | Player search/detail (`GET /api/players`, `GET /:mlbId`), per-player slot eligibility (`GET /:mlbId/eligible-slots` — rate-limited 60/min/user), fielding stats (`GET /:mlbId/fielding`), per-player news (`GET /:mlbId/news`), MLB transactions feed (`GET /news/transactions`). All endpoints require auth |
| `roster` | routes, rosterImport-routes | 5 components | Roster grid, controls, import |
| `standings` | routes, standingsService | api only | Standings computation (pages removed; StatsTables promoted to shared components) |
| `trades` | routes | 1 page, 1 component, api | Trade proposals, voting |
| `waivers` | routes | (minimal) | Legacy paired-row waiver-claim auto-engine (FAAB-style) — kept running; new owners use `wire-list` |
| `wire-list` | routes, processor | 2 pages, 2 picker components, api | Two-list waiver model: ranked Add list + ranked Drop list per period. Commissioner-driven consume/free reducer (succeed/fail/skip/revert), atomic finalize, auto-lock at deadline, push notifications on outcomes. Owner UI at `/teams/:code/wire-list`, commissioner UI at `/commissioner/:leagueId/wire-list`. See `docs/decisions.md` ADR-012 |
| `transactions` | routes | 1 page, api | Transaction history (`GET /api/transactions`), claim/drop (`POST /transactions/{claim,drop}` + `/preview`), atomic IL stash and activate (`POST /transactions/{il-stash,il-activate}` + `/preview`), MLB status sync (`POST /transactions/sync-il-status`). All writes: requireAuth + requireSeasonStatus(IN_SEASON) + requireTeamOwnerOrCommissioner |
| `auction` | routes, auctionImport | 2 pages, 14 components, 5 hooks | Live auction draft (chat, sounds, watchlist, value overlay, spending pace, settings, timer, sold visual). `GET /api/auction/state` = live/current rosters; `GET /api/auction/results` = auction-day frozen snapshot (PR #370, 2026-06-02) used by `/auction-results` so totals don't drift with in-season churn — source=`auction_2026`/`prior_season`/`DROP`/`SEASON_IMPORT`, `acquiredAt < firstPeriod.startDate + 7d`, `releasedAt IS NULL OR releasedAt >= cutoff` |
| `keeper-prep` | routes, keeperPrepService | 1 page, 1 component, api | Keeper selection workflows |
| `commissioner` | routes, CommissionerService | 1 page, 5 components | Commissioner admin tools |
| `franchises` | routes | — | Franchise (org) CRUD, org-level settings |
| `seasons` | routes, seasonService | api only | Season lifecycle (SETUP→DRAFT→IN_SEASON→COMPLETED) |
| `admin` | routes | 1 page, 2 components | System admin panel (includes league creation + CSV import) |
| `archive` | routes, 3 archive services | 1 page, api | Historical data import/export |
| `periods` | routes | 1 page (Season) | Season/period standings with toggle |
| `mlb-feed` | routes, digestService | — | Live MLB scores, transactions, my-players-today, weekly league digest, depth charts, news feeds (MLB.com, ESPN, Yahoo, Reddit, Trade Rumors) |
| `awards` | routes, awardsService | — | Fantasy MVP / Cy Young rankings via z-score composite (`GET /api/leagues/:leagueId/awards`); persisted snapshots round-trip from league digest |
| `ai` | routes, draftReportCardService, aiInsightService, checkpoints lib | 4 pages, 1 component, api | AI Insights hub, Draft Report (`/draft-report`), Draft Report Card (`/draft-report-card`, PR #371 2026-06-03 — per-team auction-day values + busts at 1/3, 2/3, EOS checkpoints by `surplus = composite_z − price_z`; reuses `auction/lib/auctionDaySnapshot`; keepers excluded), league digest on Home page |
| `watchlist` | routes | 1 component, api | Private per-team player watchlist (notes, tags) |
| `trading-block` | routes | 1 page, 1 component, api | Public league-wide trading block ("asking for" field) |
| `board` | routes | 1 page, 3 components, api | League Board: Commissioner/Trade Block/Banter cards with threads |
| `community` | routes | 1 page, api | Product Board placeholder: Announcements, Marketplace, General |
| `chat` | routes, WebSocket | 1 component, api | In-app league chat: ChatPanel, unread badges, system messages on trade/waiver events |
| `notifications` | routes | 1 component, api | Push notifications: web-push VAPID, PushSubscription, NotificationPreference, per-type settings |
| `draft` | routes, WebSocket | 1 page, 3 components, api | Snake draft: DraftBoard grid, auto-pick, pause/resume, On the Clock indicator |
| `matchups` | routes | — | H2H matchup generation: round-robin scheduling, ScoringEngine (Roto/H2H/Points) |
| `profiles` | routes | 1 page, api | User profiles: bio, favorite team, experience, preferred formats, payment handles |
| `reports` | routes, reportBuilder | — (client removed) | Weekly report API — server endpoints still active at `/api/reports/:leagueId`; client UI removed (weekly digest on Home covers this) |
| `subscribers` | routes, pagesRouter, service | — (marketing form lives in the `www` repo) | Public double-opt-in email list (PR #415, pending deploy). `POST /api/public/subscribe` (no auth, per-IP rate-limit + honeypot + DB cooldown + no-enumeration); server-rendered `GET /confirm` + `GET /unsubscribe` pages (mounted before the SPA catch-all). `Subscriber` table is RLS-locked from the anon key; confirmation email from `hello@alephco.io` via Resend |

## Feature Module Pattern

```
server/src/features/<feature>/
├── routes.ts          # Express router (named export: <feature>Router)
├── services/          # Business logic (if needed)
│   └── <name>Service.ts
├── types.ts           # Feature-specific types (if needed)
└── index.ts           # Re-exports router

client/src/features/<feature>/
├── pages/             # Page components for this feature
├── components/        # Feature-specific components
├── api.ts             # API client functions
├── hooks/             # Feature-specific hooks (if needed)
└── index.ts           # Re-exports pages for routing
```

## Adding a New Feature Module

1. Create `server/src/features/<name>/` with `routes.ts` and `index.ts`
2. Create `client/src/features/<name>/` with pages, components, api as needed
3. Mount router in `server/src/index.ts`: `app.use("/api/<prefix>", <name>Router)`
4. Import pages in `client/src/App.tsx` from `./features/<name>/pages/<Page>`
5. Add API re-exports to `client/src/api/index.ts` if needed
6. Write unit tests in `__tests__/` directories within the feature
7. Add integration tests if the feature interacts with other modules

## Cross-Feature Dependencies

Some features import from other features' services or components.

**Server (service imports):**
- `leagues/routes.ts` imports `keeper-prep/services/keeperPrepService`
- `leagues/rules-routes.ts` imports `commissioner/services/CommissionerService`
- `admin/routes.ts` imports `commissioner/services/CommissionerService`
- `commissioner/services/CommissionerService` imports `auction/services/auctionImport`
- `auth/routes.ts` imports `commissioner/services/CommissionerService` (auto-accept invites on login)
- `standings/routes.ts` imports `players/services/dataService`
- `transactions/routes.ts` imports `players/services/dataService`
- `commissioner/routes.ts` imports `trades/routes.ts` for `tradeItemSchema`
- `seasons/services/seasonService` imports `commissioner/services/CommissionerService` (lockRules)
- `auction/routes.ts` imports `seasons/services/seasonService` (auto-transition on init)
- `leagues/routes.ts` reads `franchise.inviteCode` for invite code endpoints
- `commissioner/services/CommissionerService` creates/links `Franchise` rows on league creation
- `mlb-feed/services/digestService` imports `standings/services/standingsService` (dynamic, for digest context)
- `mlb-feed/services/digestService` imports `lib/sportConfig` (dynamic, `isKeeperRoster`)
- `mlb-feed/services/digestService` imports `awards/services/awardsService` (static, for Fantasy MVP / Cy Young rankings embedded in the digest payload)
- `ai/services/draftReportCardService` imports `auction/lib/auctionDaySnapshot` (single source for "what each team had on auction day" — also consumed by `/api/auction/results`)
- `mlb-feed/digestRoutes.ts` imports `services/aiAnalysisService` (dynamic, for digest generation)
- `chat/routes.ts` imports `trades/routes.ts` and `waivers/routes.ts` (system messages on trade/waiver processing)
- `notifications/routes.ts` imports `trades/routes.ts` and `waivers/routes.ts` (push notifications on trade/waiver events)
- `wire-list/processor.ts` imports `transactions/lib/positionInherit` (`isEligibleForSlot` for position-eligibility re-check at succeed time, mirroring legacy waivers processor)
- `wire-list/routes.ts` imports `transactions/lib/freeAgent` (`assertPlayerIsFreeAgent` — single source of truth for FA detection per todo #175; legacy `waivers/routes.ts` uses a different policy and is intentionally not migrated)
- `wire-list/processor.ts` imports `lib/pushService` (per-team summary push at finalize)
- `matchups/routes.ts` imports `standings/services/standingsService` (H2H scoring from category stats)
- `draft/routes.ts` imports `seasons/services/seasonService` (auto-transition on draft completion)
- `teams/routes.ts` imports `standings/services/standingsService` (AI insights standings computation)
- `reports/services/reportBuilder` queries `AiInsight` (type=league_digest + type=weekly) and `TransactionEvent` — aggregator-only, no services imported

**Client (component imports):**
- `commissioner/pages/Commissioner` imports `keeper-prep/components/KeeperPrepDashboard`
- `commissioner/pages/Commissioner` imports `leagues/api` (getInviteCode, regenerateInviteCode — invite management)
- `commissioner/pages/Commissioner` imports `transactions/api` (getTransactions — recent activity on Overview tab)
- `commissioner/pages/Commissioner` imports `roster/components/RosterControls` (commissioner-level roster lock/unlock)
- `commissioner/pages/Commissioner` imports `commissioner/components/SeasonManager`
- `commissioner/components/SeasonManager` imports `seasons/api`
- `periods/pages/Season` imports `seasons/api` (getCurrentSeason)
- `commissioner/components/CommissionerRosterTool` imports `transactions/api` (ilStash — direct IL stash from commissioner view)
- `keeper-prep/pages/KeeperSelection` imports `leagues/api` (getMyRoster, saveKeepers)
- `transactions/pages/TransactionsPage` imports `roster/components/AddDropTab`
- `trades/pages/TradesPage` imports `teams/components/TeamRosterView`
- `auction/pages/AuctionValues` imports `components/shared/PlayerDetailModal`
- `teams/pages/Team` imports `components/shared/PlayerDetailModal`
- `teams/pages/Team` imports `transactions/components/RosterMovesTab/AddDropPanel`, `PlaceOnIlPanel`, `ActivateFromIlPanel` (Yahoo-style v3 hub remounts these existing panels as inline sub-routes under `/teams/:code/manage/{claim,il-stash,il-activate}` per plan §0.5 refinement #2 "no modals" — replaces the modal entry point on Team page; the panels themselves are unchanged)
- `components/shared/PlayerDetailModal` imports `hooks/usePlayerNews` (RSS feed aggregation for news section)
- `archive/pages/ArchivePage` imports `players/components/EditPlayerNameModal`, `teams/components/EditTeamNameModal`, `admin/components/ArchiveAdminPanel`, `components/shared/StatsTables`
- `periods/pages/Season` imports `components/shared/StatsTables`
- `commissioner/components/CommissionerTradeTool` imports `trades/components/TradeAssetSelector`
- `admin/components/AdminLeagueTools` imports `leagues/api` (adminCreateLeague, adminImportRosters, getLeagues)
- `periods/pages/Season` uses `useLeague()` from `contexts/LeagueContext` (outfieldMode for position mapping)
- `teams/pages/Team` uses `useLeague()` from `contexts/LeagueContext` (outfieldMode for position mapping)
- `pages/Home` uses `useLeague()` from `contexts/LeagueContext` (outfieldMode for position mapping)
- `pages/Home` imports `transactions/api` (getTransactions — recent league activity feed)
- `pages/Home` imports `trades/api` (getTrades, cancelTrade — pending trade proposals widget)
- `pages/Home` imports `board/api` (getBoardCards — league board summary widget)
- `board/pages/Board` imports `trading-block/api` (auto-synced Trade Block cards)
- `periods/pages/Season` imports `matchups/api` (Matchups tab for H2H scoring)
- `pages/Home` imports `chat/components/ChatPanel` (league chat slide-over)

When adding cross-feature imports, document them here to maintain visibility.
