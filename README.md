# The Fantastic Leagues (FBST)

Fantasy baseball league management tool — AI-powered insights, auction drafts, commissioner tools. Full-stack TypeScript monorepo organized by domain feature modules.

Public: [thefantasticleagues.com](https://thefantasticleagues.com) · Repo: [thirstypig/TheFantasticLeagues](https://github.com/thirstypig/TheFantasticLeagues)

> `FBST` remains the internal shorthand across code, docs, and commit messages. The repo name is the brand; the shorthand is for engineers.

## Architecture

```
fbst/
├── client/                  # React + Vite + TypeScript frontend
│   └── src/
│       └── features/        # 27 domain feature modules (mirrored with server)
├── server/                  # Express + TypeScript API (ESM, Prisma)
│   └── src/
│       └── features/        # Matching 27 feature modules
├── prisma/                  # Schema + migrations
├── mcp-servers/mlb-data/    # Local MCP proxy for MLB Stats API (SQLite cache, rate limiter)
├── scripts/                 # Data processing + one-off audits
└── docs/                    # Plans, solutions, brainstorms, audits
```

Feature modules include: auth, leagues, teams, players, roster, standings, trades, waivers, transactions, auction, draft, matchups, keeper-prep, commissioner, franchises, seasons, periods, admin, archive, mlb-feed, ai, watchlist, trading-block, board, notifications, profiles, **reports** (Weekly Report at `/report`).

See [`CLAUDE.md`](./CLAUDE.md) for the full module table + cross-feature dependency map.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, TypeScript (strict), Tailwind CSS, React Router v6, shadcn-style UI primitives |
| Backend | Node.js 22, Express, TypeScript (strict, ESM), Zod for request validation |
| Database | PostgreSQL via Supabase; Prisma ORM |
| Auth | Supabase Auth (Google/Yahoo OAuth, email/password) |
| AI | Google Gemini 2.5 Flash (primary), Anthropic Claude Sonnet 4 (fallback) |
| Email | Resend (transactional, league invites) |
| Testing | Vitest, React Testing Library |
| Deployment | Railway (API + static client); Cloudflare DNS + CDN |
| MCP | Local MCP server proxying `statsapi.mlb.com` with SQLite cache |

## Ports

| Service | Port |
|---------|------|
| Vite dev | 3010 |
| Express API | 4010 |
| PostgreSQL | 5442 |
| Redis | 6381 |

See [`MASTER-PORTS.md`](./MASTER-PORTS.md) for details.

## Quick Start

**Prerequisites:** Node.js 22.x, access to a Supabase project, Supabase service role key.

```bash
# Install dependencies (root workspace + client + server)
npm install
cd client && npm install && cd ../server && npm install && cd ..

# Set up env
cp server/.env.example server/.env
# Edit server/.env:
#   DATABASE_URL (Supabase pooled URL)
#   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
#   SESSION_SECRET (openssl rand -hex 32)
#   IP_HASH_SECRET (openssl rand -hex 32)
#   GEMINI_API_KEY + ANTHROPIC_API_KEY (optional — AI features)
#   RESEND_API_KEY (optional — email invites)

# Run Prisma migrations
cd server && npx prisma migrate dev && cd ..

# Start both servers (two terminals, or one with &)
npm run server    # Express on :4010
npm run dev       # Vite on :3010 (proxies /api → :4010)
```

## Testing

```bash
npm run test          # All tests (server + client + MCP)
npm run test:server   # Server unit + integration
npm run test:client   # Client component + hook tests
```

Current tracked baseline is documented in [`docs/TESTING.md`](./docs/TESTING.md). Recent focused roster/dashboard work added Home and Add/Drop regression tests and passed the relevant 50-test client slice plus client typecheck.

## Conventions

See [`CLAUDE.md`](./CLAUDE.md) for the authoritative conventions guide. Key points:

- **Strict TypeScript** both sides. Server uses `.js` import extensions (ESM); client omits extensions.
- **Prisma singleton** — always `import { prisma } from "../db/prisma.js"`; never `new PrismaClient()` inline.
- **Named route exports** — `export const fooRouter = router;` (no default exports for routers).
- **All writes** require `requireAuth`; admin-only endpoints require `requireAdmin`.
- **Season-gated writes** use `requireSeasonStatus([...])` (auction DRAFT, trades/waivers IN_SEASON).
- **Error correlation** — every 500 returns `ERR-<requestId>`; admins get `detail: message` in the body.
- **`fetchJsonApi`** from `client/src/api/base.ts` — auto-injects Bearer token; throws `ApiError`.
- **Tables** — `w-full` + `table-layout: fixed` + explicit width per column. See `docs/solutions/ui-bugs/table-layout-fixed-for-proportional-columns.md`.

## API

All server routes mount under `/api`. Client config uses `VITE_API_BASE_URL` (defaults to `http://localhost:4010`) — never embed `/api` inside that env var; always append `/api/...` in code.

Notable surfaces:

- `GET /api/auth/me` — current user session
- `GET /api/standings/season?leagueId=N` — live roto standings
- `GET /api/mlb/league-digest?leagueId=N[&weekKey=YYYY-Www]` — weekly AI digest
- `GET /api/reports/:leagueId/:weekKey?` — Weekly Report aggregator (`/report` page)
- `POST /api/auction/bid` — live auction bid (WebSocket broadcast side-effect)
- `POST /api/watchlist` — per-team watchlist add
- `GET /api/admin/stats` — admin dashboard stats (10s in-memory cache)

## Deployment (Railway)

- **API service** — root `server/`, start `npm start`, required env: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, `IP_HASH_SECRET`. Railway redeploys on push to `main`.
- **Client** — separately hosted (or served as static asset); build with `npm run build` in `client/`, `VITE_API_BASE_URL` set to the API origin.
- **Marketing site** — separate `thefantasticleagues-www` repo, Astro on GitHub Pages.

## Scripts & Audits

- `server/src/scripts/fangraphs-audit.ts` — aggregates season stats with roster-ownership windows for cell-by-cell comparison against FanGraphs OnRoto. Run: `cd server && npx tsx src/scripts/fangraphs-audit.ts [leagueId=20]`
- `server/src/scripts/` — one-off audits + data migrations. See `docs/` for plans.

## Troubleshooting

- **Prisma fails to connect** — check `DATABASE_URL`, ensure Supabase project is not paused, and that the pooler connection string uses `pgbouncer=true`.
- **`zsh: command not found: python`** — use `python3`, or activate the stats-worker venv.
- **Service worker serving stale assets** — unregister via DevTools → Application → Service Workers, then clear HTTP cache + in-memory cache.
- **Railway deploy fails silently** — always run `cd client && npx tsc --noEmit && cd ../server && npx tsc --noEmit` before pushing. Vite dev mode hides TypeScript errors that break Railway builds. See `docs/solutions/deployment/silent-railway-build-failures-vite-tsc-gap.md`.

## Documentation

- [`CLAUDE.md`](./CLAUDE.md) — architecture reference, conventions, testing strategy, feature module guide
- [`FEEDBACK.md`](./FEEDBACK.md) — session-over-session development log
- [`docs/CURRENT_STATUS.md`](./docs/CURRENT_STATUS.md) — active product status, planning source-of-truth, current focus, and deferred work
- `server/data/planning.json` — unified micro todo + macro roadmap source rendered by the in-app planning views
- [`docs/plans/`](./docs/plans/) — feature and refactor plans
- [`docs/solutions/`](./docs/solutions/) — postmortems and learnings
- [`mcp-servers/mlb-data/README.md`](./mcp-servers/mlb-data/README.md) — MCP proxy architecture

## Coding Guidelines

- **SOLID** — single responsibility, open/closed, Liskov, interface segregation, dependency inversion
- **DRY** — extract common logic; resist premature abstraction (three similar lines > a premature generalization)
- **KISS** — avoid over-engineering; no feature flags or backwards-compat shims when you can change the code directly
- **Clean code** — meaningful names; minimal comments (explain *why*, not *what*)
- **Error handling** — structured logging via `logger`; no swallowed exceptions
