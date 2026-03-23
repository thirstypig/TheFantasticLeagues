---
title: "CSP and WebSocket failures with custom domains and CDNs"
category: deployment
problem_type: production_incident
component: global
tags:
  - csp
  - websocket
  - cloudflare
  - security-headers
  - production
module: global
severity: critical
root_cause: missing_csp_entries, hostname_resolution
symptom: "WebSocket connections hang; analytics don't load; CSP violations in console"
date: 2026-03-22
time_to_resolve: 2_hours
---

# CSP and WebSocket failures with custom domains and CDNs

## Overview

When deploying with a custom domain (Cloudflare proxy) + a separate API domain (Render), two distinct failures occurred simultaneously:

1. **WebSocket connections failed** because the browser couldn't upgrade HTTP to WSS due to CSP restrictions
2. **Analytics didn't load** because CSP blocked PostHog API calls

Both failures were **silent** — no error messages, just UI behaviors breaking.

---

## Incident 1: WebSocket Reconnection Loop

### Symptoms

- Auction page showed "Reconnecting to auction server"
- WebSocket never connected
- No errors in browser console (WebSocket failures are not logged by the browser)
- Worked fine on localhost

### Root Cause (Two-Part)

#### Part A: Env Var Not Inlined by Vite

Client code tried to determine the WebSocket host via `import.meta.env.VITE_WS_HOST`:

```typescript
// BROKEN — env var not inlined during Render build
const host = import.meta.env.VITE_WS_HOST || window.location.host;
```

During Vite's build process on Render, `VITE_WS_HOST` was not set, so `import.meta.env.VITE_WS_HOST` evaluated to `undefined`. The fallback `window.location.host` resolved to `thefantasticleagues.com`.

The browser then tried to upgrade HTTP to WSS on the same domain: `wss://thefantasticleagues.com/ws/auction?...`

**Problem:** Cloudflare's custom domain doesn't forward WebSocket upgrade requests to the backend. The upgrade fails silently.

#### Part B: CSP Doesn't Allow WebSocket to Different Origin

Even if the code hardcoded the WebSocket host to `fbst-api.onrender.com`, the browser's CSP policy checked:

```typescript
// server/src/index.ts — INITIAL (incomplete) CSP
connectSrc: [
  "'self'",
  "wss://*.supabase.co",
  "https://*.supabase.co",
  // ... missing fbst-api.onrender.com
],
```

The CSP `connectSrc` directive controls WebSocket connections. Without an explicit entry for the Render API domain, the browser **silently blocks** the WebSocket upgrade request.

### The Fix

#### Part A: Hardcode WebSocket Host Based on Production Domain

```typescript
// client/src/features/auction/hooks/useAuctionState.ts

const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

// Render's custom domain doesn't forward WebSocket upgrades — connect directly to Render URL in production
const host = window.location.hostname === 'thefantasticleagues.com'
    ? 'fbst-api.onrender.com'  // Direct Render URL, bypasses Cloudflare
    : window.location.host;    // Localhost or other dev environment

const wsUrl = `${protocol}//${host}/ws/auction?leagueId=${leagueId}&token=${encodeURIComponent(token)}`;
```

This removes the dependency on `VITE_WS_HOST` and explicitly handles the production domain.

#### Part B: Add CSP Entries for Both WebSocket and HTTP

```typescript
// server/src/index.ts

connectSrc: [
  "'self'",
  "wss://thefantasticleagues.com",  // Explicit entry for production WebSocket domain
  "wss://*.supabase.co",            // Supabase realtime
  "https://*.supabase.co",          // Supabase REST API
  "https://us.i.posthog.com",       // PostHog analytics
  "https://us.posthog.com",         // PostHog fallback
  "https://statsapi.mlb.com",       // MLB Stats API
],
```

**Critical Detail:** CSP `'self'` does NOT reliably map `https:` → `wss:` across all browsers. You must explicitly include the WebSocket domain even though it's the same as the current page.

---

## Incident 2: Analytics Not Loading

### Symptoms

- No PostHog events recorded in production
- No errors in console (CSP violations are silent)
- Analytics loaded fine on localhost

### Root Cause

PostHog JavaScript library loads a script from `https://us-assets.i.posthog.com` and sends events to `https://us.i.posthog.com`. The initial CSP didn't include these domains:

```typescript
// BROKEN — missing PostHog domains
scriptSrc: [
  "'self'",
  "https://accounts.google.com",
  "https://apis.google.com",
  // ... missing us-assets.i.posthog.com
],
connectSrc: [
  "'self'",
  // ... missing us.i.posthog.com
],
```

The browser silently blocked both the script load and the API calls.

### The Fix

Add PostHog domains to CSP:

```typescript
scriptSrc: [
  "'self'",
  "https://accounts.google.com",
  "https://apis.google.com",
  "https://us-assets.i.posthog.com",  // PostHog script bundle
],
connectSrc: [
  "'self'",
  "https://us.i.posthog.com",         // PostHog events API
  "https://us.posthog.com",           // Fallback domain
  // ... other origins
],
```

---

## Why These Issues Went Undetected

1. **Localhost dev never hits these issues:** Vite's dev server proxies everything, and there's no Cloudflare or CSP restrictions in dev mode.

2. **CSP violations are silent:** When a resource is blocked by CSP, there's no visible error or console warning. The request is silently dropped.

3. **WebSocket failures are silent:** If a WebSocket connection fails, the browser doesn't log it unless you explicitly listen for `onerror` events.

4. **No integration tests for WebSocket:** Unit tests mock WebSocket, so they pass even if the connection would fail in production.

5. **Analytics is not critical:** If PostHog doesn't load, the app still works. Users don't notice.

---

## Architecture Context: Why CSP is Strict

CSP (Content Security Policy) exists to prevent attacks like:
- Malicious scripts injected into the page
- Cookies stolen via XSS
- Credentials exfiltrated to attacker servers

For each type of resource (scripts, styles, images, fonts, connections), CSP enforces a whitelist. If an external domain isn't on the whitelist, the browser blocks it.

### Production vs. Localhost

| Environment | CSP | Why |
|-------------|-----|-----|
| Localhost (dev) | Often relaxed or `none` | Easier development; you trust your machine |
| Production | Strict whitelist | Security; users trust the app with their data |

This difference means a broken import that goes unnoticed in dev can break production.

---

## CSP Reference: What Each Directive Controls

| Directive | Controls | Example |
|-----------|----------|---------|
| `defaultSrc` | Fallback for other directives | Most resources if no specific rule |
| `scriptSrc` | `<script>` tags, inline scripts | `https://us-assets.i.posthog.com` |
| `styleSrc` | `<link rel="stylesheet">`, inline styles | `'unsafe-inline'` for Tailwind |
| `imgSrc` | `<img>` tags | `https://` for any image URL |
| `fontSrc` | `@font-face` | `https://fonts.googleapis.com` |
| `connectSrc` | `fetch()`, `XMLHttpRequest`, WebSocket | `wss://`, `https://`, `https://*.api.com` |
| `frameSrc` | `<iframe>` | If embedding external content |
| `childSrc` | `<embed>`, `<object>` | Rarely used |

---

## Testing CSP in Production

### Check CSP Header

```bash
curl -I https://thefantasticleagues.com
# Look for Content-Security-Policy header

curl -I https://thefantasticleagues.com | grep -i "content-security-policy"
```

### Check Browser Console for Violations

1. Open DevTools → Console
2. You should see NO messages like:
   - `Refused to load the script ... because it violates the Content-Security-Policy directive`
   - `Refused to connect to ... because it violates the Content-Security-Policy directive`

If you see any CSP violations, add the blocked origin to the corresponding CSP directive.

### Test Each External Service

| Service | Test |
|---------|------|
| Google OAuth | Click "Login with Google" button |
| Yahoo OAuth | Click "Login with Yahoo" button |
| Supabase Auth | Verify session persists after login |
| PostHog Analytics | DevTools Network → Search "posthog" → should see 200 responses |
| MLB API | Search for a player → DevTools Network → `/api/players/...` should return JSON |
| WebSocket | Open Auction page → DevTools Network → WS filter → should see `wss://` connection |

---

## CSP Directives for FBST (Complete Reference)

```typescript
// server/src/index.ts — Current (working) CSP

helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],

    scriptSrc: [
      "'self'",
      "https://accounts.google.com",      // Google OAuth
      "https://apis.google.com",          // Google APIs
      "https://us-assets.i.posthog.com",  // PostHog script
    ],

    connectSrc: [
      "'self'",
      "wss://thefantasticleagues.com",    // WebSocket to production domain
      "wss://*.supabase.co",              // Supabase realtime
      "https://*.supabase.co",            // Supabase REST
      "https://us.i.posthog.com",         // PostHog events
      "https://us.posthog.com",           // PostHog fallback
      "https://statsapi.mlb.com",         // MLB Stats API
    ],

    imgSrc: [
      "'self'",
      "data:",                            // Data URLs (base64 images)
      "https://*.googleusercontent.com",  // Google OAuth profile pics
    ],

    styleSrc: [
      "'self'",
      "'unsafe-inline'",                  // Tailwind inlines critical CSS
      "https:",                           // Google Fonts, etc.
    ],

    fontSrc: [
      "'self'",
      "https:",
      "data:",                            // Font files
    ],

    frameSrc: [],                         // No embedded frames
  },
})
```

---

## Prevention Checklist

### Before Each Deploy

- [ ] **CSP Review**
  - [ ] Check for all external APIs in the codebase
  - [ ] Verify each domain is in the corresponding CSP directive
  - [ ] No stale/hardcoded domains (e.g., old API URLs)
  - [ ] `wss://` entries are specific domains, not wildcards

- [ ] **WebSocket**
  - [ ] Explicit production domain in WebSocket host logic
  - [ ] Same domain added to CSP `connectSrc`
  - [ ] Comments explaining the production-specific logic

- [ ] **Environment Variables**
  - [ ] No env vars used for static security headers
  - [ ] CSP domains are hardcoded (same as Git repo, not a secret)

- [ ] **Testing**
  - [ ] Open DevTools Console on production site
  - [ ] Search for "CSP" or "Refused" — should find 0 violations
  - [ ] Test each external service (Google, Supabase, PostHog, MLB API, WebSocket)

---

## Common CSP Patterns

### Pattern: Third-Party API

```typescript
// If adding a new API (e.g., Stripe):
// 1. Add domain to connectSrc
connectSrc: [
  // ...
  "https://api.stripe.com",
],

// 2. Test in production
// curl -I https://api.stripe.com/v1/... (or use browser Network tab)
```

### Pattern: External Script

```typescript
// If adding a new script library (e.g., analytics):
// 1. Add domain to scriptSrc
scriptSrc: [
  // ...
  "https://cdn.example.com/library.js",
],

// 2. Verify script loads in DevTools Network tab
```

### Pattern: WebSocket

```typescript
// If adding a new WebSocket domain:
// 1. Add to connectSrc with wss: scheme
connectSrc: [
  "wss://mynewdomain.com",
],

// 2. Test WebSocket connection in browser DevTools
```

---

## Debugging CSP Issues

### Step 1: Identify the Blocked Resource

In DevTools Console, look for:
```
Refused to load the resource from "https://example.com/..." because it violates the Content-Security-Policy directive: "connectSrc".
```

Note the domain and the directive (`connectSrc`, `scriptSrc`, etc.).

### Step 2: Add Domain to CSP

In `server/src/index.ts`, find the directive and add the domain:

```typescript
connectSrc: [
  // ... existing entries
  "https://example.com",  // Add this
],
```

### Step 3: Test

1. Deploy to production (or test locally with a hardcoded CSP header)
2. Verify the resource loads and the console error goes away
3. Verify the service still works

### Step 4: Document

Add a comment explaining why the domain is needed:

```typescript
connectSrc: [
  "https://example.com",  // Example API integration (added Session 35)
],
```

---

## Related Commits

- `28d21be` — Hardcode Render URL for WebSocket in production
- `913719b` — Add explicit wss://thefantasticleagues.com to CSP connectSrc
- `1646489` — Code review hardening (scoped wss: to *.supabase.co, added HSTS, etc.)
- `fc3f071` — Initial production readiness (CSP setup, env vars, render.yaml)

---

## Related Documentation

- `DEPLOYMENT-CHECKLIST.md` — Full pre-deploy checklist (includes CSP section)
- `docs/plans/2026-03-20-feat-production-deployment-render-plan.md` — Deployment plan
- `FEEDBACK.md` Session 33 (2026-03-20) — Deployment execution
- `server/src/index.ts` — Live CSP configuration

---

## Quick Reference

| Issue | Symptom | Fix |
|-------|---------|-----|
| WebSocket blocked | "Reconnecting..." message | Add `wss://[domain]` to CSP connectSrc |
| API call blocked | No Network request appears | Add `https://[domain]` to CSP connectSrc |
| Script not loading | Analytics/OAuth doesn't work | Add domain to CSP scriptSrc |
| Font not loading | Page looks wrong, fallback fonts | Add domain to CSP fontSrc |
| Styled images not loading | Broken image icons | Add domain to CSP imgSrc |

---
