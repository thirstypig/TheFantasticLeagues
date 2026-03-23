---
title: "Production Deployment Checklist & Learnings"
category: deployment
tags:
  - production
  - render
  - cloudflare
  - api-routing
  - csp
  - caching
  - websocket
  - environment-variables
module: global
problem_type: deployment_readiness
severity: critical
date: 2026-03-22
---

# Production Deployment Checklist & Learnings

## Overview

This document captures institutional learnings from FBST's first production deployment (March 20-22, 2026) to Render with Cloudflare custom domain. Several critical production incidents were discovered and fixed. Use this checklist before every future deployment.

---

## Critical Incidents & Root Causes

### Incident 1: Hardcoded API paths caused Cloudflare cache bypass

**Status:** FIXED (Commit `a510daf`)

**Symptoms:**
- Auction showed 0 teams in production despite valid server state
- Some API responses returned HTML (from SPA catch-all) instead of JSON
- Problem did not occur on localhost

**Root Cause:**
7 client components and hooks used hardcoded `/api/` paths instead of `${API_BASE}`:
- `useAuctionState.ts` — 9 hardcoded paths (nominate, bid, state fetch, pause/resume/reset, init, finish)
- `TeamListTab.tsx` — 1 path (roster assignment)
- `RosterControls.tsx`, `RosterGrid.tsx`, `RosterManagementForm.tsx` — 3 paths (commissioner tools)
- `TransactionsPage.tsx` — 1 path (claim waiver)

In production, `API_BASE` is set to `fbst-api.onrender.com` (direct to Render, bypassing Cloudflare). Hardcoded `/api/` paths resolved through the browser to `thefantasticleagues.com` (Cloudflare custom domain), which then cached responses as HTML (from the SPA catch-all route `*`).

**Fix:**
```typescript
// BEFORE
await fetchJsonApi('/api/auction/state?leagueId=${lid}');

// AFTER
await fetchJsonApi(`${API_BASE}/auction/state?leagueId=${lid}`);
```

Import `API_BASE` from `client/src/api/base.ts` in every component making API calls.

**Prevention:**
- [ ] Grep all components for hardcoded `/api/` patterns: `grep -rn "'/api/" client/src --include="*.tsx" --include="*.ts" | grep -v test`
- [ ] Every `fetchJsonApi()` call must use `${API_BASE}` prefix
- [ ] Set up a lint rule to flag hardcoded string patterns `'/api/` if possible (ESLint custom rule)

---

### Incident 2: Cloudflare cached API responses as HTML

**Status:** FIXED (Commit `b8f69c2`)

**Symptoms:**
- Some API endpoints returned HTML instead of JSON
- Problem did not occur when accessing API directly via Render URL
- Only occurred through Cloudflare custom domain

**Root Cause:**
Express served the SPA catch-all route `*` (all unmatched routes) with `index.html`. When Cloudflare cached API responses (due to no Cache-Control header), a subsequent request for the same URL would hit the Cloudflare cache instead of Express, returning the cached HTML.

**Fix:**
```typescript
// server/src/index.ts — AFTER all API routers are mounted

// Prevent Cloudflare/CDN from caching API responses
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  next();
});
```

This middleware applies to all `/api/*` routes, preventing any CDN/proxy from caching the responses.

**Prevention:**
- [ ] Confirm `Cache-Control: no-store` is set on all API responses
- [ ] Verify via `curl -I https://thefantasticleagues.com/api/health` that headers are present
- [ ] Test that API endpoints return JSON (not HTML) after deploy

---

### Incident 3: WebSocket connection failed through Cloudflare

**Status:** FIXED (Commit `28d21be` + `913719b`)

**Symptoms:**
- "Reconnecting to auction server" message on live site
- WebSocket connection appeared to hang or timeout
- Worked fine on localhost

**Root Cause (Part 1 — Environment variable not inlined):**
Client code tried to use `import.meta.env.VITE_WS_HOST` to determine the WebSocket host. This env var was not being set during Vite's build process on Render, resulting in `undefined`. The fallback was `window.location.host` (the browser's current domain), which resolves to `thefantasticleagues.com`. Cloudflare's custom domain does not forward WebSocket upgrade requests to the backend.

**Root Cause (Part 2 — CSP restrictions):**
Even after hardcoding the WebSocket host to `fbst-api.onrender.com`, browsers block WebSocket connections to non-whitelisted origins via Content Security Policy. The initial CSP had only `connectSrc: ["'self'", ...]`, which did not explicitly include the Render API domain or WSS scheme.

**Fix (Part 1 — hardcode WebSocket host):**
```typescript
// client/src/features/auction/hooks/useAuctionState.ts

const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
// Render's custom domain doesn't forward WebSocket upgrades — connect directly to Render URL in production
const host = window.location.hostname === 'thefantasticleagues.com'
    ? 'fbst-api.onrender.com'
    : window.location.host;
const wsUrl = `${protocol}//${host}/ws/auction?leagueId=${leagueId}&token=${encodeURIComponent(token)}`;
```

**Fix (Part 2 — CSP connectSrc):**
```typescript
// server/src/index.ts

connectSrc: [
  "'self'",
  "wss://thefantasticleagues.com",  // Explicit production domain
  "wss://*.supabase.co",             // Supabase realtime
  "https://*.supabase.co",
  "https://us.i.posthog.com",
  "https://us.posthog.com",
  "https://statsapi.mlb.com",
],
```

**Prevention:**
- [ ] Test WebSocket connection on production domain after deploy: open browser DevTools → Network → WS filter → bid in auction
- [ ] Verify CSP includes explicit `wss://[production-domain]` (not just `'self'`, which doesn't reliably map `https:` → `wss:` across browsers)
- [ ] Document the WebSocket host hardcoding in comments (non-obvious production-specific logic)

---

### Incident 4: CSP blocked PostHog analytics

**Status:** FIXED (Commit `fc3f071` + `1646489`)

**Symptoms:**
- PostHog analytics not loading on production
- No tracking events recorded
- No errors in console (CSP violations are silent)

**Root Cause:**
CSP `connectSrc` did not include PostHog domains. The PostHog JavaScript library tries to POST event data to `https://us.i.posthog.com`. Without that domain in the CSP whitelist, the request is silently blocked.

**Fix:**
Add PostHog domains to CSP:
```typescript
connectSrc: [
  "'self'",
  "https://us.i.posthog.com",      // PostHog analytics endpoint
  "https://us.posthog.com",         // Fallback domain
  // ... other origins
],
scriptSrc: [
  "'self'",
  "https://us-assets.i.posthog.com",  // PostHog JS bundle
  // ... other origins
],
```

**Prevention:**
- [ ] After deploy, open Production in browser and check DevTools Console for CSP violations
- [ ] Search DevTools Network tab for `posthog` requests — confirm they complete with 200 status
- [ ] Verify PostHog events appear in PostHog dashboard within 5 minutes of user action

---

## Pre-Deployment Checklist

### Phase 1: Code Review (Before Commit)

- [ ] **API Routing**
  - Grep for hardcoded `/api/` paths: `grep -rn "'/api/" client/src --include="*.tsx" --include="*.ts"`
  - All `fetchJsonApi()` calls use `${API_BASE}` prefix
  - No `fetch()` calls directly to `/api/` (use `fetchJsonApi()` wrapper)
  - Test paths work with different `API_BASE` values (localhost, production domain, Render API)

- [ ] **Content Security Policy (CSP)**
  - [ ] `connectSrc` includes all external APIs
    - [ ] `wss://[production-domain]` (WebSocket)
    - [ ] `wss://*.supabase.co` (Supabase realtime)
    - [ ] `https://*.supabase.co` (Supabase REST)
    - [ ] `https://us.i.posthog.com`, `https://us.posthog.com` (PostHog)
    - [ ] `https://statsapi.mlb.com` (MLB Stats API)
  - [ ] `scriptSrc` includes external scripts
    - [ ] `https://accounts.google.com`, `https://apis.google.com` (Google Auth)
    - [ ] `https://us-assets.i.posthog.com` (PostHog JS bundle)
  - [ ] Remove stale/hardcoded Render domains from CSP
  - [ ] No `wss:` wildcard — scope to specific domains

- [ ] **Cache Control**
  - [ ] Middleware on `/api` sets `Cache-Control: no-store, no-cache, must-revalidate, private`
  - [ ] Static assets (Vite-hashed) have `maxAge: '1y', immutable: true` in `express.static()`
  - [ ] Service worker only caches same-origin responses (origin check in `sw.js`)

- [ ] **Environment Variables**
  - [ ] No hardcoded domains in JavaScript (use `window.location.hostname` checks)
  - [ ] WebSocket host fallback logic documented with comments
  - [ ] All `VITE_*` build-time vars are set before build starts
  - [ ] Render dashboard has all required env vars set (see Phase 2 below)

- [ ] **Service Worker**
  - [ ] Cache name bumped for this deploy (e.g., `tfl-v2` instead of `tfl-v1`)
  - [ ] Origin check present before caching responses

- [ ] **TypeScript Build**
  - [ ] `cd client && npx tsc --noEmit` — no errors
  - [ ] `cd server && npx tsc --noEmit` — no errors

- [ ] **Tests**
  - [ ] `npm run test` — all passing
  - [ ] No skipped tests (`test.skip`, `it.skip`)

- [ ] **Git**
  - [ ] All changes committed (no untracked files that affect the build)
  - [ ] Branch is up to date with main
  - [ ] Commit message is clear and references any issues

---

### Phase 2: Environment Setup (Render Dashboard)

Before triggering a build on Render, verify these env vars are set:

#### Runtime Env Vars (needed immediately on deploy)
| Variable | Source | Example | Required |
|----------|--------|---------|----------|
| `NODE_ENV` | Literal | `production` | YES |
| `PORT` | Literal | `4010` | YES |
| `CLIENT_URL` | Production domain | `https://thefantasticleagues.com` | YES |
| `DATABASE_URL` | Supabase Connection Pooler | `postgres://[user]:[password]@[host]:[port]/postgres` | YES |
| `SUPABASE_URL` | Supabase Settings → API | `https://oaogpsshewmcazhehryl.supabase.co` | YES |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Settings → API | (long key) | YES |
| `SESSION_SECRET` | Auto-generated by Render | (varies) | YES |
| `ADMIN_EMAILS` | Comma-separated | `jimmychang316@gmail.com` | Optional |
| `RESEND_API_KEY` | Resend dashboard | (API key) | Optional |
| `APP_URL` | Production domain | `https://thefantasticleagues.com` | Optional |

#### Build-Time Env Vars (must be set BEFORE build runs)
| Variable | Source | Example | Required |
|----------|--------|---------|----------|
| `VITE_SUPABASE_URL` | Same as `SUPABASE_URL` | `https://oaogpsshewmcazhehryl.supabase.co` | YES |
| `VITE_SUPABASE_ANON_KEY` | Supabase Settings → API (anon, not service_role) | (public key) | YES |
| `VITE_POSTHOG_KEY` | PostHog Project Settings | (API key) | Optional |

**Critical:** If `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` are missing at build time, Vite will use placeholder values and authentication will be broken.

**How to verify:**
1. In Render dashboard, click "Logs" (not "Build Logs")
2. Look for the line starting with `▲ Building...` and wait for build to complete
3. Search the Build Logs for `VITE_SUPABASE_URL` — should see it being used
4. Open the production site and check DevTools Console for Supabase connection errors

---

### Phase 3: Supabase Configuration

- [ ] **Authentication → URL Configuration**
  - [ ] Site URL: `https://thefantasticleagues.com` (or your production domain)
  - [ ] Redirect URLs: `https://thefantasticleagues.com/**` (must include wildcard)

- [ ] **Authentication → Providers**
  - [ ] Google OAuth: verify redirect URI in Google Cloud Console
  - [ ] Yahoo OAuth: verify if enabled

---

### Phase 4: Deploy & Immediate Validation

- [ ] **Trigger Deploy**
  - [ ] Push to main (or trigger deploy in Render dashboard)
  - [ ] Wait for build to complete (5-10 minutes)
  - [ ] Check build logs for errors

- [ ] **Health Check (first 5 minutes)**
  - [ ] `curl https://thefantasticleagues.com/api/health` → should return `{"status": "ok"}`
  - [ ] Verify response is JSON, not HTML

- [ ] **Auth Test (2-3 minutes)**
  - [ ] Open https://thefantasticleagues.com in browser
  - [ ] Click "Login"
  - [ ] Verify Google/Yahoo OAuth buttons appear
  - [ ] Do NOT log in yet — just verify buttons render

- [ ] **CSP/Security Headers**
  - [ ] `curl -I https://thefantasticleagues.com/api/health`
  - [ ] Verify response includes:
    - [ ] `Cache-Control: no-store` (API responses)
    - [ ] `Content-Security-Policy: ...` (CSP header)
    - [ ] `Strict-Transport-Security: ...` (HSTS)

- [ ] **PostHog Analytics**
  - [ ] Open DevTools Console
  - [ ] No CSP violations should appear
  - [ ] Search DevTools Network tab for `posthog` — should see requests with 200 status

---

### Phase 5: Feature Tests (after health checks pass)

- [ ] **Authentication**
  - [ ] Log in with Google/Yahoo OAuth
  - [ ] Verify session persists after browser refresh
  - [ ] Log out successfully

- [ ] **API Endpoints**
  - [ ] GET `/api/leagues` → returns JSON with league list
  - [ ] GET `/api/auth/me` → returns current user
  - [ ] POST `/api/auction/state?leagueId=N` → returns auction state JSON (not HTML)

- [ ] **WebSocket (Auction)**
  - [ ] Navigate to an active auction
  - [ ] Open DevTools Network tab, filter for WS
  - [ ] Verify WebSocket connection established (should see `wss://fbst-api.onrender.com/ws/auction?...`)
  - [ ] Attempt to bid or nominate
  - [ ] No "Reconnecting to auction server" messages in UI

- [ ] **Service Worker**
  - [ ] Open DevTools Application → Service Workers
  - [ ] Should see `sw.js` with new cache name (e.g., `tfl-v2`)
  - [ ] Cache Storage should show the new cache with hashed assets

- [ ] **Static Assets**
  - [ ] Open DevTools Network tab
  - [ ] Click on a JS/CSS file, check Response Headers
  - [ ] Should see `Cache-Control: public, max-age=31536000, immutable` (or similar)

---

### Phase 6: Full Smoke Test

Run through a complete user journey to verify nothing is broken:

1. **Login flow**
   - Log out if needed
   - Log back in via Google OAuth
   - Verify email is recognized

2. **Browse leagues**
   - Navigate to Home
   - View league list
   - Enter a league

3. **View roster**
   - Navigate to Teams page
   - Click on a team
   - Verify roster loads with player stats

4. **Auction (if applicable)**
   - Navigate to Auction page
   - Verify teams and players load (this is where the original bug manifested)
   - Attempt to bid or nominate
   - Verify WebSocket messages flow (chat, bids, state updates)

5. **API response validation**
   - In DevTools Network tab, inspect a few API responses
   - All should be JSON with correct content-type
   - No HTML responses (which would indicate a cache/routing issue)

---

## Environment-Specific Differences

### Localhost (Dev)
- `API_BASE = /api` (relative, proxied by Vite to `http://localhost:4010`)
- WebSocket host = `window.location.host` (localhost:3010)
- No Cloudflare caching
- CSP is relaxed or disabled

### Production (Render with Cloudflare)
- `API_BASE = https://fbst-api.onrender.com` (direct to Render, bypassing Cloudflare)
- WebSocket host = `fbst-api.onrender.com` (hardcoded check for `thefantasticleagues.com`)
- All CDN caching must be disabled via Cache-Control headers
- CSP must whitelist all external domains

### How API_BASE is Set
In `client/src/api/base.ts`:
```typescript
export const API_BASE = ((): string => {
  // In production, use the Render API domain to bypass Cloudflare
  if (typeof window !== 'undefined' &&
      window.location.hostname === 'thefantasticleagues.com') {
    return 'https://fbst-api.onrender.com';
  }
  // In dev, use relative path (proxied by Vite)
  return '/api';
})();
```

**If you change the production domain**, update this check:
1. Update the hostname comparison
2. Update all CSP CSP rules
3. Update WebSocket host check in `useAuctionState.ts`
4. Test the changes on production after deploy

---

## Monitoring Post-Deploy

### First Hour
- [ ] Check Render logs for errors
- [ ] Monitor Supabase database activity (should see auth records)
- [ ] Monitor PostHog events (should see page views, user actions)
- [ ] Check error tracking (if configured) for any new errors

### First Day
- [ ] Review Render metrics (CPU, memory, request latency)
- [ ] Check for any user-reported issues
- [ ] Verify no 5xx errors in logs

### Ongoing
- [ ] Set up alerts for:
  - [ ] Build failures (failed deployments)
  - [ ] High error rate (5xx errors)
  - [ ] High latency (P99 response time > 1s)
  - [ ] WebSocket disconnects

---

## Rollback Procedure

If production is broken post-deploy:

1. **Identify the issue** (see logs, error tracking, user reports)
2. **Revert the commit**: `git revert HEAD` or `git reset --hard [previous-commit]`
3. **Re-deploy**: Push to main; Render will auto-deploy the previous version
4. **Notify stakeholders** of the rollback and ETA for a fix

---

## Related Documentation

- `docs/plans/2026-03-20-feat-production-deployment-render-plan.md` — detailed deployment plan
- `FEEDBACK.md` Session 33 (2026-03-20) — deployment execution notes
- `FEEDBACK.md` Session 34 (2026-03-21) — post-deployment retrospective
- `.claude/scripts/check.sh` — automated pre-deploy checks (tests + TypeScript)
- `render.yaml` — Render configuration (env vars, Node version, build/start commands)

---

## Quick Reference: Common Issues & Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| Auction shows 0 teams | Hardcoded `/api/` paths through Cloudflare | Use `${API_BASE}` in all API calls |
| API returns HTML | Cloudflare cached SPA catch-all | Add `Cache-Control: no-store` middleware |
| "Reconnecting to auction server" | WebSocket through Cloudflare | Hardcode WebSocket host to Render URL + add CSP entry |
| Analytics not loading | CSP blocks PostHog | Add PostHog domains to `connectSrc` and `scriptSrc` |
| iOS content clipped | `100vh`/`100dvh` on address bar | Use `100svh` on main layout divs |
| Sticky table headers don't work | Nested overflow containers | Use `ThemedTable bare` + viewport height constraint |
| Auth broken | Missing `VITE_SUPABASE_*` env vars | Set vars BEFORE build starts in Render |

---

## Session History

- **Session 33 (2026-03-20)**: Production deployment readiness, CSP hardening, render.yaml updates
- **Session 34 (2026-03-21)**: Mobile readiness, sticky headers, color accessibility
- **2026-03-22**: Production incidents (hardcoded paths, cache bypass, WebSocket) discovered and fixed

---
