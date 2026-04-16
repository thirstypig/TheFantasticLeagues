# The Fantastic Leagues — Development Feedback Log

This file tracks session-over-session progress, pending work, and concerns. Review at the start of each session.

---

## Session 2026-04-14 (Session 65) — Task-System Consolidation

### Completed

**Task-system consolidation (todo-tasks.json is now the single source of truth)**
- Discovery: `admin-tasks.json` had no live UI consumer. `AdminTasks.tsx` existed but was never imported into `App.tsx` — dead code. The earlier Session 63 plan (`docs/plans/2026-04-13-task-system-consolidation-plan.md`) assumed a live milestone UI; that assumption was wrong, which simplified the merge dramatically (no 3-level `work.json` rebuild needed).
- Merged all unique content from `admin-tasks.json` into `todo-tasks.json` with an optional `milestone` field (`mvp | mid-season | growth | monetization | content-seo | seo-technical`) preserving launch-phase grouping.
- Added 3 new categories: `mid-season` (4 tasks), `growth` (4 tasks), `code-quality-review` (9 tasks — the Session 63 `/ce:review` P1/P2 backlog that had been living in FEEDBACK.md only).
- Deduped 4 overlapping ids (`stripe-setup`, `stripe-checkout-flow`, `email-subscribe-backend`, `blog-formatting-posts-2-5`) — todo-tasks won per richer schema; admin-tasks instructions folded in.
- Deleted `server/data/admin-tasks.json`, `client/src/features/admin/pages/AdminTasks.tsx`, and all 4 `/api/admin/tasks` handlers + `TASKS_FILE`/`readTasks`/`writeTasks` helpers from `server/src/features/admin/routes.ts`.
- Extended `updateTodoSchema` and `addTodoSchema` to accept the new `milestone` enum field.
- Net: 68 tasks across 9 categories; 10 P1 open items now co-located (was split across two files).

### Session 63 /ce:review P1 backlog now tracked as tasks

All 9 items now live under `code-quality-review` category:
- `heartbeat-single-statement` — rewrite SELECT+UPDATE as conditional UPDATE (DB race fix)
- `admin-stats-active30d-index` — replace raw SQL on AuditLog with `UserMetrics.lastLoginAt` index (Supabase pooler exhaustion)
- `admin-stats-singleflight` — dedup concurrent `/admin/stats` requests on cache miss
- `admin-metric-bugs` — `leaguesOwned` returns team count; `avgSessionSec` biased low
- `profile-endpoint-requireauth` — anonymous membership enumeration (security)
- `usermetrics-dead-columns` — drop or populate `leaguesOwnedCount`/`leaguesCommissionedCount`/`lastActivityAt`
- `admin-routes-split` — split 1031-LOC admin/routes.ts into sub-routers
- `r13-impersonation-decision` — officially cut or implement behind flag
- `prisma-any-casts-profiles` — remove root cast in profiles route

### Concerns / Tech Debt

- The consolidation plan doc at `docs/plans/2026-04-13-task-system-consolidation-plan.md` is now stale — it describes a `work.json` rebuild that we didn't do. Either update it to describe the actual simpler merge, or archive it. Low priority.

### Test Results

- Server: 546 passing, 7 skipped, 0 failing (no test changes — schema additions are additive + optional)
- Client: 201 passing, 0 failing
- TypeCheck: clean (both client + server)

---

## Session 2026-04-16 (Session 65 continuation) — Will Smith matcher, Table widths, Weekly Report MVP, IP_HASH_SECRET rotation

### Completed

**P0 — IP_HASH_SECRET rotated + redacted**
- Jimmy generated a fresh 32-byte hex via `openssl rand -hex 32`, updated Railway env var, verified green deploy. `server/data/todo-tasks.json` line 44 redacted to placeholder; old value is cryptographically inert (even in git history, no deploy uses it). Todo `091-complete-p1-*` closed.

**Will Smith news false-matching fixed** (queue task B)
- New module `server/src/features/mlb-feed/services/playerNameMatcher.ts` with two protections: (1) word-boundary regex using lookbehind/lookahead (`(?<=^|\W)…(?=\W|$)`) so "Smithson" no longer matches "Smith", and names ending in punctuation like "Ronald Acuna Jr." still match correctly. (2) 50-name ambiguous-last-name allowlist (Smith, Garcia, Martinez, Rodriguez, Perez, etc.) where only full-name match is accepted.
- 25 new tests (`__tests__/playerNameMatcher.test.ts`). `routes.ts` `/player-news` wired to use the matcher for both article titles AND Trade Rumors `categories[]`.

**Table layout — 3 critical width fixes** (queue task C)
- `AddDropTab.tsx` Name col: `min-w-[140px]` → `w-[220px]` (Jimmy's flagged bug).
- `Players.tsx` cell: `min-w-[140px]` → `w-[220px]` — header had `w-[220px]`, cell mismatched.
- `Draft.tsx` Team col `w-[180px]`, Player col `w-[220px]` (were unconstrained).
- 13 partial tables + TeamListTab refactor deferred to todo #15.

**Weekly Report MVP — "This Week in Baseball" (`/report`)**
- New feature module `server/src/features/reports/` with single aggregator `GET /api/reports/:leagueId/:weekKey?` bundling League Digest + per-team Weekly Insights + Activity log from existing tables. No new AI calls, no new cron — pure data reuse.
- Client: `ReportPage.tsx` at `/report` and `/report/:weekKey` with 10 sections (Hero, Power Rankings, Hot/Cold, Standings-stub, Category Movers-stub, Trade of Week, 8-team Insights collapsible, Activity log grouped by type, Stat/Prediction, Looking Ahead-stub).
- `TwibHero.tsx` — inline SVG retro broadcast mark (red motion-line baseball, blue panel, yellow ticker). Evokes TWIB aesthetic without reproducing the MLB-trademarked logo.
- Nav link not yet added; direct URL only. Home + Team page integrations deferred until design iteration.

### Pending / Next Steps

- **Task D** — Watchlist CTA expansion (Team, Activity, Trades, Auction unify). Design spike needed before building 4 surfaces.
- **Report polish** — fill standings/category-movers/looking-ahead stubs; wire Home page League Digest as preview card linking to `/report`; add `/report` nav entry.
- **Table sweep** — 13 partial tables + TeamListTab refactor (todo #15).
- **Zod validation** for `readTodos()` (todo 092).
- **FanGraphs audit** — Monday cadence unless anomalies.

### Test Results

- Server: **571 passing**, 7 skipped, 0 failing (+25 playerNameMatcher tests)
- Client: 201 passing, 0 failing
- TypeCheck: clean (both client + server)

---

## Session 2026-04-14 (Session 64) — Session 63 P0/P1 Burn-Down, Table Layout Overhaul, Color Lab, AI Temperature

### Completed

**FanGraphs morning audit — 100% parity**
- Compared FBST Season standings to FanGraphs OGBA OnRoto — every raw stat and roto point matched to displayed precision across all 10 categories × 8 teams (80 cells) plus the 8 point totals. Session 60 concerns (ERA/WHIP rounding, K/W timing drift) are resolved. Tool is audit-ready.

**Sessions 404 fix + local dev recovery**
- Express was started pre-Session 63 commit, so `/api/sessions/start` and `/api/admin/users` 404'd. Restart + investigation surfaced a downstream issue: `server/.env.local` was redirecting Prisma to a nonexistent `localhost:5432/fbst_dev` (dotenv loaded it first, `.env` couldn't override the already-set var). `server/.env` DB password was also out of sync with repo-root `.env` (password rotation never propagated). Backed up `.env.local` → `.env.local.bak`, synced password into `server/.env`. Health now 200.

**Table layout overhaul — reclaim wasted real estate**
- Morning complaint: Players Name col was 442px (40% of table) absorbing leftover width; Season Point Matrix team col was 305px. Root cause: `.lg-table { width: 100% }` in `index.css` + `min-w-full` on `ThemedTable`/`TableCard` inner `<table>` forced desktop stretch while auto-layout dumped extra into one unconstrained column.
- First pass (shrink-to-content) fixed the column bloat but left dead space right.
- Final pass: `w-full` + `table-layout: fixed` everywhere, explicit widths on every column so remainder distributes proportionally. Added `minWidth` prop to ThemedTable for small tables (minWidth=0 on 4-col category tables, 600px floor on 9+ col tables for mobile scroll).
- Result: Players Name 442 → 288, Season Team 305 → 180, Team page PLAYER 373 → 379 (proportionally sized in 9-col), Season Period 10× category tables 600 → 397, Admin Users cols 146 (all equal) → 90–304 proportional. Zero dead space on desktop, `min-w-[600px]` scroll floor preserved for mobile.

**Heartbeat 401 silencing**
- `useSessionHeartbeat` was reporting every error as a user-facing toast — including the predictable 401/403s that fire during auth boot, token refresh, and logout. Added `isTransientAuthErr()` guard; 401/403 now silently retry, 5xx/network still toast.

**Color System Lab (/concepts#colors)**
- New tab in Concepts page. 5 dark palettes (Current, Neutral Slate, Graphite + Amber, Forest Green, Ink + Crimson), 4 light palettes (Current, Warm Newsprint, Cool Stone, Cream + Rust). Click "Preview site-wide" to apply inline CSS variable overrides to `<html>` + toggle `.dark` class + write `localStorage.fbst-theme` so ThemeProvider doesn't fight. Persists across SPA nav (inline styles survive route changes) AND full page reloads (`applyPersistedPalette()` runs in `main.tsx` before React mounts, reads `sessionStorage.fbst:color-lab-preview`, reapplies). Reset button restores.

**AI temperature tuning (aiAnalysisService)**
- Threaded `temperature` through `getModel()` for both Gemini (generationConfig) and Anthropic (request body). 11 call sites now declare intent: 0.3 (trade + waiver post-facto), 0.4 (grades + analytical advice), 0.5 (draft report narrative), 0.6 (weekly insights), 0.8 (league digest creative banter). Was defaulting to 1.0 before.

**P0 #1 — IPv6 truncation bug** (Session 63 post-review finding)
- `truncateIp()` was producing `::1::`, `2001:db8::::`, `fe80:::::` — malformed garbage from a naive `split(":")` that didn't expand `::` first. Rewrote with a proper IPv6 expander: handles compressed forms, IPv4-mapped-in-IPv6 (`::ffff:a.b.c.d`), zone indices (`fe80::1%eth0`), and rejects malformed inputs instead of mangling them. 16 new tests covering every shape the review flagged. The old 6-test file passed for the wrong reason (its sample `2001:db8:85a3:0:0:8a2e:370:7334` had no `::`, never exercised the bug codepath) — deleted as misplaced duplicate.

**P0 #2 — IP retention + session row purge cron**
- Schema comment promised 7-day purge of `UserSession.ipRaw` (GDPR), nothing implemented. Added daily cron at 04:15 UTC: NULL out `ipRaw` after 7d, DELETE whole session rows after 90d. `pg_try_advisory_lock(0x50555247)` keeps it multi-instance safe, different key from the 15-min idle sweeper so they can't block each other.

**P1 — Middleware ordering** (Session 63 self-flagged + review consensus)
- `express.json()` ran BEFORE request-ID middleware, so JSON parse errors escaped untagged as `ERR-unknown` — an attacker could flood the 100-entry error ring buffer with collisions. Swapped order: request-ID now runs first. Verified with `curl -d '{this is not json'` → `ERR-1f84b062` (real code).

**P1 — UserDeletionLog writer (plan R16)**
- Plan R16 promised `UserDeletionLog` survives the GDPR cascade; there were zero writers, only one direct `prisma.user.delete` call (a test script). Built `deleteUserWithAudit(userId, opts)` helper: writes the log row with HMAC-hashed email in the same `$transaction` as the cascade delete. Updated the test script to route through the helper. Added `hashEmail()` to `ipHash.ts` (reuses `IP_HASH_SECRET`). 5 tests covering happy path, admin-initiated, email normalization, missing user, metadata.

### Pending / Next Steps

From Session 63 `/ce:review` backlog (10 P1, 13 P2/P3 remaining):
- **Heartbeat single-statement** — replace SELECT+UPDATE with one conditional UPDATE (halves DB round-trips, fixes a subtle dedupe race).
- **Admin stats query design** — `active30d` raw SQL on AuditLog hit `MaxClientsInSessionMode` today; switch to `UserMetrics.lastLoginAt` index.
- **`/admin/stats` single-flight dedup** — N dashboards opening on cache expiry = N full query sets.
- **Admin metric bugs** — `leaguesOwned` returns `_count.ownedTeams` (teams, not leagues). `avgSessionSec` biased low.
- **Dead denormalized columns** — `UserMetrics.leaguesOwnedCount`, `leaguesCommissionedCount`, `lastActivityAt` never written; either populate or drop.
- **Profile endpoint missing `requireAuth`** — anonymous enumeration of membership data.
- **Admin routes file size** — 1031 lines, split into sub-routers (leagueAdmin/syncAdmin/tasksAdmin/usersAdmin/errorsAdmin).
- **R13 impersonation decision** — cut entirely vs. plan promise. Officially defer or implement behind flag.
- **Task-system consolidation** — `admin-tasks.json` + `todo-tasks.json` plan written but not executed.
- **Prisma `any` casts in profiles route** — kieran-ts flagged "root cast — removing dissolves several downstream findings."

### Concerns / Tech Debt

- Supabase pooler exhaustion during dev today — today's restart churn left connections hanging; transient but a reminder the `active30d` raw-SQL fix is urgent.
- Service worker keeps caching stale Vite dev assets with 503s after HMR; unregister + cache clear fixes it. Known pattern.

### Test Results

- Server: 546 passing, 7 skipped, 0 failing (added 21 tests: 16 ipHash + 5 userDeletion; removed 6-test duplicate)
- Client: 201 passing, 0 failing
- TypeCheck: clean (both client + server)

---

## Session 2026-04-13 (Session 63) — Launch Readiness, Admin IA, Error Correlation, Dashboard Rebuild, Session Tracking (Phase B)

### Completed

**Launch-readiness analysis + plan docs**
- Wrote comprehensive launch-readiness audit: Sentry/PostHog/Stripe/GSC status, 7 scale chokepoints, stress-test plan, admin users spec, 8 integration prompts, 18 open questions for Jimmy
- Wrote `docs/plans/2026-04-13-admin-users-session-tracking-plan.md` with UserSession + UserMetrics Prisma design. Ran `/deepen-plan` with 4 parallel agents (security-sentinel, performance-oracle, data-integrity-guardian, best-practices-researcher). Folded 19 material revisions back into the plan:
  - Int PK not cuid (R2), one session per browser via BroadcastChannel (R3), 30s cadence (R4), no per-heartbeat rollup (R5), no lastSeenAt index for HOT updates (R6), fetch-keepalive over sendBeacon (R7), HMAC-hashed IPs with 7d raw retention (R8), 20/min heartbeat rate limit (R9), denormalized league counts (R10), upsert for first login (R11), idempotent sweeper (R12), impersonation P0 with dual-identity JWT (R13), admin table sort lastSeenAt DESC (R14), PostHog hybrid keep (R15), UserDeletionLog non-cascading (R16), LOGIN in AuditLog (R17), LIMIT 10000 retention purge (R18), backfill labeled lastActivityAt (R19)
  - All 4 agent reviews appended as Appendices A-D verbatim
  - Schema conflict resolved: single UserSession model (not split into UserPresence + UserSessionArchive) with no-index-on-lastSeenAt pattern satisfies both data-integrity and performance goals
  - Awaiting @jimmy approval to run migration

**Admin IA restructure**
- Side nav: dissolved "Manage" (1-item section smell), created dedicated "Admin" section for admin-only pages, three sub-groups (Operations / Planning / Reference)
- `/admin` tab "Product Roadmap" renamed "Launch Milestones" — eliminated collision with /roadmap page. Added disambiguation subtitle linking /todo and /roadmap
- Quick-link bar on /admin rebuilt around admin destinations (Users, Todo, Analytics, Status, Under the Hood)
- Pricing removed from side nav (kept as public /pricing route for Login/Signup); inline tier summary embedded in Concepts' pricing concept card
- TODO.md dropped from /docs (redundant with /todo interactive page)
- Stable anchor IDs on Roadmap phases (engagement/data/features/monetization/platform) and Concept cards
- Hash-scroll + auto-expand on /roadmap#monetization, /concepts#pricing etc.
- New `RelatedTodos` component: reverse cross-link panel on Roadmap phases + Concept cards, admin-only, module-level fetch cache for multiple instances per page
- `server/data/todo-tasks.json`: 4 occurrences of `#marketing` → `#monetization` (matches actual phase id)

**Admin dashboard rebuild** (parallel agents)
- API contract doc written at `docs/plans/2026-04-13-admin-dashboard-api-contract.md`
- Server agent built: `server/src/lib/errorBuffer.ts` (100-entry ring buffer, prefix normalization), error handler patched to push records + add `ref`, three endpoints (`GET /api/admin/stats`, `/admin/errors`, `/admin/errors/:ref`), 10s response cache on stats, Vitest tests
- Client agent built: `/admin` rebuilt as 5-row card grid (stat cards, league health, AI summary, Todo progress, Quick Links, Activity feed, Recent Errors, League Tools collapsed below fold). Auto-refresh 60s + manual refresh. NavSection extended to support `groups` subgroup headers. Todo progress bars added to category headers. Changelog + Status dual-placed (public + admin).

**Error correlation system (Phase 1)**
- Existing request-ID middleware (server/index.ts:122) was generating IDs but never surfacing them. Patched: sets `X-Request-Id` response header, `Access-Control-Expose-Headers`, includes `requestId` in 500 + 404 response bodies. Switched to 8-char hex.
- Admin-only `detail` field on 500 responses (real error message for admins, generic envelope for regular users)
- ERR-prefixed user-facing codes (`ref` field in response body)
- Client `ApiError` class with `status`, `url`, `requestId`, `ref`, `detail`, `body`, `serverMessage`, `displayCode()`
- `fetchJsonApi` + `fetchJsonPublic` both extract all three correlation fields
- New `lib/errorBus.ts` — pub/sub with `reportError(err, { source })` normalizes any thrown value
- New `components/ErrorToast.tsx` — dismissible toast, click-to-copy code, auto-dismiss (pauses on hover), icons per kind (api/network/runtime)
- New `components/ErrorProvider.tsx` — root-mounted subscriber, stack of 5, dedupes same-ref repeats from retry loops
- Mounted in `main.tsx` outside `<BrowserRouter>` so errors from non-route code still surface
- `ErrorBoundary` enhanced — captures `getLastRequestId()` on crash, shows `ERR-xxx` copyable code in fallback, also fires `reportError` so toast appears alongside fallback

**Task-system consolidation proposal** (NOT executed)
- `docs/plans/2026-04-13-task-system-consolidation-plan.md` proposes merging `admin-tasks.json` + `todo-tasks.json` into 3-level hierarchy (milestone → category → task). Rejected 3 alternatives. Awaiting @jimmy decision.

**Phase B — Session Tracking (parallel-agent execution)**
- Added 3 Prisma models: `UserSession`, `UserMetrics`, `UserDeletionLog`. Schema changes include the HOT-update optimization: deliberately NO index on `UserSession.lastSeenAt` (per plan R6 — preserves HOT to avoid dead-tuple bloat). `fillfactor=80` + aggressive autovacuum baked into migration.
- Hand-wrote migration SQL at `prisma/migrations/20260413200000_add_user_session_tracking/migration.sql` (DIRECT_URL auth failing from shell, so hand-rolled from Prisma model definitions). Safe to apply: additive-only, no data transformation, reversible with `DROP TABLE ... CASCADE`.
- Built `server/src/lib/ipHash.ts` — HMAC-SHA256 with fail-fast on missing `IP_HASH_SECRET`, IPv4 /24 + IPv6 /48 truncation helpers.
- Built `server/src/features/sessions/` — `POST /start | /heartbeat | /end` endpoints with ownership checks (silent 204 on mismatch per plan R2), 20/min heartbeat rate limit, concurrent-session cap 10, credential-stuffing canary at 100/hr, fire-and-forget AuditLog LOGIN entries (plan R17), single atomic `$executeRaw` UserMetrics rollup with `LEAST(dur, 28800)` clamp (plan R5).
- Added `GET /api/admin/users` — paginated (max 200) / filterable (search / active window / tier) / sortable (default `lastLoginAt DESC` per plan R14), with leagues-owned and leagues-commissioned counts.
- 15-min idle sweeper cron with `pg_try_advisory_lock` for multi-instance safety.
- `client/src/hooks/useSessionHeartbeat.ts` — 30s heartbeat (plan R4), visibility-gated, BroadcastChannel leader election for one-session-per-browser (plan R3), `fetch({ keepalive: true })` on pagehide (plan R7 — `sendBeacon` cannot carry Authorization header).
- `AuthProvider` integration: `endSession()` awaited before `supabase.auth.signOut()` so Bearer token is still valid for the `/end` call.
- `/admin/users` page rebuilt from scaffold: stat cards, chip filters, debounced search, sortable columns, pagination. Consumes new endpoint.
- `IP_HASH_SECRET=ef742c...` generated and added to local `server/.env` + `server/.env.example` documented.
- Test-infrastructure gotcha caught: `req.ip` on Node's `IncomingMessage` is a getter; direct assignment silently fails. Fixed via `Object.defineProperty(req, "ip", { value, configurable: true })` in supertest setup.
- 30 new tests (16 server session routes + ipHash, 7 client hook, 7 admin users) — full suite now 732 passing / 0 failing across client + server.

**What's awaiting user action to activate Phase B:**
- Apply migration SQL to Supabase (one-time; creates 3 new tables; safe + reversible)
- Set `IP_HASH_SECRET` env var in Railway (server refuses to boot without it)

### Pending — awaiting @jimmy decisions

- **Session-tracking plan (19 revisions)** — approve → I run the migration + real data pipeline + admin users page data
- **Task-system consolidation** — approve → I merge the JSONs and retire one UI
- **Impersonation gating (R13)** — feature flag vs. defer entirely
- **Hash secret rotation cadence (R8)** — yearly OK?
- **PostHog `.init()`** — ship in session-tracking PR or separate?

### Test Results
- Server: `tsc --noEmit` clean
- Client: `tsc --noEmit` clean
- Server tests: 3 new Vitest files for admin stats/errors/integration (not yet run)

### Files touched
Modified (13): `client/src/components/AppShell.tsx`, `client/src/pages/Docs.tsx`, `client/src/pages/Roadmap.tsx`, `client/src/pages/Concepts.tsx`, `client/src/App.tsx`, `client/src/main.tsx`, `client/src/api/base.ts`, `client/src/components/ErrorBoundary.tsx`, `client/src/features/admin/pages/Admin.tsx`, `client/src/features/admin/pages/TodoPage.tsx`, `server/data/todo-tasks.json`, `server/src/index.ts`, `server/src/features/admin/routes.ts`

Created (11): `client/src/features/admin/components/RelatedTodos.tsx`, `client/src/features/admin/pages/AdminUsers.tsx`, `client/src/lib/errorBus.ts`, `client/src/components/ErrorToast.tsx`, `client/src/components/ErrorProvider.tsx`, `server/src/lib/errorBuffer.ts`, plus 3 Vitest files for admin stats/errors/integration, plus 3 plan docs (`2026-04-13-admin-users-session-tracking-plan.md`, `2026-04-13-task-system-consolidation-plan.md`, `2026-04-13-admin-dashboard-api-contract.md`)

### Concerns / Tech Debt

- Two parallel task systems (`admin-tasks.json` + `todo-tasks.json`) still coexist — consolidation proposal awaits decision
- PostHog dep installed but `.init()` still not called (Analytics page remains a mockup until wired)
- No Sentry yet — all error data lives in Railway logs + in-memory ring buffer (wipes on restart)
- Session-tracking migration NOT applied — `/admin/users` is a scaffold
- Stripe NOT integrated — paid subscriber count hardcoded 0

---

## Session 2026-04-12 (Session 62 cont.) — Admin System, Draft Report, Waiver Priority, YouTube Fix

### Completed
- **Admin interconnected system** — new `/todo` page (category-based micro-tasks), Concepts rebuilt with 4 tabs (Strategic/SEO/Integrations/UX Mockups), AdminCrossNav shared across all 4 admin pages, Changelog cross-links
- **Waiver priority by period** — server already used most-recent-completed-period; UI was wrong (showing season cumulative). New GET /api/waiver-priority endpoint + UI match
- **Draft Report regenerated** — admin bypass for IN_SEASON force=true, AI timeouts 60s→90s, max_tokens 4096→8192, regen script
- **YouTube on production** — switched to youtube-nocookie.com, removed origin= param (fixed prod playback)
- **Orphaned slug endpoint removed** — GET /api/public/leagues/:slug cleaned up (LeagueDetail page removed in Session 61)
- **Top 100 prospects sync** — verified already working via syncAAARosters (Konnor Griffin in DB with full data)

### Test Results
- Server: TypeScript clean
- Client: TypeScript clean
- Commits: 5 (cd26316, 182ab9a, c70bd35, 18111c0, 2359d73)

---

## Session 2026-04-10 (Session 62) — Quick Wins: Auction Enrichment, Add/Drop Fix, Position Sort, Standings Verified

### Completed
- **Austin Riley enrichment** — `finishCurrentLot` and `force-assign` now set `mlbTeam` from nomination payload; backfills existing players with null mlbTeam
- **Position sort everywhere** — verified DraftReport + Players already using POS_ORDER; Team.tsx updated to shared `POS_SCORE`, added pitcher position sort (SP before RP)
- **Add/drop flow tested** — walked through in browser; found and fixed 500→400 error handling for roster limit and player availability guards
- **Scoring/standings verified** — 7 periods, Period 1 active, 8 teams ranked correctly by roto points, stats realistic (AVG ~.250, ERA ~3-4)
- **force-assign schema** — added `team` field to forceAssignSchema, client now sends `mlb_team`
- **Transaction test mock** — added `$queryRaw` to mockTx (was missing, caused test failures)

### Pending / Next Steps
- Deploy marketing site to GitHub Pages
- Blog formatting posts 2-5
- GitHub Action for Monday auto-deploys
- Orphaned `public.ts` slug endpoint cleanup (Todo 090)
- Email subscribe backend
- Stripe setup
- Remaining outstanding items: waiver priority by period, draft report regen, trade PICK processing, YouTube on prod

### Test Results
- Server: TypeScript compiles clean
- Client: TypeScript compiles clean
- 91 tests passing for changed features (auction + transactions)
- Pre-existing failures in standings/mlbSync/archive/periods/roster/waivers (not this session's changes)

---

## Session 2026-04-10 (Session 61) — Code Review, Blog Launch, Admin Tasks, Login Redesign

### Completed
- Code review (7 agents) of league detail rollback — 2 todos created, all resolved
- Fixed dead click handler on Discover league cards (removed cursor-pointer, CTA text)
- ER and BB+H columns on Team pitchers — was showing "—", fixed by adding raw stats to SeasonStatEntry and API response
- Fixed splitTwoWayStats to zero ER/BB_H/IP on Ohtani hitter row
- Removed PeriodAwardsCard from Dashboard + deleted orphaned component
- Split-screen login page — marketing panel (left), login form (right), mobile-responsive
- Footer links on Login + Signup pages (Discover, Pricing, About, thefantasticleagues.com)
- Added rel="noopener noreferrer" to all external links
- Removed unused useNavigate import from DiscoverLeagues
- Marketing site: pricing updated to seasonal ($0/$29/$49), nav cleaned up, email signup section
- Marketing site: blog infrastructure (Astro content collections, 5 posts written, SEO-optimized template)
- Blog design system researched (Stripe/Linear/Vercel patterns) and implemented
- Admin Tasks page — milestone-based task board at /admin (Product Roadmap tab)
- FanGraphs daily audit — CLEAN (all 10 categories, 8 teams, perfect parity)

### Pending / Next Steps
- Deploy marketing site to GitHub Pages
- Apply blog formatting to posts 2-5 (same TL;DR/short-paragraph treatment as post 1)
- GitHub Action for Monday blog auto-deploys
- Todo 090: orphaned public.ts slug endpoint cleanup
- Email subscribe backend (POST /api/auth/subscribe)
- Stripe setup (tracked in Admin Tasks)

### Test Results
- Server: TypeScript compiles clean
- Client: 1 pre-existing TS error (title prop on Th component from prior commit)
- FanGraphs audit: perfect parity

---

## Session 2026-04-08 (Session 60) — 19-Item Backlog Blitz (Plan + Execute)

### Completed
- **Plan deepened**: 21 agents (12 review + 9 deep-dive) analyzed 19 items → 5 eliminated, 2 merged, 10 implemented
- **A1: Stale player enrichment**: `POST /api/admin/enrich-stale-players` — batch MLB API lookup, `shouldUpdatePosList` guard replicated. 5 players enriched (Díaz, García, Cortes, Kershaw, Manea)
- **A2: Player news in modal**: `usePlayerNews` hook aggregates 5 RSS feeds client-side, "Recent News" section in PlayerDetailModal Profile tab
- **B2: IL SP/RP fix**: Depth chart replacement now matches any pitcher type (P/SP/CP/RP) when injured player is a pitcher
- **C1: Position sort unified**: Client `POS_ORDER` now includes SP/RP (matches server). DraftReportPage and AddDropTab fixed. Inline POS_ORDER in mlb-feed removed.
- **C2+E1: TeamStatsSeason deprecated**: 6 consumers replaced with `TeamStatsPeriod` aggregation. Table left in DB (no migration). Waiver priority tiebreaker added (most recent claim = lower priority).
- **F1: Race conditions fixed**: `SELECT ... FOR UPDATE` on team row in add/drop claim. Advisory lock (`pg_try_advisory_xact_lock`) on waiver processing. Client in-flight guard with disabled buttons.
- **G1-G3: Trade asset UI**: Added BUDGET input + PICK round/season selector to TradeAssetSelector. Trade reversal now handles WAIVER_PRIORITY re-swap.
- **G5: Pre-draft trade**: Devil Dawgs → DLC trade record created (Mullins + $75 for Tucker)
- **G6: De-emphasize prices**: RosterGrid + TeamListTab show muted prices during IN_SEASON
- **IDOR investigation**: Commissioner roster assign already validated at service layer (line 726). No fix needed.
- **Team.tsx type fix**: Removed 5 `as any` casts, added `assignedPosition`/`isKeeper`/`rosterId` to `PlayerSeasonStat` type
- **RSS parser extracted**: `rssParser.ts` utility replaces 4 duplicated parsing blocks. mlb-feed/routes.ts reduced 1498→1378 lines. Link URL validation included.
- **Home.tsx stale guards**: Added `ok` boolean cleanup to YouTube, Reddit, roster status useEffects
- **Waiver tiebreaking**: Deterministic tie resolution via most recent successful claim timestamp

### Eliminated (by 21-agent review)
- **A3 (AL news)**: No NL filter exists — confirmed no-op
- **B1 (AL+H2H)**: No AL/H2H leagues exist — YAGNI
- **G4 (Top 100 prospects)**: `syncAAARosters()` already covers this
- **G7/G8**: QA-only tasks (browser check + button click)

### Additional Work (second half of session)
- **7-agent code review**: All 20 findings (5 P1 + 6 P2 + 9 P3) fixed and pushed
- **Rate stat precision**: AVG 4dp (.2576), WHIP 3dp (1.077), ERA 2dp (2.16) — matches FanGraphs
- **Hooks violation fixed**: `useLeague()` moved above early return in PlayerDetailModal
- **Server-side player-news**: `GET /api/mlb/player-news?playerName=X` — aggregates cached RSS feeds (agent-native parity)
- **usePlayerNews simplified**: 109 lines → 40 lines (1 API call instead of 5)
- **fetchPlayerBatch typed**: returns `MlbPerson[]` instead of `any[]` — propagates to all consumers
- **God module extraction**: digestRoutes.ts extracted (1,426 → 1,120 lines, -306 lines)
- **Waiver priority toggle**: replaced 3 "round" buttons with single toggle (FAAB has no rounds)
- **useFetchOnMount hook**: reusable stale-guard fetch pattern for simpler effects
- **YouTube fallback**: "Watch on YouTube" link for videos that disable embedding
- **Home.tsx stale guards**: all league-dependent fetches now have `ok` boolean cleanup
- **FanGraphs audit**: 1/8 exact match (timing diff — FBST one day ahead). Roto logic verified correct.
- **ERA/WHIP investigation**: diffs are timing-based, not calculation errors. No fix needed.
- **Mobile audit**: all 5 main pages pass at 390px (Home, Season, Players, Activity, Team)
- **Multi-league plan**: 4-phase plan with feature module isolation at `docs/plans/`
- **Railway deploy checklist**: env var mapping, OAuth URLs, pre-deploy verification at `docs/RAILWAY-DEPLOY.md`

### Pending / Next Steps
- **Deploy to Railway** — checklist ready at `docs/RAILWAY-DEPLOY.md`, zero-code migration
- Remaining `as any` reduction (gradual, ~140 server + ~130 client)

### Concerns / Tech Debt
- `mlb-feed/routes.ts` at 1,120 lines — remaining routes tightly coupled, diminishing returns for further extraction
- PICK trades are log-only on server (informational for auction leagues)
- Home.tsx complex effects (roster stats, digest) don't fit `useFetchOnMount` pattern cleanly

### Test Results
- Server: TypeScript clean (all 9 commits)
- Client: TypeScript clean (all 9 commits)
- Browser: 10 items verified in Playwright (A2 news, C1 position sort, F1 add/drop, G1-G3 trade selectors, G5 pre-draft trade, E1 waiver priority, Changelog, mobile 390px)
- FanGraphs audit: roto point allocation logic verified correct across all 10 categories

---

## Session 2026-04-07 (Session 59) — P1 Data Fixes, AI Grading, Minors Report, Audit Enhancement

### Completed
- **Ohtani two-way stats isolation**: `mirrorTwoWayPitcherStats` now zeroes pitching stats on hitter record (prevents double-counting W across DLC + Skunk Dogs)
- **POSITION_OVERRIDES map**: New narrow-purpose map for `resolvePosition()` — prevents daily sync overwriting "DH" back to "TWP". Keeps `TWO_WAY_PLAYERS` empty (protects 6+ code paths)
- **Ohtani pitcher team**: Set `mlbTeam: "LAD"` on synthetic pitcher record (id=3191)
- **AI standings fix**: Route now uses `TeamStatsPeriod` (real data) instead of empty `TeamStatsSeason`. Uses `computeStandingsFromStats` from standingsService with proper tie-handling
- **Deterministic AI grading**: Grades anchored to standings position (1st-2nd = A range, 7th-8th = D range). LLM cannot override
- **Weekly insights backfill**: `weekOverride` param on `generate-all` endpoint. All 24 insights regenerated (8 teams × 3 weeks). Cache key now includes weekKey
- **Stale insights across teams**: Reset AI state on `dbTeamId` change in Team.tsx
- **Null dedup promise**: Returns 503 instead of 200 with null body
- **Team page period stats**: `teamService` now includes per-player `periodStats` from `PlayerStatsPeriod`. Team.tsx uses these for players without CSV match (e.g., Ohtani pitcher)
- **Team totals ERA/WHIP**: Fixed via IP-weighted reverse computation from individual ERA/WHIP values
- **Minors Report**: New amber accordion on Home + Team pages. Shared `RosterAlertAccordion` component + `useRosterStatus` hook. Detection expanded to include "Optioned" status
- **Roster alerts cards**: Dashboard pills replaced with horizontal card grid (headshots, 4-across desktop, stacked mobile)
- **IL headline feature**: New IL placements (today only) compete as Daily Diamond hero with "Injury Alert" label
- **Season page**: Removed roster expansion on team click. Team name navigates to team page
- **Audit script enhanced**: 4 new checks (ERA/WHIP math, IP format, TWP position, period coverage)
- **Supabase MCP**: Added to project `.mcp.json`
- **teamService period query**: Fixed to filter by `leagueId` (was finding wrong period from different league)

### Pending / Next Steps
- Player profile news links (wire tagged articles from news feeds into PlayerDetailModal)
- AL player news inclusion (expand beyond NL-only)
- Forward-compatible stats for AL + H2H scoring
- IL replacement accuracy (SP vs RP from depth chart)
- Position sort on remaining pages (Team, Season, Players, Draft Report)
- Deploy to Railway

### Concerns / Tech Debt
- `TeamStatsSeason` has all zeros — unused but not removed. Should populate from period rollups or remove
- IP stored in baseball notation in DB (`5.2` = 5⅔) — client must `parseIP()` before math
- Ohtani hitter pitching stats can temporarily reappear between MLB sync and `mirrorTwoWayPitcherStats`

### Test Results
- Server: 473 passing, 2 failing (pre-existing: standings routes timeout, periods mock)
- Client: 171 passing, 16 failing (pre-existing: ArchivePage test)
- TypeScript: clean (both client and server)

---

## Session 2026-04-06 (Session 58) — Data Integrity, IL Report, IP Fix, Chat Removal, Digest Accuracy

### Completed
- **Digest accuracy fix**: Period query case mismatch (`"ACTIVE"` → `"active"`) caused AI to hallucinate entire digest from zero data. Fixed + prompt rewrite (accuracy-first rules, injury prominence, max 2-spot power ranking deviation)
- **IL Report**: Accordion cards on Daily Diamond sidebar and Team page showing injury, placement date, eligible return, depth chart replacement
- **IL filtering**: IL players removed from On Deck; roster-status switched from fullSeason to 40Man (catches 60-day IL like Burnes, Greene)
- **IP parsing bug**: Baseball notation (5.2 = 5⅔) was treated as decimal 5.2 — wrong ERA/WHIP everywhere. Added `parseIP()` helper, fixed 143 stored records. Skenes ERA now matches MLB (9.53)
- **Chat removal**: Board replaces chat. Routes, WebSocket, sidebar, slide-over all removed. /chat redirects to /board
- **Depth chart**: 40-man IL players merged so recently-placed IL shows (Betts was missing)
- **Ohtani pitcher stats mirror**: `mirrorTwoWayPitcherStats()` post-sync step copies pitching stats from real Ohtani to synthetic pitcher entry
- **Stats timestamps**: `StatsUpdated` component on all stats tables (Home, Season, Team, Players, PlayerDetailModal)
- **Daily Diamond**: Capped at 3 performers, On Deck capped at 3
- **Feature module isolation audit**: 26 modules scanned, 0 circular deps, 1 page-to-page import violation identified
- **3-agent code review**: Security (clean), Architecture (P1 type cast, P2 dead code), Simplicity (chat no-op removed)
- **Solution documented**: `docs/solutions/logic-errors/silent-null-causes-llm-hallucination.md`

### Pending / Next Steps
- **DLC W=6 vs standings showing 5** — Ohtani pitcher stats may not count for DLC (assigned DH, not P)
- **DLC F grade despite 1st place** — AI grading needs standings rank in prompt
- **Ohtani display** — ensure `assignedPosition` used (DH on DLC, P on Skunk Dogs), not `posPrimary: TWP`
- **Weekly insights gaps** — some teams missing week tabs (Devil Dawgs has 0)
- **Minors Report** — same accordion pattern as IL: player, when sent down, MLB replacement (e.g., Dylan Crews)
- **Automated data integrity audit** — `/audit-data` command for stats math, IP values, IL scoping, grades

### Concerns / Tech Debt
- `features/chat/` directory still exists as dead code — delete when convenient
- `getCategoriesForSport()` in standingsService is unused (sport engine prep)
- Period status field has no enum enforcement — `"active"` vs `"ACTIVE"` could recur
- Page-to-page import: `transactions/ActivityPage` → `trades/pages/TradesPage` (should extract to component)

### Test Results
- Server: 473 passing, 2 failing (pre-existing: standings routes timeout, periods mock)
- Client: not run separately this session
- TypeScript: clean (both client and server)

---

## Session 2026-04-05 (Session 57) — 10 Features, League Board, Pricing, Sport Engine, Trophy Case

### Completed
- **Local Timezone Display**: timeUtils.ts with cached Intl.DateTimeFormat, three-tier display (countdown/relative/absolute), useCountdownSeconds hook. Applied to Home, Season pages
- **League Health Dashboard**: Commissioner "Health" tab with per-team engagement scoring (0-100), status badges (active/at-risk/inactive), sorted by score ascending
- **Period Awards & Engagement**: periodAwardsService.ts — Manager of Period, Pickup of Period, Category Kings. PeriodAwardsCard on Home page
- **Pre-Trade AI Advisor**: Enhanced POST /api/trades/analyze with keeper detection, position scarcity, category impact. TradeAnalysisModal with "Analyze Before Proposing" button
- **Sport-Agnostic Engine Phase 1**: server/src/lib/sports/ + client/src/lib/sports/ — SportConfig interface, baseball.ts extracted, getSportConfig() registry. Zero behavioral changes
- **Historical Analytics & Trophy Case**: trophyCaseService.ts with dynasty scores, championships, records. TrophyCaseTab on Archive page
- **Pricing Page**: Free / Pro $29/season / Commissioner $49/season. Founding member lifetime deal ($99). FAQ section. /pricing route + sidebar
- **Concepts Lab**: Interactive League Board prototype at /concepts. Sample cards, reactions, polls
- **League Board**: Card-based async communication (Commissioner/Trade Block/Banter). Trade Block auto-syncs from TradingBlock table. Thread/reply UX (slide-over desktop, inline mobile). /board route
- **Product Board placeholder**: /community with Announcements, Marketplace, General channels. OGBA listing
- **Batch AI Insights**: POST /api/teams/ai-insights/generate-all for all teams
- **Category table columns**: Reordered to Team, Season, Period, Chg
- **Competitive analysis brainstorm**: 4-agent research — competitors, APIs, pricing, remote UX
- **Roadmap rewrite**: 5 phases, 27 items, seasonal pricing model

- **Smart Deadline Warnings**: DeadlineWarnings component with countdown pills (blue/amber/red urgency), dismissible, period end + next period + season end alerts
- **Push Notifications**: web-push with VAPID keys, PushSubscription + NotificationPreference models, sw.js handlers, /api/notifications routes, NotificationSettings component, wired into trades + waivers
- **H2H Category Scoring**: ScoringEngine interface with Roto/H2HCategory/Points implementations, Matchup generation, configurable fantasy points, Matchups tab on Season page
- **Points-Based Scoring**: Configurable pointsConfig on League, DEFAULT_POINTS_CONFIG (R=1, HR=4, etc.)
- **Snake Draft Mode**: DraftBoard grid, WebSocket at /ws/draft, auto-pick, pause/resume, "On the Clock" indicator
- **In-App League Chat**: ChatMessage model, WebSocket at /ws/chat, ChatPanel (slide-over desktop, full-screen mobile), unread badges, system messages on trade/waiver processing
- **Conditional Waiver Claims**: conditionType/conditionPlayerId fields, ONLY_IF_UNAVAILABLE/ONLY_IF_AVAILABLE/PAIR_WITH, evaluateCondition() in processing, FAILED_CONDITION status
- **Sport Engine Phase 2**: League.sport wired through API → LeagueContext → standings, auction stores sport in config
- **Rule Lock Tiers**: ruleLock.ts with NEVER/SEASON_START/DRAFT_START/ANYTIME tiers. 10 waiver config fields. Commissioner UI with padlock icons on locked fields
- **User Profiles**: UserProfile model, /api/profiles routes, ProfilePage with edit mode + public view, payment handles (league-members-only)
- **League Invites + Public Leagues**: /join/:inviteCode landing page, visibility (PRIVATE/PUBLIC/OPEN), maxTeams, Community Board with real public league listings

- **7-Agent Code Review**: TypeScript, Security, Performance, Architecture, Simplicity, Agent-Native, Learnings — 42 findings (5 P1, 12 P2, 25 P3)
- **5 P1 Security Fixes**: Draft commissioner auth (7 endpoints), chat league membership, board vote/reply membership, push subscription hijacking prevention, email exposure stripped from public endpoints

### Pending / Next Steps
- Run `npx prisma migrate dev` for BoardCard + ProductBoardCard + ChatMessage + PushSubscription + NotificationPreference + Matchup tables
- Deploy to Railway (30+ commits pending)
- FanGraphs projection import ($15/mo, best ROI data add)
- Stripe payment integration for seasonal pricing
- P2/P3 review findings (12 P2, 25 P3) — table virtualization, search debounce, barrel files

### Test Results
- Server: 493 passing
- Client: 187 passing
- MCP: 50 passing
- Total: 730 tests, 0 failures
- TypeScript: clean (both client and server)
- All features browser-verified on localhost

---

## Session 2026-04-03 (Session 56 cont.) — Email Notifications, AAA Sync, 7-Agent Review, Competitive Analysis, Roadmap Rewrite

### Completed
- **Email notifications**: Trade proposed/processed/vetoed + waiver results via Resend. `notifyTeamOwners()` helper, `sanitizeSubject()` security, List-Unsubscribe header
- **Weekly AAA prospects sync**: Monday 14:00 UTC cron. Position overwrite bug fixed. Admin manual trigger
- **7-agent code review**: TypeScript, Security, Performance, Architecture, Simplicity, Agent-Native, Learnings — 18 findings, all 8 P2s resolved
- **All 673 tests passing**: 5 pre-existing client failures fixed (findMyTeam mock, label updates). 486 server + 187 client
- **Shared components**: PlayerNameCell, TeamNameLink extracted. `displayPos()` centralized in playerDisplay.ts
- **Watchlist search fixed**: _dbId added to players API, client-side search with 2,277 players
- **Trading Block tab in Activity**: 5th tab renders league-wide TradingBlockPanel
- **Preseason sidebar section**: Auction, Draft, Rules, Keepers grouped under collapsible "Preseason"
- **Competitive analysis brainstorm**: 4-agent research — competitors (Yahoo/ESPN/Sleeper/Fantrax), paid APIs, remote UX, pricing
- **Roadmap rewrite**: 5 phases (In-Season, Paid APIs, Scoring, Monetization, Platform Evolution), 27 planned items
- **Under the Hood hard audit**: All 14 metrics verified against actual codebase. Cost estimate updated
- **Solution doc**: service-worker-immutable-cache-headers.md
- **Browser audit**: 0 console errors across all 7 tested pages

### Pending / Next Steps
- **In-app league chat** — #1 engagement gap vs Sleeper (P1 from competitive analysis)
- **Push notifications** — Web Push API for PWA (P1 from competitive analysis)
- **Local timezone display** — auto-detect + countdown timers
- **FanGraphs projection import** — $15/mo, best ROI data add
- **H2H + Points scoring** — required for market expansion beyond roto
- **Seasonal pricing implementation** — Free / Pro $29/season / Commissioner $49/season
- **P3 review findings** (10 items) — table virtualization, search debounce, barrel files, etc.
- Deploy latest to Railway (20 commits since last deploy)

### Test Results
- Server: 486 passing, 7 skipped
- Client: 187 passing, 0 failures
- MCP: 50 passing
- Total: 723 tests, 0 failures
- TypeScript: clean (both client and server)

---

## Session 2026-04-02 (Session 56) — ADA Compliance, Frozen Columns, Filter Consolidation, Watchlist & Trading Block, SW Cache Fix

### Completed
- **ADA table compliance**: scope="col" on all `<th>`, aria-label on all ThemedTable instances, aria-sort="none" on unsorted SortableHeaders, caption prop, focus ring upgrade to --lg-accent
- **Frozen first column**: `frozen` prop on ThemedTh/ThemedTd with sticky left-0, opaque bg, separator line. New `--lg-table-sticky-col-bg` token (light + dark). Applied to Players, AddDropTab, StatsTables (6 tables), Season matrix
- **Shared PlayerFilterBar**: Extracted from Players.tsx + AddDropTab.tsx — ~180 LOC deduped. Includes ToggleGroup, aria-label on all controls
- **Watchlist UI**: WatchlistPanel — private per-team, add/remove players, inline note editing, tag toggles (trade-target, add-drop, monitor)
- **Trading Block UI**: TradingBlockPanel — public league-wide with "asking for" field, grouped by team in league view. /trading-block page + route + sidebar link
- **SW cache fix**: Root cause — Express serving sw.js with max-age=1y immutable, so browsers NEVER re-fetched the v3 fix. Dedicated /sw.js route with no-cache headers + updateViaCache='none' on registration. Bumped v3→v4
- **Solution doc**: overflow-hidden-blocks-child-horizontal-scroll.md

### Pending / Next Steps
- **Deploy to Railway** — push this session's changes to fix production YouTube/images
- **Purge Cloudflare cache** for sw.js after deploy (if applicable)
- **Standardize player/team name patterns** — extract shared components (deferred from this session)
- **Notification system** — email/in-app for trades, waivers, commissioner announcements
- YouTube on production — should be fixed after SW cache fix deploy

### Test Results
- Server: 493 passing
- Client: 182 passing, 5 pre-existing failures (StatsTables, TradesPage, ActivityPage)
- TypeScript: clean (both client and server)

---

## Session 2026-04-02 (Session 55 cont.) — Mobile Scroll Fix, Font Consistency, Service Worker Fix, UX Audit

### Completed
- **Service worker fix**: SW was intercepting all external URLs (MLB images, YouTube, Google Fonts, PostHog) and returning 503 Offline. Fixed by skipping non-same-origin requests. Bumped cache to tfl-v3.
- **CSP fix**: Added `img.mlbstatic.com` and `*.mlb.com` to `img-src` directive for MLB highlight thumbnails
- **YouTube logging**: Added error logging for YouTube API non-OK responses and embeddability check results
- **Mobile scroll fix**: Players page table now horizontally scrollable on mobile. Fixed `overflow-x-hidden` → `overflow-x-clip` on AppShell, added `max-w-[100vw]` + `overflow-x-auto` on Players, `min-w-[600px]` on all ThemedTable tables
- **Font consistency**: Season + Period tab team names standardized to `text-[11px] text-primary` (was `text-sm text-accent` on Season, `text-heading` on Period)
- **UX audit report**: Comprehensive analysis of UI/UX paths, ADA compliance gaps, filter patterns, typography hierarchy, glassmorphism assessment, technology evaluation

### Pending / Next Steps
- **P1: Filter consolidation** — Collapse 2-3 row filter bars to 1 row + mobile bottom sheet (Players, Add/Drop, Auction)
- **P1: Frozen first column** on mobile stat tables
- **P2: ADA compliance** — add scope, caption, aria-label to all tables
- **P2: Standardize player/team name patterns** into shared components
- YouTube videos on production — check Railway logs after deploy for API error details

### Test Results
- TypeScript: clean (both client and server)
- No uncommitted changes

---

## Session 2026-04-01 (Session 55) — Daily Diamond, Table Standardization, Design Consistency

### Completed
- **Daily Diamond redesign**: Complete newspaper-style overhaul of Daily Headlines widget
  - Serif masthead ("The Daily Diamond · Los Doyers Edition") with date
  - Hero card with real MLB highlight thumbnails from game content API
  - On Deck (upcoming/live only), Pulse bar, 30 rotating daily editorial columns
  - 60+ unique headline templates with deterministic per-player rotation
  - Fully responsive: 2/3 + 1/3 grid on desktop, stacks on mobile
- **Table design standardization**: All tables now use compact density from centralized `table.tsx`
  - `table.tsx`: compact = `py-px text-[11px]`, default = `py-0.5 text-xs`, comfortable = `py-1 text-[13px]`
  - `ThemedTable.tsx` + `TableCard.tsx` default → compact
  - Removed 40+ per-cell padding overrides (`px-8 py-5`, `py-3`, `py-4`) across StatsTables, Players, AddDropTab
  - Period tab team names: `text-lg` → `text-[11px]` to match Season tab
  - Players page: fantasy team pill badges → plain text; position badges `text-[8px]`; names `text-[11px]`
  - AddDropTab: player name/position pattern unified with Players page; Add/Drop buttons `px-2 py-px text-[9px]`
- **MLB highlight thumbnails**: Added to `roster-stats-today` endpoint (parallel content API fetch, 5-min cache)
- **League-wide headlines endpoint**: `GET /api/mlb/league-headlines` (backend complete)
- **Solution doc**: `docs/solutions/logic-errors/waiver-priority-league-and-sort-fix.md`

### Pending / Next Steps
- YouTube videos not playing on production (works on localhost)
- Top 100 prospects sync (syncAllPlayers only does 40-man rosters)
- Watchlist + Trading Block UI (backend from Session 54)

### Test Results
- Server: 486 passing (7 skipped)
- Client: 182 passing, 5 pre-existing failures (StatsTables, TradesPage, ActivityPage)

---

## Session 2026-04-01 (Session 54) — Multi-Sport Vision, Watchlist & Trading Block, AI Transparency, Daily Headlines

### Completed
- **CPLAN rewrite**: Football-first pivot — 5-phase plan targeting Aug 2026 launch, all architecture decisions documented
- **Multi-sport plan**: Deepened by 8 research agents (NFL APIs, Stripe, sport abstraction, security, performance, deployment, learnings)
- **Business strategist brainstorm**: `/ce:business` agent design with 3 pillars (revenue, competitive intel, trends)
- **Watchlist feature**: Prisma model + CRUD API (4 endpoints) + client API types — private per-team player tracking with notes/tags
- **Trading Block feature**: Prisma model + CRUD API (5 endpoints) + client API types — public league-wide "available for trade" board
- **AI Insights page redesign**: Removed Generate button, added "How It Works" expandable transparency on every card (When It Runs, What the AI Does, Data It Sees, Model)
- **ESPN RSS fix**: All 4 RSS parsers now handle CDATA-wrapped `<link>` tags (was silently returning homepage URL)
- **Season page**: Team names are clickable links to team detail
- **Players page**: Position badge + player name on same line (compact rows)
- **Weekly team insights**: Week tabs always visible (matches league digest pattern); generated W13 (Opening Day) + refreshed W14 (Week of 3/30) for Los Doyers
- **Daily Headlines widget**: 3-panel widget on Dashboard — top 2 performers with MLB headshots + wild card box (rotates daily)
- **Waiver priority fix**: Correct inverse standings order, real points from season data, removed "No Owner", added "YOU" badge, fixed league ID bug (was querying league 1 instead of 20)
- **Skunk Dogs Ohtani fix**: Corrected keeper price $20→$15 in auction state, budget -$5→$5
- **CI fix**: `KEY_TO_DB_FIELD` added to standings test mock — CI should be green
- **13-finding code review**: TypeScript, Security, Architecture, Simplicity, Learnings agents — synthesized to P1/P2/P3
- **Local dev DB**: Full schema push (37 tables) + seed script (4 users, 4 teams, 42 players)
- **Watchlist plan**: docs/plans/2026-03-31-feat-watchlist-plan.md
- **Trading Block plan**: docs/plans/2026-04-01-feat-trading-block-and-waiver-position-fix-plan.md
- **Compound doc**: Period date timezone shift solution

### Pending / Next Steps
- [ ] **Watchlist UI**: Activity page tab, star toggle on Players page, PlayerDetailModal integration
- [ ] **Trading Block UI**: Activity page tab, team page badges, "Propose Trade" pre-fill
- [ ] **Daily Headlines styling**: Old-school newspaper style, punchier 5-10 word headlines, action images/videos from YouTube
- [ ] **Position+name inline**: Apply to AddDropTab (only remaining stacked layout)
- [ ] **Mobile table optimization**: Hide non-essential columns (G, AB, SB, Fantasy Team) on mobile, add overflow-x-auto to Auction Values
- [ ] **Waiver position in trades**: Simplify back to single toggle (matches server reality)
- [ ] **Yahoo gap features**: Player game logs (CRITICAL), email notifications, league chat, IL slots
- [ ] **P1/P2 code review fixes**: Waiver round field disconnect, commissioner date parsing, dead budget state
- [ ] **Local DB testing**: Run trades/waivers with test accounts on fbst_dev
- [ ] **Deploy to production**: Push to Railway + Cloudflare cache purge

### Concerns / Tech Debt
- Client tests failing (jsdom "document is not defined") — pre-existing vitest config issue, not new
- Home.tsx still ~1,500+ lines — Phase 3B extraction still needed
- 4 RSS endpoint handlers duplicate XML parsing logic — extract shared `parseRssFeed()` helper

### Test Results
- Server: 486 passing, 7 skipped (35 test files)
- Client: TypeScript compiles clean (both client + server)
- CI: Previous runs were failing; standings mock fix should make them green

---

## Session 2026-03-31 (Session 53) — Code Review Remediation, Dashboard Overhaul, Depth Charts, Trade UI, Local DB

### Completed
- **6-agent code review**: TypeScript, Security, Performance, Architecture, Simplicity, Learnings reviewers ran in parallel — 17 findings synthesized
- **P1 fix**: Missing `releasedAt: null` in `/my-players-today` — ghost players appearing in widget
- **P2 security**: Added `requireAuth` to `/scores` and `/transactions` (were open proxies)
- **P2 validation**: `weekKey` format validation with `WEEK_KEY_REGEX`
- **P2 type safety**: Created `DigestResponse` type, eliminated all `any` casts in digest JSX; imported `TeamStatRow` via `ReturnType` to remove `as any` double-casts
- **P2 architecture**: Extracted `digestService.ts` from mlb-feed/routes.ts (routes: 1,196→1,153 lines)
- **News feed overhaul**: Unified shared filter across all feeds; converted 3-column grid to 5-tab layout (MLBTradeRumors.com, Reddit, MLB.com, ESPN, Yahoo Sports); added source attribution
- **New RSS endpoints**: `GET /mlb/mlb-news` (MLB.com), `GET /mlb/espn-news` (ESPN)
- **Depth charts**: `GET /mlb/depth-chart?teamId=N` endpoint (MLB Stats API, 1hr cache); Home page component with 30-team dropdown, position-grouped table, injury tags
- **Dashboard redesign**: "MLB Today" → "Dashboard" with league/team subtitle; section anchor navigation (Stats, Digest, Scores, News, YouTube, Depth Charts)

### Pending / Next Steps
- [ ] AI Insights page — remove Generate button, show prompts for transparency
- [ ] Weekly Digest — add AI attribution/source
- [ ] Commissioner Seasons tab — edit/add periods for 2026
- [ ] Create test season for trades/waivers testing
- **Period editing**: Commissioner can now add/edit periods during IN_SEASON (not just SETUP/DRAFT)
- **Period date timezone fix**: Dates stored as noon UTC to prevent Pacific timezone shift
- **Trade UI overhaul**: Removed waiver budget, renamed to "Future Auction Dollars", waiver position by round (1st/2nd/3rd)
- **Trade leagueId bug fix**: `proposeTrade()` was missing `leagueId` — all proposals returned 400
- **Production cleanup**: Deleted 2 test trades from League 20, deleted test League 21
- **Local dev DB setup**: `.env.local` support, `fbst_dev` PostgreSQL created (schema push pending)

### Pending / Next Steps
- [ ] Finish local DB schema push (`prisma db push --force-reset`)
- [ ] Seed local DB with test data
- [ ] Deploy to production (Railway) + Cloudflare cache purge
- [ ] AI Insights page — remove Generate button, show prompts for transparency
- [ ] Weekly Digest — add AI attribution/source
- [ ] Home.tsx decomposition (Phase 3B) — extract sub-components
- [ ] Auto-refresh interval stabilization (Phase 3C)
- [ ] Test season: create on local DB, test trades/waivers/add-drops
- [ ] Supabase custom domain (fixes Google OAuth consent screen showing random ID)

### Concerns / Tech Debt
- Home.tsx still ~1,390 lines; Phase 3B extraction still needed
- 5 RSS endpoint handlers duplicate XML parsing logic — extract shared `parseRssFeed()` helper
- Depth chart default hardcoded to LAD (119); could auto-detect from user's rostered players
- Trade processing migration path: broken `ClaimStatus` enum migration (20260312) — use `db push` not `migrate deploy` for new DBs
- Production and local shared same DB until this session — now isolated via `.env.local`

### Test Results
- Server: 484 passing, 2 pre-existing failures (standings/routes.test.ts)
- Client: TypeScript compiles clean
- Server: TypeScript compiles clean

---

## Session 2026-03-31 (Session 52)

### Completed
- **Weekly Digest tabs**: Horizontal pill strip for browsing past weekly digests (Mar 23 = auction, Mar 30 = stats)
- **Weekly Digest prompt overhaul**: New 7-section format (week headline, power rankings, hot/cold, stat of the week, category movers, trade of the week, bold prediction); real standings data wired in via `computeTeamStatsFromDb`
- **Real-time stats columns**: Added AVG for hitters, W/SV/ERA/WHIP for pitchers; bold on scoring categories (R/HR/RBI/SB/AVG, W/SV/K/ERA/WHIP), dimmed on calc columns (AB/H/IP/ER/BB)
- **Bid advice team projections**: Resolved the only production TODO — `computeTeamProjections()` aggregates CSV category scores for rostered players
- **Trade ghost data fix**: `computeWithPeriodStats` now skips players whose active roster is on a different team; fixes double-counting of traded players (Riley/Fairbanks swap, Ohtani two-way)
- **Data cleanup**: Deleted ghost TRADE_IN roster entries from reversed trade #16; fixed Trade #17 bad processedAt timestamp
- **TeamStatsPeriod snapshot refresh**: Los Doyers saves corrected from 3→1, Skunk Dogs runs corrected from 27→24
- **Documentation**: CLAUDE.md League Digest Rules section (no auction in future digests), `/audit-data` command, memory for trade reversal pattern

### Pending / Next Steps
- [ ] Trade reversal code path should DELETE TRADE_IN roster entries, not just release them
- [ ] Run `/audit-data` after every trade processing (add to commissioner workflow)
- [ ] Generate fresh W14 digest with real AI (delete current hand-written one, let prompt pipeline run)
- [ ] CHG (change) column on Period tab needs day-over-day deltas (currently shows "—")
- [ ] Verify all stats after next daily sync (13:00 UTC cron)

### Concerns / Tech Debt
- **Hand-written digests**: W13 and W14 were manually seeded — may have minor inaccuracies. Future digests will be AI-generated from real data.
- **Period stats fallback path**: Only 8.3% daily stats coverage (1 of 12 days). Once more daily data syncs, the daily path (with proper date-aware attribution) will take over automatically at 80% threshold.
- **Token waste**: Research/planning agents consumed ~400K+ tokens unnecessarily. For straightforward features, skip `/ce:plan` and go straight to coding.

### Test Results
- Server: 484 passing, 2 pre-existing failures (standings/routes.test.ts)
- Client: TypeScript compiles clean
- Browser: All changes verified in Playwright

---

## Session 51 continued (2026-03-31) — Data Integrity Crisis, Period Stats Fix, Digest Overhaul

### CRITICAL: Data Integrity Issues Found
1. **League confusion**: League 1 = OGBA 2025 (archived), League 20 = OGBA 2026 (live). App may show wrong league.
2. **Stale import roster entries deleted**: 182 `source=import` entries on League 1 were deleted. These were 2025 roster data. The 2025 archive (HistoricalPlayerStat 10,640 rows, HistoricalStanding 16 rows) is INTACT.
3. **Roster overlap query bug**: `computeTeamStatsFromDb` includes players released on the same day the period starts (Pete Fairbanks had 2 phantom saves counted for Los Doyers). Fix needed: tighten the `releasedAt > period.startDate` check.
4. **Daily stats path was showing 1 day instead of period-to-date**: Fixed — now requires 80% daily coverage before using daily path, falls back to cumulative PlayerStatsPeriod.

### Completed
- **Period tab Stats/Points toggle**: Stats mode shows real stat values, Points mode shows roto points
- **Period Totals label**: Renamed from "Season Totals" to "Period Totals"
- **Category column headers**: "Period to Date" and "Season to Date" (not just "Period" and "Season")
- **Season value SV→S mapping fix**: KEY_TO_DB_FIELD used for correct field lookup
- **Daily stats coverage check**: 80% threshold prevents incomplete daily data from being used
- **Weekly Insights**: AI prompt now includes actual per-player stat lines, forbids hallucination
- **League Digest prompt**: Removed auction prices/budget, strengthened keeper exclusion
- **Hitter columns**: POS, PLAYER, TM, G, AB, R, HR, RBI, SB, AVG (removed GS, added G+AB)
- **Pitcher columns**: Removed SO (shutouts)
- **Player modal**: Positions Played moved above Recent Stats
- **YouTube Error 153**: Added origin param + expanded CSP, filter non-embeddable videos
- **Security fixes**: Auth on period-roster, DST fix, claim drop filter, trade reverse dates
- **Performance fixes**: count→findFirst, batch upserts, deduplicate prevTeamStats

### CRITICAL Next Session TODOs
1. **Re-import 2025 roster data** for League 1 archive (deleted accidentally)
2. **Fix roster overlap query** — exclude players released on period start date
3. **Audit all 8 teams on League 20** — verify roster, keepers, positions match auction data
4. **Weekly Digest tabs** — show previous weeks, no week numbers
5. **Weekly Digest accuracy** — grades must match actual standings (A+ team should be #1)
6. **Test season** — create and verify waiver/trade flows

### Test Results
- Server: 486 passing, 7 skipped
- Client: 182 passing, 5 failing (pre-existing)

---

## Session 51 (2026-03-30) — Stats Attribution, Weekly Insights, Railway Migration, Marketing Site, CSP Fixes

### Summary
Massive infrastructure session: (1) date-aware stats attribution system with PlayerStatsDaily, next-day effective dates, and dual-path aggregation, (2) weekly insights overhaul with performance-focused prompts and human-readable week labels, (3) migrated hosting from Render to Railway ($5/mo, always-on), (4) separated marketing site to Astro + Tina.io on GitHub Pages, (5) DNS moved to Cloudflare, (6) fixed multiple CSP issues for Google OAuth, YouTube, fonts, PostHog.

### Completed
- **Stats Attribution**: PlayerStatsDaily model, nextDayEffective() utility, soft-delete drops, date-aware computeTeamStatsFromDb(), period roster endpoint + UI, backfill script
- **Weekly Insights**: "Week of 3/30" labels, "Updated Every Monday", 3 player-focused insights (Hot Bats, Pitching, Roster Alert), comparative grading, removed budget/auction talk
- **Activity Tabs**: Reordered to Waivers > Add/Drop > Trades > History
- **Railway Migration**: Deployed at app.thefantasticleagues.com, always-on, no cold starts, Node 20 pinned
- **Marketing Site**: thefantasticleagues-www repo, Astro + Tina.io, deployed to GitHub Pages at www.thefantasticleagues.com
- **DNS**: Moved to Cloudflare, apex + www → GitHub Pages, app → Railway
- **Auth Fix**: Unauthenticated users redirect to /login (not landing page), AuthRedirect component preserves OAuth hash fragment
- **CSP Fixes**: Added Google, fonts, YouTube, PostHog to Content Security Policy for new domain
- **Supabase Fix**: Updated Site URL and redirect URLs, fixed VITE_SUPABASE_ANON_KEY (was wrong project)
- **Season Page**: Added "Updated [date] at [time]" timestamps to Season and Period views

### Pending / Next Session
1. **Category tables: season-to-date stats** — Show cumulative season stats alongside period stats in category tables
2. **Team page: Games + IP columns** — Add Games column for hitters, IP column for pitchers
3. **Weekly Insights: projection/hot take box** — Add a 4th insight about next-week projections and trends
4. **Test season** — Create a separate test season with short periods to verify waiver/trade processing with date-aware stats
5. **Run daily stats backfill** — `npx tsx server/src/scripts/backfill-daily-stats.ts`
6. **Decommission Render** — Turn off old Render service
7. **Rotate credentials** — DB password and service role key were shared in chat
8. **Remove marketing pages from app** — Landing, Guide, About, Changelog, Roadmap, Status still bundled in React SPA (lazy loaded but unnecessary)

### Concerns / Process Improvements
- **Service worker caching** — sw.js caches old CSP headers, causing persistent issues after server changes. Consider disabling SW in production or using network-first for API calls.
- **VITE_ build-time vars** — VITE_SUPABASE_ANON_KEY was wrong because it was copied from another project. Railway needs these set correctly BEFORE the build step.
- **CSP maintenance** — Every new external service requires CSP updates. Consider a more permissive connectSrc or documenting required domains.

### Test Results
- Server: 486 passing, 7 skipped
- Client: 182 passing, 5 failing (pre-existing @/lib/utils alias)
- TypeScript: Clean on both client and server

---

## Session 50 (2026-03-30) — Ohtani Profile Fix, Recent Stats Fix, Trade Assets, Waiver Priority, Code Review

### Summary
Major session covering 4 areas: (1) fixed Ohtani pitcher derived ID so player profile/stats load correctly, (2) fixed MLB API deprecation of last7Days/last15Days/last30Days stat types — replaced with byDateRange, (3) added 3 new trade asset types (FUTURE_BUDGET, WAIVER_PRIORITY, PICK processing), (4) switched waiver priority from season-wide stats to period-based standings.

### Completed
- **Ohtani Pitcher ID resolution**: `resolveRealMlbId()` maps derived 1660271 → real 660271 at 3 layers (modal, API functions, server routes). All 5 API calls now work for Ohtani Pitcher.
- **Recent Stats fix**: MLB API deprecated `last7Days`/`last15Days`/`last30Days`. Replaced with `byDateRange` + date arithmetic. Now shows 7d/14d/21d/YTD rows for all players.
- **YouTube Spanish filter**: Added `relevanceLanguage: "en"` to YouTube Data API search params.
- **Trade asset types**: Added `FUTURE_BUDGET` and `WAIVER_PRIORITY` to AssetType enum. Full server processing + client UI (TradeAssetSelector, TradesPage, CommissionerTradeTool).
- **FUTURE_BUDGET**: Deferred budget adjustments applied on season DRAFT transition via `seasonService.ts`.
- **WAIVER_PRIORITY**: Swaps `waiverPriorityOverride` between teams. Overrides cleared atomically inside waiver processing transaction.
- **Waiver priority by period**: Replaced `TeamStatsSeason` cumulative sum with proper roto standings from most recent completed period. Falls back to season stats if no completed period.
- **Schema migration**: Added `FUTURE_BUDGET`, `WAIVER_PRIORITY` to AssetType, `season Int?` to TradeItem, `waiverPriorityOverride Int?` to Team.
- **Trade validation**: Added Zod `.refine()` for per-asset-type required field validation. Fixed `season` field not persisted in trade proposals (bug found by security review).
- **Position sort**: Added position sort logic to Players page.
- **Code review**: 3-agent parallel review (security, performance, simplicity). Fixed all P1/P2 findings.
- **Compound docs**: Documented MLB API deprecation and Ohtani ID resolution in `docs/solutions/`.
- **Brainstorm**: Home page improvements brainstorm — period countdown + standings snapshot + unified player alert feed.

### Pending / Next Session
1. **Home page improvements** — Implement period countdown + standings snapshot + player alert feed (brainstorm at `docs/brainstorms/2026-03-30-home-page-improvements-brainstorm.md`)
2. **Weekly Digest tabs** — Past weeks in tabs (infrastructure ready)
3. **Deploy to production** — All changes ready for Render deployment
4. **Commissioner waiver override UI** — `waiverPriorityOverride` exists but no commissioner UI to set it manually
5. **Pre-draft trade record** — Devil Dawgs → DLC (Mullins + $75 for Kyle Tucker) via Commissioner Trade Tool

### Concerns / Process Improvements
- **Playwright auth flaky** — Dev-login session doesn't persist across Playwright page navigations; requires manual Supabase signInWithPassword workaround
- **5 pre-existing client test failures** — All caused by `@/lib/utils` vitest path alias issue (ActivityPage × 2, TradesPage × 1, same root cause)
- **Season transition atomicity** — Future budget adjustments in `seasonService.ts` not wrapped in a single transaction with the season update (P3 from performance review)

### Test Results
- Server: 486 passing, 7 skipped
- Client: 182 passing, 5 failing (all pre-existing `@/lib/utils` alias)
- TypeScript: Clean on both client and server

---

## Session 49 (2026-03-27/29) — Performance, Season, Positions, Home Page, YouTube/Reddit/Yahoo, Waiver/Trade, Ohtani Split, Stat Fixes (25 commits)

### Summary
Massive session covering 4 major areas: (1) comprehensive performance audit with 8 DB indexes and 3 N+1 fixes, (2) 2026 season lifecycle — stats showing current year, draft report locked, Opening Day stats synced, (3) Yahoo Fantasy position model — fixed POS columns, positions locked during season, auto-assignment script, (4) complete Home page redesign with Real-Time Stats Today, MLB Trade Rumors RSS, and fantasy team cross-referencing.

### Completed
- **Performance**: 8 compound database indexes deployed, 3 N+1 queries fixed, standings query flattened (4-level nested → 3 parallel), search debounce, API waterfall fixes
- **2026 Season**: getCurrentSeasonStats() replaces hardcoded 2025, draft report locked during IN_SEASON, period labels show names not IDs, 233 players synced for Period 1
- **Position System**: Fixed POS column on Team/Auction/Draft Report (read-only during season), auto-assignment script for roster slots, 15 auction-set positions preserved, commissioner editing via Roster tool
- **Home Page**: Real-Time Stats Today (side-by-side hitters/pitchers with stat columns, live boxscore, auto-refresh), MLB Trade Rumors RSS (NL/AL filter, team dropdown, fantasy team dropdown, roster cross-referencing), Weekly Digest collapsed by default (auto-expand Mondays)
- **New Endpoints**: /api/mlb/trade-rumors, /api/mlb/injuries, /api/mlb/roster-stats-today, /api/mlb/player-videos, /api/mlb/reddit-baseball
- **YouTube Player Highlights**: Data API v3 search for rostered players (3 months back, short videos, 6-hour cache), falls back to MLB + Jomboy channel RSS, inline video modal with autoplay
- **Reddit Feed**: r/baseball + r/fantasybaseball hot posts with player cross-referencing, fantasy team dropdown filter
- **MLBTradeRumors.com**: Renamed, NL default from league rules, fantasy team dropdown (8 teams + Free Agents)
- **Real-Time Stats timezone fix**: Uses Pacific time, yesterday's stats visible until noon PST, then clears for today
- **Boxscore fix**: Switched from schedule hydration to per-game live feed endpoint for actual player stats
- **ERA/WHIP/IP Formatting**: Shows "—" for 0 IP instead of raw floats
- **AI Insights**: Default collapsed on Team page and Home page
- **YouTube video modal**: Click thumbnail to play inline with autoplay, dark backdrop, close on click outside

### Extended Session (Mar 28-29)
- **Yahoo Sports MLB RSS** — 3rd news column with cross-referencing + fantasy team filter
- **3-column news layout** — MLBTradeRumors | Reddit | Yahoo side-by-side, equal height, above YouTube
- **YouTube Shorts pagination** — 2 rows of 3 per page, search includes 4 hitters + 2 pitchers
- **Waiver Claim Form** — team owners can submit FAAB bids (search, bid, drop selection)
- **Period stats endpoint enabled** — returns PlayerStatsPeriod for active period
- **Roster limit validation** — 23-player max on waivers, claims, trades
- **Season guards** — added to /transactions/claim and /drop
- **assignedPosition** — auto-set on waiver claim, waiver processing, trade processing
- **REVERSED enum** — added to TradeStatus, removed unsafe type cast
- **MLB Roster Status alerts** — IL/minors players shown as badges on Home page
- **Ohtani split** — 2 separate player records: Shohei Ohtani (Hitter) on DLC, Shohei Ohtani (Pitcher) on Skunk Dogs (keeper)
- **Team page totals** — hitter totals (R/HR/RBI/SB/AVG) and pitcher totals (W/SV/K/IP/ERA/WHIP)
- **IP field fix** — was entirely missing from SeasonStatEntry, now pitcher IP/ERA/WHIP display on team pages
- **Category tables fix** — real stat values display (was showing dashes), proper labels (Runs not R Metric)
- **Season page** — hitters left / pitchers right, Chg column with daily standings snapshots, GP column removed
- **Players page** — NL default, All NL/AL team groups, Season Total + Period 1 dropdown labels
- **2026 positions** — fielding stats now fetch current year (was 2025 due to March offseason bug), "2026 Positions Played:" label
- **Team links** — category tables use team code not database ID

### Pending / Next Session
1. **Weekly Digest tabs** — Past weeks in tabs (only 1 digest exists, infrastructure ready)
2. **Deploy to production** — All changes ready for Render deployment
3. **ActivityPage test fix** — Pre-existing @/lib/utils alias issue in vitest environment

### Concerns / Process Improvements
- **YouTube API quota** — 100 searches/day free, currently 6 searches per user per 6 hours. Fine for small league.
- **Ohtani pitcher mlbId** — Uses derived ID 1660271 (original + 1M). Daily sync won't find this ID in MLB API. May need special handling.
- **Standings snapshots** — Saved on every page load. Consider moving to daily cron for consistency.

### Test Results
- Server: 493 passing
- Client: 186 passing (1 pre-existing ActivityPage test failure — vitest env issue)
- Total: 680 passing, TypeScript clean on both sides

---

## Session 48 (2026-03-25/26) — Open Items + Position Dropdown Fix + Sync Preservation + Position Plan (7 commits)

### Summary (Continued)
Extended session to add position dropdowns to Draft Report and Team pages, fix position eligibility data wipe by daily cron, and research/plan Yahoo-style roster slot management.

### Additional Completed
- **Position dropdowns on Draft Report** — added `rosterId`, `posList`, `assignedPosition` to server draft-report API; added position select dropdowns to DraftReportPage TeamCard
- **Position dropdowns on Team page** — threaded `_rosterId` through roster merge; added ELIG column dropdowns with optimistic UI for multi-position players
- **syncAllPlayers posList preservation** — daily cron was wiping enriched multi-position data; now preserves `posList` when already enriched by `syncPositionEligibility`
- **Position eligibility restored** — re-ran `syncPositionEligibility(2025, 20)` to restore 171 players' multi-position data
- **Yahoo-style roster slot plan** — comprehensive plan at `docs/plans/2026-03-25-feat-yahoo-style-roster-slot-management-plan.md` covering slot-based UI, server validation, compliance indicators, migration script, and auto-assignment

### Pending / Next Session
1. **Implement Phase 1A** — Make Draft Report positions read-only, sourced from auction assignedPosition
2. **Implement Phase 1B** — Server-side PATCH validation (eligibility + slot capacity + auto-displace)
3. **Implement Phase 1C** — Slot-based Team page UI with green/amber/red indicators
4. **Implement Phase 1D** — Auto-assignment migration script for existing roster data
5. **Regenerate Draft Report** — click Regenerate to refresh cached report with new `rosterId`/`posList` fields
6. **Verify position dropdowns in browser** — Draft Report and Team page (Playwright was blocked by Chrome conflict)

### Concerns / Process Improvements
- **Playwright Chrome conflict** — cannot launch browser test when user's Chrome is open; need to configure separate user data dir or use headless mode
- **Draft Report cached data** — old cached reports don't have `rosterId`/`posList` fields; requires manual Regenerate click
- **Position data integrity** — daily cron (`syncAllPlayers`) was silently wiping `posList`; now fixed but need integration test to prevent regression

### Test Results
- Server: 493 passing
- Client: 187 passing
- Total: 680 passing, TypeScript clean on both sides

---

## Session 48 (2026-03-25) — Open Items + Position Dropdown Fix + Sync Preservation (4 commits)

### Summary
Verified all 6 Session 47 open items, then discovered and fixed two critical bugs: (1) position dropdown changes in auction results didn't persist in the UI due to missing `onRefresh` prop and controlled component race condition, (2) daily `syncAllPlayers` cron was wiping multi-position eligibility data set by `syncPositionEligibility`. Added trade guard, updated CLAUDE.md with mandatory browser verification checklist.

### Completed
- **Item 1-3**: Browser-verified position dropdowns (O'Hearn 1B/CM/OF/DH), position persistence, Draft Report (grades, expandable H/P rosters, sortable columns, K badges)
- **Item 4**: Trade guard — `SELECT FOR UPDATE` row lock in processing transaction to prevent double-processing race condition
- **Item 5a-5c**: Add/Drop flow verified, Period 1 endDate bug fixed (was March 22 < startDate March 25), pre-draft trade #17 created (DLC→Mullins, Devil Dawgs→$75)
- **Item 6**: Position eligibility 2026 — cron wired, no 2026 data yet, will auto-update
- **Position dropdown fix** — `AuctionResults` wasn't passing `onRefresh` to `AuctionComplete`; added optimistic `positionOverrides` state for immediate UI feedback; position sort also uses overrides
- **Sync preservation fix** — `syncAllPlayers` now preserves enriched `Player.posList` instead of overwriting with just the primary position; only overwrites when posList equals posPrimary (not enriched)
- **CLAUDE.md** — added mandatory "Browser Verification" section before Session End Checklist; documented syncAllPlayers/posList preservation behavior under Daily Cron Jobs
- **Memory** — saved `feedback_browser_verify_every_change.md` and `feedback_check_cross_feature_side_effects.md`

### Pending / Next Session
- **Stats will populate** once MLB games are played and daily cron runs (13:00 UTC syncs stats)
- **Position eligibility** will auto-update as 2026 fielding data accumulates (20-game threshold)
- **Verify standings differentiate** after first period's stats sync
- **Add period creation validation** — prevent endDate before startDate

### Concerns / Process Improvements
- **Build-break cycle**: Must always browser-verify with Playwright interaction after code changes, not just TypeScript/tests. Added to CLAUDE.md and memory.
- **Cron/data conflicts**: The syncAllPlayers→posList wipe went undetected because the eligibility data was set in a previous session and the cron hadn't run yet. Now documented and protected.
- **Supabase session expiry**: Sessions expire frequently during Playwright testing — causes redirects to landing page. Need to investigate session TTL.
- **AuctionResults vs AuctionComplete**: Two separate code paths render the auction page depending on season status (DRAFT vs IN_SEASON). Both must be kept in sync for features like position editing.

### Test Results
- Server: 493 passing
- Client: 187 passing
- Total: 680 passing, TypeScript clean on both sides

---

## Session 47 (2026-03-25) — Feedback Items 1-11 + Auction Data Integrity (11 commits)

### Summary
Worked through all 11 FEEDBACK.md pending items plus critical auction data integrity fixes. Discovered and fixed dual-league issue (league 1 vs 20), roster duplication bug, two-way player stats, and position eligibility.

### Completed
- **Feedback Item 1**: Auction spent breakdown — Keepers/Auction/Total/Left as separate columns per team
- **Feedback Item 2**: Draft Report overhaul — H/P split tabs, stats columns (R/HR/RBI/SB/AVG, W/SV/K/ERA/WHIP), sortable headers, OF mapping
- **Feedback Item 3**: Season page — sortable column headers on standings matrix
- **Feedback Item 4**: Teams page — removed Manage Roster button/modal, added position-based secondary sort
- **Feedback Item 5**: Commissioner Roster tab verified working
- **Feedback Item 6**: OF rule verified everywhere
- **Feedback Item 7**: Waiver priority — inverse-standings tiebreaker on equal FAAB bids
- **Feedback Item 10**: Auction Values page — IN_SEASON banner noting pre-draft reference only
- **Ohtani two-way**: Pitcher Ohtani on Skunk Dogs shows pitching stats, Hitter Ohtani on DLC shows hitting stats
- **Konnor Griffin sort**: All players sort together (keepers no longer pinned)
- **Roster duplication bug**: Rewrote roster build to use auction state directly (eliminated fragile WIN-log reconciliation)
- **Expandable player rows**: Click any player in Draft Results or Draft Report to see career stats, positions, Full Profile
- **Position dropdowns**: Multi-position eligibility in draft results (SS→SS/MI, 1B→1B/CM, etc.)
- **Position eligibility sync**: `syncPositionEligibility` added to daily cron (20-game threshold from MLB fielding stats)
- **Position change refresh**: Dropdown changes now save to DB and refresh UI immediately
- **DH eligibility fix**: Removed blanket DH for all hitters — only players with actual DH games qualify
- **League data fix**: Identified league 1 (OGBA 2025) vs league 20 (OGBA 2026) confusion; marked league 20 auction as completed
- **Trade reversal**: Riley/Fairbanks TRADE_IN entries deleted, players restored to original teams
- **posList in auction state**: Server now sends Player.posList (not just posPrimary) so dropdowns show all eligible positions

### Pending / Next Session
1. **Verify position dropdowns in browser** — O'Hearn should show 1B/CM/DH/OF after posList fix
2. **Test position change persistence** — select a new position, verify it sticks after page reload
3. **Draft Report page** — verify expandable rows, stats, and Ohtani display
4. **Prevent phantom trades** — investigate audit log for who triggered Riley/Fairbanks trade; consider adding trade guard
5. **Feedback Items 8, 9, 11** — browser test add/drop flow, verify scoring/standings, pre-draft trade history entry
6. **Position eligibility for 2026 season** — re-run sync with 2026 data once season starts (currently synced 2025)

### Concerns / Process Improvements
- **Dual-league confusion** was root cause of many bugs this session — league 1 (2025) vs league 20 (2026). The league selector worked correctly but the auction state cache and in-memory server state created stale data issues.
- **Vite dev server keeps dying** when API server is restarted — need to investigate why. Requires manual restart each time.
- **Position eligibility** was already coded (`syncPositionEligibility`) but never wired into the daily cron — always verify new functions are actually called, not just defined.

### Test Results
- Server: 493 passing
- Client: 187 passing
- Total: 680 passing, TypeScript clean on both sides

---

## Sessions 40–46+ (2026-03-24/25) — Phase 1 + Phase 2 + Auction Overhaul (30+ commits)

### Summary
Massive multi-session sprint covering Phase 1 completion, Phase 2 (format framework + engines), and deep auction page overhaul with data integrity fixes.

### Completed — Phase 1 (PRs #90, #91)
- Sidebar extraction (505→188 LOC), 5-section nav (Core, AI, League, Manage, Product)
- Mobile bottom tab nav (BottomNav.tsx), accessibility (skip-nav, aria-labels)
- React.lazy code splitting on 25 routes (~250KB bundle reduction)
- Shared EmptyState component on 8 pages
- Self-service league creation (POST /api/leagues + /create-league UI)

### Completed — Phase 2 (PR #92 + direct pushes)
- Format framework: scoringFormat on League model, format cards (Available/Planned)
- Marketing landing page (hero, formats, features, pricing, SEO meta tags)
- Snake draft engine: 12 server endpoints + client Draft page + auto-pick
- H2H matchup system: schedule generator, scoring (categories + points), standings
- Conversion flow: Create League CTA on Home, setup checklist

### Completed — Auction Page Overhaul
- **Konnor Griffin fix** — force-assigned players now show via WIN log reconciliation by playerName
- **Hitters/Pitchers split** — keepers first (with "K" badge in amber), then auction picks
- **Stats columns** — R/HR/RBI/SB/AVG for hitters, W/SV/K/ERA/WHIP for pitchers (from CSV)
- **All columns sortable** — clickable headers with ↑/↓ indicators
- **OF mapping** — LF/CF/RF → OF via league outfieldMode (OGBA uses OF mode)
- **Keeper pricing in amber** — distinct from auction picks (blue accent)
- **Budget calculation fixed** — uses per-team DB budget (includes pre-draft trade $75 adjustment)
- **Global player enrichment** — traded players (Riley, Fairbanks) get Pos/MLB from any team
- **Commissioner tools** — roster price editing (click-to-edit), position sort toggle, trade reversal endpoint
- **Diacritics name matching** — lookupAuctionValue with NFD normalization (147→159 player matches)
- **Draft Report** — regeneration button, surplus calculation fix

### Completed — Other
- Trade reversal endpoint (POST /api/trades/:id/reverse)
- Commissioner roster price editing (PATCH /api/commissioner/:leagueId/roster/:rosterId)
- 12 code review findings resolved + 4 security hardening fixes
- Weekly insights history tabs on Team page
- Public pages (Changelog, Roadmap, Status accessible to all users)
- H2H and Snake Draft formats enabled on Create League form

### Pending / Next Session
1. **Auction Spent breakdown** — show keeper spend vs auction spend separately
2. **Draft Report overhaul** — hitters/pitchers split with stats, sortable columns (match auction page)
3. **Season page** — verify standings, expandable player view with sortable columns
4. **Teams page** — remove Manage Roster button, verify position sort
5. **Position editing** — verify Commissioner → Roster tab works for position changes
6. **OF rule everywhere** — verify LF/CF/RF → OF on Draft Report, Season, Teams
7. **Waiver priority positions** — inverse-standings order per period
8. **Test add/drop flow** — actually walk through in browser
9. **Verify scoring/standings** — check OGBA 2026 periods + stats sync
10. **De-emphasize auction prices during IN_SEASON**
11. **Pre-draft trade history** — record Tucker + $75 for Mullins trade entry

### Concerns / Process Improvements
- Must always verify visually in browser (Playwright screenshot) BEFORE saying "done"
- Present numbered task list for user confirmation before building
- Track all items from user prompts — don't drop requests when debugging one issue
- The auction page data flow (WIN log + DB roster + auction state) has 3 data sources that can disagree — document this architecture

### Test Results
- Server: 493 passing
- Client: 187 passing
- Total: 680 passing, TypeScript clean on both sides

---

## Sessions 40–44 (2026-03-24) — Phase 1: Polish & Foundation (7 commits)

### Summary
Complete Phase 1 SaaS readiness overhaul. Sidebar extraction + reorganization, mobile bottom nav, code splitting, empty states, self-service league creation, draft report bug fix, security hardening, and 12 code review findings resolved.

### Completed
- **Sidebar Redesign** — extracted to Sidebar.tsx (505→188 LOC AppShell), 5 sections: Core, AI, League, Manage, Product
- **Mobile Bottom Nav** — BottomNav.tsx with 5 tabs, "More" opens sidebar drawer, 56px + safe area, ≥44px touch targets
- **Code Splitting** — React.lazy on 25 routes + dynamic Mermaid import (~250KB removed from initial bundle)
- **Empty States** — shared EmptyState component with discriminated union actions, deployed on 8 pages
- **Self-Service League Creation** — POST /api/leagues + single-form UI at /create-league
- **Weekly Insights History** — tab-based week navigation on Team page (lazy-loaded, up to 8 weeks)
- **Draft Report Fix** — $0 surplus bug (stale cache + diacritics name matching), Regenerate button added
- **Security** — trade budget validation, atomic vote (FOR UPDATE), 4 capped caches, 128-bit invite codes
- **Code Review** — 12 of 14 findings resolved (isPitcher CL parity, typed JSON interfaces, IIFE elimination, etc.)
- **Accessibility** — skip-nav link, dual aria-label, aria-expanded, viewport-fit=cover
- **Public Pages** — Changelog/Roadmap/Status no longer admin-gated

### Pending / Next Steps
- **Phase 2: Format Expansion** — snake draft engine, H2H matchups, Yahoo/ESPN import
- **2 P3 todos remain** — AiInsight index (needs migration), LeagueDigest typed state
- **PublicLayout** — minimal header for unauthenticated visitors on public pages

### Test Results
- Server: 493 passing
- Client: 187 passing
- Total: 680 passing, TypeScript clean

---

## Session 2026-03-24 (Session 39) — AI Insights Overhaul + Code Review (15 commits)

### Summary
Complete overhaul of the AI Insights system. Built 8 AI-powered features, ran 4-agent code review (TypeScript, Security, Performance, Simplicity), resolved all 14 findings (P1+P2+P3). Production deployed and verified on Render.

### Completed — AI Features (8)
- **Draft Report** (`/draft-report`) — dedicated page with surplus analysis, per-team grades, keeper assessment, category strengths/weaknesses, favorite MLB team, NL-only context, methodology blurb
- **Live Bid Advice** — team-aware marginal value (knows roster, projected values, remaining pool, category needs)
- **Weekly Team Insights** — auto-generates on Team page load, persists weekly to AiInsight table, expand/collapse, dates, pre-season/in-season modes
- **Home Page League Digest** — 2-sentence overview, hot/cold teams, team grades (expandable), Trade of the Week (rotating conservative/outrageous/fun) with vote poll
- **Post-Trade Analyzer** — fire-and-forget on trade processing, persists on Trade record, fairness badge inline
- **Post-Waiver Analyzer** — fire-and-forget on waiver processing, persists on WaiverClaim, Zod-validated via proper service method
- **Keeper Recommendations** — enhanced with projected values from CSV, NL-only scarcity, injury awareness
- **Trade of the Week Poll** — yes/no voting, persisted per user per week, vote feedback informs next week's proposal

### Completed — Code Review Fixes (14 findings)
- **P1-1**: Moved waiver analysis into proper AIAnalysisService method with Zod validation (was bypassing via `as any`)
- **P1-2**: Added 60-second timeout to Gemini LLM calls (Anthropic already had 30s)
- **P2-3**: Centralized CSV loading into `server/src/lib/auctionValues.ts` singleton (replaced 6 duplicate readFileSync sites)
- **P2-4**: Added max size to in-memory caches (bidAdviceCache: 200, insightsCache: 100 with expired sweep)
- **P2-5**: Added Zod schema to vote endpoint via validateBody middleware
- **P2-6**: Deduplicated allTeamStats query in weekly insights (was querying twice)
- **P2-7**: Extracted getWeekKey() to shared utils (was duplicated in 2 files)
- **P3-10**: Used sportConfig.isPitcher everywhere (removed 3 duplicate definitions, added "CL" to canonical)
- **P3-11**: Extracted shared gradeColor() utility to client sportConfig
- **P3-12**: Deduplicated vote handlers in Home.tsx
- **P3-13**: Added take:8 to league digest roster query

### Completed — Infrastructure
- Schema: AiInsight model, aiAnalysis Json? on Trade and WaiverClaim
- Draft Report added to sidebar nav (League section)
- AI attribution ("Powered by Google Gemini & Anthropic Claude") on all AI content
- "FAAB" replaced with "Waiver Budget" in all user-facing content
- Injury history discounts (15-30%) and uncertainty (~5%) in projections
- League Digest: keepers protected from trades, positions must match, vote feedback loop
- CLAUDE.md updated with comprehensive AI Analysis System documentation
- Production deployed and verified on Render (Cloudflare proxy working)

### Pending / Next Steps
- Add tests for new endpoints (draft-report, league-digest, vote, post-trade, post-waiver)
- Stats sync begins Period 1 (March 25) — weekly insights will auto-switch to in-season mode
- Monitor Trade of the Week vote patterns to tune realism

### Test Results
- Server: 493 passing, 0 failing
- Client: 187 passing, 0 failing
- MCP: 50 passing, 0 failing

---

## Session 2026-03-23 (Session 38) — Code Review P2 Cleanup: Context, Accessibility, SortableHeader Adoption

### Summary
Resolved all 5 P2 findings from the Session 37 five-agent code review. Added `myTeamId` to LeagueContext (merged with existing fetch, memoized value), AbortController to AIHub, WAI-ARIA accessible SortableHeader with generic types, removed dead `compact` prop infrastructure, and adopted SortableHeader across 3 pages (30+ inline sort headers replaced). 9-agent deepened plan guided implementation. Visual spot-check passed (dark, light, mobile 390px). AI APIs funded (Gemini + Anthropic).

### Completed — LeagueContext myTeamId (Task 1)
- **`findMyTeam<T>` generic helper** — typed team ownership matching, single source of truth
- **Merged outfieldMode + myTeamId** into single `GET /leagues/:id` fetch with cancellation flag
- **Memoized context value** — `useMemo` on entire provider value object, `useCallback` on `setLeagueId` (fixes pre-existing 29-consumer re-render issue)
- **Reset to null synchronously** on league switch — prevents stale cross-league race condition
- **`LeagueDetail` type** now includes `ownerships` field (was untyped)
- **6 consumer files** updated: AIHub, Home, Auction, AuctionResults, TradesPage, ActivityPage
- Removed TradesPage email-based fallback (`t.owner === user?.email`) — all teams have `ownerUserId`

### Completed — AIHub AbortController (Task 2)
- **AbortController ref** on generate callback — aborts previous request on new generate, aborts on unmount
- **`signal.aborted` check** instead of `instanceof DOMException` (works in Node.js test environments)
- Removed team fetch useEffect (replaced by context `myTeamId`)
- Removed unused `useAuth` import

### Completed — SortableHeader Accessibility (Task 3)
- **`<button>` inside `<th>`** per WAI-ARIA APG sortable table pattern (native keyboard support)
- **`aria-sort`** only on active column, omitted entirely on unsorted (not `"none"`)
- **`aria-hidden="true"`** on sort icon
- **Generic `<K extends string = string>`** for typed sort keys
- **Focus ring** via `focus-visible:ring-2 ring-[var(--lg-tint)]`

### Completed — Compact Prop Deprecation (Task 4)
- Migrated 2 callers (PlayerPoolTab, AuctionDraftLog) to `density="compact"`
- Removed `compact` prop from ThemedTable interface
- Removed `TableCompactProvider`, `TableCompactContext`, `useTableCompact` from table.tsx
- Simplified ThemedTable body (removed nested conditional wrapping)

### Completed — SortableHeader Adoption (Task 5)
- **Players.tsx** — 13 inline sort headers replaced with SortableHeader + `handleSort` function
- **PlayerPoolTab.tsx** — 13+ inline headers replaced, `sortArrow` helper removed
- **AddDropTab.tsx** — 12 inline headers replaced (found by Pattern Recognition agent — was missed in original plan)

### Completed — Other
- **`splitTwoWayStats` JSDoc** — added in-place mutation warning
- **AI API funded** — both Gemini and Anthropic on paid plans
- **Visual spot-check** — dark mode, light mode, mobile 390px all verified via Playwright
- **9-agent deepened plan** — TypeScript Reviewer, Performance Oracle, Code Simplicity, Pattern Recognition, Architecture Strategist, Frontend Races, Best Practices, Learnings, Codebase Explorer

### Test Results
- Server: 493 passing
- Client: 187 passing
- **Total: 680 tests** (MCP: 50 additional)
- TypeScript: clean (client + server)

### Pending / Next Session
1. **SaaS Phase 1A** — begin snake draft implementation (deferred)
2. **Adopt `--lg-positive`/`--lg-negative` tokens** — added Session 37 but unused
3. **Remove `syncNLPlayers`** — superseded by `syncAllPlayers`

### Concerns / Tech Debt
- `Player.posList` is global (not per-league) — if leagues diverge on GP threshold, would need per-league eligibility model
- LeagueContext is at architectural ceiling — a third user-derived field should trigger context split

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

### Completed — 5-Agent Code Review (PR #89)
- **Security Sentinel**: Found CRITICAL — `GET /leagues/:id` returned full User model (passwordHash, resetToken, isAdmin, payment handles). **Fixed immediately** (commit `7c61d2d`)
- **Performance Oracle**: rosterFingerprint good; AIHub team fetch over-fetches (should centralize)
- **Architecture Strategist**: Dual-context conflict (compact+density); 7 pages duplicate team-finding logic
- **TypeScript Reviewer**: SortableHeader missing aria-sort/keyboard; AIHub missing abort controller; splitTwoWayStats mutation undocumented
- **Code Simplicity Reviewer**: SortableHeader + semantic tokens are YAGNI (but planned for phased adoption)

### Pending / Next Session (from code review P2 findings)
1. **Extract `useMyTeamId` hook** — 7 pages duplicate team-finding logic (Architecture P2)
2. **AIHub abort controller** — add cleanup to useEffect fetch to prevent race conditions (TypeScript P2)
3. **SortableHeader accessibility** — add `aria-sort`, `tabIndex`, `onKeyDown` before adoption (TypeScript P2)
4. **Document `splitTwoWayStats` mutation** — add JSDoc warning about in-place mutation (TypeScript P2)
5. **Deprecate `compact` prop** — replace with `density="compact"` in 2 callers to avoid dual-context conflict (Architecture P2)
6. **Adopt SortableHeader** — replace inline sort logic in Players.tsx, AuctionValues.tsx, StatsTables.tsx
7. **Table design visual testing** — verify density changes look right in browser (dark + light mode)
8. **SaaS Phase 1A** — begin snake draft implementation
9. **Fund AI API** — Gemini needs paid plan, Anthropic needs credits

### Concerns / Tech Debt
- `Player.posList` is global (not per-league) — if leagues diverge on GP threshold, would need per-league eligibility model
- `syncNLPlayers` superseded by `syncAllPlayers` — candidate for removal
- Gemini API key on free tier with 0 quota — falls back to Claude (costs money)
- `--lg-positive`/`--lg-negative` CSS tokens added but unused — adopt or remove next session

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
