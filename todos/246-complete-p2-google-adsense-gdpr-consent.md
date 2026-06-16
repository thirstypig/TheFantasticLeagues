---
status: pending
priority: p2
issue_id: "246"
tags: [monetization, gdpr, privacy, adsense, ga4, gsc, analytics, marketing-site]
dependencies: []
---

# Google AdSense + GA4 + GSC — both sites

## Current state

| Service | www (Astro) | app (React/Vite) |
|---------|-------------|------------------|
| GA4     | ✅ live — `G-5FS3SKCH55` + cross-domain linker | ✅ live — `G-5FS3SKCH55` + cross-domain linker |
| GSC     | ❓ need verification meta tag | ❓ need verification meta tag |
| AdSense | ✅ publisher script live (`ca-pub-7103672049879516`) — need ad unit IDs | ✅ publisher script live — need ad unit IDs |

---

## 1. GA4 — Google Analytics 4

### www (already done)
`Base.astro` lines 52–58 have the gtag.js snippet. No action needed.

### app — add to `client/index.html`
Add the same property ID (`G-5FS3SKCH55`) so marketing-site → app user journeys are connected. Use `linker` to enable cross-domain attribution.

```html
<!-- Google Analytics 4 -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-5FS3SKCH55"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-5FS3SKCH55', {
    linker: {
      domains: ['thefantasticleagues.com', 'app.thefantasticleagues.com']
    }
  });
</script>
```

**Also configure in GA4 dashboard:**
- Admin → Data Streams → app stream → Cross-domain tracking → add `thefantasticleagues.com`

### AdUnit.tsx (when AdSense lands)
The `gtag('event', ...)` call can be used to fire ad-related events alongside impressions — no extra setup needed if the same property ID is used.

---

## 2. GSC — Google Search Console

GSC verification is a one-time step per domain. No ongoing code maintenance.

### www — `thefantasticleagues.com`
1. Go to [Google Search Console](https://search.google.com/search-console) → Add property → URL prefix: `https://thefantasticleagues.com`
2. Choose **HTML tag** verification. Copy the meta tag:
   ```html
   <meta name="google-site-verification" content="XXXXXXXXXXXXXXXXXXXX" />
   ```
3. Add to `Base.astro` inside `<head>`, below the canonical tag.
4. Click Verify in GSC.
5. Submit sitemap: `https://thefantasticleagues.com/sitemap.xml` (confirm Astro generates one — check `astro.config.mjs` for sitemap plugin).

### app — `app.thefantasticleagues.com`
The web app is a SPA with auth — most pages are behind login, so GSC crawlability is limited. However, verifying the domain is still useful for:
- Monitoring any public pages (`/login`, `/signup`) for indexing issues
- Domain-level coverage if using a domain property
- Confirming `noindex` is being respected for private pages

1. Add property for `https://app.thefantasticleagues.com`
2. HTML tag verification — add meta tag to `client/index.html` inside `<head>`:
   ```html
   <meta name="google-site-verification" content="XXXXXXXXXXXXXXXXXXXX" />
   ```
3. Optionally add `<meta name="robots" content="noindex" />` to prevent the app shell from indexing (since most content is behind auth anyway).

### Alternative: Domain property (covers both at once)
Instead of two URL-prefix properties, add a single **Domain property** (`thefantasticleagues.com`) which covers `www.`, `app.`, and all subdomains. Requires DNS TXT record verification — no code changes to either site.

---

## 3. AdSense — BLOCKED on publisher ID

**Blocker:** AdSense account exists but domain not yet approved. Cannot implement until Publisher ID (`ca-pub-7103672049879516`) and ad unit IDs are available from the AdSense dashboard.

### When approved — www (`Base.astro`)
Add publisher script to `Base.astro` `<head>`, after the GA4 snippet:
```html
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7103672049879516" crossorigin="anonymous"></script>
```
Add one responsive ad unit below the hero section on the home page.

### When approved — app (`client/index.html` + `AdUnit.tsx`)
Add publisher script to `client/index.html` `<head>`.

Create `client/src/components/AdUnit.tsx` — thin wrapper around `<ins class="adsbygoogle">` with `useEffect` to push the ad slot after mount.

**Planned placements:**
- Home page — below the league-activity feed widget
- Standings / Season page — below the standings table (leaderboard 728×90 or responsive)
- Team / Roster page — below the roster grid (before tab content)
- **Exclude:** commissioner-only views, auction draft flow

### GDPR/CCPA consent (zero code — AdSense dashboard only)
- AdSense → Privacy & messaging → GDPR: create consent message for EU/EEA users
- AdSense → Privacy & messaging → CCPA: enable US state opt-out message
- Google's CMP (Funding Choices) handles the consent banner automatically once the AdSense script is on the page

### Why no `integrity=` on the AdSense script
SRI hashes are intentionally omitted — Google updates `adsbygoogle.js` continuously server-side without version pinning; a hash would be stale within hours and silently kill ad revenue. Use `crossorigin="anonymous"` + CSP `script-src` allowlist for `https://pagead2.googlesyndication.com` instead.

---

## Acceptance criteria

- [ ] GA4 snippet added to `client/index.html` with cross-domain linker config
- [ ] GA4 cross-domain configured in dashboard (Admin → Data Streams)
- [ ] GSC www property verified (HTML meta tag or DNS)
- [ ] GSC app property verified
- [ ] Sitemaps submitted to GSC for www
- [ ] AdSense publisher script added to both sites (unblocked when pub ID available)
- [ ] AdSense ad units rendering on Home, Standings, Team pages in the app
- [ ] AdSense ad unit rendering below hero on www home page
- [ ] GDPR/CCPA consent banners configured in AdSense dashboard
- [ ] No ad appears inside auction draft flow or commissioner panels
