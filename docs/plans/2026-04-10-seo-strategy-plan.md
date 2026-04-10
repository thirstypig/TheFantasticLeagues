# SEO Strategy Plan — The Fantastic Leagues

**Created:** April 10, 2026
**Deepened:** April 10, 2026 (4 parallel research agents)
**Owner:** Jimmy Chang (sole operator)
**Status:** Active

---

## TL;DR

Don't compete on volume with ESPN/Yahoo (DA 90+). Compete on **depth in 4 niches they ignore**: commissioner tools, auction drafts, AI-native features, and NL-only formats. Build topical authority with 50+ articles in year one. Technical SEO is a 2.5-hour checklist. Total cost: $0/month.

---

## Priority 1: THIS WEEK (5 hours total)

### Technical SEO (2.5 hours)
- [ ] Install `@astrojs/sitemap` — auto-generates sitemap at build time (5 min)
- [ ] Create `public/robots.txt` with sitemap reference (5 min)
- [ ] Install `astro-seo` — OG tags, Twitter cards, canonical URLs on every page (30 min)
- [ ] Add JSON-LD structured data: Organization + SoftwareApplication on landing, BlogPosting on posts (45 min)
- [ ] Create default OG image (1200x630px) at `public/og-default.png` (15 min)
- [ ] Self-host Inter font with `font-display: swap` + preload (20 min)
- [ ] Add `noindex` to status page (2 min)
- [ ] Verify domain in Google Search Console via DNS TXT record (15 min)
- [ ] Submit sitemap in Search Console (5 min)
- [ ] Add GA4 to marketing site (gtag.js in Base.astro) (30 min)

### Community Groundwork (2.5 hours)
- [ ] List on AlternativeTo as alternative to Yahoo/Fantrax/ESPN/Sleeper (30 min)
- [ ] List on Firsto, SideProjectors, LaunchingNext, StartupStash, SaaSPage (1 hr)
- [ ] Join r/fantasybaseball — start commenting helpfully, NO product mentions (30 min/day)
- [ ] Join 2 fantasy baseball Discord servers (20 min)
- [ ] Sign up for Qwoted + Featured (HARO replacement) as "fantasy sports tech" expert (20 min)

---

## Priority 2: THIS MONTH (Weeks 2-4)

### Analytics Setup
- [ ] Set up Ahrefs Webmaster Tools (free, 100 keywords) (15 min)
- [ ] Create Ubersuggest project with 25 tracked keywords (20 min)
- [ ] Add scroll depth tracking to blog posts (25/50/75/100%) (45 min)
- [ ] Add cookie consent banner to marketing site (1 hr)
- [ ] Add privacy policy page (30 min)
- [ ] Link Search Console to GA4 (10 min)
- [ ] Run baseline PageSpeed Insights (10 min)
- [ ] Create UTM parameter spreadsheet template (15 min)

### Content & Community
- [ ] Continue Reddit/Discord engagement (30 min/day, still no self-promotion)
- [ ] Write 1 technical post for dev.to: "Building real-time auction drafts with WebSockets" (3-4 hrs)
- [ ] Build free Auction Value Calculator lead magnet (4-6 hrs)
- [ ] Start posting on X with #BuildInPublic + #FantasyBaseball, 1x/day (15-20 min/day)
- [ ] Post on IndieHackers: founder story (1 hr)
- [ ] End of month: FIRST Reddit post mentioning product ("I built this free tool") (1 hr)
- [ ] Set up beehiiv account for newsletter (30 min)

---

## Priority 3: THIS QUARTER (Months 2-3)

### Landing Pages to Build
1. `/features/auction-draft` — target: "fantasy baseball auction draft platform"
2. `/features/ai-insights` — target: "AI fantasy baseball analysis tools"
3. `/features/commissioner-tools` — target: "fantasy baseball commissioner tools"
4. `/features/keeper-management` — target: "keeper league management software"
5. `/compare/yahoo` — target: "Yahoo fantasy baseball alternative"
6. `/compare/fantrax` — target: "Fantrax alternative"
7. `/for-commissioners` — target: "how to run a fantasy baseball league"
8. `/learn/fantasy-baseball-glossary` — target: "fantasy baseball glossary" (60-100 terms)

### Distribution
- [ ] Submit guest post to FantraxHQ: "How AI is changing auction draft strategy" (4-5 hrs)
- [ ] List on BetaList (2-3 weeks before Product Hunt) (1 hr)
- [ ] Pitch 2 podcasts: 90 Feet From Home + Sports Tech Feed (1 hr)
- [ ] Launch first newsletter issue via beehiiv (2 hrs/week ongoing)
- [ ] Cross-post blog content to dev.to + Medium with canonical URLs (30 min/post)
- [ ] Email 2-3 university sports analytics programs about free access (1 hr)
- [ ] Product Hunt launch (when 50+ users + 200 email subscribers)

---

## Top 10 Keyword Targets

| # | Keyword | Est. Volume | Competition | Page Type |
|---|---------|------------|-------------|-----------|
| 1 | fantasy baseball commissioner tools | ~880/mo | LOW | Feature page |
| 2 | fantasy baseball auction draft software | ~480/mo | LOW | Feature page |
| 3 | AI fantasy baseball analysis | ~720/mo | VERY LOW | Feature page |
| 4 | keeper league management software | ~210/mo | VERY LOW | Feature page |
| 5 | NL-only fantasy baseball platform | ~180/mo | VERY LOW | Use-case page |
| 6 | Fantrax alternative | ~590/mo | LOW | Comparison page |
| 7 | how to run a fantasy baseball league | ~480/mo | MEDIUM | Blog guide |
| 8 | fantasy baseball auction values calculator | ~3,600/mo | MEDIUM | Tool page |
| 9 | Yahoo fantasy baseball alternative | ~390/mo | LOW | Comparison page |
| 10 | fantasy baseball glossary | ~1,100/mo | MEDIUM | Knowledge base |

---

## Content Calendar Framework

### Pre-Season (Jan-Mar): 6 posts/month — draft prep, rankings, platform comparisons
### In-Season (Apr-Sep): 4 posts/month — weekly analysis (AI-assisted), strategy, player spotlights
### Off-Season (Oct-Dec): 2 posts/month — retrospectives, platform updates, evergreen guides

### Year 1 Target: 50-60 posts across 4 content clusters:
1. **Auction Draft Cluster** (pillar + 8-10 articles)
2. **Commissioner/Platform Cluster** (pillar + 6-8 articles)
3. **Keeper League Cluster** (pillar + 6-8 articles)
4. **AI + Fantasy Cluster** (pillar + 4-6 articles)

---

## Analytics Stack ($0/month)

| Tool | Purpose | Free Limit |
|------|---------|-----------|
| Google Search Console | Search performance, indexing | Unlimited |
| Google Analytics 4 | Marketing site traffic | Unlimited |
| PostHog | App product analytics | 1M events/mo |
| Ahrefs Webmaster Tools | Keyword tracking, backlinks | 100 keywords |
| Ubersuggest | Keyword research | 25 keywords, 3 searches/day |
| PageSpeed Insights | Core Web Vitals | Unlimited |

---

## Domain Authority Timeline

| Milestone | Target DA | Timeline | How |
|-----------|----------|----------|-----|
| Initial | 0-5 | Now | New domain, no backlinks |
| Long-tail ranking | 20-30 | 6-12 months | 50+ articles, directory listings, guest posts |
| Niche authority | 40+ | 18-24 months | Topical authority in 4 clusters |

**Key insight:** Sites with DA 20 can outrank DA 70 sites when they have deeper topical coverage on a specific subject. Topical authority > domain authority.

---

## What NOT to Do

- Paid ads (zero budget, zero ROI at this stage)
- G2/Capterra (enterprise buyers, wrong audience)
- Start a podcast (3-5 hrs/episode, poor ROI for solo founder)
- Daily player news (ESPN/Yahoo have newsrooms)
- Player rankings competing with FantasyPros (they aggregate 50+ experts)
- Spread across 6+ social platforms (master 2, then add a third)

---

## Sources

Full source list in research agent outputs. Key references:
- [Astro Sitemap Integration](https://docs.astro.build/en/guides/integrations-guide/sitemap/)
- [astro-seo package](https://github.com/jonasmerlin/astro-seo)
- [BlogPosting Schema](https://developers.google.com/search/docs/appearance/structured-data/article)
- [Core Web Vitals 2026](https://web.dev/vitals/)
- [Product Hunt Launch Strategy](https://beyondlabs.io/blogs/how-to-get-your-first-100-saas-users-with-a-product-hunt-launch)
- [Domain Authority vs Topical Authority](https://searchatlas.com/blog/da-vs-ta-2026/)
