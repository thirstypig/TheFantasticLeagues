# Code Conventions

Consistent patterns across the codebase ensure readability, type safety, and maintainability.

## TypeScript & Imports

- **Strict mode** in both client and server
- **Server files** use `.js` extensions in imports (ESM compat): `from "../db/prisma.js"`
- **Client files** use no extensions in imports: `from "../api/base"`
- **Named exports preferred**; default exports only for page components
- **Prisma singleton** imported from `server/src/db/prisma.ts` — NEVER create `new PrismaClient()` inline

## API & Auth

- **All write endpoints (POST, PATCH, DELETE) MUST use `requireAuth` middleware** — no exceptions
- **Admin-only endpoints** (waiver processing, trade processing) use `requireAdmin`
- **Middleware ordering**: `requireAuth → validateBody(schema) → requireSeasonStatus([...]) → requireTeamOwner/requireLeagueMember → asyncHandler(fn)`. Validation runs before season guard and authorization because both read from `req.body`. Season guard placed after validation so leagueId/teamId are parsed. For param-based auth (e.g., `requireCommissionerOrAdmin()`), auth runs before validation.
- **Season-gated endpoints** use `requireSeasonStatus(["DRAFT"])` or `requireSeasonStatus(["IN_SEASON"], "body.teamId")` — auction nominate/bid require DRAFT, trade propose and waiver submit require IN_SEASON
- **Auth token** passed via `Authorization: Bearer <token>` header
- **API client functions** use `fetchJsonApi()` from `client/src/api/base.ts`

## Error Handling

- **Error responses MUST NOT leak internal details** — return `{ error: "Internal Server Error", requestId, ref }` for 500s; admins (`req.user?.isAdmin === true`) additionally get `detail: message`; log details server-side via `logger` with `{ ref, requestId, path, method, userId }`
- **Request correlation** — every request gets an 8-char hex `req.requestId` set by middleware in `server/src/index.ts`; always echoed back via `X-Request-Id` response header (exposed to browser JS via `Access-Control-Expose-Headers`). User-facing code is `ERR-${requestId}`. Every 500 also pushes a record into the in-memory `errorBuffer` (capacity 100, newest-first, admin-visible at `GET /api/admin/errors`).
- **Client-side error surface** — thrown `ApiError` (not plain `Error`) carries `status`, `url`, `requestId`, `ref`, `detail`, `body`, `serverMessage`. Callers that want the toast to appear should call `reportError(err, { source: "feature-name" })` from `client/src/lib/errorBus.ts`. `ErrorProvider` must wrap the app root in `main.tsx`.

## Routing & Naming

- **All routers** use named exports: `export const fooRouter = router;`
- **Features** use kebab-case routes under `/api/<feature>/...`
- **Resource naming** follows REST conventions (GET for retrieve, POST for create, PATCH for update, DELETE for remove)

## Environment & Secrets

- **Required env vars** (`DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, `IP_HASH_SECRET`) validated at startup — server exits if missing
- **IP_HASH_SECRET** must be ≥32 chars (generate with `openssl rand -hex 32`); rotate yearly per session-tracking plan R8
- **Dev-only endpoints** gated behind explicit env vars (e.g., `ENABLE_DEV_LOGIN=true`), never `NODE_ENV` checks

## Styling & UI

- **Tailwind** for all styling; shadcn-pattern components in `components/ui/`
- **Design system**: Score Sheet design system (flat paper, Inter only, warm taupe / medium gray, outfield-green accent). CSS class `.aurora-theme` and token prefix `--am-*` are legacy Aurora names kept to avoid touching hundreds of callsites — don't rename without a full codebase sweep.

## Time-Aware Logic (Critical)

**Any function checking "does this roster entry cover this date/period?" MUST use the named predicates from `lib/rosterWindow.ts`:**
- `ownedOn(roster, date)` — was player on roster on this date?
- `overlapsPeriod(roster, period)` — does player tenure overlap this period?
- `clampToPeriod(roster, period)` — what portion of the period was the player owned?

**NEVER use raw `releasedAt === null` checks for period-scoped queries** — that answers "is the player currently on a team?" not "was the player on this team during this period?" — a category error that silently mis-attributes stats across period boundaries. `releasedAt === null` is ONLY correct for free-agent detection (no time dimension) — see `transactions/lib/freeAgent.ts`.

See `docs/solutions/logic-errors/closed-period-stat-attribution-uses-current-owner.md`.

## Player Row Enrichment (Deprecated)

Several wire-format responses ferry the Prisma `Player.id` through to the client under leading-underscore field names (`_dbPlayerId`, `_dbTeamId`, `_rosterId`, `_posList`). Status: **deprecated — scheduled for removal when v3 ships everywhere.**

**Until then:** Every new server emission of a Prisma row id MUST use `_dbPlayerId` (or the appropriate `_dbXxx` form), never invent a new variant. Document any new consumer in `CLAUDE.md`.

Removal vehicles:
- Todo #140 — server-side hub roster endpoint returns a clean payload
- Todo #116 — panel data-shape cleanup audits consumer side
