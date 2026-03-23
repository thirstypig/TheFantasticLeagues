# The Fantastic Leagues — Development Feedback Log

This file tracks session-over-session progress, pending work, and concerns. Review at the start of each session.

---

## Session 2026-03-23 (Session 37) — AI Insights Fixes, Table Density, Code Quality, SaaS Planning

### Summary
Tested all 9 AI features end-to-end, fixed 2 bugs, implemented table density system, extracted code quality improvements, and created SaaS Phase 1 plan. 1 PR merged.

### Completed — AI Insights Deep Dive
- **Tested all 9 AI endpoints** — 7/9 worked, 2 had bugs, both fixed
- **Trade Analyzer fix** — `requireLeagueMember` only checked `req.params`/`req.query`, not `req.body`; POST endpoints with body-based `leagueId` would 400
- **Weekly Insights fix** — AIHub was missing `teamId` in generate URL; added user team fetch on mount
- **Draft Report** — was 404 due to stale server process; roster fallback works after restart
- +1 new test for `requireLeagueMember` body fallback

### Completed — Table Design Refresh
- **3-tier density system** — `compact` (28px), `default` (36px), `comfortable` (44px) via `TableDensityContext`
- **SortableHeader component** — replaces 10+ inline sort implementations
- **Zebra striping** — `zebra` prop on ThemedTable, uses existing `lg-table` CSS class
- **Semantic value tokens** — `--lg-positive` / `--lg-negative` (mode-aware green/red)
- Applied `density="default" zebra` to Players, StatsTables, AuctionValues

### Completed — Code Quality Improvements
- **`splitTwoWayStats()`** — extracted from inline route logic into `statsService.ts` (18 lines → 2)
- **`mlbGetJson<T>`** — generic type parameter (backwards-compatible)
- **`rosterFingerprint`** — stable dependency for enrichedPlayers, prevents re-renders on non-roster updates

### Completed — SaaS Phase 1 Plan
- Created `docs/plans/2026-03-23-saas-phase-1-plan.md`
- 5 phases: Snake draft → Self-service onboarding → Public directory → Stripe billing → Astro marketing site
- Pricing: Free (1 league, snake) vs Pro ($49/season — auction, keepers, AI, archive)

### Test Results
- Server: 493 passing (+1)
- Client: 187 passing
- **Total: 680 tests** (MCP: 50 additional)
- TypeScript: clean (client + server)

### Pending / Next Session
1. **Table design visual testing** — verify density changes look right in browser (dark + light mode)
2. **Adopt SortableHeader** — replace inline sort logic in Players.tsx, AuctionValues.tsx, StatsTables.tsx
3. **Sticky first column** — mobile player name pinning (CSS-only)
4. **useMemo split** — separate filter/sort in Players.tsx for performance
5. **SaaS Phase 1A** — begin snake draft implementation
6. **Fund AI API** — Gemini needs paid plan, Anthropic needs credits

### Concerns / Tech Debt
- `Player.posList` is global (not per-league) — if leagues diverge on GP threshold, would need per-league eligibility model
- `syncNLPlayers` superseded by `syncAllPlayers` — candidate for removal
- Gemini API key on free tier with 0 quota — falls back to Claude (costs money)

---

## Session 2026-03-22 (Session 36) — Position Eligibility, Prospects, Auction Lifecycle, Sidebar, Ohtani

### Summary
Marathon session covering data quality, auction lifecycle, UI condensing, Ohtani two-way stats, and AI provider fallback. 8 PRs merged (#81-#87), plus multiple direct commits. Season transitioned to IN_SEASON. 15 commits total.

### Completed — Position Eligibility (PR #81)
- **`syncPositionEligibility()`** — fetches MLB fielding stats in batch, updates `Player.posList` for all positions with GP >= threshold (configurable, default 20)
- **New league rule `position_eligibility_gp`** — commissioner-configurable via slider (1-50)
- **New admin endpoint** `POST /api/admin/sync-position-eligibility`
- **199 players** updated with multi-position eligibility (e.g., Burleson: 1B→1B,DH,LF,RF)
- **Auction budget fix** — `refreshTeams()` now uses `Team.budget` (per-team, reflects trades) instead of `budgetCap`

### Completed — AAA Prospect Sync (PR #82)
- **`syncAAARosters()`** — fetches all ~30 Triple-A team rosters, creates players not already in DB
- Maps AAA teams to MLB parent orgs via `parentOrgId`
- **622 new prospects** created (total players: 1,652→2,274)
- **New admin endpoint** `POST /api/admin/sync-prospects`

### Completed — Ohtani Two-Way Player Fixes (PR #83 + direct commits)
- `syncAllPlayers()` sets `posList="DH,P"` for TWO_WAY_PLAYERS entries
- `syncPositionEligibility()` adds "P" for two-way players even without fielding data
- **Team page**: uses `assignedPosition` (not `posPrimary`) for `is_pitcher` determination — SKD Ohtani (P) now shows pitching stats
- **Standings**: `computeTeamStatsFromDb` splits hitting/pitching stats by assigned role — SKD gets pitching stats only, DLC gets hitting stats only, no double-counting

### Completed — 6-Agent Code Review + Fixes (PR #84)
- **P1-1**: Fixed `undefined` fielding iteration crash for two-way players
- **P1-2**: Removed unscoped `leagueRule.findFirst`
- **P2-3**: Replaced N+1 `findFirst` with batch `buildPlayerLookup()` (~2,400→3 DB round-trips)
- **P2-5/6**: Shared `buildPosList()` and `fetchPlayerBatch()` helpers
- **P3**: Cleanup (unused `parentOrgName`, `normalizePos` to module level, `isTwoWay` reuse)

### Completed — CI → CM Rename (PR #85)
- Renamed Corner Infield (CI) to Corner Man (CM) across all code + DB

### Completed — End Auction + Matrix Refresh (PR #86)
- **`POST /api/auction/complete`** — commissioner/admin can manually end auction without full rosters
- **`POST /api/auction/refresh-teams`** — triggers `refreshTeams()` + broadcast; TeamListTab calls this after position PATCH so matrix updates for all clients

### Completed — Sidebar Nav Condensing (PR #87)
- Primary items (Home, Season, Players, Auction, Activity) always visible, no section header
- League/Manage/Dev sections collapsible with persisted state in localStorage
- Auction item disabled (greyed out) outside DRAFT phase via `useSeasonGating()`
- `aria-current="page"` on active links, Escape closes mobile drawer, Cmd+B toggles sidebar

### Completed — Auction Lifecycle Operations
- Auction ended via `POST /api/auction/complete`
- 5 periods created for 2026 (March 25 – September 27)
- Season transitioned DRAFT → IN_SEASON
- Roster-based auction analysis generated (all 8 teams)

### Completed — AI Provider Fallback
- Gemini model updated `gemini-2.0-flash-exp` → `gemini-2.0-flash`
- **Anthropic Claude fallback** — auto-detects Gemini 429/quota errors, switches to Claude API for the session
- Uses raw `fetch` (no SDK dependency), Zod validation on LLM output
- Requires `ANTHROPIC_API_KEY` env var (added to local .env + Render)

### Completed — Manual Data Fixes
- **Konnor Griffin** (mlbId 804606) — created, added to Los Doyers at $150 as SS
- **Walker Buehler** (mlbId 621111) — team updated BOS→SD

### Module Isolation Audit
- 9 server cross-feature imports — all documented in CLAUDE.md
- 0 undocumented client cross-feature imports
- No circular dependencies
- 1 missing index.ts: `client/src/features/seasons/` (no page component, API imported directly)

### Test Results
- Server: 492 passing
- Client: 187 passing
- **Total: 679 tests** (MCP: 50 additional)
- TypeScript: clean (client + server)

### Pending / Next Session
1. **Table design evaluation + refresh** — deepened plan ready at `docs/plans/2026-03-22-feat-session-37-mega-plan.md` Phase 4
2. **Fund AI API** — Gemini needs paid plan, Anthropic needs credits for draft grades to work
3. **Stabilize `enrichedPlayers` dependency** — P3; rosterFingerprint
4. **Extract `expandAndSplitTwoWayStats()`** — P3; fold stat zeroing into expansion helper
5. **Type `mlbGetJson` return** — P2-4 from code review; add generics
6. **SaaS Phase 1 planning** — multi-league, snake draft, public directory

### Concerns / Tech Debt
- `Player.posList` is global (not per-league) — if leagues diverge on GP threshold, would need per-league eligibility model
- `syncNLPlayers` effectively superseded by `syncAllPlayers` — consider removing
- Gemini API key on free tier with 0 quota — needs billing enabled
- `requireCommissionerOrAdmin` reads from `req.params` but auction endpoints use `req.body/query` — used `requireAdmin` as workaround for `/complete`

---

## Session 2026-03-22 (Session 35) — Live Auction Production Fixes

### Summary
Critical production fixes during a live auction draft. Auction was non-functional (0 teams, no player names, stale availability). Root cause: hardcoded `/api/` paths bypassed `API_BASE`, routing through Cloudflare instead of direct to Render. Fixed in rapid succession with 8 commits, 2 PRs, and a 5-agent code review.

### Completed — Production Outage (PRs #79, #80)
- **API routing fix** — replaced 21 hardcoded `/api/` paths with `${API_BASE}` in `useAuctionState.ts` + 6 other files; auction calls now go direct to Render
- **Player names** — server includes `mlbId` and `playerName` in roster data (was only sending internal `playerId`)
- **Force-assign availability** — added `enrichedPlayers` useMemo that overlays real-time auction state onto player pool
- **WebSocket safety net** — added `fetchState()` on WS connect to re-fetch if initial HTTP fetch failed
- **Cloudflare cache prevention** — `Cache-Control: no-store` on all `/api` routes (commit `b8f69c2`)

### Completed — Auction UX Fixes
- **Position dropdown** — MI/CI roster slots via `positionToSlots()` instead of hardcoded BN/UTIL
- **Ohtani two-way stats** — pitcher row now zeros out hitting stats, hitter row zeros out pitching stats
- **Position matrix colors** — green=fully filled (correct), neutral=partial, muted=empty (was red=full which felt like an error)

### Completed — Code Quality (5-Agent Review)
- **Complete API_BASE migration** — 28 more hardcoded paths across 15 files (total: 49 paths fixed across 22 files)
- **Server type drift** — updated `AuctionTeam.roster` in `types.ts` to match actual runtime shape (`id`, `mlbId`, `playerName`)
- **Duplicate `players.find()`** — removed redundant O(n) scan in TeamListTab; uses `entry.stat` from first lookup
- **`(entry as any).playerName`** — removed unnecessary cast (type already had field)
- **`||` → `??`** — nullish coalescing for `mlbId` fallback in 3 locations
- **Duplicate constant** — replaced inline `slotOrder` with existing `MATRIX_POSITIONS`

### Completed — Documentation
- **Compound learning doc** — `docs/solutions/runtime-errors/auction-production-outage-api-routing-player-ids.md`
- **UX fixes doc** — `docs/solutions/ui-bugs/auction-ux-position-dropdown-ohtani-stats-api-migration.md`
- **Deployment docs** — `docs/solutions/deployment/` (5 files: checklist, quick-reference, readme, hardcoded paths, CSP/WS)
- **Feedback memory** — `feedback_predeploy_audit.md` (pre-deploy checklist for future deploys)

### Test Results
- Server: 473 passing
- Client: 187 passing
- **Total: 660 tests** (MCP: 50 additional)
- TypeScript: clean (client + server)

### Pending / Next Steps — Priority Order
1. **TD-F02**: Refresh position eligibility from fielding stats — 20+ GP rule (e.g., Burleson has 75 GP at OF but DB only shows 1B)
2. **TD-F01**: Expand player sync to include minor league prospects (e.g., Konner Griffin)
3. **Post-auction retrospective** — review logs, bid patterns, UX issues from real usage
4. **Stabilize `enrichedPlayers` dependency** — P3 from review; use `rosterFingerprint` to prevent unnecessary re-renders on bids
5. **Extract `expandAndSplitTwoWayStats()`** — P3; fold stat zeroing into expansion helper to prevent future callers from forgetting
6. **SaaS Phase 1 planning** — multi-league, snake draft, public directory

---

## Session 2026-03-21 (Session 34) — Sticky Table Headers & Accessibility

### Summary
Sticky table headers on Players page (hitters + pitchers) and Auction PlayerPoolTab. WCAG 2.2 AA color accessibility fixes. Age-friendly table typography improvements for 40+ users. Multi-agent research (8 agents) for color verification, performance analysis, and best practices.

### Completed — Sticky Table Headers
- **ThemedTable bare path** renders raw `<table>` instead of shadcn `<Table>` — eliminates intermediate `overflow-auto` wrapper that broke `position: sticky`
- **`sticky` prop on ThemedThead** — encapsulates sticky behavior in shared component (previously inline classNames)
- **Players page** — constrained to `h-[100dvh]` viewport height, removed `overflow-hidden` from `lg-card`, removed intermediate `overflow-x-auto` div
- **PlayerPoolTab + AuctionDraftLog** — migrated from inline sticky className to `<ThemedThead sticky>`

### Completed — Color Accessibility (WCAG 2.2 AA)
- **Status colors fixed** — all 3 failed AA in light mode: success #059669→#065f46 (5.62:1), warning #d97706→#92400e (5.18:1), error #dc2626→#b91c1c (4.73:1)
- **Dark mode status overrides added** — #34d399 (success), #fbbf24 (warning), #f87171 (error) — all pass AA on #0f172a
- **Delta colors synced** — `--lg-delta-positive` and `--lg-delta-negative` updated in lockstep
- **Alert classes** — hardcoded hex replaced with `var()` references
- **Colorblind-verified** — all 6 status values distinguishable under deuteranopia/protanopia via luminance separation

### Completed — Sticky Header Performance
- **Replaced `backdrop-blur-xl`** with opaque `--lg-table-header-sticky-bg` token (#e8ecf2 light / #1c2638 dark)
- **Added `border-b border-[var(--lg-border-subtle)]`** for visual separation (GitHub/Notion pattern)
- **Performance**: eliminated per-frame GPU blur shader — scroll goes from 30-45 FPS to 60 FPS on mid-range devices
- Research confirmed: no production app uses backdrop-blur on sticky table headers

### Completed — Table Typography (40+ Readability)
- **Font size**: 14px → 15px (`text-[15px]`) on TableCell
- **Row height**: ~38px → ~42px (`py-2.5` → `py-3`)
- **Line-height**: added explicit `leading-5` (20px)
- Compact mode unchanged (auction sidebar panels)

### Test Results
- Server: 473 passing
- Client: 187 passing
- **Total: 660 tests** (MCP: 50 additional)

### Completed — Mobile Readiness (PR #77)
- **Activity page sticky headers** — `<ThemedThead sticky>` on Add/Drop + History tables, viewport height constraint, removed overflow blockers
- **Viewport height: 100vh/dvh → 100svh** — AuctionLayout, Players, Docs, index.css body + auth container (fixes iOS Safari address bar clipping)
- **Touch targets** — sidebar nav items 5px→10px padding (44px+), auction Pass/AI buttons py-1.5→py-2.5, ContextDeck tabs text-[10px]→text-[11px] + px-3 py-2.5, AppShell icon buttons p-1.5→p-2.5
- **Mobile verified** — Activity + Players pages at 390px viewport (Playwright screenshots)

### Pending / Next Steps — Priority Order
1. **Post-deploy smoke test** — health check, auth, WebSocket, PostHog on thefantasticleagues.com
2. **End-to-end auction test in production** — create test auction, verify WS, bid, nominate, timer
3. **Design contrast spot-check** — verify new status colors and sticky headers on live site
4. **Dark mode hardcoded color audit** — 26+ files use hardcoded Tailwind colors (text-red-400, bg-green-500/10) bypassing design tokens. Separate PR.
5. **Post-auction retrospective** — review logs, bid patterns, UX issues from real usage
6. **SaaS Phase 1 planning** — multi-league, snake draft, public directory

---

## Session 2026-03-20 (Session 33) — Production Deployment & Code Review Hardening

### Summary
Production deployment readiness for Render with 6-agent code review. All P2/P3 findings resolved. Auction retrospective endpoint with DraftReport component.

### Completed — Production Deployment (PRs #69, #70)
- **CSP Hardening** — scoped `wss:` to `wss://*.supabase.co`, added PostHog domains (`us.i.posthog.com`, `us-assets.i.posthog.com`), removed stale `fbst-api.onrender.com`
- **HSTS Header** — `Strict-Transport-Security` (1 year, includeSubDomains) via helmet
- **Static Asset Caching** — `maxAge: '1y'`, `immutable: true`, `index: false` on `express.static` for Vite-hashed assets
- **Service Worker Origin Check** — only cache same-origin responses
- **render.yaml Overhaul** — production domain `thefantasticleagues.com`, `VITE_*` build-time vars, `APP_URL`, `RESEND_API_KEY`, `maxShutdownDelaySeconds: 60`, Node 20 pinned
- **Shutdown Timeout Alignment** — hard kill at 55s matches Render's 60s `maxShutdownDelaySeconds`
- **Express v5 Cleanup** — removed `express@^5.1.0` and `cors` from root `package.json` (server uses v4)
- **SW Cache Bump** — `tfl-v1` → `tfl-v2` for clean deploy

### Completed — Features
- **Auction Retrospective** — `GET /api/auction/retrospective?leagueId=N`: league stats, bargains/overpays, position spending, contested lots, team efficiency, spending pace (+11 tests)
- **DraftReport Component** — post-auction analytics rendered on AuctionComplete page
- **Guide Additions** — "Finding Players" screenshot, "Before the Draft" section with league rules screenshot

### Completed — Code Review (6-agent)
- Security Sentinel, Architecture Strategist, Code Simplicity, Learnings Researcher
- 2 P2 findings resolved: scoped wss: CSP, aligned shutdown timeout
- 5 P3 findings resolved: static caching, SW origin check, Node pinning, HSTS, Express cleanup

### Completed — Production Hotfixes (PRs #72, #73)
- **CSP wss:// fix (PR #72)** — explicit `wss://thefantasticleagues.com` in CSP connectSrc; browser `'self'` doesn't reliably map `https:` → `wss:` across all browsers. Fixed "Reconnecting to auction server" on live site.
- **Design contrast (PR #73)** — light mode: darker backgrounds (#d6dde7), darker muted text (#4b5563), stronger table headers. Dark mode: lighter muted text (#8b9bb5 vs #64748b which was identical to light mode). Home game cards: "Final" visible, W-L records inline next to team abbr. Season "Cumulative results" subheader readable. Sidebar labels opacity 0.6→0.85.

### Completed — Roadmap Update
- Expanded long-term vision: SaaS Phase 1 (baseball platform for other leagues) and Phase 2 (multi-sport: football, March Madness, pick'em, game calculators, SaaS pricing)

### Test Results
- Server: 473 passing (+11 retrospective)
- Client: 187 passing
- MCP: 50 passing
- **Total: 710 tests**

### Pending / Next Steps — Pre-Auction (March 21)
1. **Post-deploy smoke test** — health check, auth, WebSocket, PostHog on thefantasticleagues.com
2. **End-to-end auction test in production** — create test auction, verify WS, bid, nominate, timer
3. **Sticky table headers** — Players page and Auction player pool tables lose column headers on scroll. CSS `position: sticky; top: 0` exists in `.lg-table thead` but doesn't work inside scrollable containers. Fix for both Players and Auction PlayerPoolTab.
4. **Design contrast spot-check** — verify light/dark mode improvements look correct on live site

### Pending / Next Steps — Post-Auction
- Post-auction retrospective — review logs, bid patterns, UX issues from real usage
- SaaS Phase 1 planning (multi-league, snake draft, public directory)
- TD-Q03 (auction/routes.ts extraction) — intentionally deferred

---

## Session 2026-03-20 (Session 32) — Reliability, Mobile, PostHog, AI Draft Grades

### Summary
Pre-auction reliability session. Added React error boundaries, WebSocket reconnect indicator, PostHog analytics enhancement (18 tracked events), mobile auction testing/fixes, and AI post-draft grade feature.

### Completed — Platform Quality
- **React Error Boundaries** — Root + feature-level (Auction, AuctionResults, Commissioner) boundaries with friendly error card, retry button, PostHog crash reporting
- **Offline/Reconnect Indicator** — Amber "Reconnecting..." banner on WS disconnect, auto-reconnect with exponential backoff (1s→2s→4s→8s→15s cap), polling safety net during reconnect
- **Mobile Auction Testing** — Tested 390x844 (iPhone 14) viewport via Playwright. Fixed AppShell mobile overflow (`min-w-0 overflow-x-hidden`) that was clipping right edge of content. Responsive text sizing on auction stage.
- **PostHog Analytics Enhancement** — Expanded from 8 to 18 tracked events: auction_init, auction_chat_send, auction_watchlist_toggle, auction_ws_reconnected, auction_draft_grades_generated. Updated Analytics page metrics.

### Completed — AI Features (6 endpoints)
- **AI Post-Draft Grade** — `GET /api/auction/draft-grades?leagueId=X`. Grades each team A-F. Cached per league, Zod-validated, deduped concurrent requests.
- **AI Trade Analyzer** — `POST /api/trades/analyze`. Evaluates trade fairness (fair/slightly_unfair/unfair), identifies winner, analysis + recommendation.
- **AI Keeper Recommender** — `GET /api/commissioner/:leagueId/keeper-prep/ai-recommend?teamId=Y`. Ranks all roster players by keeper value.
- **AI Waiver Bid Advisor** — `GET /api/waivers/ai-advice?leagueId=X&teamId=Y&playerId=Z`. Suggests FAAB bid with confidence level.
- **AI Weekly Insights** — `GET /api/teams/ai-insights?leagueId=X&teamId=Y`. 3-5 actionable insights + overall grade.
- **AI Auction Draft Advisor** — `GET /api/auction/ai-advice?leagueId=X&teamId=Y&playerId=Z&currentBid=N`. Real-time bid recommendation.

### Completed — Code Review Fixes (9 items)
- **P1**: Zod validation on AI JSON responses, cached+deduped draft-grades endpoint, `catch(e:unknown)` convention, initial connectionStatus fix
- **P2**: Deduplicated reconnect logic (scheduleReconnect), removed stack traces from PostHog, generic AI error messages, track() outside state updater, removed unused topPicks from AI prompt

### Completed — AI Features (6 server + 5 client UIs)
- Post-Draft Grade, Trade Analyzer, Keeper Recommender, Waiver Bid Advisor, Weekly Insights, Auction Bid Advisor
- All endpoints Zod-validated, cached, with generic error messages

### Completed — Auction Enhancements
- **AUC-10**: Pre-Draft Rankings Import — CSV upload/paste, private "My Rank" column
- **AUC-11**: Post-Auction Trade Block — toggle players as tradeable, DB-backed (+8 tests)
- **SS/MI position fix** — server was double-counting eligible slots; now uses assigned position
- **Nomination Queue redesign** — vertical stack, 3 teams, full names
- **Position Matrix fix** — full team names, P column shows X/9

### Completed — Platform Quality
- **Commissioner Reorg** — 6→5 tabs (League, Members, Teams, Season, Trades)
- **PWA** — manifest.json, service worker, installable on phones
- **Browser Push Notifications** — Your turn / Outbid / Won notifications
- **Mobile fixes** — Team, Archive, Tech overflow wrappers, hamburger menu fix
- **AI Insights route fix** — moved before /:id parameterized route

### Test Results
- Server: 462 passing (+8 trade block)
- Client: 187 passing
- MCP: 50 passing
- **Total: 699 tests**

### Pending / Next Steps
- Auction Replay + Bid History Visualization (building)
- TD-Q03 (auction/routes.ts extraction) — intentionally deferred
- Production deployment
- Sunday March 22 live auction

---

## Session 2026-03-20 (Session 31) — 21 PRs, Auction UX, My Val, MLB Home, Guide, AI Roadmap, CI Fix

### Summary
Massive session with 19 PRs merged (#46 through #64), completing 10 of 12 auction enhancements, adding personalized My Val (roster-aware valuation with 4 factors), MLB-powered Home page, rewriting the Guide, running a full code review, and fixing CI.

### Completed — Auction Enhancements (10 of 12 done)
- **AUC-01**: Opening bid picker (inline $ input on Nom button)
- **AUC-02**: Watchlist/Favorites (star icons, localStorage, filtered view)
- **AUC-03**: Chat/Trash Talk (WebSocket bidirectional, rate-limited, ChatTab)
- **AUC-04**: Sound Effects (Web Audio API oscillator tones, mute toggle)
- **AUC-05**: Value Over Replacement (Val column, surplus display)
- **AUC-06**: Spending Pace Tracker (budget bars, avg cost, hot/cold indicators)
- **AUC-07**: Position Needs Matrix (compact grid in Teams tab, filled/limit per position per team)
- **AUC-08**: Nomination Timer Countdown (30s visible countdown, red pulse at <10s)
- **AUC-09**: "Going Once, Going Twice, SOLD!" Visual (5s/3s/1s escalation)
- **AUC-12**: Keeper Cost Preview (shows next year cost when high bidder)

### Completed — Code Review & Fixes
- 5 P1 fixes: unbounded chat array, proxy bid deletion bug, proxy bid auth bypass (GET+DELETE), bid picker validation
- 9 P2 fixes: type safety (teams:any[] to AuctionTeam[]), duplicate interfaces, useCallback, win sound detection, rate limiter, watchlist toggle

### Completed — New Features
- MLB-powered Home page (live scores, transactions, date navigation, dashboard cards)
- About page (product overview, features, commissioner tools)
- Guide split into 3 pages (Account, Auction, FAQ) with Playwright screenshots
- Auction Settings panel (6 per-user toggles)
- Auction Excel export on completion screen
- Commissioner roster release button in RosterGrid
- Sidebar: collapse/expand caret, condensed 6 to 4 sections
- Bid timer dropdown (15s increments)
- Print/PDF styles for Guide
- Tooltips on auction column headers

### Completed — My Val & Later PRs (#60-#64)
- Resource page audit (#60)
- Val column colors (green/red) + public guide pages (no login required) (#61)
- Val tooltips (base vs adjusted breakdown), default league filter, compact tabs (#62)
- Personalized My Val — roster-aware player valuation with 4 factors: position need (+30%/-70%), budget pressure (+10%/-20%), position scarcity (+10-20%), market pressure (#63)
- Market pressure factor + multi-user test script for My Val validation (#64)
- My Val section added to Auction Guide

### Completed — Infrastructure
- New mlb-feed server module (3 endpoints: scores, transactions, my-players-today)
- MCP phases 7-8 complete (21 integration tests, full README)
- CI pipeline fix — Supabase placeholder env vars for GitHub Actions (PRs #58-59)

### Test Results
- Server: 454 passing
- Client: 187 passing
- MCP: 50 passing (+21 from integration tests)
- **Total: 691 tests**

### Pending / Next Steps
- AUC-10 (Pre-Draft Rankings), AUC-11 (Post-Auction Trade Block) — remaining backlog
- TD-Q03 (auction/routes.ts extraction) — intentionally deferred
- Production deployment
- Sunday March 22 live auction

---

## Session 2026-03-20 (Session 30) — Auction Enhancements: Opening Bids, Watchlist, Chat, Sounds, VOR, Spending Pace

### Completed
- **AUC-01: Nominator Sets Opening Bid** — clicking "Nom" in PlayerPoolTab shows inline $input with Go button (default $1). Enter to confirm, Escape to cancel. Auto-nominations from queue still use $1.
- **AUC-02: Watchlist / Favorites** — star icon on every player row in Player Pool (amber when starred), new "★" filter button alongside All/Avail, persisted per league in localStorage. New hook: `useWatchlist.ts`.
- **AUC-03: Chat / Trash Talk** — WebSocket handles incoming CHAT messages and broadcasts to room. Rate limited (5 msgs/10s per user, 500 char max). New ChatTab component in ContextDeck (5th tab). Ephemeral (in-memory only). New component: `ChatTab.tsx`.
- **AUC-04: Sound Effects / Notifications** — Web Audio API oscillator tones (zero dependencies). 5 sounds: nomination (ding), outbid (alert), your turn (sweep), win (arpeggio), tick. Mute/unmute toggle in AuctionLayout header, persisted in localStorage. New hook: `useAuctionSounds.ts`.
- **AUC-05: Value Over Replacement** — new "Val" column in Player Pool showing $dollar_value. During active bidding: shows surplus (value - current bid) with color coding (green for bargain, red for overpay). Sortable by value.
- **AUC-06: Spending Pace Tracker** — league summary bar (total drafted, total spent, avg price/player). Per-team: roster/total, avg cost, remaining $/spot. Budget progress bar (green/amber/red by spend %). Hot/cold indicators (Flame/Snowflake icons) when team avg differs >25% from league avg.
- **Documentation** — updated TODO.md (AUC-01 through AUC-06 marked complete), CLAUDE.md (auction module description), FEEDBACK.md

### Files Added
- `client/src/features/auction/hooks/useWatchlist.ts`
- `client/src/features/auction/hooks/useAuctionSounds.ts`
- `client/src/features/auction/components/ChatTab.tsx`

### Files Modified
- `client/src/features/auction/components/PlayerPoolTab.tsx` (AUC-01, AUC-02, AUC-05)
- `client/src/features/auction/components/TeamListTab.tsx` (AUC-06)
- `client/src/features/auction/components/AuctionLayout.tsx` (AUC-04 mute toggle)
- `client/src/features/auction/pages/Auction.tsx` (all 6 features wired in)
- `client/src/features/auction/hooks/useAuctionState.ts` (AUC-03 chat, AUC-06 budgetCap/rosterSize config)
- `server/src/features/auction/services/auctionWsService.ts` (AUC-03 chat broadcast)

### Test Results
- Server: 454 passing
- Client: 187 passing
- MCP: 29 passing
- **Total: 670 tests**
- TypeScript: clean (both client and server)

### Pending / Next Steps
- Auction feature backlog remaining: AUC-07 through AUC-12 in TODO.md
- TD-Q03 (auction/routes.ts extraction) — intentionally deferred
- Sunday March 22 live auction — all infrastructure ready

---

## Session 2026-03-19 (Session 29) — Auction Enhancements: Proxy Bids, Force Assign, Timers, Decline

### Completed
- **Proxy/Max Bid (eBay-style)** — Team owners can set a max bid; server auto-bids incrementally up to that amount. Resolves competing proxy bids (highest wins at loser's max + $1). Private per-team — other teams can't see your max.
- **Force Assign (Commissioner Override)** — Commissioner can manually assign any available player to any team at any price via the Player Pool expanded row. Bypasses the auction process for verbal deals or timer issues.
- **Configurable Auction Timers** — Bid timer (default 15s) and nomination timer (default 30s) now load from league rules (`bid_timer`, `nomination_timer`). Configurable via Commissioner Rules tab.
- **Decline/Pass Feature** — Team owners can "pass" on a player during bidding, hiding bid buttons. Can rejoin at any time. Auto-resets on new nomination. Pure client-side (no server state needed).
- **Bigger "Set Max Bid" Button** — Upgraded from tiny text link to full-width bordered button with `py-3 px-4` styling.
- **Manual bid override** — +$1/+$5 buttons work independently of proxy bid. Proxy display auto-clears when current bid exceeds proxy max.
- **12 auction feature ideas** added to TODO.md backlog (AUC-01 through AUC-12)

### Test Results
- Server: 454 passing
- Client: 187 passing
- TypeScript: clean (both client and server)

### Pending / Next Steps
- Auction feature backlog (AUC-01 through AUC-12) in TODO.md
- TD-Q03 (auction/routes.ts extraction) — intentionally deferred

---

## Session 2026-03-19 (Session 28) — Meta Pages, Analytics, Code Review Fixes & P3 Cleanup

### Completed
- **/changelog page** — Release history with 11 versions, expandable change details, type badges (feat/fix/perf/refactor/test/docs/security)
- **/status page** — Live health checks for API server, database, Supabase Auth, MLB Stats API with latency timing, refresh button, overall status banner
- **/analytics page** — PostHog integration overview, development velocity chart (155 items across 27 sessions), product metrics tracking grid, key questions to answer
- **/tech improvements** — API Explorer (48 routes across 9 modules, expandable per-module), Bundle Size tracker (9 deps with concern levels), Dependency Health matrix (10 deps with version status)
- **/roadmap improvements** — Session Velocity chart (bar chart of items per session group), Risk Register (7 risks with impact/likelihood/mitigation/status), Next Session planner card
- **Admin quick links** — Links to all 5 meta pages: Roadmap, Under the Hood, Changelog, Status, Analytics
- **App.tsx routes** — Added /changelog, /status, /analytics routes
- **Tech.tsx build journal** — Session 28 entry added
- **Reusable prompts** — Provided prompts for generating /tech, /roadmap, /changelog, /status, /analytics pages on other projects
- **CR-09** (P2) — Imported `AuctionLogEvent` type from `useAuctionState` into `AuctionDraftLog.tsx`
- **CR-10** (P2) — Added `StatKey` union type, removed `@ts-expect-error` in `PlayerPoolTab.tsx`
- **CR-15** (P3) — Extracted ~195 LOC stats logic from `players/routes.ts` into `players/services/statsService.ts`
- **RD-01** (P3) — Lazy-loaded `xlsx` (2.3MB) and `@google/generative-ai` (1.2MB) via dynamic `import()`
- **RD-02** (P3) — Converted 8 scripts from `new PrismaClient()` to singleton import from `db/prisma.ts`
- **RD-04** (P3) — Moved `PlayerDetailModal` and `StatsTables` to `client/src/components/shared/`, updated 11 import paths
- **CR-16** (P3) — Added `compact` variant to ThemedTable via React context (`TableCompactProvider`), migrated both `AuctionDraftLog.tsx` and `PlayerPoolTab.tsx` from raw `<table>` to ThemedTable components
- **RD-03** (P3) — Created `.github/workflows/ci.yml` with test + audit jobs, blocks on critical vulnerabilities
- **Documentation** — Updated CLAUDE.md paths, TODO.md checkboxes, Roadmap.tsx counts, Tech.tsx build journal, FEEDBACK.md

### Pending / Next Steps
- TD-Q03: auction/routes.ts extraction (intentionally deferred to post-auction season)
- Sunday March 22 live auction — all infrastructure ready, all tech debt resolved

### Test Results
- Server: 454 passing
- Client: 187 passing
- MCP: 29 passing
- **Total: 670 tests**

---

## Session 2026-03-19 (Session 27) — 6-Agent Code Review, P1/P2 Fixes & Roadmap

### Completed
- **6-agent code review** — Ran TypeScript, Security, Performance, Architecture, Simplicity, and Pattern Recognition agents in parallel on PR #43. Synthesized 16 findings (3 P1, 7 P2, 6 P3)
- **All 3 P1 fixes** — (1) Awaited AuctionLot.update for data integrity, (2) Changed DraftLog re-fetch from log.length to winCount (eliminates 3-5x unnecessary API calls), (3) Switched checkPositionLimit from async DB query to sync in-memory check (eliminates ~690 DB queries per auction)
- **5 of 7 P2 fixes** — (4) leagueId now required (no default to 1), (5) persistState logs errors instead of swallowing, (6) positionToSlots consolidated into sportConfig.ts, (7) NL_TEAMS/AL_TEAMS imported from sportConfig, (8) PITCHER_CODES + TWP added to both sportConfig files
- **4 P3 fixes** — (11) Removed unused ThemedTable imports, (12) Merged double useLeague() call, (13) Fixed dead ternary colCount, (14) Added useMemo for teamMap/completedLots
- **Roadmap page** — Visual dashboard with project health scorecard (8.5/10 SVG ring), audit recommendations section, progress tracking, severity badges, completed items archive, cross-links to /tech
- **Consolidated TODO.md** — Merged ROADMAP.md items, archived 47 completed items, added 16 CR-## findings
- **Updated Tech.tsx** — Session 27 build journal entry, cross-links to /roadmap

### Pending / Next Steps
- CR-09: Import AuctionLogEvent type from types.ts (P2)
- CR-10: Replace @ts-expect-error with proper StatKey union type (P2)
- CR-15: Extract stats fetching logic to statsService.ts (P3)
- CR-16: Migrate AuctionDraftLog/PlayerPoolTab to ThemedTable (P3)
- TD-Q03: auction/routes.ts extraction (deferred to post-auction season)
- Sunday March 22 live auction — all P1 infrastructure fixes done

### Test Results
- Server: 454 passing
- Client: 187 passing
- MCP: 29 passing
- **Total: 670 tests**

---

## Session 2026-03-19 (Session 26) — 2025 Stats from MLB API, Auction Bid Tracking

### Completed
- **2025 season stats from MLB API** — Players page and auction Player Pool now show real 2025 stats for ALL MLB players (not just rostered). Batched MLB Stats API fetching (50 players/batch) for all 1,652 players in DB, with 30-day SQLite cache via `mlbGetJson()` and CSV fallback on API failure
- **Sortable stat columns** — All stat columns (R, HR, RBI, SB, AVG for hitters; W, SV, K, ERA, WHIP for pitchers) are sortable in both Players page and Auction Player Pool with visual sort indicators
- **Auction bid history tracking** — Wired `AuctionLot` and `AuctionBid` Prisma models to persist all bids. `/nominate` creates lot + opening bid, `/bid` writes bid record (fire-and-forget), `/finish` updates lot with final price and winner
- **Draft Board log** — New `AuctionDraftLog` component with two views: "Draft Board" (completed auctions in nomination order with expandable bid history per lot) and "Live Feed" (existing event stream). Fetches from new `GET /api/auction/bid-history` endpoint
- **Removed $ column from Player Pool** — Cleaned up auction Player Pool tab (removed dollar value column, fixed default sort)
- **Tech.tsx updated** — Session 26 build journal entry, updated session count and token estimate

### Pending / Next Steps
- Sunday March 22 live auction — all infrastructure ready
- Production deployment
- Compound engineering review / refactor (user mentioned for next session)

### Test Results
- Server: 454 passing
- Client: 187 passing
- MCP: 29 passing
- **Total: 670 tests**

---

## Session 2026-03-19 (Session 25) — Player Data Polish, Full Team Names, OF Mapping

### Completed
- **Full team names everywhere** — Replaced 3-letter fantasy team codes with full names throughout: PlayerDetailModal header, PlayerExpandedRow, AuctionValues modal, Team page modal. Server now returns `ogba_team_name` in both `/players` and `/player-season-stats` endpoints
- **OF position mapping** — CF/RF/LF now merge to "OF" when `outfieldMode` is "OF" (controlled by league rule). Applied in PlayerDetailModal fielding section and PlayerExpandedRow positions display via `mapPosition()` from `sportConfig.ts`
- **Transaction section: "last 3"** — Changed from 30-day window to 2-year window, returns last 3 transactions sorted by date (not limited to recent ones)
- **Profile tab team fallback** — Falls back to `mlbTeam` from player data when MLB API returns no `currentTeam`
- **Season lifecycle documentation** — Full sequence diagram added to `docs/howto.md` (SETUP → DRAFT → IN_SEASON → COMPLETED with keeper prep details)
- **stats_source fix** — League 1 `stats_source` rule updated from `NL` to `ALL` (was filtering out AL teams from dropdown)
- **UNK team cleanup** — Scott Manea (mlbId 900009) updated from `UNK` to `FA`
- **Keeper reset** — 32 roster entries in league 1 reset `isKeeper` from true to false
- **PlayerDetailModal tests fixed** — Added `useLeague()` context mock after component started importing `LeagueContext`
- **6 new server tests** — Player routes (fielding, transactions) and mlbSyncService (all-team sync)
- **Player data API enrichment** — `ogba_team_name` added to `PlayerSeasonStat` type, server rosterMap includes `teamName`

### Pending / Next Steps
- Auction nomination order: user reports seeing 3-letter codes (code audit shows `team.name` used everywhere — may be stale state or different UI area)
- Season lifecycle in Rules page (documented in howto.md but not yet surfaced in client-side rules UI)
- Sunday March 22 live auction — all infrastructure ready

### Test Results
- Server: 454 passing (+6 from Session 24)
- Client: 187 passing
- MCP: 29 passing
- **Total: 670 tests**

---

## Session 2026-03-18 (Session 24) — Live Data Integration, Auction Readiness

### Completed
- **Phase 1: Live standings** — Wired `standings/routes.ts` to use `computeTeamStatsFromDb` + `computeStandingsFromStats` instead of returning zeros (period, category, season endpoints)
- **Phase 2: Admin stats sync** — `POST /api/admin/sync-stats` for on-demand sync (single period or all active)
- **Phase 3: All-team player sync** — `syncAllPlayers()` syncs all 30 MLB teams with team-change detection; daily cron updated from NL-only
- **Auction commissioner controls** — Pause/resume now allowed for commissioners (not just admins)
- **NL/AL/All player pool filter** — 3-button toggle in auction PlayerPoolTab UI
- **Team abbreviation updates** — ATH (Athletics 2026), AZ alias (Arizona) added to NL/AL sets
- **Pre-season setup** — 4 test leagues with 8 teams each, 7 periods, keepers locked, budgets verified ($400 - keeper costs)
- **Full auction E2E test** — Init, pause, resume, nominate, bid, finish, undo-finish, reset all verified on league 11
- **20 new tests** — 11 standings routes, 7 mlbSyncService, 2 admin sync-stats

### Pending / Next Steps
- Sunday March 22 live auction — all infrastructure ready
- Update Tech.tsx with session 24 notes and test count 664
- Production deployment of live data changes
- First real stats sync after March 25 season opener

### Test Results
- Server: 448 passing
- Client: 187 passing
- MCP: 29 passing

---

## Session 2026-03-17 (Session 23) — Auth Phase 1, Email Invites, Member List Enhancement

### Completed
- **Resend email service** — `server/src/lib/emailService.ts` with fire-and-forget `sendInviteEmail()`
  - Graceful degradation: skips silently if `RESEND_API_KEY` not set
  - HTML email with signup CTA, league name, inviter name, role
- **CommissionerService.createInvite()** — now sends invite email after upsert (fire-and-forget)
- **Member list team badges** — Commissioner overview shows team assignment badges per member
  - Client-side `useMemo` cross-references `overview.teams` ownerships with member userIds
- **Tech.tsx updates** — test count 644, session count 23, Resend in DB & Auth stack, build journal entry for Sessions 21-23
- **PLAN-AUTH-MEMBERS.md** — Phase 2.3 and Phase 3 items marked done
- **CLAUDE.md** — Added `emailService.ts` to shared infra, Resend to tech stack

### Pending / Next Steps
- Add `RESEND_API_KEY` to Render production env vars
- Production Google OAuth test via browser (Phase 1)
- Manual test: invite email delivery via Resend dashboard
- Send email when user is added to league (low priority)

### Test Results
- Server: 428 passing
- Client: 187 passing
- MCP: 29 passing

---

## Session 2026-03-17 (Session 22) — Keeper Lock E2E, Performance Fix, 2026 Values, MCP Plan

### Completed
- **Keeper lock E2E testing** — Extended `scripts/setup-keeper-tests.js` with 3 phases:
  - Phase 1: Setup (create leagues, populate rosters, select keepers, execute trades)
  - Phase 2: Lock & Verify (release non-keepers, verify only keepers remain active)
  - Phase 3: Auction Readiness (verify budget math, spots, maxBid per team)
  - All 3 scenarios pass: Test1 (32 keepers baseline), Test2 (budget trade), Test3 (mixed + player trade)
- **keeperPrepService.lockKeepers()** — Now releases non-keeper players (`releasedAt` set), returns `{ releasedCount }`
- **2026 Player Values** — Imported `2026 Player Values v2.xlsx` → `ogba_auction_values_2026.csv` (843 players, rounded $ values)
- **OF position mapping** — Applied `mapPosition(pos, outfieldMode)` everywhere:
  - KeeperSelection, KeeperPrepDashboard, CommissionerKeeperManager, PlayerPoolTab, AuctionValues, RosterGrid
- **Team page performance** — Parallelized:
  - Client: `getTeams()` + `getPlayerSeasonStats()` now run via `Promise.all()`
  - Server: `teamService.getTeamSummary()` — 5 independent DB queries now run in parallel
- **Fantasy team code removed** — NominationQueue no longer shows team codes
- **Custom slash commands** — Created 5 commands in `.claude/commands/`:
  - `check.md`, `db.md`, `feature-test.md`, `feature-overview.md`, `smoke-test.md`
- **MCP MLB API Plan** — Detailed plan at `docs/MCP-MLB-API-PLAN.md` with 8 phases, 8 tools, cache/rate-limit strategy

### Pending / Next Steps
- Build MCP MLB Data Proxy server (see `docs/MCP-MLB-API-PLAN.md`)
- Live app testing of keeper lock flow (through UI)
- Edge case testing: 0-keeper lock, double-lock, save-after-lock

### Test Results
- Server: 32 files, 428 tests passing
- Client: 14 files, 187 tests passing
- Total: 615 tests, all green
- TypeScript: clean compile (both client and server; 2 pre-existing test mock export warnings)

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
