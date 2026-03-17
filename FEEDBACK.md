# The Fantastic Leagues — Development Feedback Log

This file tracks session-over-session progress, pending work, and concerns. Review at the start of each session.

---

## Session 2026-03-17 (Session 21) — Complete Tech Debt, Client Tests, 6-Agent Code Review

### Completed
- **All remaining TODO items completed** (TD-Q07, TD-T09–T13, TD-M01, TD-M02, TD-M04):
  - TD-Q07: Audited `: any` annotations — fixed 8 high-priority files
  - TD-T09: AuctionValues client tests (10 tests)
  - TD-T10: TradesPage client tests (23 tests)
  - TD-T11: Teams/Team client tests (17 tests)
  - TD-T12: ArchivePage client tests (16 tests)
  - TD-T13: Remaining modules — KeeperSelection (8), Season (8), Commissioner (8), ActivityPage (6), Admin (6)
  - TD-M01: Deleted 29 one-off scripts (67→39 files)
  - TD-M02: Consolidated 15 scripts into 6 parameterized utilities (39→30 files)
  - TD-M04: Archive matrix optimization — new standings-matrix endpoint (N+1 → 1 query)
- **6-agent code review** (PR #37 — 15 findings, all resolved):
  - Security: Mermaid `securityLevel` hardened, `endAuction` wrapped in `$transaction`, budget floor check added
  - DRY: Deduplicated roto scoring in archiveStatsService (3 copies → 1, -100 LOC)
  - Type safety: Fixed double-casts in teamService, `as any` in new code, error handler typed as `unknown`
  - Cleanup: Shared `parseYear()`, `OPENING_DAYS` to sportConfig, dead test code removed, MLB naming standardized

### Pending / Next Steps
- TD-Q03: auction/routes.ts extraction (intentionally deferred — 844 LOC stateful system, 72 tests)
- No other tech debt items remain

### Test Results
- Server: 32 files, 428 tests passing
- Client: 14 files, 187 tests passing
- Total: 615 tests, all green
- TypeScript: clean compile (both client and server)

---

## Session 2026-03-16 (Session 20) — Tech Debt Cleanup, Tech Page Expansion, Test Coverage

### Completed
- **Service extraction**:
  - TD-Q01: Extracted `autoMatchPlayersForYear` + `calculateCumulativePeriodResults` from `archive/routes.ts` into `archiveStatsService.ts` (992→~800 LOC)
  - TD-Q02: Extracted `endAuction` + `executeTrade` from `commissioner/routes.ts` into `CommissionerService.ts` (877→779 LOC)
  - TD-Q03: Deferred — auction/routes.ts (844 LOC) is tightly coupled stateful system with 72 tests; extraction risk outweighs benefit
- **Type safety**:
  - TD-Q06: Typed `archiveImportService.ts` — added `StandardizedPlayerRow`, `StandingsRowObj`, `PlayerKnowledge`, `FuzzyEntry` interfaces; replaced `any` accumulators with typed maps; CSV records typed as `Record<string, string>`; fixed `catch (err: any)` → `unknown`
- **Infrastructure**:
  - TD-I02: Audited all 17 feature modules — all async handlers wrapped with `asyncHandler()`. Sync-only handlers correctly omit it.
  - TD-I03: Zero circular deps — extracted auction types (`AuctionStatus`, `AuctionTeam`, `NominationState`, `AuctionLogEvent`, `AuctionState`) to `auction/types.ts`, breaking routes↔services cycle. Verified with madge.
  - TD-M03: Migrated 8 production files from `console.*` to structured `logger` — `data/` modules, archive services, `supabase.ts`. Scripts (67 files) left as-is.
- **Test coverage** (116 new server tests):
  - TD-T01: `archive/routes.ts` — 38 tests
  - TD-T02: `admin/routes.ts` — 19 tests
  - TD-T03: `roster/routes.ts` + `rosterImport-routes.ts` — 14 tests
  - TD-T04: `keeper-prep/routes.ts` — 8 tests
  - TD-T05: `players/routes.ts` — 13 tests
  - TD-T06: `periods/routes.ts` — 10 tests
  - TD-T07: `transactions/routes.ts` — 8 tests
  - TD-T08: `franchises/routes.ts` — 6 tests
- **Tech page expansion** (`client/src/pages/Tech.tsx`):
  - Added Genesis section (origin story of the 2004 fantasy league)
  - Added AI Development Workflow section (5 cards: CLAUDE.md, session structure, FEEDBACK.md, directing vs delegating, terminal-only)
  - Architecture Overview with Mermaid.js flowchart (Browser → Express → PostgreSQL with Supabase Auth, WebSocket, MLB Stats API, Google Gemini)
  - Expanded Build Journal timeline with visual dot indicators
  - Lessons Learned section (5 insights about AI-assisted development)
  - Created reusable `MermaidDiagram.tsx` component (dark/light theme aware)
  - ERD section with Mermaid entity-relationship diagrams (collapsible by domain)
  - Updated stats: tests 397→513, tokens 60M→65M, feature modules 16→17

### Pending / Next Steps
- TD-Q07: Audit remaining 80+ files with `: any` annotations
- TD-T09–T13: Client-side test coverage (auction, trades, teams, archive, etc.)
- TD-M01/M02: Scripts cleanup/consolidation (67 files)
- TD-M04: Archive backend optimization TODO

### Test Results
- Server: 32 files, 428 tests passing
- Client: 4 files, 85 tests passing
- Total: 513 tests, all green
- TypeScript: clean compile (both client and server)

---

## Session 2026-03-16 (Session 19) — Season-Aware Feature Gating & Code Quality

### Completed
- **Season-Aware Feature Gating** (TD-F01–F06, complete):
  - Added `seasonStatus` to `LeagueContext` (fetches current season on league change)
  - Created `useSeasonGating()` hook — returns `canAuction`, `canTrade`, `canWaiver`, `canEditRules`, `canEditRosters`, `canKeepers`, `isReadOnly`, `phaseGuidance`
  - Commissioner tab gating — disabled tabs with tooltips based on season status
  - Phase guidance bar — color-coded status badge + actionable guidance text
  - AppShell nav gating — Auction nav item hidden when not in DRAFT phase
  - Server-side `requireSeasonStatus` middleware — auction nominate/bid (DRAFT), trade propose (IN_SEASON), waiver submit (IN_SEASON)
- **Code quality fixes**:
  - TD-Q08: Consolidated `playerDisplay.ts` → `sportConfig.ts` (moved `normalizePosition`, `getMlbTeamAbbr`, deleted dead `getGrandSlams`/`getShutouts`)
  - TD-Q09: Removed orphaned period APIs from `leagues/api.ts`
  - TD-Q10+Q11: Added `seasons/api` + `waivers/api` to barrel exports
  - TD-Q04: Typed `isPitcher`, `normalizePosition`, `getMlbTeamAbbr` (removed `any`)
  - TD-Q05+M05: Typed `LeagueTradeCard` trade prop as `TradeProposal`
  - TD-I01: `adminDeleteLeague` type mismatch confirmed already resolved

### Pending / Next Steps
- (Addressed in Session 20)

### Test Results
- Server: 23 files, 312 tests passing
- Client: 4 files, 85 tests passing
- Total: 397 tests, all green
- TypeScript: clean compile (both client and server)

---

## Session 2026-03-16 (Session 18) — Commissioner Tab Cleanup & Tech Debt Audit

### Completed
- **PR #33 — Commissioner tab cleanup**:
  - Merged two redundant season creation forms into one unified flow on Season tab
  - Removed duplicate period management from Controls tab (now only on Season tab)
  - Renamed Controls tab → Auction (only auction timer + End Auction remain)
  - Fixed stale leagueId validation in LeagueContext (auto-fallback when stored ID is invalid)
  - Added `scripts/fix-memberships.ts` utility
- **Tech debt audit** — comprehensive codebase analysis covering test coverage, type safety, code quality, and maintenance
- **TODO.md created** — documented all tech debt items + Season-Aware Feature Gating feature design (lifecycle matrix, implementation plan with breadcrumb guidance)

### Pending / Next Steps
- Implement Season-Aware Feature Gating (TD-F01 through TD-F06) — see TODO.md
- Test coverage for untested modules (8 server, 10 client)
- Extract oversized route files into services (archive, commissioner, auction)

### Test Results
- Server: 22 files, 302 tests passing
- Client: 4 files, 85 tests passing
- Total: 387 tests, all green
- TypeScript: clean compile

---

## Session 2026-03-15 (Session 17) — Phase 3: Franchise Schema Refactor

### Completed
- **Franchise parent table** — Added `Franchise` and `FranchiseMembership` models to Prisma schema as org-level parent above `League`
- **Two-phase migration** — Additive nullable `franchiseId` column → data migration → non-nullable constraint
- **Data migration script** (`scripts/migrate-franchises.ts`) — Creates franchise per distinct League name, links leagues, deduplicates memberships
- **Franchise fix script** (`scripts/fix-franchise-names.ts`) — Merges year-suffixed franchise names (e.g., "OGBA 2025" + "OGBA 2026" → "OGBA")
- **Franchise routes** (`server/src/features/franchises/`) — GET list, GET detail, PATCH settings (3 endpoints)
- **Franchise-aware auth** — `requireFranchiseCommissioner()` middleware in `server/src/middleware/auth.ts`
- **CommissionerService** — `createLeague()` resolves/creates Franchise, links new leagues, creates FranchiseMembership for creator
- **addMember() + addTeamOwner()** — Now upsert `FranchiseMembership` alongside `LeagueMembership`
- **Keeper prep** — Prior season lookup uses `franchiseId` FK instead of string name match
- **League routes** — Include `franchiseId` in response; invite code join creates both FranchiseMembership + LeagueMembership
- **Auth /me** — Returns `franchiseMemberships` array in user response
- **Client types** — Added `FranchiseSummary`, `FranchiseMembership`, `franchiseId` to `LeagueSummary`
- **LeagueContext** — Groups seasons by `franchiseId` (with name fallback)
- **AppShell** — Season switcher groups by `franchiseId`
- **Security fixes (P1)** — Explicit `select` clauses exclude `inviteCode` from franchise responses; FK cascade fixed (SET NULL → RESTRICT on NOT NULL column)
- **Performance (P2)** — Added `@@index([userId])` and `@@index([franchiseId])` on `FranchiseMembership`
- **Documentation** — Updated CLAUDE.md (feature count, models, cross-feature deps, middleware)

### Pending / Next Steps
- Deploy and run data migration on production
- Verify franchise grouping in UI with real data
- Manual browser testing of season switcher, invite flow, commissioner settings

### Test Results
- Server: 22 files, 302 tests passing
- Client: 4 files, 85 tests passing
- Total: 387 tests, all green
- TypeScript: server clean; client has 1 pre-existing error (adminDeleteLeague)

---

## Session 2026-03-15 (Session 16) — Auction Production Hardening & E2E Testing

### Completed
- **Auction production readiness** (Phase 1-3 from plan):
  - **DB persistence**: `AuctionSession` model + `auctionPersistence.ts` service — state survives server restart
  - **Server-side auto-finish timer**: `setTimeout` on server replaces client-side timer dependency
  - **Nomination guard**: prevents nominating already-rostered players
  - **Concurrent finish protection**: per-league lock flag prevents double-finish races
  - **League rules integration**: budget/roster config read from `LeagueRule` instead of hardcoded
  - **Undo-finish**: commissioner can reverse last pick (admin-only)
  - **Auction completion detection**: auto-detects when all rosters full
  - **Nomination timer auto-skip**: 30s timer advances queue if team doesn't nominate
- **Bug fixes found via E2E testing**:
  - **Position limit enforcement moved from nomination to bid** — nominations are now unrestricted (any team can nominate any player for others to bid on); per-position limits (C:2, OF:5, etc.) not enforced during auction (only pitcher/hitter totals: 9P/14H)
  - **Queue skipping for full teams** — added `advanceQueue()` helper that skips full teams during queue rotation; prevents auction from stalling when teams fill at different rates
  - **Client Nom button always visible** — changed from blocking ("Full") to visual hint (dimmed button with tooltip) when position is full for your team
- **E2E auction test** (168 assertions, all pass):
  - `setup-auction-test.ts` — automated test data setup (owners, memberships, rosters, keepers, season)
  - `auction-e2e-test.ts` — full 152-pick auction simulation via API (init, nominate, bid, finish, pause/resume, undo, reset, completion)
- **Player values data**: Added 2026 player values CSV
- **Documentation**: Updated CLAUDE.md (test counts, auction tests), Tech.tsx stats, FEEDBACK.md

### Pending / Next Steps
- Manual browser testing before 3/22 auction (multi-tab, WS sync)
- Deploy to Render and test on production
- Verify 2026 player values loaded for auction player pool

### Test Results
- Server: 22 files, 302 tests passing
- Client: 4 files, 85 tests passing
- Total: 387 tests, all green
- TypeScript: clean (both client and server)
- E2E auction: 168 assertions, all green

---

## Session 2026-03-14 (Session 15) — Home Page Fix, Fielding Stats, OF Position Mapping

### Completed
- **PR #22 — Home page + Season tab fixes**:
  - Fixed Home page showing empty roster (was defaulting to league 2 which has no 2025 roster data)
  - Added league selector dropdown for users with multiple memberships
  - Removed `$` cost display from Season standings expanded roster (only needed for auction/archive)
- **PR #23 — Fielding stats in PlayerDetailModal**:
  - Added "Fielding — Games by Position" section to PlayerDetailModal
  - Created `getPlayerFieldingStats()` in `players/api.ts` using MLB Stats API fielding endpoint
  - Added `lastCompletedSeason()` helper — returns prior year before April (fixes season=2026 bug)
  - Added `cached()` wrapper with 5-minute TTL for MLB API calls
  - Fixed 5 failing PlayerDetailModal tests (added `getPlayerFieldingStats` mock)
- **PR #24 — Outfield position mapping (league setting)**:
  - Added `outfield_mode` league rule (`"OF"` or `"LF/CF/RF"`)
  - Created `LeagueContext` (`client/src/contexts/LeagueContext.tsx`) for app-wide league settings
  - Created `mapPosition()` utility in `client/src/lib/sportConfig.ts` — display-time RF/CF/LF → OF mapping
  - Added outfield mode select to `RulesEditor` (commissioner settings)
  - Server: league detail endpoint returns `outfieldMode` from league rules
  - Applied position mapping to: Home page roster, Season standings, Team page roster
  - Updated `server/src/lib/sportConfig.ts` DEFAULT_RULES with `outfield_mode`
- **Documentation**: Updated CLAUDE.md (test counts, shared infrastructure, cross-feature deps)

### Pending / Next Steps
- (none identified)

### Test Results
- Server: 20 files, 289 tests passing
- Client: 4 files, 85 tests passing
- Total: 374 tests, all green
- TypeScript: clean (both client and server)

---

## Session 2026-03-13 (Session 14) — Data Fixes & Migration Sync

### Completed
- **Unmatched players resolved**: Ran `scripts/fix-unmatched-2025.ts` — only 1 player remaining ("J. Deyer"), identified as Jack Dreyer (MLB ID 676263) via typo correction. Updated script. All 1,305 2025 archive player-stat rows now matched (0 unmatched).
- **Archive sync re-run**: `POST /api/archive/2025/sync` — updated 1,252 player records with MLB stats.
- **Prisma migration drift fixed**:
  - 2 migrations already applied to DB but untracked (`remove_viewer_role`, `add_player_stats_period`) — marked as applied via `prisma migrate resolve`
  - 2 migrations not yet applied (`add_cancelled_claim_status`, `add_league_invite_code`) — deployed via `prisma migrate deploy`
  - `prisma migrate status` now reports "Database schema is up to date!"
- **PlayerDetailModal act() warnings fixed**:
  - Added `isVisible` guard to data-fetch useEffect in `PlayerDetailModal.tsx` — prevents API calls when modal is hidden
  - Added `await waitFor` in 6 test cases to properly await async state updates
  - Zero act() warnings in test output now

### Pending / Next Steps
- (none identified)

### Test Results
- Server: 20 files, 289 tests passing
- Client: 4 files, 85 tests passing
- Total: 374 tests, all green
- TypeScript: clean (both client and server)
- Zero act() warnings

---

## Session 2026-03-12 (Session 13) — Cleanup & Hardening

### Completed
- **Zod validation gaps**: Added `validateBody` schemas to `POST /commissioner/:leagueId/end-auction` (empty schema), `POST /admin/sync-mlb-players` (season schema), `POST /admin/league/:leagueId/reset-rosters` (empty schema). Import-rosters uses `express.text()` with existing string validation — left as-is.
- **Trade ownership hardening**: Added self-accept prevention in `assertCounterpartyAccess()` — proposers who co-own a counterparty team can no longer accept/reject their own trades.
- **Waiver DELETE hardening** (5 fixes):
  1. Added `CANCELLED` to `ClaimStatus` enum (migration `20260312000000_add_cancelled_claim_status`)
  2. Status guard: only `PENDING` claims can be cancelled
  3. Soft-cancel: changed from `prisma.waiverClaim.delete()` to `.update({ status: "CANCELLED" })`
  4. Commissioner bypass: commissioners of the claim's league can cancel claims
  5. Audit trail: added `writeAuditLog("WAIVER_CANCEL", ...)` call
- **Unmatched players script**: Created `scripts/fix-unmatched-2025.ts` with smarter name parsing (reversed formats, multi-word last names, no-dot names) and broader MLB API search. Script ready to run.
- **Stale worktrees**: Already clean (only `.DS_Store` in `.claude/worktrees/`)

### Pending / Next Steps
- Run `scripts/fix-unmatched-2025.ts` to resolve 46 unmatched 2025 archive players
- After script, re-run sync: `POST /api/archive/2025/sync`
- Address Prisma migration drift (DB schema is ahead of migration history)

### Concerns / Tech Debt
- Prisma migration history is significantly drifted from the actual DB — many tables/columns were added directly. Consider a baseline migration reset.
- PlayerDetailModal tests have `act(...)` warnings (pre-existing)

### Test Results
- Server: 20 files, 289 tests passing
- Client: 4 files, 85 tests passing
- Total: 374 tests, all green
- TypeScript: clean (both client and server)

---

## Session 2026-03-07 (Session 12) — Mobile-Ready + Light/Dark Mode

### Completed
- **Phase 1: Theme Infrastructure** (4 files):
  - `index.html` — added `color-scheme` and `theme-color` meta tags for browser awareness
  - `ThemeContext.tsx` — system preference detection (`prefers-color-scheme`), dynamic `theme-color` meta sync
  - `index.css` — `color-scheme: light`/`dark` declarations, `.scroll-hint` utility class
  - `PageHeader.tsx` — responsive sizing (`text-2xl md:text-3xl`, `py-4 md:py-8`)
- **Phase 2: Light Mode Color Fixes** (~25 files):
  - Replaced ~169 `text-white`, ~40 `bg-slate-*`/`bg-gray-*`, ~52 `text-white/XX` with `--lg-*` tokens
  - Files: RosterControls, KeeperPrepDashboard, RosterImport (removed `useTheme`), CommissionerKeeperManager, RosterGrid, AddDropTab, ArchiveAdminPanel, TradesPage, TradeAssetSelector, TeamRosterView, TeamRosterManager, RosterManagementForm (removed `useTheme`), AuctionStage, ContextDeck, PlayerPoolTab, Period, KeeperSelection, AppShell, Players, Standings, AuctionValues, Leagues, Commissioner
  - Kept `text-white` only on accent/opaque backgrounds (buttons, auth hero)
- **Phase 3: Mobile Responsiveness** (16+ page files):
  - All page containers: `px-6 py-10` → `px-4 py-6 md:px-6 md:py-10`
  - Card padding: `p-8`/`p-10` → `p-4 md:p-8`/`p-4 md:p-10`
  - Gap reduction: `gap-6` → `gap-3 md:gap-6`, `space-y-12` → `space-y-6 md:space-y-12`
  - Players filter bar: `grid grid-cols-2 md:flex`
  - TradesPage: `grid-cols-1 md:grid-cols-2`
  - KeeperSelection: `grid-cols-1 sm:grid-cols-3`

### Verification
- TypeScript: 0 errors (`npx tsc --noEmit`)
- Client tests: 70/70 passing
- `grep -r "bg-slate-\|bg-gray-[0-9]"` → 0 results
- Remaining `text-white` only on accent/opaque backgrounds

### Test Results
- Server: 15 files, 207 tests passing
- Client: 4 files, 70 tests passing
- Total: 277 tests, all green

---

## Session 2026-03-06 (Session 11) — Complete All Pending P2 & P3 Todos

### Completed
- **`024` asyncHandler migration** — wrapped ~50 remaining async route handlers in `asyncHandler()` across 7 files:
  - `commissioner/routes.ts` (19 handlers): 12 had 500 catches removed, 7 kept 400 business logic catches
  - `archive/routes.ts` (20 handlers): all 500 catches removed
  - `leagues/routes.ts` (5 handlers): all 500 catches removed
  - `keeper-prep/routes.ts` (6 handlers): 4 had 500 catches removed, 2 kept 400 catches
  - `admin/routes.ts` (2 handlers): kept 400 catches, wrapped in asyncHandler
  - `players/routes.ts` (2 handlers): had NO error handling, now wrapped in asyncHandler
  - `routes/public.ts` (2 handlers): 500 catches removed (bonus, not in original plan)
- **`045` waivers/api.ts** — created typed client API file with 4 functions: `getWaiverClaims`, `submitWaiverClaim`, `cancelWaiverClaim`, `processWaiverClaims`
- **Todo file renames** — 16 todo files renamed from `*-pending-*` to `*-complete-*` (14 previously completed + 2 newly completed)
- **Zero unprotected async handlers** remaining in all route files (verified via grep)

### Remaining Pending Todos (out of scope)
- `001` — Hardcoded DB credentials (needs Neon password rotation)
- `027` — Zod validation for commissioner/admin (already partially done via `validateBody`)

### Test Results
- Server: 15 files, 207 tests passing
- Client: 4 files, 70 tests passing
- Total: 277 tests, all green
- TypeScript: server compiles clean; client has 1 pre-existing error in AuthProvider.tsx

---

## Session 2026-03-05 (Session 10) — P3 Cleanup, Testing, Shared Components, Audit Logging

### Completed
- **`011` AppShell cleanup** — removed duplicate auth state (`me`, `loading`, `refreshAuth()`) — now uses `useAuth()` from AuthProvider. Removed YAGNI sidebar resize (sidebarWidth/isResizing/drag handler). Uses fixed `w-60` class.
- **`012` RulesEditor derive grouped** — removed `grouped` state, replaced with `useMemo(() => rules.reduce(...))`. Removed `setGrouped()` calls in fetch effect and handleSave.
- **`013` Commissioner design tokens** — replaced all hardcoded `text-white`, `text-white/50-80`, `bg-slate-950/60`, `bg-black/20` with design tokens (`--lg-text-primary`, `--lg-text-muted`, `--lg-text-heading`, `--lg-bg-surface`, `--lg-glass-bg`). Active tab: `bg-[var(--lg-accent)] text-white`. Kept semantic red/amber colors.
- **`014` parseIntParam move** — moved function from `middleware/auth.ts` to `lib/utils.ts`. Moved 7 tests from auth.test.ts to utils.test.ts. No other files imported it from auth.
- **Auth handler extraction** — extracted `handleAuthHealth`, `handleGetMe`, `handleDevLogin` as named exported functions in auth/routes.ts. Created 12 unit tests in auth/__tests__/routes.test.ts.
- **Integration tests** — created 3 files in `server/src/__tests__/integration/`:
  - `auction-roster.test.ts` (9 tests): finish→roster, budget deduction, queue advancement, reset
  - `trade-roster.test.ts` (10 tests): player movement, budget, mixed items, status guards, atomicity
  - `waiver-roster.test.ts` (11 tests): FAAB ordering, budget, drop player, $0 claims, atomicity
- **Shared component extraction** — moved `PlayerDetailModal` and `StatsTables` to `client/src/components/`. Updated cross-feature imports (teams, auction, archive, periods). Original files re-export for backwards compat within their feature.
- **Audit logging** — `writeAuditLog()` utility in `server/src/lib/auditLog.ts`. Instrumented 15+ admin/commissioner actions (TEAM_CREATE, TEAM_DELETE, MEMBER_ADD, OWNER_ADD/REMOVE, ROSTER_ASSIGN/RELEASE/IMPORT, AUCTION_FINISH/END, RULES_UPDATE, LEAGUE_CREATE). Fire-and-forget pattern.
- **CLAUDE.md updated** — test coverage section (272 tests), shared infra (auditLog.ts, PlayerDetailModal, StatsTables), cross-feature deps updated.

### Pending / Next Steps
- [ ] Rotate Neon DB password (credentials were in git history)
- [ ] Commit and create PR for Sessions 8–10 changes
- [ ] Clean up 14+ stale worktrees in `.claude/worktrees/`
- [ ] Visual QA: verify Commissioner page design tokens in light/dark mode

### Test Results
- Server: 14 files, 202 tests passing
- Client: 4 files, 70 tests passing
- Total: 272 tests, all green
- TypeScript: both server + client compile clean (`tsc --noEmit`)

---

## Session 2026-03-05 (Session 9) — P2 Code Quality

### Completed
- **`005` Type standings service** — replaced all `any` types with proper interfaces (`CsvPlayerRow`, `TeamStatRow`, `CategoryRow`, `StandingsRow`, `SeasonStandingsRow`). Zero `any` in standingsService.ts and routes.ts.
- **`006` Cache standings computation** — added `getCachedStandings()` to DataService with a `Map<string, unknown>` cache that clears on data reload. All 3 standings endpoints now cache results.
- **`007` Complete auth migration** — migrated 6 files from raw `fetch()` to `fetchJsonApi`/`fetchWithAuth`:
  - `AIInsightsModal.tsx` — JSON → `fetchJsonApi`
  - `Standings.tsx` — JSON → `fetchJsonApi`
  - `ArchiveAdminPanel.tsx` — 5 calls: 1 multipart → `fetchWithAuth`, 4 JSON → `fetchJsonApi`; removed `getToken()` helper and `supabase` import
  - `RosterImport.tsx` — multipart → `fetchWithAuth`; removed `supabase` import
  - `RosterControls.tsx` — multipart → `fetchWithAuth`; removed `supabase` import
  - `AuthProvider.tsx` — JSON → `fetchJsonApi`; simplified `fetchMe()` to 2 lines
  - Created `fetchWithAuth()` helper in `api/base.ts` for multipart uploads
- **`008` Fix test files** — tests now import real source code instead of re-implementing:
  - `auction/routes.test.ts` — imports `calculateMaxBid` + types from `routes.ts` (exported `calculateMaxBid`)
  - `trades/routes.test.ts` — imports `tradeItemSchema` + `tradeProposalSchema` from `routes.ts` (exported both)
  - `waivers/routes.test.ts` — imports `waiverClaimSchema` from `routes.ts` (exported it)
  - Fixed vi.mock hoisting issues (inline factory pattern, `__mockTx` accessor)
  - Auth tests left as-is (handler logic is anonymous, would need service extraction)
- **`009` Document cross-feature deps** — added 3 new imports to CLAUDE.md:
  - Server: `standings/routes.ts` → `players/services/dataService`
  - Server: `transactions/routes.ts` → `players/services/dataService`
  - Client: `commissioner/pages/Commissioner` → `leagues/components/RulesEditor`

### Pending / Next Steps (for Session 10+)
- [ ] `011`–`014` — P3 cleanup (AppShell, RulesEditor, Commissioner tokens, parseIntParam)
- [ ] Rotate Neon DB password (credentials were in git history)
- [ ] Commit and create PR for Session 8 + 9 changes
- [ ] Extract auth route handler logic into named functions (for proper unit testing)
- [ ] Integration tests (auction→roster, trade→roster, etc.)

### Test Results
- Server: 11 files, 168 tests passing
- Client: 4 files, 70 tests passing
- Total: 238 tests, all green
- TypeScript: both server + client compile clean

---

## Session 2026-03-05 (Session 8) — P0 Security Fixes

### Completed
- **`001` Hardcoded credentials** — deleted `fix_2025_auction_values.js` and `get_league_id.js` (contained Neon DB password)
- **`002` Archive auth** — added `requireAuth` to all 11 GET endpoints, `requireAuth + requireAdmin` to all 8 write endpoints (POST/PUT/PATCH)
- **`002b` Roster import auth** — added `requireAuth + requireAdmin` to POST `/import`; template GET left public
- **`003` Auction ownership** — added `requireTeamOwner("nominatorTeamId")` to nominate, `requireTeamOwner("bidderTeamId")` to bid
- **`004` Roster ownership** — inline `isTeamOwner()` check on POST `/add-player` and DELETE `/:id` (lookup team by code). Admins bypass.
- **`010` Waivers info disclosure** — GET without `teamId` now scoped to user's own teams (via `Team.ownerUserId` + `TeamOwnership`). With `teamId`, verifies ownership. Admins see all.
- **IDOR — Teams** — GET `/api/teams` scoped to user's league memberships. With `leagueId` query param, verifies membership.
- **IDOR — Transactions** — `leagueId` now required + `requireLeagueMember("leagueId")` middleware added.
- **Smoke tested** all 30+ endpoints: unauthed → 401, authed → correct scoping

### Pending / Next Steps (for Session 9+)
- [ ] `005` — Type standings service (replace `any[]` with proper interfaces)
- [ ] `006` — Cache standings computation
- [ ] `007` — Complete auth migration (~6 client files still use raw `fetch()`)
- [ ] `008` — Fix test files testing copied logic (~550 LOC)
- [ ] `009` — Document 3 undocumented cross-feature dependencies
- [ ] `011`–`014` — P3 cleanup (AppShell, RulesEditor, Commissioner tokens, parseIntParam)
- [ ] Rotate Neon DB password (credentials were in git history)
- [ ] Commit and create PR for this session's changes

### Test Results
- Server: 11 files, 168 tests passing
- Client: 4 files, 70 tests passing
- Total: 238 tests, all green
- TypeScript: both server + client compile clean
- Manual smoke: 30+ endpoints tested (unauthed + authed)

---

## Session 2026-03-05 (Session 7)

### Completed
- **PR #12 merged to main** — auth fix, port change, standings CSV, guide cleanup (57 files, +3524 -1016)
- **Port change**: FBST Express API moved from 4001 → 4002 (avoids conflict with FSVP Pro)
- **Standings fix**: Routes compute from CSV data (DataService) instead of empty DB tables
- **Scripts security**: Removed hardcoded OAuth secrets from shell scripts; now source from `server/.env`
- **6-agent code review** completed: Security, Performance, Architecture, TypeScript, Pattern, Simplicity

### Code Review Findings (14 total)

**P1 — Critical (4):**
- [x] `001` — Hardcoded production DB credentials — **fixed Session 8**
- [x] `002` — Archive routes + roster import missing auth — **fixed Session 8**
- [x] `003` — Auction nominate/bid no ownership check — **fixed Session 8**
- [x] `004` — Roster add/delete missing ownership checks — **fixed Session 8**

**P2 — Important (6):**
- [x] `005` — Pervasive `any` types in standings service — **fixed Session 9**
- [x] `006` — Cache standings computation — **fixed Session 9**
- [x] `007` — ~6 client files still use raw `fetch()` — **fixed Session 9**
- [x] `008` — Test files test copied logic — **fixed Session 9**
- [x] `009` — 3 undocumented cross-feature dependencies — **fixed Session 9**
- [x] `010` — Waivers GET info leak — **fixed Session 8**

**P3 — Nice-to-Have (4):**
- [x] `011` — AppShell duplicates auth state + YAGNI sidebar resize — **fixed Session 10**
- [x] `012` — RulesEditor: derive `grouped` with useMemo — **fixed Session 10**
- [x] `013` — Commissioner page uses hardcoded colors, not design tokens — **fixed Session 10**
- [x] `014` — `parseIntParam` belongs in utils.ts, not auth.ts — **fixed Session 10**

### Test Results
- Server: 11 files, 168 tests passing
- Client: 4 files, 70 tests passing
- Total: 238 tests, all green

---

## Session 2026-03-04 (Session 6)

### Completed
- **P2 — Test Coverage** (125 new tests, 228 total):
  - **New middleware tests** (35 tests across 3 files):
    - `middleware/__tests__/validate.test.ts` — 7 tests (valid/invalid input, type errors, null body, multiple errors)
    - `middleware/__tests__/asyncHandler.test.ts` — 4 tests (success, rejection forwarding, sync error wrapping)
    - `middleware/__tests__/authExtended.test.ts` — 24 tests (attachUser: 5, requireLeagueRole: 5, requireCommissionerOrAdmin: 5, isTeamOwner: 4, requireTeamOwner: 5)
  - **Auth routes** — `features/auth/__tests__/routes.test.ts` — 8 tests (health check, /me session lookup, /me DB user, /me error, dev-login gating, dev-login admin lookup, dev-login credentials)
  - **Trades routes** — `features/trades/__tests__/routes.test.ts` — 13 tests (schema validation: 6, propose, list, accept, reject, process rejection, player trade processing, budget trade processing)
  - **Waivers routes** — `features/waivers/__tests__/routes.test.ts` — 12 tests (schema: 5, list: 2, submit, delete, process FAAB: highest bidder wins, budget insufficient, drop player processing)
  - **Auction routes** — `features/auction/__tests__/routes.test.ts` — 21 tests (calculateMaxBid: 6, state transitions: 3, bidding: 5, pause/resume: 2, finish DB: 2, reset: 2, refreshTeams: 1)
  - **Client StatsTables** — `features/standings/__tests__/StatsTables.test.tsx` — 22 tests (PeriodSummaryTable: 5, CategoryPeriodTable: 3, SeasonTable: 4, TeamSeasonSummaryTable: 3, HittersTable: 3, PitchersTable: 4)
  - **Client PlayerDetailModal** — `features/players/__tests__/PlayerDetailModal.test.tsx` — 14 tests (null/closed states, rendering, API fetch, loading, recent/career stats, overlay close, Escape key, profile tab, error state, pitcher badge)
- **Bugfix**: Fixed `validate.ts` — `result.error.errors` → `result.error.issues` (Zod v4 API change)

### Pending / Next Steps
- [ ] IDOR protection — league-scoped queries should filter by user's memberships
- [ ] Audit logging — log admin/commissioner actions to AuditLog table
- [ ] Trade accept/reject ownership check — currently any authed user can accept/reject
- [ ] Waiver delete ownership check — any authed user can cancel anyone's claim
- [ ] Extract `PlayerDetailModal` and `StatsTables` to shared components

### Concerns / Tech Debt
- **Trade accept/reject**: still no ownership check — any authenticated user can accept/reject any trade
- **Waiver DELETE**: no ownership check — any authed user can cancel anyone's claim
- **Auction routes**: no auth middleware at all — significant security gap
- **PlayerDetailModal tests**: React act() warnings from async state updates (non-blocking, cosmetic)

### Test Results
- Server: 11 files, 158 tests passing
- Client: 4 files, 70 tests passing
- Total: 228 tests, all green
- Zod bugfix: `validate.ts` now uses `.issues` (Zod v4 compatible)

---

## Session 2026-03-04 (Session 5)

### Completed
- **Phase 1 — Immediate Security Fixes**:
  - Added `requireAuth` to 15 unprotected write endpoints across 5 route files
  - Added `requireAdmin` to waivers `/process` and trades `/process`
  - Hard-gated `/auth/dev-login` behind `ENABLE_DEV_LOGIN=true` env var
  - Added 10s `AbortSignal.timeout` to MLB API fetch calls
  - Env var validation at startup — server exits if missing
  - Graceful shutdown (SIGTERM/SIGINT)
  - Sanitized global error handler — no internal details leaked
  - Removed unused deps: `csv-parser`, `papaparse`, `socket.io-client`
- **P0 — Security & Stability**:
  - **Rate limiting**: `express-rate-limit` — global 100 req/min, auth 10 req/min
  - **Ownership validation**: `requireTeamOwner` middleware — checks both legacy `ownerUserId` and `TeamOwnership` table. Applied to teams PATCH, waivers POST, transactions claim, trades propose
  - **Input validation**: `zod` schemas on all 5 write endpoints (roster add-player, waivers claim, trades propose, transactions claim, teams roster update). `validateBody` middleware factory.
- **P3 — Code Quality**:
  - **asyncHandler**: utility wrapping all async route handlers (roster, waivers, trades, transactions, teams, standings) — catches unhandled rejections
  - **Structured logging**: replaced 39 `console.error()` calls across 17 files with `logger.error()`. Only 5 remaining in seed/logger/startup (appropriate)
  - **Hardcoded season removed**: transactions routes now look up `league.season` dynamically
  - **Idempotency keys**: replaced `Date.now()` in transaction rowHash with `crypto.randomUUID()`
- **P1 — Resilience**:
  - **MLB API retry**: 3 retries with exponential backoff (1s, 2s, 4s) + circuit breaker (opens after 5 failures, resets after 60s)
  - **Transaction timeouts**: all 7 `prisma.$transaction()` calls now have `{ timeout: 30_000 }`
  - **Request ID tracking**: `x-request-id` middleware on all requests
  - **Health check expansion**: `/api/health` now checks both DB and Supabase connectivity
- **Documentation**:
  - Created `docs/SECURITY.md`, `docs/ROADMAP.md`
  - Updated `CLAUDE.md` with security conventions
  - New middleware files: `asyncHandler.ts`, `validate.ts`

### Pending / Next Steps
- [ ] IDOR protection — league-scoped queries should filter by user's memberships
- [ ] Audit logging — log admin/commissioner actions to AuditLog table
- [ ] Test coverage for new middleware (requireTeamOwner, validateBody, asyncHandler)
- [ ] Increase overall test coverage (currently 1.4%, 103 tests)

### Concerns / Tech Debt
- **Trade accept/reject**: currently only requires `requireAuth`, not ownership of the counterparty team. Would need to fetch the trade to determine recipient.
- **Roster routes use `teamCode` not `teamId`**: can't apply `requireTeamOwner` to legacy `RosterEntry` model — separate ownership pattern needed
- **IDOR risk**: league-scoped GET queries don't verify the user is a league member

### Test Results
- Server: 69 tests passing (4 files)
- Client: 34 tests passing (2 files)
- Total: 103 tests, all green
- TypeScript: 0 new errors (server has 10 pre-existing in test file)

---

## Session 2026-03-04 (Session 4)

### Completed
- **UI/UX Redesign** (PR #10, merged to main, 67 files changed):
  - Removed wave background image entirely (both light/dark mode)
  - Unified all table styling through `table.tsx` as single source of truth
  - Stripped inline style overrides from ThemedTh/ThemedTd across 22 table-using files
  - Converted raw `<table>/<th>/<td>` to ThemedTable in 6 files (Period, PlayerDetailModal, RosterManagementForm, ArchivePage, AuctionValues, PlayerExpandedRow)
  - Removed blue accent color from all table headers — consistent muted gray everywhere
  - Added `tabular-nums` to base TableCell component
  - Toned down typography: `font-bold` → `font-medium` on labels, `font-bold` → `font-semibold` on headings
  - Deleted 3 stale files (Layout.tsx, NavBar.tsx, ThemeContext.tsx)
  - Migrated all `--fbst-*` CSS vars to `--lg-*`, removed legacy shim block
  - Compacted sidebar nav, tuned liquid glass opacity/blur
  - Added Inter font import
  - Cleaned sci-fi/military naming across ~30 files
- **Feature Module Isolation Audit** — comprehensive audit of client + server
  - Found 9 undocumented client cross-feature imports, 1 undocumented server import
  - Updated CLAUDE.md with full cross-feature dependency map
  - All 15 modules properly structured with index.ts barrels

### Pending / Next Steps
- [ ] Visual QA: run dev server and inspect all pages in light/dark mode after design reset
- [ ] Consider extracting `PlayerDetailModal` and `StatsTables` to `src/components/` (used by 3+ features each)
- [ ] Consider extracting shared auction import logic from CommissionerService → auction dependency
- [ ] 46 unmatched archive players still need manual matching
- [ ] Feature-by-feature quality pass (types, error handling, validation, tests)

### Concerns / Tech Debt
- **`PlayerDetailModal`** used by 3 features (auction, teams, archive) — candidate for promotion to shared components
- **`StatsTables`** used by 3 features (standings, archive, periods) — candidate for promotion to shared components
- **CommissionerService → AuctionImportService** server dependency — tightest coupling; consider shared service extraction
- **14 stale worktrees** exist in `.claude/worktrees/` — should clean up
- **ThemeContext still imported** in `roster/RosterManagementForm.tsx` and `periods/Season.tsx` — verify it's actually needed after the `useTheme()` removal from Period.tsx

### Test Results
- Server: 4 files, 69 tests passing
- Client: 2 files, 34 tests passing
- Total: 103 tests, all green
- TypeScript: zero errors (client)

---

## Session 2026-03-03 (Session 3)

### Completed
- Fixed `ArchiveAdminPanel.tsx` auth: replaced 5x `localStorage.getItem('token')` with `supabase.auth.getSession()` helper
- Added MIME types to file input accept attribute for better browser compatibility
- Imported 2025 season from `Fantasy_Baseball_2025 - FINAL.xlsx` via terminal curl (UI was inaccessible)
  - 8 teams, 7 periods, 184 draft picks, 251 auto-matched players (46 unmatched)
- Ran MLB data sync: 1,110 player records updated with real stats
- Confirmed user `jimmychang316@gmail.com` is already admin + commissioner (leagues 1 & 2)
- Researched UI/UX best practices for dark/light mode, liquid glass, and sidebar spacing

### Pending / Next Steps — UI/UX Redesign
- [ ] **Compact sidebar nav** — current items are `10px font-black uppercase tracking-widest` with `10px 16px` padding. Change to `text-sm font-medium` (14px/500), normal case, `6px 10px` padding
- [ ] **Fix dark/light mode colors** — align with shadcn v4 OKLCH defaults or fix `--lg-*` token inconsistencies
- [ ] **Clean up legacy CSS vars** — audit & replace all `var(--fbst-*)` references with `var(--lg-*)` tokens
- [ ] **Delete stale files**: `components/ThemeContext.tsx`, `components/NavBar.tsx`, `components/Layout.tsx`
- [ ] **Liquid glass tuning** — light mode glass too opaque (0.65 → 0.15), dark mode blur too strong (40px sidebar → 16-20px)
- [ ] See detailed plan: `.claude/projects/.../memory/ui-redesign.md`

### Pending / Next Steps — Archive
- [ ] 46 unmatched players still need manual matching or improved auto-match logic
- [ ] Verify archive page period/season sections display correctly with populated stats

### Concerns / Tech Debt
- **Duplicate ThemeContext**: `contexts/ThemeContext.tsx` (active, key: `fbst-theme`) vs `components/ThemeContext.tsx` (stale, key: `theme`) — delete the stale one
- **ArchiveAdminPanel uses legacy `--fbst-*` vars** — needs migration to `--lg-*`
- **Orchestration tab invisible** — only shows for `isAdmin` users; no way to discover it exists if you're not admin

### Test Results
- Did not run tests this session (focused on data import + UI research)

---

## Session 2026-02-21 (Session 2)

### Completed
- Merged all 4 open PRs to main in order (#2 → #3 → #4 → #5)
  - PR #2: Feature module extraction (15 modules, 122 files) — already merged
  - PR #3: Fix 320 TypeScript strict mode errors — rebased, 1 conflict resolved
  - PR #4: Clean up stale Prisma duplicates, unused routes, backup files — rebased, 6 conflicts resolved
  - PR #5: Consolidate inline auth middleware — rebased, 5 conflicts resolved
- Set up Vitest infrastructure (PR #6, merged)
  - Server: `vitest.config.ts`, `vitest` + `@vitest/coverage-v8` deps, test scripts
  - Client: `vitest.config.ts` with jsdom + React Testing Library, test setup file
  - Root `npm run test` / `test:server` / `test:client` scripts
- Wrote 103 tests across 6 test files:
  - `server/src/lib/__tests__/utils.test.ts` (28 tests)
  - `server/src/features/standings/__tests__/standingsService.test.ts` (21 tests)
  - `server/src/features/standings/__tests__/standings.integration.test.ts` (7 tests)
  - `server/src/middleware/__tests__/auth.test.ts` (13 tests)
  - `client/src/api/__tests__/base.test.ts` (17 tests)
  - `client/src/lib/__tests__/baseballUtils.test.ts` (17 tests)

### Pending / Next Steps
- [ ] Feature-by-feature quality pass (types, error handling, validation, tests, API shapes)
  - Start with: standings, trades, auth
  - Then: leagues, teams, players, roster, auction
  - Then: keeper-prep, commissioner, admin, archive, periods, waivers, transactions
- [ ] UI/Design system module (theme tokens, shared patterns, component audit)
- [ ] New feature work (auction improvements, standings visualizations, etc.)

### Concerns / Tech Debt
- **`parseIntParam` edge case**: Returns 0 for null/undefined/empty string due to `Number("") === 0`. May want to treat these as null for stricter validation.
- **Cross-feature imports**: leagues→keeper-prep, leagues→commissioner, admin→commissioner, commissioner→roster. Monitor for circular dependency risk.
- **No MSW setup**: Client API tests could benefit from Mock Service Worker for more realistic HTTP mocking.
- **Supabase debug logging**: Client `base.test.ts` outputs Supabase init debug info — consider suppressing in test environment.
- **Multiple worktrees**: 11 worktrees exist, most on stale commit `29af429`. Consider cleaning up unused worktrees.

### Test Results
- Server: 4 files, 69 tests passing
- Client: 2 files, 34 tests passing
- Total: 103 tests, all green

---

## Session 2026-02-21 (Session 1)

### Completed
- Extracted 15 feature modules from layer-based architecture (both server and client)
- Fixed inconsistent Prisma imports in 5 route files (roster, rosterImport, trades, waivers, rules)
- Standardized all router exports to named exports
- Updated all import paths across 77 files
- Updated CLAUDE.md with full feature module documentation
- Created FEEDBACK.md for session continuity
- Created PR #2 (merged)

### Test Results
- Server TypeScript: 319 pre-existing errors (0 from refactoring)
- Client TypeScript: 0 errors
- Client Vite build: Passes
