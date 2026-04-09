---
title: "Cloudflare edge-cached stale service worker blocks external requests after deploy"
category: deployment
tags:
  - cloudflare
  - service-worker
  - caching
  - railway
  - express-static
  - cdn
  - 503-offline
module: server/infrastructure
symptom: "After Railway deploy, users see 503 Offline for Google Fonts, Google Sign-In, PostHog, YouTube. App appears to run old code despite successful deploy."
root_cause: "Cloudflare edge cached sw.js with max-age=1y immutable headers. Old SW intercepted all cross-origin requests. Additionally, untracked TrophyCaseTab.tsx caused Railway builds to fail silently, serving last successful (old) build."
severity: critical
date_resolved: 2026-04-09
session: 60
---

# Cloudflare Edge-Cached Stale Service Worker Blocks External Requests

## Symptom

After deploying to Railway, production users see:
- 503 "Offline" errors on Google Fonts, Google Sign-In, PostHog analytics
- YouTube embeds fail to load
- MLB player images missing
- Login page broken (Google OAuth blocked)
- App appears to run weeks-old code despite Railway showing "Deploy successful"

Browser console shows:
```
Failed to load resource: the server responded with a status of 503 (Offline) @ https://fonts.googleapis.com/...
Failed to load resource: the server responded with a status of 503 (Offline) @ https://accounts.google.com/gsi/client
Failed to load resource: the server responded with a status of 503 (Offline) @ https://us-assets.i.posthog.com/...
```

## Investigation

1. **Checked browser console** — 503 errors on all external URLs (fonts, auth, analytics)
2. **Checked SW cache headers**: `curl -sI https://app.thefantasticleagues.com/sw.js` returned:
   ```
   cache-control: public, max-age=31536000, immutable
   date: Tue, 31 Mar 2026 21:18:07 GMT
   ```
   The date was 9 days stale — Cloudflare was serving a cached copy from March 31.
3. **Reviewed server code** — `serveSWNocache()` at `server/src/index.ts:289-299` correctly sets `Cache-Control: no-cache, no-store, must-revalidate` on `/sw.js`
4. **Identified the gap** — Cloudflare edge cache had the old copy and never asked Railway for a new one because the cached response said "immutable, cache for 1 year"
5. **Found secondary issue** — `TrophyCaseTab.tsx` was never committed to git. Local `tsc --noEmit` passes (file on disk) but Railway build fails (only committed files). Railway silently served last successful old build.

## Root Cause

**Two cascading failures:**

### 1. Untracked file caused silent build failure
`client/src/features/archive/components/TrophyCaseTab.tsx` existed locally but was never `git add`ed. Railway builds failed with:
```
error TS2307: Cannot find module '../components/TrophyCaseTab'
```
Railway's behavior: when a build fails, it keeps serving the last successful deploy. No alert, no notification — the old build silently continues running.

### 2. Cloudflare cached stale service worker
`express.static` serves `client/dist/` with `maxAge: '1y', immutable: true`. Before `serveSWNocache()` was added (Session 55), `sw.js` was served with these aggressive headers. Cloudflare cached it at the edge. Even after the fix, Cloudflare never re-fetched because:
- `immutable` tells the CDN the content will never change
- `max-age=31536000` (1 year) means no revalidation needed
- Standard `Cache-Control` headers from the origin are irrelevant — Cloudflare uses its own edge cache TTL based on what it originally received

The stale SW's fetch handler intercepted ALL requests (including cross-origin) and returned 503 Offline because it lacked the `isSameOrigin` guard added in Session 55.

## Solution

### Fix 1: CDN-specific no-cache headers (code)

Added `CDN-Cache-Control` and `Cloudflare-CDN-Cache-Control` headers that Cloudflare respects for edge caching decisions, independent of `Cache-Control`:

```typescript
// server/src/index.ts — serveSWNocache()
app.get('/sw.js', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('CDN-Cache-Control', 'no-store');               // Cloudflare edge
  res.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');    // Cloudflare alt
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(swPath);
});
```

### Fix 2: Cloudflare Page Rule (one-time)

In Cloudflare dashboard → Rules → Page Rules:
- URL: `app.thefantasticleagues.com/sw.js`
- Setting: **Cache Level: Bypass**

### Fix 3: Purge stale cache (one-time)

Cloudflare dashboard → Caching → Purge by URL: `https://app.thefantasticleagues.com/sw.js`

### Fix 4: Commit missing file

```bash
git add client/src/features/archive/components/TrophyCaseTab.tsx
git commit -m "fix: add missing TrophyCaseTab.tsx"
git push origin main
```

## Verification

After deploying the fix:

```bash
# 1. Verify sw.js headers from CDN
curl -sI https://app.thefantasticleagues.com/sw.js | grep -i cache
# Expected: cache-control: no-cache, no-store, must-revalidate
# Expected: cdn-cache-control: no-store
# NOT: max-age=31536000, immutable

# 2. Check cf-cache-status
curl -sI https://app.thefantasticleagues.com/sw.js | grep -i cf-cache
# Expected: cf-cache-status: BYPASS or DYNAMIC (NOT HIT)

# 3. Browser: hard refresh (Ctrl+Shift+R), check console for 0 errors on external resources
```

## Prevention

### Pre-push checklist additions
- `git status --short | grep "^??" | grep -E "\.(ts|tsx)$"` — find untracked TypeScript files
- If any results: verify they are NOT imported by committed code

### Automated defense layers
| Layer | Defense | Status |
|-------|---------|--------|
| Server | `CDN-Cache-Control: no-store` on sw.js | Done (Session 60) |
| CDN | Cloudflare Page Rule: bypass cache for sw.js | Manual setup needed |
| Browser | `updateViaCache: 'none'` on SW registration | Already in code |
| SW | `isSameOrigin` guard in fetch handler | Already in code (Session 55) |
| Git | Check untracked imports before push | Add to session-end checklist |

### Key insight
**Service workers are uniquely dangerous to CDN-cache.** A stale SW can break the entire app for all users until the CDN TTL expires. Unlike other static assets (which just show old content), a stale SW actively intercepts and blocks network requests. The `sw.js` file must ALWAYS bypass CDN caching.

## Related

- `docs/solutions/deployment/service-worker-immutable-cache-headers.md` — original SW cache header fix (Session 55)
- `docs/solutions/runtime-errors/service-worker-blocking-external-resources.md` — isSameOrigin guard (Session 55)
- `docs/solutions/deployment/hardcoded-api-paths-cloudflare-cache-bypass.md` — Cloudflare cache issues with API paths
- `docs/solutions/deployment/QUICK-REFERENCE.md` — deployment checklist
