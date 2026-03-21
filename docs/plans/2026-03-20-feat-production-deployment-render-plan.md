---
title: Production Deployment to Render
type: feat
status: active
date: 2026-03-20
---

# Production Deployment to Render

## Overview

Deploy the current FBST codebase to Render as a single web service before the **live auction on Sunday, March 22**. The Render service already exists (Starter plan, Oregon region) but needs updating with ~32 sessions of changes. This plan covers code fixes, environment variable verification, and a pre-deploy smoke test.

## Problem Statement / Motivation

The live auction draft with 8 owners is Sunday March 22. All development has been on localhost. The Render service exists but is stale. Key concerns:

- **WebSocket must work in production** for real-time auction bidding
- **Auth must work** (Supabase OAuth + session tokens)
- **No zero-downtime deploys** on Render Starter plan — must deploy BEFORE the auction, not during
- **CSP headers are incomplete** — will block PostHog analytics and potentially WebSocket

## Proposed Solution

A focused deploy-readiness pass with 3 phases: code fixes, environment verification, and post-deploy validation. No new features — just making what exists work in production.

---

## Phase 1: Code Fixes (Before Deploy)

### 1.1 Fix CSP `connectSrc` — CRITICAL

**File:** `server/src/index.ts`, line 81

Current `connectSrc` is missing:
- `https://us.i.posthog.com` — PostHog analytics will be silently blocked
- `wss:` directive — WebSocket connections may be blocked depending on browser CSP interpretation of `'self'`

Also, `https://fbst-api.onrender.com` appears to be a stale reference. If the production domain is `thefantasticleagues.com` (custom domain on Render) or `fbst.onrender.com`, this should be updated.

**Action:** Update `connectSrc` to:
```typescript
connectSrc: [
  "'self'",
  "wss:",
  "https://*.supabase.co",
  "https://us.i.posthog.com",
  "https://us.posthog.com",
  "https://statsapi.mlb.com",
],
```

Remove the hardcoded `https://fbst-api.onrender.com` — `'self'` covers same-origin requests, and `wss:` covers WebSocket to any origin (scoped by JWT auth server-side).

### 1.2 Fix CSP `scriptSrc` for PostHog — CRITICAL

PostHog's JS bundle loads from `https://us-assets.i.posthog.com`. If `scriptSrc` doesn't allow it, the tracking script fails to load entirely.

**Action:** Add `https://us-assets.i.posthog.com` to `scriptSrc` if not already present.

### 1.3 Verify Domain Configuration — CRITICAL

Three domains appear in the codebase:
| Domain | Where Referenced | Purpose |
|--------|-----------------|---------|
| `fbst.onrender.com` | `render.yaml` CLIENT_URL | Render default domain |
| `fbst-api.onrender.com` | CSP `connectSrc` | Stale? Different service? |
| `thefantasticleagues.com` | emailService, APP_URL default | Custom domain |

**Action:** Determine the actual production domain and ensure:
- `CLIENT_URL` env var on Render matches it
- CORS origin list includes it
- Supabase Auth redirect URLs include it
- CSP `'self'` covers it (it does, since Express serves the client)

### 1.4 Update `render.yaml` — HIGH

Current `render.yaml` is missing several env vars. Update to include all required variables (secrets marked `sync: false` are set manually in Render dashboard):

```yaml
services:
  - type: web
    name: fbst
    runtime: node
    region: oregon
    plan: starter
    buildCommand: npm run build
    startCommand: npm start
    healthCheckPath: /api/health
    maxShutdownDelaySeconds: 60
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: "4010"
      - key: CLIENT_URL
        value: https://thefantasticleagues.com  # or fbst.onrender.com
      - key: DATABASE_URL
        sync: false
      - key: SUPABASE_URL
        sync: false
      - key: SUPABASE_SERVICE_ROLE_KEY
        sync: false
      - key: SESSION_SECRET
        generateValue: true
      - key: ADMIN_EMAILS
        sync: false
      # Build-time client vars (Vite inlines these)
      - key: VITE_SUPABASE_URL
        sync: false
      - key: VITE_SUPABASE_ANON_KEY
        sync: false
      - key: VITE_POSTHOG_KEY
        sync: false
      # Optional
      - key: RESEND_API_KEY
        sync: false
      - key: APP_URL
        value: https://thefantasticleagues.com
```

### 1.5 Service Worker Cache Versioning — MEDIUM

**File:** `client/public/sw.js`

The service worker uses fixed cache name `tfl-v1`. After deploy, Vite generates new hashed filenames but the old SW may serve stale cached assets until all tabs close.

**Action:** Either:
- (Simple) Bump cache name to `tfl-v2` before this deploy
- (Better) Use `__COMMIT_HASH__` from Vite config in the cache name so it auto-invalidates on every deploy

### 1.6 Express Version Mismatch — LOW

Root `package.json` has `express: ^5.1.0`, server has `express: ^4.19.2`. The server's version is what runs, but having Express 5 at root could cause confusion.

**Action:** Remove `express` from root `package.json` dependencies (the server has its own). Or align both to `^4.19.2`.

---

## Phase 2: Environment Verification (Render Dashboard)

### 2.1 Required Server Env Vars

These must be set in the Render dashboard. Server exits on startup if any are missing:

| Variable | Source | Notes |
|----------|--------|-------|
| `DATABASE_URL` | Supabase → Settings → Database → Connection string | Use the "Transaction" pooler URL for production |
| `SUPABASE_URL` | Supabase → Settings → API → Project URL | e.g., `https://oaogpsshewmcazhehryl.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role key | Server-side JWT verification |
| `SESSION_SECRET` | Auto-generated by Render | Cookie signing |
| `CLIENT_URL` | The production domain | Used for CORS origin |
| `ADMIN_EMAILS` | Comma-separated admin emails | e.g., `jimmychang316@gmail.com` |

### 2.2 Required Client Env Vars (Build-Time)

These MUST be set BEFORE triggering a build. Vite bakes them into the JS bundle at build time:

| Variable | Source | Notes |
|----------|--------|-------|
| `VITE_SUPABASE_URL` | Same as `SUPABASE_URL` | Client-side Supabase client |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Settings → API → anon/public key | Client-side auth (NOT the service_role key) |
| `VITE_POSTHOG_KEY` | PostHog → Project Settings → API Key | Optional; analytics disabled if missing |

**If `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are not set, auth is completely broken.** The client falls back to a placeholder URL and no user can log in.

### 2.3 Optional Env Vars

| Variable | Default | Notes |
|----------|---------|-------|
| `RESEND_API_KEY` | (disabled) | Email invites won't send without it |
| `APP_URL` | `https://thefantasticleagues.com` | Used in email invite links |
| `ENABLE_DEV_LOGIN` | `false` | Must NOT be set in production |
| `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI` | — | If using Google OAuth directly (vs. Supabase-managed) |
| `YAHOO_CLIENT_ID/SECRET/REDIRECT_URI` | — | If using Yahoo OAuth |

### 2.4 Supabase Auth Configuration

In the Supabase dashboard (Authentication → URL Configuration):

- **Site URL**: Set to production domain (e.g., `https://thefantasticleagues.com`)
- **Redirect URLs**: Must include production domain (e.g., `https://thefantasticleagues.com/**`)
- **Google OAuth**: Verify redirect URI in Google Cloud Console points to Supabase callback URL

---

## Phase 3: Deploy & Validate

### 3.1 Pre-Deploy Checklist

```
[ ] All tests pass (`npm run test` — 660+ tests)
[ ] TypeScript builds clean (`cd client && npx tsc --noEmit && cd ../server && npx tsc --noEmit`)
[ ] CSP `connectSrc` updated (PostHog + wss:)
[ ] Service worker cache version bumped
[ ] render.yaml updated with all env vars
[ ] Render dashboard: all env vars verified (especially VITE_* build-time vars)
[ ] Supabase Auth redirect URLs include production domain
[ ] Git commit and push to main
```

### 3.2 Deploy

Push to main triggers auto-deploy on Render. Monitor:

1. **Build log** — Watch for `npm run build` success (client Vite build + Prisma generate)
2. **Start log** — Server should log `Server running on port 4010` and `Health check available at /api/health`
3. **Health check** — Render's `/api/health` probe should return 200

### 3.3 Post-Deploy Smoke Test

Run these manually after deploy:

```bash
# 1. Health check
curl https://<domain>/api/health

# 2. SPA serves index.html
curl -s https://<domain>/ | head -5

# 3. API responds
curl https://<domain>/api/auth/health

# 4. WebSocket upgrade works
# Use browser DevTools → Network → WS tab
# Navigate to auction page, verify WS connection established

# 5. Auth flow works
# Log in via Google OAuth, verify session is established

# 6. PostHog loads
# Check browser DevTools → Console for PostHog initialization
# Check Network tab for requests to us.i.posthog.com
```

### 3.4 Auction-Specific Validation

Before Sunday:
```
[ ] Create/join a test auction in production
[ ] Verify WebSocket connection (check browser DevTools → Network → WS)
[ ] Submit a test bid, verify other connected users see it
[ ] Test nomination timer countdown
[ ] Test reconnection (disable network briefly, verify reconnect)
[ ] Test from mobile device (PWA installation, touch targets)
```

---

## Technical Considerations

### WebSocket on Render — VERIFIED SAFE

- Render natively supports WebSocket on web services, no special config needed
- The `ws` library attached to the HTTP server (`{ server: httpServer, path: "/ws/auction" }`) is the recommended pattern
- 30-second heartbeat ping keeps connections alive through NAT timeouts
- Client reconnection with exponential backoff (1s→2s→4s→8s→15s cap) handles transient drops
- Polling fallback (1s interval) provides resilience if WS fails entirely
- `'self'` in CSP covers same-origin WS connections; adding `wss:` is extra safety

### No Zero-Downtime Deploys

Render Starter plan stops the old instance before starting the new one. During the gap (~30-120 seconds):
- All WebSocket connections drop
- REST API returns errors
- Client shows "Reconnecting..." banner

**Rule: Never deploy during a live auction.** Deploy well before the auction starts on Sunday.

### Auction Timer Behavior on Deploy

In-memory timers (`setTimeout` for auto-finish and nomination) are destroyed on SIGTERM. Auction state is persisted to DB, but timers are not. After restart:
- Auction state rehydrates from DB
- Timers do NOT resume — auction appears frozen until commissioner pauses/resumes

This is acceptable if we follow the "never deploy during auction" rule.

### MLB Cache is Ephemeral

The SQLite cache at `mlb-data.db` is stored on Render's ephemeral filesystem. It rebuilds from scratch after each deploy. First MLB API requests post-deploy are slower but this doesn't affect the auction.

---

## Dependencies & Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Missing VITE_* env vars → auth broken | Medium | Critical | Verify in Render dashboard before deploying |
| CSP blocks PostHog/WS | High (current code) | High | Fix CSP before deploy (Phase 1.1) |
| Deploy during live auction | Low | Critical | Rule: deploy before auction, never during |
| OAuth redirect URI wrong | Medium | High | Verify in Supabase + Google Cloud Console |
| Stale service worker cache | Medium | Medium | Bump cache version before deploy |
| Domain mismatch (CORS/CSP) | Medium | High | Resolve which domain is production, align all references |

---

## Success Criteria

- [ ] Production site loads at the correct domain
- [ ] Users can log in via Google OAuth
- [ ] WebSocket connects for auction (verify in DevTools)
- [ ] 2+ users can bid simultaneously in a test auction
- [ ] PostHog events appear in dashboard
- [ ] Health check returns 200
- [ ] No CSP errors in browser console
- [ ] Mobile PWA installable and functional

---

## Sources & References

- Render WebSocket docs: https://render.com/docs/websocket
- Render Blueprint YAML: https://render.com/docs/blueprint-spec
- Render monorepo support: https://render.com/docs/monorepo-support
- Current render.yaml: `/render.yaml`
- Server entry point: `/server/src/index.ts`
- WS service: `/server/src/features/auction/services/auctionWsService.ts`
- Client WS hook: `/client/src/features/auction/hooks/useAuctionState.ts`
- Supabase client config: `/client/src/lib/supabase.ts`
- CSP/CORS config: `/server/src/index.ts:61-89`
- Service worker: `/client/public/sw.js`
