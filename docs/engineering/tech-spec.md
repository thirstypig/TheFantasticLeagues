---
id: DOC-007
title: "Technical specification"
description: "Architecture overview — request flow, module structure, data path, and the real dependency graph."
type: tech-spec
status: active
phase: null
owner: james
tags: [database, auth, deploy, design-system]
links: [ADR-015, DOC-008, DOC-009]
updated: 2026-07-23
---

# Technical specification

<!-- Prompt-to-self: this doc describes the system AS IT IS, not as it was designed to be.
     Where the two differ, say so — the gap is the useful information. -->

## Shape of the system

A **TypeScript monorepo** deployed as a single unit: one Express server that serves both
the JSON API and the built static client.

```
Browser (React SPA)
   │  fetch → /api/*
   ▼
Cloudflare  (DNS + CDN)
   │
   ▼
Railway  (single service — app.thefantasticleagues.com)
   │
   ├── Express: /api/*  → 291 routes across 33 feature routers
   └── Express: /*      → static client build (SPA catch-all)
        │
        ▼
   Prisma ORM
        │
        ▼
   PostgreSQL (Supabase) — 65 models, 36 migrations
```

**Notable:** there is no separate API host, no serverless split, no queue infrastructure.
One process does everything. For a single-league app with a dozen users this is the right
call and should not be complicated without a specific reason.

---

## Request flow

The middleware order in `server/src/index.ts` is load-bearing — several of these must
happen before others, and getting it wrong causes subtle auth or rate-limit bugs.

| # | Stage | Notes |
|---|---|---|
| 1 | `trust proxy` | Required — Railway terminates TLS, so client IPs come via `X-Forwarded-For` |
| 2 | CORS + security headers | |
| 3 | `cookieParser` | |
| 4 | Request-ID assignment | Correlates client errors to server logs (`ERR-` prefix) |
| 5 | `express.json` / `urlencoded` | 1 MB cap |
| 6 | `attachUser` | Verifies the Supabase JWT and attaches `req.user`. **Global** — runs before every route. Does *not* itself reject. |
| 7 | Rate limiting | `globalLimiter` on `/api`, tighter `authLimiter` on `/api/auth` |
| 8 | Feature routers | 33 mounts — see [api-docs](api-docs.md) |
| 9 | `/api/*` 404 | Prevents API 404s falling through to the SPA and returning HTML |
| 10 | Static client + SPA catch-all | `maxAge: 1y, immutable` |
| 11 | Error handlers | Two, terminal |

**The `attachUser`-then-`requireAuth` split matters.** `attachUser` is global and
non-rejecting; individual routes opt into `requireAuth`, `requireAdmin`,
`requireLeagueRole`, or `requireFranchiseCommissioner`. A route that forgets to opt in is
**public** — the failure mode is silent, and it's the reason several P1 security todos
(`002`, `003`, `004`) existed historically.

### Authorization middleware

| Middleware | Enforces |
|---|---|
| `requireAuth` | A valid session |
| `requireAdmin` | System admin |
| `requireLeagueRole` / `requireLeagueMember` | Membership in the league in the request |
| `requireFranchiseCommissioner` | Commissioner of the franchise |
| `requireSeasonStatus(...)` | Season-phase constraint on writes (e.g. `IN_SEASON` only) |
| `rateLimitPerUser` | Per-user limits above the global limiter |

`requireSeasonStatus` is unusual and worth knowing about: it blocks writes that are valid
code but invalid *at this point in the season* — e.g. a roster move during `SETUP`.

---

## Module structure

**63 feature modules** — 34 server, 29 client — each owning its routes, services, pages,
components, and API client.

```
server/src/features/<feature>/     client/src/features/<feature>/
├── routes.ts                      ├── pages/
├── services/                      ├── components/
├── types.ts                       ├── api.ts
└── index.ts                       ├── hooks/
                                   └── index.ts
```

### Shared infrastructure — do NOT move into features

| Path | Holds |
|---|---|
| `shared/api/` | Cross-side Zod schemas. The inferred type is the wire-format source of truth. **Needs `"type": "module"` in its package.json** — without it Node ESM treats these as CJS and runtime imports collapse to default. |
| `server/src/middleware/` | Auth, season guard, validation, rate limiting, async handler |
| `server/src/lib/` | 24 modules — prisma, logger, mlbApi, advisory locks, roster guards, IL windows, outbox drainer, push service, audit log, feature flags |
| `server/src/db/prisma.ts` | The Prisma singleton |
| `client/src/components/shared/` | 9 cross-feature components |
| `client/src/components/ui/` | 15 design-system primitives |
| `client/src/lib/`, `client/src/hooks/` | Client utilities and cross-feature hooks |

### The real dependency graph

The module boundary is **half-honoured**. Measured 2026-07-23 by
`scripts/check-feature-isolation.mjs`:

| Measure | Value |
|---|---|
| Modules with zero outbound cross-feature imports | **34 of 63** |
| Production cross-feature imports | **85** (36 server, 49 client) |
| Test-file cross-feature imports | 12 |
| Circular dependencies | **4** |

**De-facto shared modules** — imported by many others, never promoted:

| Module | Inbound |
|---|---|
| `transactions` | 12 client, 7 server |
| `standings` | 8 server |
| `teams` | 8 client |
| `players` | 5 server |
| `commissioner` | 5 server |

**Cycles:** `server: teams ↔ transactions` · `client: teams ↔ transactions` ·
`client: auction ↔ teams` · `client: commissioner ↔ roster`

This is now enforced as a ratchet — see **[ADR-015](adrs/ADR-015-feature-module-boundaries.md)**.
Existing imports are grandfathered; new ones fail the check. Regenerate the picture with:

```bash
node scripts/check-feature-isolation.mjs --report
```

---

## Data path

**PostgreSQL on Supabase, via Prisma.** 65 models, 36 migrations.

### Three databases — verify which one you're hitting

This is the single most dangerous piece of local knowledge in the project.

| Env source | Points at |
|---|---|
| `server/.env` | **LOCAL** Supabase (`127.0.0.1:54322`). Standalone `tsx` scripts resolve here. |
| `server/.env.local` | A **separate cloud project**. The local server loads this first, so `npm run server` does *not* use the local DB. |
| Railway env only | **PRODUCTION.** In no local file. |

A mutation you think hits prod may hit local, and vice versa. Browser-verified prod
mutations must be reversed in the same session.

### Migration hazards — both have frozen production

1. **Never `CREATE INDEX CONCURRENTLY` in a Prisma migration.** Prisma wraps each migration in a transaction; the command fails with PG `25001`, the migration is marked failed, and **every future deploy is blocked** via `P3009`. (2026-05-05: prod frozen 21 h.)
2. **A migration left with `finished_at = null`** — e.g. a bare `CREATE TYPE` of an existing object, error `42710` — triggers the same `P3009` freeze. (2026-06-29: prod frozen **8 days**.) Recover with `prisma migrate resolve --applied <migration>`.

Railway runs `prisma migrate deploy` on boot, so a bad migration freezes the live build at
the previous image. **A health check returning 200 cannot detect this** — the old image
keeps serving happily. Only the version check can:

```bash
curl -s https://app.thefantasticleagues.com/api/health | jq .version
git rev-parse origin/main     # these must match
```

`.github/workflows/verify-deploy.yml` automates this and emails on mismatch (PR #405).

### Stat attribution — the core domain rule

Stats count only for the days a player was on your roster (**ADR-013**). Implemented in
`computeTeamStatsFromDb` as **hybrid attribution**: boundary-aligned players use
doubleheader-safe `PlayerStatsPeriod`; players acquired or released strictly mid-period are
windowed through daily stats with a half-open `releasedAt` boundary.

`PlayerStatsPeriod` is authoritative. `playerStatsDaily` collapses doubleheaders and must
not be used as the primary source.

---

## Frontend

React 18 + React Router v6, Vite, TypeScript strict, Tailwind + shadcn-style primitives.

**Dual-shell, single-route architecture.** Mobile twin pages are substituted by
`MobileLayoutGate` at `max-width: 767px`; the desktop Score Sheet shell renders at ≥768px.
**Routes are not duplicated** — the same URL works in both.

> **Trap:** pages substituted by `MobileShell.pickMobilePage` render **outside** any
> `<Route>` match, so `useParams` returns `{}`. Parse URL params in the shell and pass them
> as props.

**Design system:** Score Sheet — flat paper palette, Inter only, warm taupe / medium gray,
outfield-green accent. The CSS class `.aurora-theme` and token prefix `--am-*` are legacy
names retained to avoid touching hundreds of call sites. Do not rename without a full sweep.

**Error handling:** `ApiError` (with request-ID correlation) → `errorBus` → `ErrorProvider`
→ `ErrorToast`, showing an `ERR-`prefixed code the user can copy and you can grep for.

---

## Observability

| Concern | Status |
|---|---|
| Structured logging | `server/src/lib/logger.ts` |
| Error correlation | Request IDs, `ERR-` codes, 100-entry ring buffer for the admin dashboard |
| Deploy verification | `verify-deploy.yml` — version check, emails on failure |
| Product analytics | PostHog, **`autocapture: false`** — pageviews on route change, everything else needs an explicit `track()` call |
| Uptime / health checks | <!-- TODO(james): none beyond /api/health. --> |
| Ingestion-job monitoring | **None** — this is open todo `299` (P1) |

---

## Known thin spots

Honest gaps, not a wish list:

- **No server-side ESLint at all.** The client has one with no import rules.
- **No ingestion-job run tracking or alerting** (todo `299`) — a sync can fail silently.
- **No `syncedAt` on scoring tables** (todo `300`) — you can't tell stale data from fresh.
- **Standings cold-compute is serialized on a single connection** (todo `305`).
- **Period rollover is manual.** No cron. A late rollover misdates owners' moves.
- **The legacy waiver system still runs** alongside the newer Wire List (todo `303`).
