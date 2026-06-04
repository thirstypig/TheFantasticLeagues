---
title: "Astro GitHub Pages www-redirect breaks GSC sitemap crawl and ads.txt discovery"
problem_type: deployment
component: "Astro static site / GitHub Pages / Google Search Console / AdSense"
symptoms:
  - "Google Search Console reports 'couldn't fetch' on sitemap-index.xml"
  - "Sitemap <loc> tags contain www URLs that 301-redirect to non-www"
  - "AdSense dashboard shows 'ads.txt: Not found' blocking domain approval"
tags:
  - astro
  - github-pages
  - google-search-console
  - sitemap
  - canonical-domain
  - www-redirect
  - adsense
  - ads-txt
  - seo
severity: high
resolved: true
date: 2026-06-04
---

## Symptoms

- GSC reports `Couldn't fetch` when crawling the submitted sitemap URL
- `curl -sI https://www.thefantasticleagues.com/sitemap-index.xml` returns HTTP 301 → bare domain
- The sitemap `<loc>` entries themselves also point to `www.` URLs (also redirects)
- AdSense "Sites" tab shows `ads.txt: Not found` despite the file appearing to exist

## Root Causes

### Issue 1 — Astro `site` config points to the redirect alias, not the canonical origin

`astro.config.mjs` had:

```js
site: 'https://www.thefantasticleagues.com'
```

GitHub Pages with a bare-domain CNAME **serves from `thefantasticleagues.com`** and 301-redirects `www.` requests to it. The `@astrojs/sitemap` integration uses the `site` field verbatim to construct every `<loc>` URL. A wrong `site` value silently poisons every `<loc>` tag in the generated sitemap and every `<link rel="canonical">` on every page.

GSC fetches the sitemap index → hits a redirect → follows it → but then each child sitemap URL also redirects, causing the "couldn't fetch" failure.

### Issue 2 — `ads.txt` not in Astro `public/`

AdSense verifies publisher identity via `https://<domain>/ads.txt`. Astro only copies files from `public/` into the build output; anything not in that directory simply doesn't exist at the deployed root.

The `public/` directory only had `CNAME` and `robots.txt` — no `ads.txt` — so the file was never deployed.

## Fix

### Fix 1 — Correct the Astro `site` field

```js
// astro.config.mjs
export default defineConfig({
  site: 'https://thefantasticleagues.com',  // was: https://www.thefantasticleagues.com
  integrations: [tailwind(), sitemap()],
  output: 'static',
});
```

The rule: **`site` must be the URL a user lands on after all redirects settle** — not a URL that redirects to something else.

After deploy, all sitemap `<loc>` tags and canonical tags use the bare domain. GSC can fetch without redirect chains.

**GSC submission:** Submit `https://thefantasticleagues.com/sitemap-index.xml` under the **non-www property** (`thefantasticleagues.com`), not the www property. The www property is a separate GSC property and will always hit the redirect.

### Fix 2 — Create `public/ads.txt`

Create `public/ads.txt` in the Astro project root (and `client/public/ads.txt` in any co-deployed sub-apps):

```
google.com, pub-7103672049879516, DIRECT, f08c47fec0942fa0
```

Format breakdown:

| Field | Value | Notes |
|---|---|---|
| Ad network domain | `google.com` | Always this for AdSense |
| Publisher ID | `pub-7103672049879516` | **No `ca-` prefix** — use `pub-...` not `ca-pub-...` |
| Relationship | `DIRECT` | First-party publisher |
| Certification authority ID | `f08c47fec0942fa0` | Google's fixed CA ID |

After deploy, verify: `curl -sf https://thefantasticleagues.com/ads.txt` returns 200 with the correct content.

## Diagnosis Commands

```bash
# Check if www redirects (and where to)
curl -sIL https://www.thefantasticleagues.com/sitemap-index.xml | grep -E "^(HTTP|[Ll]ocation)"

# Verify sitemap <loc> tags use the canonical domain
curl -s https://thefantasticleagues.com/sitemap-index.xml | grep '<loc>'

# Check all <loc> URLs for redirect pollution
curl -s https://thefantasticleagues.com/sitemap-0.xml \
  | grep -oP '(?<=<loc>)[^<]+' \
  | grep -v '^https://thefantasticleagues.com'  # zero output = clean

# Verify ads.txt is live
curl -sf https://thefantasticleagues.com/ads.txt
```

## Prevention

### The canonical-origin invariant

Before writing `astro.config.mjs`, resolve the final serving URL:

```bash
curl -sIL https://www.example.com | grep -E "^(HTTP|[Ll]ocation)"
```

Follow to the final 200. That URL (scheme + host, no trailing slash) is the value for `site`.

**The `public/CNAME` file is your ground truth.** The hostname in that file is what GitHub Pages actually serves from. The `site` field must match.

### Checklist: Astro + GitHub Pages + Custom Domain

- [ ] Resolve the final serving URL (follow redirects to 200); record as canonical origin
- [ ] `site: '<canonical-origin>'` in `astro.config.mjs` — no www unless www is the 200 endpoint
- [ ] `public/CNAME` contains only the bare hostname (no `https://`); must match `site` minus the scheme
- [ ] Build locally: open `dist/sitemap-index.xml` and confirm every `<loc>` starts with canonical origin
- [ ] Check `dist/index.html` for `<link rel="canonical">` — confirm it also uses the canonical origin
- [ ] Submit sitemap under the **non-www GSC property** at `https://<bare-domain>/sitemap-index.xml`
- [ ] Click "Test URL" in GSC before requesting indexing

### Checklist: AdSense / Monetization

- [ ] Copy the exact `ads.txt` line from AdSense dashboard (publisher ID is account-specific)
- [ ] Place at `public/ads.txt` (Astro), commit and push **before** enabling ad serving
- [ ] Publisher ID in `ads.txt` uses `pub-` prefix, NOT `ca-pub-` prefix
- [ ] `curl https://<domain>/ads.txt` returns 200 after deploy
- [ ] In AdSense → Sites → click "Check now" (allow up to 24 h for first verification)
- [ ] If deploying multiple subdomains (e.g. `app.example.com`), add `ads.txt` to each domain's public root

### CI guard (GitHub Actions pre-build step)

```yaml
- name: Preflight checks
  run: |
    # 1. ads.txt present
    test -f public/ads.txt || { echo "Missing public/ads.txt"; exit 1; }

    # 2. CNAME present
    test -s public/CNAME || { echo "Missing or empty public/CNAME"; exit 1; }

    # 3. Astro site config matches CNAME
    CNAME=$(tr -d '[:space:]' < public/CNAME)
    node -e "
      import('./astro.config.mjs').then(m => {
        const site = (m.default.site || '').replace(/\/$/, '');
        const host = site.replace(/^https?:\/\//, '');
        if (host !== '$CNAME') {
          console.error('astro.config site host ' + host + ' != CNAME ' + '$CNAME');
          process.exit(1);
        }
      });
    "
```

## Related

- `docs/solutions/deployment/` — Railway, Prisma, Supabase connection setup
- [Google Search Console sitemap docs](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [IAB ads.txt spec](https://iabtechlab.com/ads-txt/)
- `thefantasticleagues-www/public/ads.txt` — the live ads.txt
- `thefantasticleagues-www/astro.config.mjs` — the corrected site field
