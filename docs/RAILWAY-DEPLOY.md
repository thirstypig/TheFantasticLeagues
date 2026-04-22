# Railway Deployment Reference

**Current production host.** The app is deployed as a single unified service on Railway (API + static client) behind Cloudflare DNS/CDN at `https://app.thefantasticleagues.com`. This doc is the source of truth for env vars and deploy procedure.

> Migrated from Render in Session 51. Historical Render incidents are preserved in `docs/solutions/deployment/` for institutional knowledge.

## Architecture at a glance

```
Browser
  │
  └─→ app.thefantasticleagues.com (Cloudflare DNS + CDN)
        │
        └─→ Railway (Nixpacks build, Node 20)
              ├── Express serves API at /api/*
              ├── Express serves built client (Vite /dist) at /*
              └── WebSocket (ws://) upgrades on same origin — no split API domain
```

`API_BASE` defaults to `/api` (relative) — see `client/src/api/base.ts`. WebSocket uses `window.location.host` — see `client/src/features/auction/hooks/useAuctionState.ts`. Both work because API and client ship from the same Railway service.

## Railway configuration

- Builder: Nixpacks (see `railway.json`)
- Start command: `npm start` (runs compiled `server/dist/index.js`)
- Health check: `GET /api/health` with 30s timeout
- Restart policy: ON_FAILURE with max 3 retries

Env vars are set in the Railway dashboard (Railway doesn't support declaring them in `railway.json` the way Render did in `render.yaml`).

## Environment variables

Set all of these in the Railway dashboard **before the first build** (`VITE_*` vars are inlined at build time, so missing values silently ship broken clients).

### Server / runtime

| Variable | Value | Notes |
|----------|-------|-------|
| `NODE_ENV` | `production` | **Critical** — gates dev-only login paths |
| `DATABASE_URL` | `postgres://…` | From Supabase Connection Pooler |
| `SUPABASE_URL` | `https://….supabase.co` | |
| `SUPABASE_SERVICE_ROLE_KEY` | (secret) | |
| `SESSION_SECRET` | (32+ hex chars) | Generate with `openssl rand -hex 32` |
| `IP_HASH_SECRET` | (32+ hex chars) | Required — server refuses to boot without it (Session 60) |
| `ADMIN_EMAILS` | `you@example.com` | Comma-separated |
| `CLIENT_URL` | `https://app.thefantasticleagues.com` | For CORS |
| `APP_URL` | `https://app.thefantasticleagues.com` | For transactional email links |
| `RESEND_API_KEY` | (from Resend) | Transactional email |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | see `docs/AUTH_SETUP.md` | Production redirect uses `app.thefantasticleagues.com` |
| `YAHOO_CLIENT_ID` / `YAHOO_CLIENT_SECRET` / `YAHOO_REDIRECT_URI` | see `docs/AUTH_SETUP.md` | Same host |

### Client build-time (Vite)

| Variable | Value | Notes |
|----------|-------|-------|
| `VITE_SUPABASE_URL` | Same as `SUPABASE_URL` | Inlined at build |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon (not service_role) key | Inlined at build |
| `VITE_POSTHOG_KEY` | (from PostHog) | Optional — omit to disable |
| `VITE_POSTHOG_HOST` | `https://us.i.posthog.com` | Optional |
| `VITE_GA_MEASUREMENT_ID` | `G-66ZM096S4D` | Optional — omit to disable GA4 |

### Feature flags

| Variable | Default | Notes |
|----------|---------|-------|
| `ENFORCE_ROSTER_RULES` | `true` | Platform-wide kill switch for the Phase 2/3 roster-rules enforcement layer (add-must-drop, position-inherit, IL slot gating, ghost-IL block). Flip to `false` in Railway dashboard (no deploy needed) to disable enforcement while keeping the new endpoints (`/il-stash`, `/il-activate`, `/reconcile-il-fees`) + `FinanceLedger` billing live. Safety net if legitimate commissioner workflow starts getting rejected in production — see plan R16 in `docs/plans/2026-04-21-feat-roster-rules-il-slots-and-fees-plan.md`. |

**Do NOT set:** `VITE_API_BASE` (leave empty — relative `/api` works for unified deploy), `PORT` (Railway auto-assigns).

## OAuth provider configuration

Whenever you change the production host, update the callback URLs in:

- **Google Cloud Console** → Credentials → authorized redirect URIs: `https://app.thefantasticleagues.com/api/auth/google/callback`
- **Yahoo Developer Portal** → app redirect URI: `https://app.thefantasticleagues.com/api/auth/yahoo/callback`
- **Supabase** → Authentication → URL Configuration → redirect URLs: `https://app.thefantasticleagues.com/**`

## Content Security Policy

CSP is enforced server-side via `helmet` in `server/src/index.ts`. When adding a new third-party service (analytics, OAuth provider, external API), add its domains to the appropriate directive (`scriptSrc`, `connectSrc`, `imgSrc`, etc.) — CSP violations are silent in the browser. See `docs/solutions/deployment/csp-websocket-and-cdn-issues.md` for the canonical example (PostHog) and the GA4 addition (`www.googletagmanager.com`, `*.google-analytics.com`).

## Deploy workflow

Railway auto-deploys on push to `main`.

```bash
# 1. Local pre-flight
npm run test                                                   # all tests pass
cd client && npx tsc --noEmit && cd ../server && npx tsc --noEmit

# 2. Push
git push origin main

# 3. Monitor build in Railway dashboard (5–10 min)

# 4. Post-deploy verification
curl https://app.thefantasticleagues.com/api/health | jq .     # {"status":"ok"}
curl -I https://app.thefantasticleagues.com | grep -i csp      # CSP header present
```

Open the app in a browser, log in, visit an active auction, and confirm DevTools → Console shows zero CSP violations and WebSocket connects to `wss://app.thefantasticleagues.com/ws/auction?…`.

## Rollback

Railway dashboard → Deployments → find last known-good → overflow menu → Redeploy. DNS doesn't change; the rollback is a single-service redeploy.

## Changing the production domain

If `app.thefantasticleagues.com` ever moves, these files need updating (grep for the current hostname):

- `server/src/index.ts` — CSP `connectSrc` `wss://…` entry
- `client/src/api/base.ts` — only if you re-introduce a split API domain (currently unified, so `API_BASE=/api` works without change)
- `client/src/features/auction/hooks/useAuctionState.ts` — only if split API domain returns
- OAuth provider consoles (Google, Yahoo, Supabase) — callback URLs
- `docs/AUTH_SETUP.md`, `docs/RAILWAY-DEPLOY.md` (this file) — documented URLs
- `scripts/verify_auth_config.ts` — printed guidance

After the change, redeploy and verify zero CSP violations + working OAuth login.
