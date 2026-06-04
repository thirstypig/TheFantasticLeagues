---
status: pending
priority: p2
issue_id: "246"
tags: [monetization, gdpr, privacy, adsense, marketing-site]
dependencies: []
---

# Google AdSense + GDPR/US-state consent messaging

## Blocker
AdSense account exists but domain not yet approved. Cannot implement until Publisher ID (ca-pub-XXXXXXXX) and ad unit IDs are available from the AdSense dashboard.

## What to do when approved

### 1. Privacy & consent (zero code — AdSense dashboard only)
- In AdSense → Privacy & messaging → GDPR, create a consent message for EU/EEA users
- In AdSense → Privacy & messaging → CCPA, enable US state (California) opt-out message
- Google's CMP (Funding Choices) handles the consent banner automatically once the AdSense script is on the page — no custom cookie-consent library needed

### 2. App (thefantasticleagues-app — React/Vite)
Add AdSense publisher script to `client/index.html`:
```html
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXX" crossorigin="anonymous"></script>
```

Create `client/src/components/AdUnit.tsx` — thin wrapper around the `<ins class="adsbygoogle">` tag with `useEffect` to push the ad slot after mount.

**Planned placements:**
- **Home page** — below the league-activity feed widget
- **Standings / Season page** — below the standings table (leaderboard format, 728×90 or responsive)
- **Team / Roster page** — below the roster grid (before the tab content)

Keep ads out of commissioner-only views and the auction draft flow.

### 3. Marketing site (thefantasticleagues-www — Astro)
Add script to `src/layouts/BaseLayout.astro` (or equivalent root layout).
Add one responsive ad unit below the hero section on the home page.

### 4. Verification
- Confirm consent banner fires for EU IP (use VPN or BrowserStack)
- Confirm ads render on Home, Season, Team pages
- Confirm no ad appears inside the auction draft flow or commissioner panels

## Notes
- AdSense auto-ads is an option (Google places ads automatically) but manual units give more layout control — prefer manual
- `xlsx` vuln (no fix available) is unrelated; don't conflate
- The www site is Astro — check `src/layouts/` for the root layout file before adding the script

## Security — why NO `integrity=` on the AdSense script
SRI (`integrity="sha384-..."`) is intentionally omitted. Google updates `adsbygoogle.js` continuously and server-side without version pinning; a hash would be stale within hours and cause the script to be blocked by the browser, silently killing all ad revenue. This is Google's documented design — they do not publish SRI hashes for this script.

Mitigations that DO apply instead:
- `crossorigin="anonymous"` is already present (limits credential leakage on redirect)
- `async` prevents the script from blocking page render
- Google's CMP (Funding Choices) is served from the same Google CDN and is covered by their security posture
- CSP `script-src` should allowlist `https://pagead2.googlesyndication.com` explicitly rather than using `unsafe-inline` or a wildcard
