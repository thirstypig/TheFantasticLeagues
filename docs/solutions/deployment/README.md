# Production Deployment Solutions & Learnings

> **Current production host:** Railway (unified API + client at `app.thefantasticleagues.com`), behind Cloudflare. For the authoritative deploy reference, see `docs/RAILWAY-DEPLOY.md`.
>
> The incidents below happened during the **original Render deployment** (March 2026). They're preserved because the *lessons* — CSP must whitelist every third-party domain, hardcoded paths bypass routing, CDNs silently cache API responses — apply to any host. Specific URLs (`fbst-api.onrender.com`) and the split-domain architecture are historical.

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

## Production Architecture (current)

```
Browser
  │
  └─→ app.thefantasticleagues.com (Cloudflare DNS + CDN)
        │
        └─→ Railway (Nixpacks, Node 20)
              ├── Express serves API at /api/*
              ├── Express serves built client (Vite dist) at /*
              └── WebSocket upgrades on same origin (wss://app.thefantasticleagues.com)
```

Unified single-service deployment: `API_BASE = "/api"` (relative) and WebSocket uses `window.location.host`. No split API domain.

### Historical architecture (Render, March 2026)

```
thefantasticleagues.com  ──▶  Cloudflare  ──▶  fbst.onrender.com        (HTML/static)
fbst-api.onrender.com    ──▶  (direct)    ──▶  Render API               (JSON + WS)
```

The split was required because Cloudflare's custom domain didn't forward WebSocket upgrades. Railway's unified deploy makes the split unnecessary — but the Incidents 1–4 below all stem from maintaining that split, so the lessons still matter.

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

### API_BASE (client/src/api/base.ts) — current
```typescript
const RAW_BASE = import.meta.env.VITE_API_BASE ?? import.meta.env.VITE_API_BASE_URL ?? "";
// Empty → "/api" (relative). Works because Railway serves API and client on the
// same origin. Historical Render deploy had to hardcode a split-domain check here.
```

### WebSocket Host (client/src/features/auction/hooks/useAuctionState.ts) — current
Uses `window.location.host` for the WS URL. Same origin as the HTTP request → Railway handles the upgrade natively.

### If You Change the Production Domain
Currently (unified Railway deploy), update:
1. CSP `wss://` entry in `server/src/index.ts`
2. OAuth provider consoles (Google, Yahoo, Supabase) — callback URLs
3. `CLIENT_URL` / `APP_URL` / `*_REDIRECT_URI` env vars in Railway dashboard
4. `docs/RAILWAY-DEPLOY.md` + `docs/AUTH_SETUP.md` documented URLs

If a split API domain is ever reintroduced, also update `client/src/api/base.ts` and `client/src/features/auction/hooks/useAuctionState.ts`.

---

## Session History

- **Session 33 (2026-03-20):** First production deployment to Render (CSP hardening, render.yaml, env vars)
- **Session 34 (2026-03-21):** Mobile readiness, sticky headers, color accessibility
- **2026-03-22:** Production incidents discovered and fixed (hardcoded paths, cache bypass, WebSocket) — see Incidents 1–4 above
- **Session 51:** Migrated Render → Railway (always-on, native WebSocket, unified deploy) — see `FEEDBACK.md`

---

## Related Files

- `server/src/index.ts` — CSP configuration, cache-control middleware
- `client/src/api/base.ts` — API_BASE constant definition
- `client/src/features/auction/hooks/useAuctionState.ts` — WebSocket host determination
- `railway.json` — Railway deployment configuration (current)
- `docs/RAILWAY-DEPLOY.md` — env var schema + deploy procedure (current)
- `FEEDBACK.md` — Session-by-session progress log
- `CLAUDE.md` — Architecture and conventions

---

## Testing Post-Deploy

```bash
# 1. Health check
curl https://app.thefantasticleagues.com/api/health | jq .

# 2. CSP verification
curl -I https://app.thefantasticleagues.com | grep -i "content-security-policy"

# 3. API response validation
# Open DevTools → Network tab; make an API call (login, bid, etc.)
# Verify response is JSON (not HTML) with Cache-Control: no-store

# 4. WebSocket test
# Open Auction page → DevTools → Network → WS filter
# Should see wss://app.thefantasticleagues.com/ws/auction?...
# Should NOT see "Reconnecting" message

# 5. CSP violations
# DevTools → Console → search for "Refused" or "CSP"
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
