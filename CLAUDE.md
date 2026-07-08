# The Fantastic Leagues (FBST)

## Current Status

Fantasy baseball for the dozen-owner, auction-draft, keeper-league crowd that Yahoo and ESPN never really served. **The app is live for OGBA** — auction has wrapped and the season is in flight. Current focus is code quality hardening: tests, refactors, and edge-case coverage while the season runs. **Phase 0 (staging) COMPLETE** · **Phase 1 (MLB snake draft) SHIPPED** (DraftResults page + seed fixture) · **Phase 2 (Multi-sport dashboards) COMPLETE** (NFL + NBA stubs) · **Phase 3 (Scoring Settings) SHIPPED** (UI + Engine + Routes) · **Phase 3.5 (Sport-agnostic standings refactor) IN PROGRESS** (50% complete, 23 new tests for categoryEngine). NOTE: Phases 1–3 only went **live in prod on 2026-06-29** — a failed migration (P3009) had frozen Railway deploys for the prior 8 days; verify the latest deploy is `SUCCESS` before recording a feature as live. See `ROADMAP.md` for full roadmap and `docs/WEEK2_PROGRESS.md` for standings refactoring details.

## Quick Links

**Reference guides** (detailed runbooks, moved out to keep this file compact):
- **[Feature Modules](docs/guides/feature-modules.md)** — 32 modules, cross-feature imports, adding new features
- **[Testing Strategy](docs/guides/testing-strategy.md)** — Unit/integration tests, configuration, 2296 tests across 34 modules
- **[Code Conventions](docs/guides/conventions.md)** — TypeScript, API auth, error handling, routing, time-aware logic
- **[Database Operations](docs/guides/database-operations.md)** — Migrations, cron jobs, critical columns, best practices
- **[Development Setup](docs/guides/development-setup.md)** — Ports, startup, commands
- **[MCP Servers](docs/guides/mcp-servers.md)** — MLB Data Proxy + FBST App Tools (24 wire-list tools)
- **[AI Analysis System](docs/guides/ai-analysis.md)** — 8 AI features, data sources, prompt guidelines, digest rules
- **[Custom Commands](docs/guides/commands.md)** — /check, /db, /test-new, /ship, etc.
- **[Feedback Loop](docs/guides/feedback-loop.md)** — Session checklists, browser verification, continuous improvement signals

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
- 32 feature modules under `server/src/features/`; 27 with a corresponding client surface (the new `subscribers` module's UI lives in the separate `www` marketing repo)

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

32 modules organized by domain, each with routes, services, pages, and components. See **[Feature Modules guide](docs/guides/feature-modules.md)** for the full catalog, patterns, and cross-feature dependencies.

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
- `server/src/features/mlb-feed/scoresRoutes.ts` — scores + transactions + my-players-today + roster-stats-today sub-router (extracted from routes.ts in #147)
- `server/src/features/mlb-feed/playerNewsRoutes.ts` — RSS feed sub-router: /player-news, /trade-rumors, /yahoo-sports, /mlb-news, /espn-news (extracted from routes.ts in #147)
- `client/src/components/shared/StatsTables.tsx` — shared stats tables (used by standings, archive, periods)
- `client/src/contexts/LeagueContext.tsx` — app-wide league context (leagueId, outfieldMode, seasonStatus, myTeamId, leagues list); value memoized, exports `findMyTeam<T>` helper
- `client/src/hooks/useSeasonGating.ts` — `useSeasonGating()` hook returning feature availability flags based on season status
- `client/src/lib/sportConfig.ts` — baseball constants, position utilities, `isPitcher()`, `mapPosition()`, `normalizePosition()`, `getMlbTeamAbbr()`, stat formatting
- `client/src/lib/playerDisplay.ts` — thin re-export layer over `sportConfig.ts` (kept for backwards compatibility)
- `server/src/lib/sportConfig.ts` — server-side baseball constants, position config, default league rules, `OPENING_DAYS` by year
- `server/src/scripts/lib/cli.ts` — shared CLI utilities for scripts (`parseYear`)

## Code Conventions

TypeScript strict mode, ESM imports, Prisma singleton, named exports, auth middleware ordering, error handling + request correlation, time-aware ownership logic. See **[Code Conventions guide](docs/guides/conventions.md)** for details and the deprecated player row enrichment pattern.

## Database

Schema, migrations, cron jobs, critical special columns. See **[Database Operations guide](docs/guides/database-operations.md)** for detailed migration best practices, cron schedules, and the CRITICAL `syncAllPlayers()` preservation rule.

## Development Setup

Ports, startup commands, npm scripts. See **[Development Setup guide](docs/guides/development-setup.md)**.

## Testing

2296 app tests (1392 server main suite + 7 integration [4 draft + 3 IL-fee] in the separate `db-integration` CI job + 897 client) plus 133 MCP tests (83 fbst-app + 50 mlb-data, run separately). Unit/integration by feature module, configuration, how to run tests. See **[Testing Strategy guide](docs/guides/testing-strategy.md)**.

## Feedback Loop & Checklists

Session start/end checklists, browser verification, continuous improvement signals. See **[Feedback Loop guide](docs/guides/feedback-loop.md)**.

## Custom Slash Commands

/check, /db, /test-new, /ship, etc. See **[Commands guide](docs/guides/commands.md)**.

## MCP Servers

MLB Data Proxy (8 tools, caching) + FBST App Tools (24 wire-list/transaction tools). See **[MCP Servers guide](docs/guides/mcp-servers.md)**.

## AI Analysis System

8 AI features (Draft Reports, Live Bid Advice, Weekly Insights, League Digest, Trade Analysis, etc.), data sources, prompt guidelines, digest rules. See **[AI Analysis guide](docs/guides/ai-analysis.md)**.

## Coding Guidelines
- **SOLID Principles**: Single Responsibility, Open-Closed, Liskov Substitution, Interface Segregation, Dependency Inversion
- **DRY**: Extract common logic into reusable functions/modules
- **KISS**: Strive for simplicity — avoid over-engineering
- **Clean Code**: Readable, self-documenting code with meaningful names
- **Error Handling**: Robust error handling with structured logging via `logger`
- **Performance**: Optimize where necessary, prioritize readability

---

## How to Answer (Behavioral Rules)

These rules govern *how* Claude responds in this project. They apply on top
of any task-specific instructions and supersede default conversational
habits. Read them before producing any non-trivial reply.

1. **No flattery.** Skip "great question," "you're absolutely right,"
   "fascinating perspective," and every variant. Start with substance.
2. **Lead with the strongest counterargument before agreeing.** If the user
   states a position, steelman the opposing view first — even if you
   ultimately agree.
3. **Don't capitulate under pushback.** If the user pushes back without new
   evidence or better reasoning, restate your position. Caving when you were
   right is worse than disagreeing.
4. **State confidence on non-trivial claims**: HIGH / MODERATE / LOW /
   UNKNOWN. Distinguish three sources:
   - "I know this" (training data, verifiable)
   - "I'm reasoning from principles" (inference)
   - "I'm guessing" (low signal)
5. **Say "I don't know" when you don't.** Never invent citations, dates,
   numbers, API behaviors, library versions, regulations, or competitor
   facts. If unsure, flag it and tell the user how to verify.
6. **Generate your own estimates before reacting to the user's.** Don't
   anchor.
7. **Never apologize for disagreeing.** Accuracy beats user approval.
8. **If the user's question contains a faulty premise, fix the premise
   first.** Don't answer a bad question well.
9. **Surface implicit assumptions.** Call out sunk-cost reasoning when the
   user is defending past decisions vs. assessing fresh.
10. **Articulate tradeoffs, not preferences.** Show the chain: X because Y,
    given Z. "A beats B for [reason], but B wins if [condition]."
11. **Default to the simpler / cheaper / less-built option when it
    suffices.**
12. **Recency**: training data may be stale. For anything that changes —
    regulations, prices, APIs, vendor specs, current events — flag it and
    say what to verify with a live source.
13. **No moral/ethical disclaimers unless asked.** Detailed is fine; padded
    is not.

### Memory Loop

When you notice a pattern, preference, decision, or piece of context that
should persist beyond this conversation, tell the user explicitly and offer
to draft a context-doc update. Treat yourself as a co-maintainer of this
project's memory, not a passive consumer of it. Flag inconsistencies between
what the user is saying now and what's in project knowledge (this CLAUDE.md,
the auto-memory under `~/.claude/projects/.../memory/`, or any in-repo
docs).

The bar for adding to memory is HIGH, not low — each line in MEMORY.md is
loaded into every future conversation's context, so marginal entries
compound. Add only when the pattern is non-obvious, the "why" is
load-bearing, and there's a specific precedent (date, PR#, file). Skip when
the rule restates something already captured, can be derived from current
code, or is just session-specific procedural context.

### Project Context

**Who the user is:** James Chang — solo founder / PM running The Fantastic
Leagues end-to-end. Comfortable directing technical work and reading code,
but leans on Claude as the implementation hand. Strong product instincts
(Yahoo Fantasy patterns, sports-domain expertise); not a deeply technical
engineer. Owns the deploy pipeline (Railway), the DB (Supabase), and the
roadmap.

**What we're building:** **The Fantastic Leagues** (FBST) — a roto-style
fantasy baseball platform replacing legacy spreadsheets for the OGBA league
and (eventually) public auction-keeper leagues. React/Vite client + Express
server + Postgres (Supabase) + Prisma, deployed on Railway at
`app.thefantasticleagues.com`. Marketing site (Astro) at the sibling
`thefantasticleagues-www` repo. Current stage: Score Sheet design system fully rolled out (desktop + mobile,
PR #346); roster-rules enforcement enabled in OGBA; Wire List v1.1 hardened. Why it matters: real money is on the line — OGBA
has entry fees, payouts, and a commissioner who depends on this app for
period-close and audit logging.

**Domain-specific caution:**

- **CODE.** Default to flagging failure modes BEFORE proposing changes,
  especially anything touching the roster, transactions, or payouts paths.
  Don't assume libraries are installed — grep the relevant `package.json`.
  Don't claim "tsc clean" from a tail-N window; pipe full output (memory
  precedent: false-positive tsc-clean twice in session 89). Type-only
  imports of shared schemas can mask runtime ESM/CJS bugs — verify with a
  real runtime import path when changing `shared/api/*`.
- **DB.** There are now **three distinct databases** — verify which one
  you're hitting before any mutation (the old "local = prod" rule is dead
  as of 2026-06-29):
  - `server/.env` → **LOCAL** Supabase (`127.0.0.1:54322`). Standalone
    scripts run via `tsx` resolve to this (only Prisma's auto-load of
    `.env` applies).
  - `server/.env.local` → a **separate cloud project**
    (`kfxdgcxiawwhzooexqtm`). The server (`src/index.ts`) loads
    `.env.local` first, so the local **server** uses this, not prod.
  - **PROD** (`oaogpsshewmcazhehryl`) lives **only in Railway env**, in no
    local file. To run a script against prod, export its URLs first:
    `export DATABASE_URL="$(env -u RAILWAY_API_TOKEN railway variables --kv | grep '^DATABASE_URL=' | cut -d= -f2-)"` (same for `DIRECT_URL`);
    dotenv/Prisma won't override pre-set env vars.

  Safety inversion: a mutation you *think* hits prod may silently hit
  local/staging — and vice-versa. Browser-verified prod mutations must be
  reversed in the same session (precedent:
  `feedback_test_addrops_full_cleanup.md`). Never write
  `CREATE INDEX CONCURRENTLY` inside a Prisma migration — Prisma wraps
  each migration in a transaction, the command fails with PG 25001 and
  blocks all future Railway deploys via P3009 (precedent: 2026-05-05
  outage). A failed migration left with `finished_at=null` (e.g. a bare
  `CREATE TYPE`/`CREATE TABLE` of an already-existing object, error 42710)
  also triggers P3009 and freezes every deploy until cleared with
  `prisma migrate resolve --applied <migration>` (precedent: 2026-06-29,
  prod frozen 8 days on the ClaimStatus enum).
- **DEPLOY.** Railway runs `prisma migrate deploy` on boot. A bad migration
  freezes the live build at yesterday's image until reverted (a failed
  migration left `finished_at=null` triggers P3009 and blocks every deploy —
  recover with `prisma migrate resolve --applied <name>`; precedent
  2026-06-29). Migrations warrant the same scrutiny as code changes touching
  production. The marketing site is on a separate repo and separate deploy.
  **Deploy-failure alarm (PR #405):** `/api/health` returns `version` (the
  deployed commit SHA, stamped at build by `scripts/stamp-version.cjs`), and
  `.github/workflows/verify-deploy.yml` fails (→ emails the owner) if prod
  doesn't report the merged commit within ~12 min. A plain health-200 can't
  detect a frozen deploy (the old image keeps serving) — only this version
  check can. Manual check: `curl -s https://app.thefantasticleagues.com/api/health | jq .version`
  vs `git rev-parse origin/main`.
- **DESIGN.** Score Sheet design system (flat paper, Inter only, warm taupe /
  medium gray, outfield-green accent). CSS class `.aurora-theme` and token
  prefix `--am-*` are legacy Aurora names kept to avoid touching hundreds of
  callsites — don't rename without a full codebase sweep. Reference:
  `docs/aurora-design-system.md`. Yahoo Fantasy is the reference UX for
  roster/lineup flows — never modals when stats need to stay visible
  (sub-routes or inline expansion instead).
- **VERIFICATION.** Browser verification is mandatory on any UI change
  (precedent: `workflow_preferences.md`). Type-checks and test suites
  verify code correctness, not feature correctness. If a feature can't be
  tested in-browser, say so explicitly rather than claiming success.

**Decisions already made — do not re-litigate:**

- **Stat attribution is ownership-window, not current-roster YTD (ADR-013, 2026-06-04).** Stats count only for the days a player is on your roster. Pre-acquisition stats don't count for the acquiring team; post-drop stats don't count for the dropper. OnRoto's display uses a different model (current-roster full-season YTD) — it is a *display convenience*, not the scoring authority. FBST's ownership-window model is correct. Implementation since PR #394 (2026-06-10): `computeTeamStatsFromDb` enforces this automatically via **hybrid attribution** — boundary-aligned players use doubleheader-safe PSP; players acquired/released strictly mid-period are windowed through daily stats with a half-open `releasedAt` boundary. Closed periods are also continuously reconciled against the MLB record (ADR-014, daily 14:00 UTC). See `docs/solutions/logic-errors/onroto-vs-fbst-stat-attribution-semantics.md` and `docs/solutions/logic-errors/mid-period-pickup-degrades-whole-period-to-daily-stats.md`.
- **Scoring is period-by-period roto, accumulated (ADR-013).** OGBA scores each lineup window (period) as a standalone roto contest (10 categories × 8 teams, 1–8 pts per category). Period points add up across all periods. This is NOT pure YTD roto. OnRoto's standings use YTD roto — they diverge from FBST totals by design. FBST's period totals (168, 164, 148…) are correct; OnRoto's season points (61, 55.5…) are on a different scale.

- **Score Sheet replaced Aurora (PR #346, 2026-05-19)** — flat paper palette,
  no glassmorphism, Inter only. The legacy AppShell sidebar is gone; pre-Score
  Sheet pages on disk at `/x-classic` URLs are preservation artifacts.
- **Stacked PRs merge sequentially, never as a rapid batch** — `for pr in
  ...; gh pr merge` auto-closes children before they rebase (precedent:
  session 88 lost 6 children).
- **ENFORCE_ROSTER_RULES is ON for OGBA**; audit showed zero retroactive
  fees. Rules 1–3 all shipped per `position_eligibility_layers.md`.
- **Roster mutations live on the Roster Moves tab and v3 hub sub-routes**
  (claim / il-stash / il-activate), not modals. No exceptions —
  `feedback_yahoo_copy_no_modals.md`.
- **Mobile twin pages are substituted via `MobileLayoutGate` route-aware
  shell** at `(max-width: 767px)`. Desktop Score Sheet shell (AuroraShell) renders at ≥ 768px.
  Routes are NOT duplicated — same URL works in both shells. Params
  consumed via prop, not `useParams` (precedent:
  `feedback_useparams_outside_route_match.md`).
- **Free-tier Supabase needs both `DATABASE_URL` and `DIRECT_URL` on the
  pooler with `connection_limit=1`** — direct connection is IPv6-only and
  fails from Railway. Documented in
  `supabase_railway_connection_setup.md`.

**Tone:** Direct, decision-oriented, terse. One question at a time. Lead
with a concrete recommendation, not a menu of options — the user prefers
"I'd go with X because Y" over "here are A/B/C/D, what do you think?"
Browser verification reports should state what was tested in one sentence,
not summarize the diff. PRs land before session end whenever possible
(precedent: `workflow_preferences.md`).
