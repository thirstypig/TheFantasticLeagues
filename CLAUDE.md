# The Fantastic Leagues (FBST)

## Current status

<!-- now-tldr -->
Fantasy baseball for the dozen-owner, auction-draft, keeper-league crowd that Yahoo and ESPN never really served. App is live, our first auction of the season just wrapped, and I'm rolling out roster-rules enforcement in phases while iterating weekly on AI-assisted features (draft grades, trade analyzer, a weekly "Week in Baseball" report). Current focus: merging fixes for two silent production regressions caught this week, landing the Phase 4 UI, and finishing commissioner tooling so I can flip roster-rules enforcement on for my own OGBA owners.
<!-- /now-tldr -->

## Project Overview
Fantasy baseball league management tool. Client/server monorepo organized by **feature modules**.

## Tech Stack

### Frontend
- React 18 + React Router v6
- Vite (dev server + bundler)
- TypeScript (strict mode)
- Tailwind CSS + shadcn-style UI primitives
- Supabase JS client (auth sessions)

### Backend
- Node.js + Express
- TypeScript (strict mode, ESM)
- Prisma ORM (PostgreSQL)
- Supabase Admin SDK (JWT verification)
- Zod (request validation)

### Shared
- TypeScript across both client and server
- Vitest (unit + integration tests)
- 27 feature modules mirrored client/server

### Infrastructure
- PostgreSQL (Supabase)
- Supabase Auth (Google/Yahoo OAuth, email/password)
- Resend (transactional email for league invites)
- Railway (deployment, unified API + static client at `app.thefantasticleagues.com`)
- Cloudflare (DNS + CDN in front of Railway)

## Project Structure
```
fbst/
├── client/
│   └── src/
│       ├── features/        # Domain feature modules (see below)
│       ├── pages/           # App-level pages (Home, Guide)
│       ├── components/      # Shared components (AppShell, NavBar, ui/)
│       │   └── ui/          # shadcn-style primitives
│       ├── api/             # Shared API infra (base.ts, types.ts, index.ts barrel)
│       ├── auth/            # AuthProvider (Supabase context)
│       ├── hooks/           # Shared hooks (useAuth)
│       ├── lib/             # Utilities (baseballUtils, supabase client)
│       └── types.ts         # Global client types
├── server/
│   └── src/
│       ├── features/        # Domain feature modules (see below)
│       ├── routes/          # Shared routes (public.ts)
│       ├── middleware/      # Auth middleware (attachUser, requireAuth, requireLeagueRole)
│       ├── lib/             # Infra (prisma, supabase, logger, mlbApi, utils)
│       ├── db/              # Prisma singleton
│       ├── services/        # Shared services (aiAnalysisService)
│       └── types/           # Server-side types
├── prisma/                  # Schema + migrations
├── scripts/                 # One-off data processing scripts
├── docs/                    # Documentation
└── .claude/
    └── commands/            # Custom slash commands (check, db, feature-test, etc.)
```

## Feature Modules

The codebase is organized by **domain feature modules**. Each feature encapsulates its own routes, services, pages, components, and API client in a self-contained directory.

### Current Feature Modules (27)

| Module | Server | Client | Description |
|--------|--------|--------|-------------|
| `auth` | routes | 5 pages, api | Login, signup, password reset, landing |
| `leagues` | routes, rules-routes | api only | League CRUD, rules management (pages removed; API used by admin, commissioner, keeper-prep) |
| `teams` | routes, teamService | 2 pages, 4 components, api | Team management, roster views |
| `players` | routes, dataService | 1 page, 2 components, api | Player search, stats, detail modals |
| `roster` | routes, rosterImport-routes | 5 components | Roster grid, controls, import |
| `standings` | routes, standingsService | api only | Standings computation (pages removed; StatsTables promoted to shared components) |
| `trades` | routes | 1 page, 1 component, api | Trade proposals, voting |
| `waivers` | routes | (minimal) | Waiver claims workflow |
| `transactions` | routes | 1 page, api | Transaction history |
| `auction` | routes, auctionImport | 2 pages, 14 components, 5 hooks | Live auction draft (chat, sounds, watchlist, value overlay, spending pace, settings, timer, sold visual) |
| `keeper-prep` | routes, keeperPrepService | 1 page, 1 component, api | Keeper selection workflows |
| `commissioner` | routes, CommissionerService | 1 page, 5 components | Commissioner admin tools |
| `franchises` | routes | — | Franchise (org) CRUD, org-level settings |
| `seasons` | routes, seasonService | api only | Season lifecycle (SETUP→DRAFT→IN_SEASON→COMPLETED) |
| `admin` | routes | 1 page, 2 components | System admin panel (includes league creation + CSV import) |
| `archive` | routes, 3 archive services | 1 page, api | Historical data import/export |
| `periods` | routes | 1 page (Season) | Season/period standings with toggle |
| `mlb-feed` | routes, digestService | — | Live MLB scores, transactions, my-players-today, weekly league digest, depth charts, news feeds (MLB.com, ESPN, Yahoo, Reddit, Trade Rumors) |
| `ai` | — | 3 pages | AI Insights hub, Draft Report (`/draft-report`), league digest on Home page |
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

### Feature Module Pattern
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

### Adding a New Feature Module
1. Create `server/src/features/<name>/` with `routes.ts` and `index.ts`
2. Create `client/src/features/<name>/` with pages, components, api as needed
3. Mount router in `server/src/index.ts`: `app.use("/api/<prefix>", <name>Router)`
4. Import pages in `client/src/App.tsx` from `./features/<name>/pages/<Page>`
5. Add API re-exports to `client/src/api/index.ts` if needed
6. Write unit tests in `__tests__/` directories within the feature
7. Add integration tests if the feature interacts with other modules

### Cross-Feature Dependencies
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
- `mlb-feed/routes.ts` imports `services/aiAnalysisService` (dynamic, for digest generation)
- `chat/routes.ts` imports `trades/routes.ts` and `waivers/routes.ts` (system messages on trade/waiver processing)
- `notifications/routes.ts` imports `trades/routes.ts` and `waivers/routes.ts` (push notifications on trade/waiver events)
- `matchups/routes.ts` imports `standings/services/standingsService` (H2H scoring from category stats)
- `draft/routes.ts` imports `seasons/services/seasonService` (auto-transition on draft completion)
- `teams/routes.ts` imports `standings/services/standingsService` (AI insights standings computation)
- `reports/services/reportBuilder` queries `AiInsight` (type=league_digest + type=weekly) and `TransactionEvent` — aggregator-only, no services imported

**Client (component imports):**
- `commissioner/pages/Commissioner` imports `keeper-prep/components/KeeperPrepDashboard`
- `commissioner/pages/Commissioner` imports `leagues/components/RulesEditor`
- `commissioner/pages/Commissioner` imports `commissioner/components/SeasonManager`
- `commissioner/components/SeasonManager` imports `seasons/api`
- `periods/pages/Season` imports `seasons/api` (getCurrentSeason)
- `commissioner/components/CommissionerRosterTool` imports `roster/components/`
- `keeper-prep/pages/KeeperSelection` imports `leagues/api` (getMyRoster, saveKeepers)
- `transactions/pages/TransactionsPage` imports `roster/components/AddDropTab`
- `trades/pages/TradesPage` imports `teams/components/TeamRosterView`
- `auction/pages/AuctionValues` imports `components/shared/PlayerDetailModal`
- `teams/pages/Team` imports `components/shared/PlayerDetailModal`
- `components/shared/PlayerDetailModal` imports `hooks/usePlayerNews` (RSS feed aggregation for news section)
- `archive/pages/ArchivePage` imports `players/components/EditPlayerNameModal`, `teams/components/EditTeamNameModal`, `admin/components/ArchiveAdminPanel`, `components/shared/StatsTables`
- `periods/pages/Season` imports `components/shared/StatsTables`
- `commissioner/components/CommissionerTradeTool` imports `trades/components/TradeAssetSelector`
- `admin/components/AdminLeagueTools` imports `leagues/api` (adminCreateLeague, adminImportRosters, getLeagues)
- `periods/pages/Season` uses `useLeague()` from `contexts/LeagueContext` (outfieldMode for position mapping)
- `teams/pages/Team` uses `useLeague()` from `contexts/LeagueContext` (outfieldMode for position mapping)
- `pages/Home` uses `useLeague()` from `contexts/LeagueContext` (outfieldMode for position mapping)
- `board/pages/Board` imports `trading-block/api` (auto-synced Trade Block cards)
- `periods/pages/Season` imports `matchups/api` (Matchups tab for H2H scoring)
- `pages/Home` imports `chat/components/ChatPanel` (league chat slide-over)

When adding cross-feature imports, document them here to maintain visibility.

## Shared Infrastructure (do NOT move into features)
- `shared/api/` — **cross-side Zod schemas** (pilot: `playerSeasonStats.ts`). Both client and server import from here; the inferred type is the single source of truth for the wire format. See `docs/CONTRACT_TESTING.md` for how to add a new schema. Server imports via relative `.js` path (NodeNext), client via `@shared/*` path alias.
- `server/src/middleware/auth.ts` — global auth (attachUser, requireAuth, requireAdmin, requireLeagueRole, requireFranchiseCommissioner)
- `server/src/middleware/seasonGuard.ts` — `requireSeasonStatus(allowedStatuses, leagueIdSource)` — enforces season-phase constraints on write endpoints
- `server/src/lib/` — supabase.ts, prisma.ts, logger.ts, mlbApi.ts, utils.ts, auditLog.ts, emailService.ts, **errorBuffer.ts** (100-entry ring buffer for admin error dashboard, push/list/find with ERR- prefix normalization), **ipHash.ts** (HMAC-SHA256 + /24-/48 truncation, fail-fast if `IP_HASH_SECRET` missing)
- `server/src/db/prisma.ts` — Prisma singleton
- `client/src/auth/AuthProvider.tsx` — global React auth context
- `client/src/api/base.ts` — fetchJsonApi, API_BASE config, **`ApiError` class** (status, url, requestId, ref, detail, body, serverMessage, displayCode()), **`getLastRequestId()`** for cross-effect correlation
- `client/src/api/types.ts` — shared API response/request types
- `client/src/lib/errorBus.ts` — pub/sub error surface; `reportError(err, { source })` normalizes any thrown value; subscribe via `subscribeErrors(listener)`
- `client/src/components/ErrorProvider.tsx` — root-mounted subscriber that renders `<ErrorToast>` stack; must wrap everything in main.tsx
- `client/src/components/ErrorToast.tsx` — dismissible toast showing ERR-prefixed code with click-to-copy, auto-dismiss 12s, hover pauses
- `client/src/components/ErrorBoundary.tsx` — React render-error boundary; calls `getLastRequestId()` + `reportError()` on catch
- `client/src/hooks/useSessionHeartbeat.ts` — 30s visibility-gated heartbeat, BroadcastChannel leader election (one session per browser, not per tab), `fetch({ keepalive: true })` on pagehide (never `sendBeacon` — doesn't support Authorization header). Mounted once in AuthProvider. Returns `{ endSession }` called before logout.
- `server/src/features/sessions/routes.ts` — `POST /api/sessions/start | /heartbeat | /end`. Ownership check: `session.userId === req.user.id` or return 204 (plan R2 — avoid enumeration). Heartbeat rate-limited 20/min per userId, concurrent-session cap 10, credential-stuffing canary at 100/hr. Rollup to UserMetrics on end (plan R5).
- `server/src/features/admin/routes.ts` — `GET /api/admin/users` with pagination (max 200), filters (search / active window / tier), sort (default `lastLoginAt DESC` per plan R14)
- `client/src/components/ui/` — shadcn-style UI primitives (table.tsx has 3-tier density: compact/default/comfortable)
- `client/src/components/ui/SortableHeader.tsx` — accessible sortable header (`<button>` in `<th>`, `aria-sort`, generic `<K extends string>`)
- `client/src/components/ui/ThemedTable.tsx` — ThemedTable supports `density` and `zebra` props
- `client/src/components/AppShell.tsx` — app shell
- `client/src/components/shared/PlayerDetailModal.tsx` — shared player detail modal (used by teams, auction, players); includes fielding stats (games by position)
- `client/src/components/shared/RosterAlertAccordion.tsx` — shared IL/Minors accordion (used by Home, Team pages); red for IL, amber for Minors
- `client/src/hooks/useRosterStatus.ts` — shared hook for roster status (IL + minors players) with proper TypeScript interface
- `client/src/hooks/usePlayerNews.ts` — shared hook for player news via `GET /api/mlb/player-news` (server-side RSS aggregation)
- `server/src/features/mlb-feed/services/rssParser.ts` — shared RSS XML parser with link URL validation, 5-min TTL cache
- `server/src/features/mlb-feed/digestRoutes.ts` — digest + headlines sub-router (extracted from routes.ts)
- `client/src/components/shared/StatsTables.tsx` — shared stats tables (used by standings, archive, periods)
- `client/src/contexts/LeagueContext.tsx` — app-wide league context (leagueId, outfieldMode, seasonStatus, myTeamId, leagues list); value memoized, exports `findMyTeam<T>` helper
- `client/src/hooks/useSeasonGating.ts` — `useSeasonGating()` hook returning feature availability flags based on season status
- `client/src/lib/sportConfig.ts` — baseball constants, position utilities, `isPitcher()`, `mapPosition()`, `normalizePosition()`, `getMlbTeamAbbr()`, stat formatting
- `client/src/lib/playerDisplay.ts` — thin re-export layer over `sportConfig.ts` (kept for backwards compatibility)
- `server/src/lib/sportConfig.ts` — server-side baseball constants, position config, default league rules, `OPENING_DAYS` by year
- `server/src/scripts/lib/cli.ts` — shared CLI utilities for scripts (`parseYear`)

## Conventions
- TypeScript strict mode in both client and server
- Server files use `.js` extensions in imports (ESM compat): `from "../db/prisma.js"`
- Client files use no extensions in imports: `from "../api/base"`
- Prisma singleton imported from `server/src/db/prisma.ts` — NEVER create `new PrismaClient()` inline
- All routers use named exports: `export const fooRouter = router;`
- API client functions use `fetchJsonApi()` from `client/src/api/base.ts`
- Auth token passed via `Authorization: Bearer <token>` header
- Tailwind for all styling; shadcn-pattern components in `components/ui/`
- Named exports preferred; default exports only for page components
- **All write endpoints (POST, PATCH, DELETE) MUST use `requireAuth` middleware** — no exceptions
- **Admin-only endpoints** (waiver processing, trade processing) use `requireAdmin`
- **Middleware ordering**: `requireAuth → validateBody(schema) → requireSeasonStatus([...]) → requireTeamOwner/requireLeagueMember → asyncHandler(fn)`. Validation runs before season guard and authorization because both read from `req.body`. Season guard placed after validation so leagueId/teamId are parsed. For param-based auth (e.g., `requireCommissionerOrAdmin()`), auth runs before validation.
- **Season-gated endpoints** use `requireSeasonStatus(["DRAFT"])` or `requireSeasonStatus(["IN_SEASON"], "body.teamId")` — auction nominate/bid require DRAFT, trade propose and waiver submit require IN_SEASON
- **Error responses MUST NOT leak internal details** — return `{ error: "Internal Server Error", requestId, ref }` for 500s; admins (`req.user?.isAdmin === true`) additionally get `detail: message`; log details server-side via `logger` with `{ ref, requestId, path, method, userId }`
- **Request correlation** — every request gets an 8-char hex `req.requestId` set by middleware in `server/src/index.ts`; always echoed back via `X-Request-Id` response header (exposed to browser JS via `Access-Control-Expose-Headers`). User-facing code is `ERR-${requestId}`. Every 500 also pushes a record into the in-memory `errorBuffer` (capacity 100, newest-first, admin-visible at `GET /api/admin/errors`).
- **Client-side error surface** — thrown `ApiError` (not plain `Error`) carries `status`, `url`, `requestId`, `ref`, `detail`, `body`, `serverMessage`. Callers that want the toast to appear should call `reportError(err, { source: "feature-name" })` from `client/src/lib/errorBus.ts`. `ErrorProvider` must wrap the app root in `main.tsx`.
- **Required env vars** (`DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, `IP_HASH_SECRET`) validated at startup — server exits if missing. `IP_HASH_SECRET` must be ≥32 chars (generate with `openssl rand -hex 32`); rotate yearly per session-tracking plan R8
- **Dev-only endpoints** gated behind explicit env vars (e.g., `ENABLE_DEV_LOGIN=true`), never `NODE_ENV` checks

## Database
- Schema at `prisma/schema.prisma`
- Never run migrations without explicit confirmation
- Key models: Franchise, FranchiseMembership, User, UserProfile, League, LeagueMembership, LeagueInvite, Team, Player, Roster, Period, TeamStatsPeriod, TeamStatsSeason, Trade, WaiverClaim, AuctionLot, AuctionBid, AuctionSession, AiInsight, TransactionEvent, HistoricalSeason, HistoricalStanding, HistoricalPlayerStat, ChatMessage, PushSubscription, NotificationPreference, Matchup
- `AiInsight` — persisted AI-generated analyses (type: "weekly" for team insights, "league_digest" for home page digest; deduped by weekKey)
- `Trade.aiAnalysis` — JSON, auto-generated post-trade analysis (fire-and-forget on processing)
- `WaiverClaim.aiAnalysis` — JSON, auto-generated post-waiver analysis (fire-and-forget on processing)
- `AuctionSession.state.draftReport` — JSON, persisted Draft Report (generated once, survives restarts)

### Daily Cron Jobs (server/src/index.ts)
- **12:00 UTC (~5 AM PT)**: `syncAllPlayers()` — roster sync for all 30 MLB teams, followed by `syncPositionEligibility(season, 3)` which applies OGBA's three-layer position eligibility:
  1. **Rule 1** — current season ≥3 GP at a position → eligible.
  2. **Rule 2** — prior season ≥20 GP at a position → eligible (additive with Rule 1; PR #124). Fail-closed on prior-season MLB API error; prior fetch uses 30-day TTL. Derived-IDs (≥1M) filtered to avoid 404s on Ohtani's synthetic pitcher row.
  3. **Rule 3** — rookies / minors → primary position only (falls out of the empty-fielding skip).
  Global threshold; per-league future.
- **13:00 UTC (~6 AM PT)**: `syncAllActivePeriods()` — player stats sync for active scoring periods

**CRITICAL**: `syncAllPlayers()` updates `Player.posPrimary` and `Player.mlbTeam` but **preserves enriched `Player.posList`** — it only overwrites `posList` if the existing value is just the primary position (not enriched by current or prior-season fielding stats). This prevents the daily sync from wiping multi-position eligibility data produced by `syncPositionEligibility`.

## Development

### Port Assignments (per MASTER-PORTS.md — DO NOT CHANGE without updating all references)
| Project | Service | Port |
|---------|---------|------|
| **FBST** | Vite dev server | **3010** |
| **FBST** | Express API server | **4010** |
| **FBST** | PostgreSQL | **5442** |
| **FBST** | Redis | **6381** |

### Starting the App (two terminals)
```bash
# Terminal 1: Express API server
npm run server        # Starts on :4010

# Terminal 2: Vite dev server (proxies /api → :4010)
npm run dev           # Starts on :3010, open http://localhost:3010
```

### Other Commands
- `npm run test` (from root) — runs all tests
- `npm run test:server` — server unit + integration tests
- `npm run test:client` — client unit tests

## Testing Strategy

### Unit Tests (per feature module)
Each feature module should have tests co-located with the code:
```
server/src/features/<feature>/
├── __tests__/
│   ├── routes.test.ts         # Route handler tests (mock Prisma, test HTTP)
│   └── <name>Service.test.ts  # Service logic tests (mock DB)

client/src/features/<feature>/
├── __tests__/
│   ├── api.test.ts            # API client tests (mock fetch)
│   └── <Page>.test.tsx        # Component render tests
```

**What to test per module:**
- **Routes**: HTTP method, status codes, request validation, error responses
- **Services**: Business logic, edge cases, error handling
- **API clients**: Request construction, response parsing, error handling
- **Pages/Components**: Rendering, user interactions, loading/error states

### Integration Tests
Cross-feature interactions should be tested in a shared integration test directory:
```
server/src/__tests__/integration/
├── auction-roster.test.ts     # Auction draft populates roster
├── trade-roster.test.ts       # Trade execution moves players between rosters
├── waiver-roster.test.ts      # Waiver claims modify rosters and budgets
├── keeper-league.test.ts      # Keeper prep interacts with league settings
└── commissioner-league.test.ts # Commissioner actions affect league state
```

**Key integration scenarios:**
- Auction draft completion should create roster entries and update team budgets
- Trade processing should move players between rosters and adjust budgets
- Waiver claim processing should enforce budget limits and roster rules
- Commissioner roster lock should prevent trades/waivers for locked teams
- Keeper selection should respect league rules and roster constraints

### Test Configuration
- **Framework**: Vitest (fast, native TypeScript, Vite-compatible)
- **Server mocking**: Use `vi.mock()` to mock Prisma (`../../db/prisma.js`) and Supabase (`../../lib/supabase.js`) in unit tests
- **Client mocking**: React Testing Library for components; `vi.mock()` for API mocking
- **DB tests**: Use a test database with Prisma migrations for integration tests (future)
- **CI**: Run `npm run test` in CI pipeline before deploy

### Current Test Coverage (749 server + 283 client + 50 MCP + 1 E2E = 1083 tests, 27 feature modules)

**Note:** The per-file breakdown below is severely stale (last full-sync ~session 66). See `docs/TESTING.md` for the live catalog; summary count above is authoritative.

See `docs/TESTING.md` for the full catalog, vocabulary (unit/integration/E2E), coverage gaps, and run cadence.
E2E tests live in `client/e2e/` and are run with `cd client && npm run test:e2e` (requires both dev servers up).


**Server (493 tests):**
- `server/src/lib/__tests__/utils.test.ts` — 36 tests (toNum, toBool, norm, normCode, parseCsv, splitCsvLine, chunk, parseIntParam)
- `server/src/features/standings/__tests__/standingsService.test.ts` — 26 tests (buildTeamNameMap, CATEGORY_CONFIG, computeCategoryRows, computeStandingsFromStats, rankPoints)
- `server/src/features/standings/__tests__/standings.integration.test.ts` — 7 tests (full pipeline: 4-team league scenario)
- `server/src/middleware/__tests__/auth.test.ts` — 6 tests (requireAuth, requireAdmin)
- `server/src/middleware/__tests__/authExtended.test.ts` — 45 tests (attachUser, requireLeagueRole, requireCommissionerOrAdmin, requireLeagueMember body fallback, requireTeamOwnerOrCommissioner matrix: admin / IDOR / commissioner / toggle on-off / legacy ownerUserId / co-owner TeamOwnership / fail-closed rule value variants)
- `server/src/lib/__tests__/leagueRuleCache.test.ts` — 9 tests + 1 todo (row→map shape, cache hits across repeated reads, per-league isolation, 60s TTL expiry with fake timers, invalidation scoping, _clearLeagueRuleCache for test isolation)
- `server/src/middleware/__tests__/asyncHandler.test.ts` — 4 tests
- `server/src/middleware/__tests__/validate.test.ts` — 7 tests
- `server/src/middleware/__tests__/seasonGuard.test.ts` — 10 tests (requireSeasonStatus: allowed/denied status, no season, team lookup, error forwarding)
- `server/src/features/auth/__tests__/routes.test.ts` — 16 tests (handleAuthHealth, handleGetMe, handleDevLogin)
- `server/src/features/auction/__tests__/routes.test.ts` — 23 tests (bid, finish, reset, init, position limits)
- `server/src/features/auction/__tests__/auctionPersistence.test.ts` — 8 tests (save/load/clear round-trip)
- `server/src/features/auction/__tests__/autoFinish.test.ts` — 3 tests (timer fire, cancel on pause, reset on bid)
- `server/src/features/trades/__tests__/routes.test.ts` — 13 tests (propose, vote, process)
- `server/src/features/waivers/__tests__/routes.test.ts` — 12 tests (submit, process, cancel)
- `server/src/__tests__/integration/auction-roster.test.ts` — 9 tests (finish→roster, budget deduction, queue)
- `server/src/__tests__/integration/auction-simulation.test.ts` — 29 tests (full auction lifecycle, queue rotation, completion)
- `server/src/__tests__/integration/trade-roster.test.ts` — 10 tests (player movement, budget, atomicity)
- `server/src/__tests__/integration/waiver-roster.test.ts` — 11 tests (FAAB ordering, budget, drop player)
- `server/src/features/seasons/__tests__/seasonService.test.ts` — 14 tests (transitions, auto-lock, validation)
- `server/src/features/seasons/__tests__/routes.test.ts` — 5 tests (router export, service integration)
- `server/src/features/commissioner/__tests__/CommissionerService.test.ts` — 7 tests
- `server/src/features/teams/__tests__/routes.test.ts` — 4 tests
- `server/src/__tests__/integration/transaction-claims.test.ts` — 25 tests
- `server/src/features/archive/__tests__/routes.test.ts` — 38 tests (seasons, standings, periods, stats, team update, stat update, sync, recalculate, search, AI, archive-current)
- `server/src/features/standings/__tests__/routes.test.ts` — 11 tests (period, category, season standings with live data)
- `server/src/features/players/__tests__/mlbSyncService.test.ts` — 9 tests (fetchAllTeams, fetchNLTeams, syncAllPlayers with team changes)
- `server/src/features/admin/__tests__/routes.test.ts` — 21 tests (league CRUD, members, import-rosters, reset, delete, team-codes, sync-mlb, sync-stats, audit-log)
- `server/src/features/keeper-prep/__tests__/routes.test.ts` — 8 tests (populate, status, roster, save, lock/unlock)
- `server/src/features/players/__tests__/routes.test.ts` — 16 tests (list/filter, detail, fielding, season-stats, period-stats, auction-values, transactions)
- `server/src/features/periods/__tests__/routes.test.ts` — 10 tests (list, create, update, delete with auth checks)
- `server/src/features/transactions/__tests__/routes.test.ts` — 8 tests (list, filter, paginate, claim by playerId/mlbId, drop)
- `server/src/features/franchises/__tests__/routes.test.ts` — 6 tests (list, detail, update settings)
- `server/src/features/auction/__tests__/retrospective.test.ts` — 11 tests (league stats, bargains/overpays, position spending, team efficiency)

**Client (187 tests):**
- `client/src/api/__tests__/base.test.ts` — 17 tests (toNum, fmt2, fmt3Avg, fmtRate, yyyyMmDd, addDays)
- `client/src/lib/__tests__/baseballUtils.test.ts` — 32 tests (POS_ORDER, POS_SCORE, getPrimaryPosition, sortByPosition, positionToSlots)
- `client/src/lib/__tests__/mlbStatus.test.ts` — 6 tests (isMlbIlStatus: real MLB API format `Injured N-Day` + legacy `Injured List N-Day` + non-IL rejects + malformed cases + case sensitivity; mirror of server `ilSlotGuard.test.ts`)
- `client/src/features/players/__tests__/PlayerDetailModal.test.tsx` — 14 tests (rendering, badges, stats, fielding)
- `client/src/features/standings/__tests__/StatsTables.test.tsx` — 22 tests (table rendering, sorting)
- `client/src/features/auction/__tests__/AuctionValues.test.tsx` — 10 tests (rendering, tabs, search, sorting, modal)
- `client/src/features/teams/__tests__/Teams.test.tsx` — 8 tests (team list, roster counts, links, empty/error states)
- `client/src/features/teams/__tests__/Team.test.tsx` — 9 tests (roster display, tabs, manage button, loading/error)
- `client/src/features/trades/__tests__/TradesPage.test.tsx` — 23 tests (trade list, actions, commissioner controls)
- `client/src/features/archive/__tests__/ArchivePage.test.tsx` — 16 tests (seasons, tabs, standings, draft results)
- `client/src/features/keeper-prep/__tests__/KeeperSelection.test.tsx` — 8 tests (rendering, budget, locked state)
- `client/src/features/periods/__tests__/Season.test.tsx` — 8 tests (standings matrix, period toggle)
- `client/src/features/commissioner/__tests__/Commissioner.test.tsx` — 8 tests (tabs, overview, phase badge)
- `client/src/features/transactions/__tests__/ActivityPage.test.tsx` — 6 tests (tabs, add/drop)
- `client/src/features/admin/__tests__/Admin.test.tsx` — 6 tests (admin access, non-admin denied)

**MCP (50 tests):**
- `mcp-servers/mlb-data/__tests__/cache.test.ts` — 8 tests (get/set/invalidate/TTL expiry/stats)
- `mcp-servers/mlb-data/__tests__/rateLimiter.test.ts` — 5 tests (token bucket, queue, rejection, metrics)
- `mcp-servers/mlb-data/__tests__/tools.test.ts` — 16 tests (all 8 tools with mocked MLB API responses)
- `mcp-servers/mlb-data/__tests__/integration.test.ts` — 21 tests (cache round-trip, rate limiter integration, tool registry, end-to-end scenarios)

### Running Tests
```bash
# All tests
npm run test

# Server tests only
npm run test:server

# Client tests only
npm run test:client

# Single feature (from server/ or client/)
npx vitest run src/features/auction/__tests__/

# Watch mode
npx vitest --watch
```

## Feedback Loop

### Purpose
Maintain a structured feedback loop between development sessions to ensure continuity, catch regressions, and improve code quality over time.

### Session Start Checklist
When starting a new session, review these items:
1. **Read `CLAUDE.md`** — confirms current architecture and conventions
2. **Check `FEEDBACK.md`** — review any open items from previous sessions
3. **Run `npm run test`** — verify all tests pass before making changes
4. **Run `git log --oneline -10`** — understand recent changes
5. **Check for open TODOs** — `grep -r "TODO\|FIXME\|HACK" server/src/ client/src/ --include="*.ts" --include="*.tsx" | head -20`

### Browser Verification (MANDATORY after every code change)
After ANY code change — before declaring "done" or moving to the next task:
1. **Open affected page** in Playwright browser
2. **Interact with the changed feature** — click, select, submit, not just look
3. **Verify persistence** — reload the page, confirm the change survived
4. **Check adjacent features** — if you changed position handling, verify dropdowns, sort, AND eligibility still work
5. **Check for cron/background job conflicts** — if the changed data is also modified by daily syncs, verify the sync won't overwrite your change

### Session End Checklist
Before ending a session:
1. **Run tests** — `npm run test` must pass
2. **Run builds** — `cd client && npx tsc --noEmit` and `cd server && npx tsc --noEmit`
3. **Browser smoke test** — open the app in Playwright, navigate to pages touched this session, verify no regressions
4. **Update `FEEDBACK.md`** — log what was done, what's pending, any concerns
5. **Update `CLAUDE.md`** — if architecture or conventions changed
6. **Commit with descriptive message** — include scope of changes

### FEEDBACK.md Format
```markdown
## Session [DATE]

### Completed
- [ item ]

### Pending / Next Steps
- [ item ]

### Concerns / Tech Debt
- [ item ]

### Test Results
- Server: X passing, Y failing
- Client: X passing, Y failing
```

### Continuous Improvement Signals
Track these metrics across sessions:
- **Test coverage trend** — are new features being tested?
- **Build errors** — are pre-existing TypeScript errors being resolved?
- **Cross-feature dependencies** — are they growing? Should modules be refactored?
- **Import path consistency** — all Prisma imports from `db/prisma.ts`, all routers named exports
- **Feature module completeness** — does each module have tests, proper index.ts, types?

## Custom Slash Commands

Located in `.claude/commands/`. Run from Claude Code with `/<name>`:

| Command | Description |
|---------|-------------|
| `/check` | Run all tests + TypeScript checks in parallel |
| `/db <query>` | Run a Prisma database query (natural language) |
| `/feature-test <name>` | Run server + client tests for a feature module |
| `/feature-overview <name>` | Show files, routes, imports, tests for a feature |
| `/smoke-test` | Hit all API endpoints and report status codes |
| `/test-new <feature>` | Write unit/integration/E2E tests for a new feature, run them, update `docs/TESTING.md` |
| `/test-run [e2e\|<feature>]` | Run tsc + unit/integration (~10s). Add `e2e` for Playwright suite |
| `/test-audit` | Scan test-infra gaps (pre-commit hook, contract testing, CI, etc.) and recommend next investment |
| `/doc [context]` | Synchronize all docs atomically — CLAUDE.md, FEEDBACK, `docs/*`, TODO — with drift detection |
| `/ship <feature-name>` | Meta: runs `/test-new` → `/doc` → tsc+tests → commit in one flow. Kebab-case name required |

All five `test-*` + `/doc` + `/ship` also live at `~/.claude/commands/` so they work in every project.

## MCP Servers

### MLB Data Proxy (`mcp-servers/mlb-data/`)

Local MCP server that acts as an intelligent caching proxy between FBST and the MLB Stats API (`statsapi.mlb.com`). Configured in `.mcp.json` at project root.

**Tools (8):**
| Tool | Description | Cache TTL |
|------|-------------|-----------|
| `get-player-info` | Player lookup by MLB ID | 24h |
| `get-player-stats` | Season hitting/pitching stats | 1h |
| `search-players` | Fuzzy name search | 1h |
| `get-team-roster` | 40-man or active roster | 6h |
| `get-mlb-standings` | Division standings | 15min |
| `get-mlb-schedule` | Game schedule by date | 5min |
| `sync-player-teams` | Batch player ID → team abbr mapping | 24h |
| `cache-status` | View/clear cache stats | — |

**Resources:** `mlb://teams` (all 30 MLB teams), `mlb://cache-stats`

**Architecture:**
- SQLite persistent cache via `better-sqlite3` (WAL mode)
- Token bucket rate limiter (10 req/s, burst 20, queue 50)
- Circuit breaker (opens after 5 failures, resets in 60s)
- **Shared cache**: Both MCP server and Express server read/write the same `mcp-servers/mlb-data/cache/mlb-data.db` via `server/src/lib/mlbCache.ts`
- Configurable DB path via `MLB_CACHE_PATH` env var

**Running:** Spawned automatically by Claude Code CLI via `.mcp.json`. For manual testing:
```bash
cd mcp-servers/mlb-data && npm run build && node dist/index.js
```

**Tests:** 50 tests (8 cache + 5 rate limiter + 16 tool tests + 21 integration tests)
```bash
cd mcp-servers/mlb-data && npx vitest run
```

**Detailed plan:** `docs/MCP-MLB-API-PLAN.md`

## AI Analysis System

### Architecture
- **Service**: `server/src/services/aiAnalysisService.ts` — all AI methods, model selection, prompt templates
- **Models**: Google Gemini 2.5 Flash (primary), Anthropic Claude Sonnet 4 (fallback)
- **Validation**: All LLM JSON responses validated with Zod schemas
- **Attribution**: All AI-generated content must show "Powered by Google Gemini & Anthropic Claude"

### AI Features (8 active)

| Feature | Trigger | Persistence | Location |
|---------|---------|-------------|----------|
| Draft Report | Manual (generate once) | `AuctionSession.state.draftReport` | `/draft-report` page |
| Live Bid Advice | On-demand during auction | In-memory cache per bid | Auction stage inline |
| Weekly Team Insights | Auto on Team page load | `AiInsight` table (weekly dedup) | Team page header |
| League Digest | Auto on Home page load | `AiInsight` table (weekly dedup) | Home page (with week tabs) |
| Trade of the Week Poll | Part of League Digest | Votes in `AiInsight.data` JSON | Home page (current week only) |
| Post-Trade Analysis | Fire-and-forget on processing | `Trade.aiAnalysis` JSON | Activity/Trades inline |
| Post-Waiver Analysis | Fire-and-forget on processing | `WaiverClaim.aiAnalysis` JSON | Activity inline |
| Keeper Recommendations | On-demand | In-memory cache | Keeper prep page |

### Data Sources for AI Prompts
- **Projected values**: `server/data/ogba_auction_values_2026.csv` (843 players with dollar values)
- **Roster data**: Prisma queries (player names, positions, prices, MLB teams, keeper status via `source` field)
- **Auction log**: `AuctionSession.state.log` (WIN events with timestamps, prices, team assignments)
- **League context**: NL-only/AL-only/Mixed from league rules, budget caps, roster sizes

### Prompt Guidelines
- Always include NL-only context when applicable (player scarcity)
- Discount injury-prone players by 15-30% in projections
- Apply ~5% uncertainty discount on all stat projections
- Use "Waiver Budget" instead of "FAAB" in user-facing content
- Grade on value efficiency (surplus), not just star power

### League Digest Rules
- **NO auction prices, draft costs, or budget amounts** in weekly digests — focus on performance only
- Week 1 digest (post-draft) is the ONLY exception — it may discuss auction results and team grades for the draft
- All subsequent weekly digests must be stats-focused: real category standings, player availability, who played vs who didn't
- Trade of the Week must NEVER include keeper players — keepers are untouchable
- Power rankings must correlate with actual standings data
- Digest sections: weekInOneSentence, powerRankings, hotTeam, coldTeam, statOfTheWeek, categoryMovers, proposedTrade, boldPrediction
- Past digests are browsable via week tabs on the Home page; votes are read-only on past weeks

## Coding Guidelines
- **SOLID Principles**: Single Responsibility, Open-Closed, Liskov Substitution, Interface Segregation, Dependency Inversion
- **DRY**: Extract common logic into reusable functions/modules
- **KISS**: Strive for simplicity — avoid over-engineering
- **Clean Code**: Readable, self-documenting code with meaningful names
- **Error Handling**: Robust error handling with structured logging via `logger`
- **Performance**: Optimize where necessary, prioritize readability
