# OAuth Authentication Setup

## Quick Reference

| Provider | Local Redirect URI | Production Redirect URI |
|----------|-------------------|------------------------|
| **Google** | `http://localhost:3010/api/auth/google/callback` | `https://fbst-api.onrender.com/api/auth/google/callback` |
| **Yahoo** | `https://localhost:4000/api/auth/yahoo/callback` | `https://fbst-api.onrender.com/api/auth/yahoo/callback` |

## Protocol Rules (Do NOT Violate)

- **Google**: Forbids `https://localhost`. Always use `http://localhost` for local dev.
- **Yahoo**: Requires `https://` for all redirect URIs, including localhost.

## Environment Variables

### Local Development (`server/.env`)

```env
# Do NOT set GOOGLE_REDIRECT_URI locally — the code default handles it
# GOOGLE_REDIRECT_URI is intentionally unset

# Yahoo requires explicit HTTPS redirect
YAHOO_REDIRECT_URI=https://localhost:4000/api/auth/yahoo/callback
```

### Production (Render Dashboard)

```env
GOOGLE_CLIENT_ID=<from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<from Google Cloud Console>
GOOGLE_REDIRECT_URI=https://fbst-api.onrender.com/api/auth/google/callback

YAHOO_CLIENT_ID=<from Yahoo Developer Console>
YAHOO_CLIENT_SECRET=<from Yahoo Developer Console>
YAHOO_REDIRECT_URI=https://fbst-api.onrender.com/api/auth/yahoo/callback
```

## Provider Console Links

- **Google**: [Cloud Console > Credentials](https://console.cloud.google.com/apis/credentials)
- **Yahoo**: [Yahoo Developer Apps](https://developer.yahoo.com/apps/)

## How the Redirect Flow Works

```
Google (local):
  Browser → http://localhost:3010/login (click Google)
         → Vite proxies /api/auth/google → https://localhost:4000
         → Server redirects to Google with redirect_uri=http://localhost:3010/...
         → Google sends user back to http://localhost:3010/api/auth/google/callback
         → Vite proxies callback → https://localhost:4000 (server processes token)

Yahoo (local):
  Browser → http://localhost:3010/login (click Yahoo)
         → Vite proxies /api/auth/yahoo → https://localhost:4000
         → Server redirects to Yahoo with redirect_uri=https://localhost:4000/...
         → Yahoo sends user directly to https://localhost:4000/api/auth/yahoo/callback
         → Server processes token, redirects to CLIENT_URL (http://localhost:3010)
```

## Debugging

### Diagnostic Routes (dev only)

Visit these URLs to see the exact config the server is using:

- **Google**: `https://localhost:4000/api/auth/google/check`
- **Yahoo**: `https://localhost:4000/api/auth/yahoo/check`

### Startup Logs

The server logs auth config on boot. Look for:
```
🔐 Auth Config: Google  { redirectUri: "..." }
🔐 Auth Config: Yahoo   { redirectUri: "..." }
```

If a protocol violation is detected, you'll see a ⚠️ warning.

### Common Failure Modes

| Symptom | Cause | Fix |
|---------|-------|-----|
| "redirect_uri_mismatch" from Google | URI doesn't match Google Console | Check `/api/auth/google/check`, copy `computedRedirectUri` to Console |
| "invalid redirect uri" from Yahoo | URI doesn't match Yahoo Console | Check `/api/auth/yahoo/check`, copy `computedRedirectUri` to Console |
| "Access blocked: invalid request" | Using `https://localhost` with Google | Remove `GOOGLE_REDIRECT_URI` from `.env`, let code default to `http://` |
| "This connection is not private" | Self-signed cert on localhost | Click Advanced → Proceed. One-time per browser session |
| 502 on Render | Server using HTTPS on Render | Ensure `NODE_ENV` is NOT `development` on Render |
