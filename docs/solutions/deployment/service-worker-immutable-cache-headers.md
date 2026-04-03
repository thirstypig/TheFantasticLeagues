---
title: "Service Worker served with max-age=1y immutable — browsers never update"
category: deployment
component:
  - server/src/index.ts
  - client/public/sw.js
  - client/src/main.tsx
symptoms:
  - Production YouTube thumbnails return 503 Offline
  - Daily Diamond MLB images don't display
  - Google Fonts fail to load (503)
  - Google Sign-in button broken
  - PostHog analytics blocked
  - All external resources intercepted by stale service worker
root_cause: "Express serves sw.js with the same max-age=1y immutable headers as hashed Vite assets — browsers permanently cache the broken SW and never re-fetch the fixed version"
date_encountered: 2026-04-02
severity: critical
tags:
  - service-worker
  - cache-control
  - express-static
  - deployment
  - immutable
related:
  - service-worker-blocking-external-resources.md
---

# Service Worker Served with max-age=1y immutable — Browsers Never Update

## Problem

After deploying a fix to the service worker (v2 → v3, which added `isSameOrigin` guard to stop intercepting external URLs), production users continued seeing 503 Offline errors on all external resources: YouTube thumbnails, MLB images, Google Fonts, Google Sign-in, PostHog analytics.

The fix was deployed, the server had the correct `sw.js` file, but browsers never fetched it.

## Symptoms

```
sw.js:33 Fetch API cannot load https://i.ytimg.com/vi/xxx/mqdefault.jpg.
         Refused to connect because it violates the document's Content Security Policy.

sw.js:33 Fetch API cannot load https://fonts.googleapis.com/css2?family=Inter...
         Refused to connect because it violates the document's Content Security Policy.

sw.js:33 Fetch API cannot load https://accounts.google.com/gsi/client.
         Refused to connect because it violates the document's Content Security Policy.
```

The `sw.js:33` line reference was the OLD v2 service worker — the v3 fix would have returned at line 31-32 without intercepting.

## Root Cause

**Express `static` middleware served `sw.js` with `max-age=1y, immutable` headers** — the same headers used for Vite's content-hashed assets (`index-abc123.js`).

```typescript
// server/src/index.ts (BEFORE)
app.use(express.static(clientDistPath, { maxAge: '1y', immutable: true, index: false }));
```

This is correct for hashed files (their content never changes — the hash changes instead). But `sw.js` is NOT hashed — it's always served at `/sw.js`. With `immutable`, browsers literally never re-check the file:

| Header | Effect on sw.js |
|--------|----------------|
| `max-age=31536000` | Browser caches for 1 year |
| `immutable` | Browser skips conditional requests (no If-None-Match/If-Modified-Since) |

Result: even after deploying v3, browsers served the cached v2 forever.

**Compounding factor**: The service worker registration used no `updateViaCache` option:

```typescript
// client/src/main.tsx (BEFORE)
navigator.serviceWorker.register("/sw.js").catch(() => {});
```

Without `updateViaCache: "none"`, the browser uses its normal HTTP cache when checking for SW updates — which returns the stale `immutable` cached version.

## Solution

Three coordinated fixes:

### 1. Dedicated `/sw.js` route with no-cache headers (BEFORE express.static)

```typescript
// server/src/index.ts
const serveSWNocache = (basePath: string) => {
  const swPath = path.join(basePath, 'sw.js');
  if (fs.existsSync(swPath)) {
    app.get('/sw.js', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(swPath);
    });
  }
};

// Register BEFORE express.static
serveSWNocache(clientDistPath);
app.use(express.static(clientDistPath, { maxAge: '1y', immutable: true, index: false }));
```

**Why before**: Express processes routes in registration order. The dedicated route intercepts `/sw.js` before `express.static` can serve it with `immutable` headers.

### 2. `updateViaCache: "none"` on SW registration

```typescript
// client/src/main.tsx
navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => {});
```

This tells the browser to always bypass HTTP cache when checking for SW script updates, regardless of the server's cache headers.

### 3. Bump SW cache version

```javascript
// client/public/sw.js
const CACHE_NAME = 'tfl-v4'; // was v3
```

Combined with `skipWaiting()` and `clients.claim()`, this ensures the new SW activates immediately and clears old caches.

## Why Not Other Approaches?

| Approach | Verdict | Reason |
|----------|---------|--------|
| Add `sw.js` to Vite's build (hashed) | Rejected | SW must be at a fixed URL — browsers monitor `/sw.js` specifically |
| Set `maxAge: 0` on ALL static files | Rejected | Would destroy caching for legitimate hashed assets |
| Use `Cache-Control: no-cache` on express.static for `.js` files | Rejected | Would affect all JS files, not just sw.js |
| Cloudflare page rule to bypass cache on sw.js | Fragile | Coupling deployment to CDN config; server should be authoritative |

## Prevention

### Rules

1. **Service workers MUST be served with `no-cache` headers.** Never rely on `express.static` defaults — always add a dedicated route for `sw.js` that sets `Cache-Control: no-cache, no-store, must-revalidate`.

2. **Always set `updateViaCache: "none"` on SW registration.** This is a belt-and-suspenders defense — even if the server headers are wrong, the browser will still bypass cache for SW update checks.

3. **Bump the SW cache version on every deploy** that changes `sw.js`. The version string in `CACHE_NAME` triggers cache eviction via the `activate` event handler.

### Checklist for SW Changes

- [ ] `sw.js` served with `Cache-Control: no-cache, no-store, must-revalidate`
- [ ] `sw.js` route registered BEFORE `express.static`
- [ ] `updateViaCache: "none"` on `navigator.serviceWorker.register()`
- [ ] `CACHE_NAME` bumped (e.g., `tfl-v4` → `tfl-v5`)
- [ ] `skipWaiting()` in install handler
- [ ] `clients.claim()` in activate handler
- [ ] Verify on production after deploy: `curl -sI https://app.thefantasticleagues.com/sw.js | grep cache-control` should show `no-cache`

## Cross-References

- **[SW Blocking External Resources](../runtime-errors/service-worker-blocking-external-resources.md)** — The original v2→v3 fix that added the `isSameOrigin` guard. That fix was correct but never reached production users due to the caching issue documented here.
- **[Deployment Checklist](DEPLOYMENT-CHECKLIST.md)** — Pre-deploy steps including hardcoded API paths, CSP verification, and cache busting.
- **[MDN: Service Worker Lifecycle](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers#updating_service_workers)** — Browser SW update mechanism and how HTTP cache interacts with it.

## Verification

After deploying the fix:
```bash
# Verify no-cache headers on sw.js
curl -sI "https://app.thefantasticleagues.com/sw.js" | grep -i cache-control
# Expected: cache-control: no-cache, no-store, must-revalidate

# Verify correct SW version
curl -s "https://app.thefantasticleagues.com/sw.js" | head -2
# Expected: const CACHE_NAME = 'tfl-v4';

# Verify external resources load (no 503)
# Open browser DevTools → Network → filter by "ytimg.com" or "mlbstatic.com"
# All should return 200, not 503
```
