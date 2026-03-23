# Production Deployment Solutions & Learnings

This directory contains institutional knowledge from FBST's first production deployment (March 2026) and the critical incidents discovered post-deploy.

## Documents

### 1. **DEPLOYMENT-CHECKLIST.md** (START HERE)
Complete pre-deployment and post-deployment checklist covering all phases from code review through production validation.

- Pre-deployment code review checklist (API routing, CSP, caching, env vars)
- Environment setup (Render dashboard, Supabase configuration)
- Deploy and validation procedures
- Smoke test checklist
- Monitoring and rollback procedures
- Quick reference table for common issues

**Use this checklist before every future deployment.**

### 2. **hardcoded-api-paths-cloudflare-cache-bypass.md**
Deep dive into the incident where hardcoded `/api/` paths bypassed the API_BASE constant, causing Cloudflare to cache API responses as HTML.

**Key learning:** Hardcoded paths work in dev (relative proxy) but break in production (different API domain). Use `${API_BASE}` everywhere.

**Prevention:** 
- Grep check: `grep -rn "'/api/" client/src --include="*.tsx" --include="*.ts"`
- Every API call must use `${API_BASE}` prefix

### 3. **csp-websocket-and-cdn-issues.md**
Covers two related security and infrastructure incidents:

1. **WebSocket connections failed** — browser couldn't upgrade HTTP to WSS due to missing CSP entries and env vars not being inlined
2. **Analytics didn't load** — CSP blocked PostHog domains

**Key learning:** CSP `'self'` does NOT reliably map `https:` → `wss:`. Explicit domain entries required. CSP violations are silent.

**Prevention:**
- Check CSP header on production: `curl -I https://[domain] | grep -i csp`
- Check browser console for CSP violations (should be 0)
- Test each external service (Google OAuth, Supabase, PostHog, WebSocket, MLB API)

---

## Production Architecture (FBST)

```
User Domain (Cloudflare Custom Domain)
  │
  └─→ thefantasticleagues.com (HTTPS)
        │
        └─→ Cloudflare proxy layer
              │
              └─→ Render backend (fbst.onrender.com)

API Domain (Direct to Render)
  │
  └─→ fbst-api.onrender.com (HTTPS)
        │
        └─→ Render backend (bypasses Cloudflare)
```

Client code must route:
- **User-facing HTML/static assets:** through `thefantasticleagues.com` (Cloudflare)
- **API calls:** directly to `fbst-api.onrender.com` (bypass Cloudflare)
- **WebSocket:** directly to `fbst-api.onrender.com` (bypass Cloudflare)

---

## Critical Incidents Resolved

| Incident | Status | Commit | Severity |
|----------|--------|--------|----------|
| Hardcoded API paths bypass API_BASE | ✅ Fixed | `a510daf` | 🔴 Critical |
| Cloudflare cached API responses as HTML | ✅ Fixed | `b8f69c2` | 🔴 Critical |
| WebSocket through Cloudflare failed | ✅ Fixed | `28d21be` + `913719b` | 🔴 Critical |
| CSP blocked PostHog analytics | ✅ Fixed | `fc3f071` + `1646489` | 🟡 High |

---

## Environment-Specific Variables

### API_BASE (client/src/api/base.ts)
```typescript
if (window.location.hostname === 'thefantasticleagues.com') {
  return 'https://fbst-api.onrender.com';  // Production
}
return '/api';  // Dev/localhost
```

### WebSocket Host (client/src/features/auction/hooks/useAuctionState.ts)
```typescript
const host = window.location.hostname === 'thefantasticleagues.com'
    ? 'fbst-api.onrender.com'  // Production
    : window.location.host;    // Dev/localhost
```

### If You Change the Production Domain
Update **three places**:
1. API_BASE check in `client/src/api/base.ts`
2. WebSocket host check in `client/src/features/auction/hooks/useAuctionState.ts`
3. CSP wss: rule in `server/src/index.ts`

---

## Session History

- **Session 33 (2026-03-20):** Production deployment readiness (CSP hardening, render.yaml, env vars)
- **Session 34 (2026-03-21):** Mobile readiness, sticky headers, color accessibility
- **2026-03-22:** Production incidents discovered and fixed (hardcoded paths, cache bypass, WebSocket)

---

## Related Files

- `server/src/index.ts` — CSP configuration, cache-control middleware
- `client/src/api/base.ts` — API_BASE constant definition
- `client/src/features/auction/hooks/useAuctionState.ts` — WebSocket host determination
- `render.yaml` — Render deployment configuration
- `FEEDBACK.md` — Session-by-session progress log
- `CLAUDE.md` — Architecture and conventions

---

## Testing Post-Deploy

```bash
# 1. Health check
curl https://thefantasticleagues.com/api/health | jq .

# 2. CSP verification
curl -I https://thefantasticleagues.com | grep -i "content-security-policy"

# 3. API response validation
# Open DevTools → Network tab
# Make an API call (login, bid, etc.)
# Verify response is JSON (not HTML)
# Verify request goes to fbst-api.onrender.com (not thefantasticleagues.com)

# 4. WebSocket test
# Open Auction page
# DevTools → Network → WS filter
# Should see wss://fbst-api.onrender.com/ws/auction?...
# Should NOT see "Reconnecting" message

# 5. CSP violations
# DevTools → Console
# Search for "Refused" or "CSP"
# Should find 0 violations

# 6. Hardcoded paths scan
grep -rn "'/api/" client/src --include="*.tsx" --include="*.ts" | grep -v test
# Should return 0 results
```

---

## Future Deployments

Before deploying:
1. Run the DEPLOYMENT-CHECKLIST.md pre-deploy section
2. Verify tests pass: `npm run test`
3. Verify builds: `cd client && npx tsc --noEmit && cd ../server && npx tsc --noEmit`
4. Commit changes with clear message
5. Push to main
6. Monitor production logs and error tracking

---
