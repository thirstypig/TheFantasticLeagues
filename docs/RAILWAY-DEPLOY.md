# Railway Deployment Checklist

## Pre-Deploy Verification (completed Session 60)

- [x] No hardcoded `onrender.com` URLs in active code (only in Changelog/Roadmap text)
- [x] `railway.json` configured: Nixpacks builder, `npm start`, health check `/api/health`
- [x] WebSocket uses `window.location.host` — no hardcoded hostnames
- [x] `API_BASE` falls back to `/api` (relative) — works for unified deployment
- [x] CSP `connectSrc` includes `wss://app.thefantasticleagues.com`
- [x] CSP `frameSrc` includes YouTube domains
- [x] Service worker serves with `no-cache` headers
- [x] `NODE_ENV` validated at startup (exits if missing required env vars)

## Environment Variables (from render.yaml → Railway)

Set ALL of these in Railway dashboard **BEFORE first build** (VITE_* are build-time):

| Variable | Value | Notes |
|----------|-------|-------|
| `NODE_ENV` | `production` | **Critical** — gates dev login |
| `DATABASE_URL` | `postgres://...` | From Supabase |
| `SUPABASE_URL` | `https://...supabase.co` | |
| `SUPABASE_SERVICE_ROLE_KEY` | (secret) | |
| `SESSION_SECRET` | (generate new) | `openssl rand -hex 32` |
| `ADMIN_EMAILS` | `jimmychang316@gmail.com` | |
| `CLIENT_URL` | `https://thefantasticleagues.com` | For CORS |
| `APP_URL` | `https://thefantasticleagues.com` | For email links |
| `VITE_SUPABASE_URL` | Same as SUPABASE_URL | **Build-time** |
| `VITE_SUPABASE_ANON_KEY` | (from Supabase) | **Build-time** |
| `VITE_POSTHOG_KEY` | (from PostHog) | **Build-time** |
| `RESEND_API_KEY` | (from Resend) | For emails |

**Do NOT set:** `VITE_API_BASE` (leave empty — relative `/api` works), `VITE_WS_HOST` (not used in code), `PORT` (Railway auto-assigns)

## OAuth Callback URLs (update BEFORE DNS cutover)

### Google Cloud Console
- Add: `https://<railway-domain>/api/auth/google/callback`
- Keep: existing Render URL until cutover

### Yahoo Developer Portal  
- Add: `https://<railway-domain>/api/auth/yahoo/callback`

### Supabase Auth
- Add Railway domain to redirect URLs

## Deployment Steps

1. Create Railway project, link GitHub repo
2. Set all env vars (above)
3. Trigger deploy, wait for health check
4. Verify: `curl https://<railway-domain>/api/health`
5. Test Google OAuth login
6. Test WebSocket (open Auction page)
7. Verify cron jobs fire (check logs after 12:00 UTC)
8. Update DNS (Cloudflare CNAME → Railway)
9. Purge Cloudflare cache
10. Keep Render as hot standby for 48h

## Rollback

If Railway fails: revert Cloudflare DNS to Render CNAME (60s with short TTL).
