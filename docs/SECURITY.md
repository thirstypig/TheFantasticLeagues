# FBST Security Architecture

## Auth Overview

FBST uses **Supabase Auth** (Google/Yahoo OAuth) with JWT tokens.

### Request Flow
1. Client authenticates via Supabase SDK → receives JWT
2. Client sends `Authorization: Bearer <token>` on every API request
3. `attachUser` middleware (global) validates token via `supabase.auth.getUser()`
4. If valid, `req.user` is populated with DB user record
5. Route-level middleware (`requireAuth`, `requireAdmin`, `requireCommissionerOrAdmin`) gates access

### Middleware Chain
- `attachUser` — always runs, sets `req.user` (null if no/invalid token)
- `requireAuth` — returns 401 if `req.user` is null
- `requireAdmin` — returns 401/403 if not authenticated or not admin
- `requireCommissionerOrAdmin(paramName)` — returns 403 if not commissioner of the specified league or site admin

## Route Protection Matrix

| Module | Method | Path | Auth Level |
|--------|--------|------|------------|
| **roster** | POST | `/api/roster/add-player` | requireAuth |
| **roster** | DELETE | `/api/roster/:id` | requireAuth |
| **roster** | GET | `/api/roster/:teamCode` | public |
| **roster** | GET | `/api/roster/year/:year` | public |
| **waivers** | GET | `/api/waivers` | public |
| **waivers** | POST | `/api/waivers` | requireAuth |
| **waivers** | DELETE | `/api/waivers/:id` | requireAuth |
| **waivers** | POST | `/api/waivers/process` | requireAdmin |
| **trades** | GET | `/api/trades` | public |
| **trades** | POST | `/api/trades` | requireAuth |
| **trades** | POST | `/api/trades/:id/accept` | requireAuth |
| **trades** | POST | `/api/trades/:id/reject` | requireAuth |
| **trades** | POST | `/api/trades/:id/process` | requireAdmin |
| **transactions** | GET | `/api/transactions` | public |
| **transactions** | POST | `/api/transactions/claim` | requireAuth |
| **teams** | GET | `/api/teams` | public |
| **teams** | GET | `/api/teams/:id/summary` | public |
| **teams** | PATCH | `/api/teams/:teamId/roster/:rosterId` | requireAuth |
| **auth** | GET | `/api/auth/health` | public |
| **auth** | GET | `/api/auth/me` | public (returns null if unauthenticated) |
| **auth** | POST | `/api/auth/dev-login` | gated by `ENABLE_DEV_LOGIN=true` env var |

## Required Environment Variables

| Variable | Purpose | Required In |
|----------|---------|-------------|
| `DATABASE_URL` | PostgreSQL connection string | All environments |
| `SUPABASE_URL` | Supabase project URL | All environments |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase admin key | All environments |
| `SESSION_SECRET` | JWT signing secret | All environments |
| `ENABLE_DEV_LOGIN` | Enables `/auth/dev-login` endpoint | Local dev only |
| `CLIENT_URL` | Production client URL for CORS | Production |
| `ADMIN_EMAILS` | Comma-separated admin emails | Production |

Server exits on startup if any of the first 4 are missing.

## Dev Login Endpoint

The `/api/auth/dev-login` endpoint is gated behind `ENABLE_DEV_LOGIN=true`. It is **never** set in production. This endpoint creates a known password for the first admin user — useful for terminal-based testing only.

## Error Handling

The global error handler never exposes internal error messages or stack traces to clients. All unhandled errors return:
```json
{ "error": "Internal Server Error" }
```
Detailed error info is logged server-side via the structured logger.

## Graceful Shutdown

The server handles `SIGTERM` and `SIGINT` signals:
1. Stops accepting new connections
2. Disconnects Prisma
3. Exits cleanly
4. Force-exits after 10 seconds if shutdown stalls

## Rollback Procedure

1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Select the FBST project / service
3. Open the "Deployments" tab
4. Find the last known-good deployment
5. Click the overflow menu → "Redeploy" on that version

## Incident Response

1. If a security issue is found, immediately disable the affected endpoint by deploying a fix
2. To disable dev endpoints: ensure `ENABLE_DEV_LOGIN` is not set in production env vars
3. Contact: project owner (jimmychang316@gmail.com)
