---
title: "Quick Reference — Production Deployment Gotchas"
category: deployment
tags:
  - cheatsheet
  - quick-reference
  - production
---

# Quick Reference — Production Deployment Gotchas

> **Current host:** Railway (unified service at `app.thefantasticleagues.com`). For env vars and deploy procedure see `docs/RAILWAY-DEPLOY.md` — it's the current source of truth.
>
> The cheatsheet below was written during the **Render-era** split-domain deploy. The *shape* of the gotchas (hardcoded `/api/` paths, CDN caching API responses as HTML, CSP silently blocking third-party services, WebSocket host mismatches) still applies to any host — keep it around as the diagnostic reference. Specific domains like `fbst-api.onrender.com` are historical.

## Pre-Deploy Checklist (5 minutes)

```bash
# 1. Grep for hardcoded API paths
grep -rn "'/api/" client/src --include="*.tsx" --include="*.ts" | grep -v test
# Expected: 0 results

# 2. Run all tests
npm run test
# Expected: 660+ tests passing

# 3. TypeScript check
cd client && npx tsc --noEmit && cd ../server && npx tsc --noEmit
# Expected: no errors

# 4. Verify env vars in Render dashboard (BEFORE building)
# Check: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_POSTHOG_KEY
# These must be set BEFORE the build starts, not after!
```

## Post-Deploy Validation (10 minutes)

```bash
# 1. Health check
curl https://thefantasticleagues.com/api/health | jq .
# Expected: {"status": "ok"} (JSON, not HTML)

# 2. CSP headers present
curl -I https://thefantasticleagues.com | grep -i "content-security-policy"
# Expected: CSP directive with connectSrc containing PostHog, Supabase, etc.

# 3. Cache headers on API
curl -I https://thefantasticleagues.com/api/health | grep -i "cache-control"
# Expected: Cache-Control: no-store, no-cache, must-revalidate, private

# 4. Open browser and check console for CSP violations
# DevTools → Console → Search "Refused" or "CSP"
# Expected: 0 violations

# 5. Service worker cache headers (Session 60 — Cloudflare bypass)
curl -sI https://app.thefantasticleagues.com/sw.js | grep -i "cache-control\|cdn-cache"
# Expected: cache-control: no-cache, no-store, must-revalidate
# Expected: cdn-cache-control: no-store
# NOT: max-age=31536000, immutable (stale Cloudflare edge cache)
```

## The Four Critical Issues (and How to Spot Them)

### Issue 1: Hardcoded `/api/` Paths
| Symptom | Test | Fix |
|---------|------|-----|
| Auction shows 0 teams; API returns HTML | `grep -rn "'/api/"` | Import `API_BASE` and use `${API_BASE}` everywhere |
| Works on localhost, breaks in production | Verify `useAuctionState.ts` has `API_BASE` | Same — use `${API_BASE}` not `/api/` |

### Issue 2: Cloudflare Cached API as HTML
| Symptom | Test | Fix |
|---------|------|-----|
| API intermittently returns HTML | `curl -I /api/health` check Content-Type | Add `Cache-Control: no-store` middleware |
| Fresh page load works, second request fails | Check Render logs for duplicate responses | Server-side: add cache-control headers |

### Issue 3: WebSocket Hang ("Reconnecting...")
| Symptom | Test | Fix |
|---------|------|-----|
| "Reconnecting to auction server" message | DevTools → Network → WS filter | Hardcode WebSocket host + add CSP entry |
| WebSocket never connects | Check if `wss://fbst-api.onrender.com` appears | Check `useAuctionState.ts` line ~153 for hostname check |
| CSP violations in console | DevTools Console search "wss://" | Add `wss://thefantasticleagues.com` to CSP connectSrc |

### Issue 4: Analytics/OAuth/APIs Don't Load
| Symptom | Test | Fix |
|---------|------|-----|
| PostHog events not recorded | Monitor PostHog dashboard | Add `https://us.i.posthog.com` to CSP connectSrc |
| Google/Yahoo OAuth doesn't work | Try login, check console | Verify CSP allows `accounts.google.com`, `apis.google.com` |
| No MLB API data | Search players, check DevTools Network | Verify CSP allows `https://statsapi.mlb.com` |

---

## Critical Files (Know These)

| File | What | Why |
|------|------|-----|
| `client/src/api/base.ts` | Defines `API_BASE` constant | Used by all API calls. Production → fbst-api.onrender.com, Dev → /api |
| `client/src/features/auction/hooks/useAuctionState.ts` | WebSocket host logic | Hardcodes `fbst-api.onrender.com` for production hostname |
| `server/src/index.ts` | CSP headers + cache-control | Must include PostHog, Supabase, WebSocket domains |
| `render.yaml` | Deployment config | Must have VITE_* build-time vars before build starts |

---

## Environment Checks

### Check API_BASE is Correct
```typescript
// In browser console
console.log(window.location.hostname)  // Should be "thefantasticleagues.com"
fetch('/api/health')  // Will resolve to thefantasticleagues.com (wrong)
// ❌ Wrong — goes through Cloudflare

// Instead, fetch('/api/health') ALWAYS fails in production
// You need to use fetchJsonApi() from api/base.ts which uses API_BASE
```

### Check WebSocket Host is Correct
```typescript
// In browser console (during auction)
// Open DevTools → Network → WS filter
// Should see: wss://fbst-api.onrender.com/ws/auction?leagueId=N
// NOT: wss://thefantasticleagues.com/ws/auction?...
```

### Check CSP is Present
```bash
curl -I https://thefantasticleagues.com | grep -A 5 "content-security-policy"

# Expected to include:
# connectSrc: ['self', 'wss://thefantasticleagues.com', 'https://*.supabase.co', 'https://us.i.posthog.com', ...]
```

---

## If You Change the Production Domain

You MUST update three places:

1. **`client/src/api/base.ts`** — API_BASE check
   ```typescript
   if (window.location.hostname === 'NEWDOMAIN.com') {
     return 'https://fbst-api.onrender.com';
   }
   ```

2. **`client/src/features/auction/hooks/useAuctionState.ts`** — WebSocket host check (line ~155)
   ```typescript
   const host = window.location.hostname === 'NEWDOMAIN.com'
       ? 'fbst-api.onrender.com'
       : window.location.host;
   ```

3. **`server/src/index.ts`** — CSP wss: rule (line ~82)
   ```typescript
   connectSrc: [
     "wss://NEWDOMAIN.com",
     // ... rest
   ]
   ```

**Test:** Deploy, then verify in browser console that there are 0 CSP violations.

---

## Deployment Workflow (Copy/Paste Ready)

```bash
# 1. Verify no hardcoded paths
grep -rn "'/api/" client/src --include="*.tsx" --include="*.ts" | grep -v test

# 2. Run tests
npm run test

# 3. TypeScript check
cd client && npx tsc --noEmit && cd ../server && npx tsc --noEmit

# 4. Commit (if changes exist)
git add -A && git commit -m "pre-deploy: [description]"

# 5. Push to main
git push origin main

# 6. Render auto-deploys. Wait 5-10 minutes.

# 7. Health check
curl https://thefantasticleagues.com/api/health | jq .

# 8. Verify headers
curl -I https://thefantasticleagues.com | grep -i "cache-control\|content-security-policy"

# 9. Open browser and test
# - Login
# - Navigate to Auction
# - DevTools → Console (should be clean, 0 CSP violations)
# - DevTools → Network → WS filter (should see wss://fbst-api.onrender.com)

# 10. Monitor logs
# Open Render dashboard → Logs and watch for errors for next 30 minutes
```

---

## Emergency: Rollback Procedure

If production is broken:

```bash
# 1. Identify the bad commit
git log --oneline -5

# 2. Revert
git revert HEAD

# 3. Push (Render auto-deploys)
git push origin main

# 4. Wait 5 minutes for deploy
# 5. Verify health
curl https://thefantasticleagues.com/api/health
```

---

## Symptoms → Root Cause Lookup

| User Reports | Check First | Likely Cause |
|---|---|---|
| "Auction shows no teams" | DevTools Network → `/api/auction/state` response | Hardcoded path or Cloudflare cache |
| "Can't bid" | DevTools Network → WebSocket hangs | WebSocket host wrong or CSP blocks it |
| "Analytics not tracking" | DevTools Console → search "PostHog" | CSP blocks PostHog domains |
| "Can't log in" | DevTools Console → CSP violations | CSP blocks Google/Yahoo domains |
| "Page looks broken" | `curl -I https://[domain]` → check headers | Service worker or CSS caching issue |

---

## Testing Commands

```bash
# Test API routing (should work directly, not through thefantasticleagues.com)
curl https://fbst-api.onrender.com/api/health

# Test Cloudflare custom domain (should also work, proxies to Render)
curl https://thefantasticleagues.com/api/health

# Test CSP is present
curl -I https://thefantasticleagues.com | grep -i csp

# Test cache headers on API
curl -I https://thefantasticleagues.com/api/health | grep -i cache

# Test WebSocket connection exists (requires authentication)
# Open browser DevTools while on Auction page
# Network tab → WS filter → should see wss://fbst-api.onrender.com/ws/auction?...
```

---

## Production vs. Localhost Differences

| Item | Production | Localhost |
|------|------------|-----------|
| API calls | Must use `${API_BASE}` (https://fbst-api.onrender.com) | Can use `/api` (Vite proxies) |
| WebSocket | Must hardcode fbst-api.onrender.com | Can use window.location.host |
| CSP | Strict whitelist | Often disabled or relaxed |
| Caching | Cloudflare caches everything unless told not to | No caching |
| HTTPS | Required | Optional (localhost uses HTTP) |

---

## Key Insight

**Localhost dev works because everything is same-origin and you control the server.** Production breaks because:
1. User domain (Cloudflare) != API domain (Render) — requests routed differently
2. Hardcoded paths resolve to wrong domain through Cloudflare
3. CSP must explicitly allow each external domain
4. WebSocket upgrades don't work through proxies

**Prevention:** Don't hardcode domains. Use constants. Test in production immediately after deploy.

---

**Next deployment?** Open `DEPLOYMENT-CHECKLIST.md` and go through Phase 1.
