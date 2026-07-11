# C.P.L.A.N. — FBST SaaS Evolution

> From single-league baseball tool to multi-sport fantasy SaaS platform
> **Primary launch target: Football draft season, August 2026**

*Last updated: 2026-03-31 (Session 54) — pivoted to football-first strategy*
*Detailed implementation: [multi-sport-platform-plan](2026-03-31-feat-multi-sport-platform-and-business-agent-plan.md)*

---

## C — Context

### Where We Are (Session 53)
- **19 feature modules** (client/server mirrored), 730 tests, 60K+ LOC
- **Auction-first**: 14 components, 5 hooks, real-time bidding, AI bid advice, spending pace, value overlays
- **8 AI features** powered by Gemini 2.5 Flash + Claude Sonnet 4 (league-context-aware — ahead of every major platform)
- **Commissioner superpowers**: franchise model, season lifecycle, roster import, financial tracking, audit logs
- **Archive**: multi-year historical data import (Excel + CSV)
- **Design system**: liquid glass, dark/light mode, `--lg-*` CSS tokens, Inter font, responsive
- **Marketing site**: Astro + Tina.io at `www.thefantasticleagues.com` (GitHub Pages)
- **Hosting**: Railway ($5/mo), PostgreSQL on Supabase, Cloudflare CDN
- **PostHog analytics**: integrated (18 events tracked, SPA-aware pageviews)
- **Stack**: React 18 + Vite + Tailwind + shadcn + Express + Prisma + Supabase + PostgreSQL

### What We're Missing for SaaS
- No self-service onboarding (admin creates leagues)
- No snake draft engine (~60% of baseball leagues use snake)
- No multi-sport support (football is 4x the market)
- No pricing tiers or payment integration
- No mobile bottom nav (hamburger only)
- No league migration tools (import from Yahoo/ESPN)

### The Pivot (Session 54)
**Baseball season 2026 is NOT the launch target.** The current 8-user private league continues as beta. **Football draft season (August 2026)** is the real launch window because:
- Fantasy football has ~40M US players vs ~10M for baseball
- Football draft season creates urgent demand (new leagues every August)
- AI differentiation translates directly to football with a sport config swap
- Content marketing (draft kits, demo videos) has clear viral potential in football

### Competitive Landscape
| Platform | Strengths | Weaknesses | Our Edge |
|----------|-----------|------------|----------|
| Yahoo | Largest user base, all 4 major sports | Dated UI, weak auction, clunky mobile | Auction UX, AI, commissioner tools |
| ESPN | Brand trust, media integration | Buggy, weak commissioner tools | Reliability, customization |
| Sleeper | Best mobile UX, social/chat, NFL+NBA | Limited baseball, auction is secondary | Baseball depth, auction-first, AI layer |
| Fantrax | Most customizable scoring | Ugly UI, poor mobile | Design quality, AI layer |
| Ottoneu | Analytics-savvy, loyal niche | Tiny user base, dated UX, baseball only | Modern UX + multi-sport |

---

## P — Phases

### Phase 1: Sport Abstraction Layer (Apr 1–21, 3 weeks)
**Goal:** Decouple baseball-specific code into pluggable sport modules. Zero regressions on existing baseball functionality.

- [ ] **`SportConfig` interface** — positions, categories, roster slots, default rules per sport
- [ ] **Sport registry** — `getSportConfig("BASEBALL")` returns current config; `getSportConfig("FOOTBALL")` returns stub
- [ ] **Extract baseball config** — move constants from `sportConfig.ts` to `sports/baseball/config.ts`, re-export for backward compat
- [ ] **Add `sport` column** to League (default BASEBALL) and Player (default BASEBALL)
- [ ] **Add `externalId` column** to Player (new, alongside existing `mlbId` — DO NOT rename `mlbId`)
- [ ] **Extend `LeagueContext`** — add `sportCode` and `sportConfig` (NOT a separate SportContext)
- [ ] **`SportDataProvider` interface** — `syncPlayers`, `syncStats`, `syncSchedule`, `getInjuryReport`
- [ ] **Wrap MLB in `MlbDataProvider`** — no behavior change, just implements interface
- [ ] **Parameterize cron jobs** by sport
- [ ] **Parameterize standings service** — read categories from `SportConfig`
- [ ] **All 730+ tests must pass** — zero regressions

**Critical:** `mlbId` stays as-is. Football uses `externalId`. Rename later as a dedicated refactor.

### Phase 2: Football Core (Apr 22 – May 26, 5 weeks)
**Goal:** Full fantasy football — snake draft, auction draft, roster management, weekly scoring, trades, waivers, AI.

- [ ] **Football sport config** — QB/RB/WR/TE/K/DEF/FLEX, PPR/Standard/Half-PPR scoring
- [ ] **NFL data provider** — Sleeper API (primary, free) + ESPN API (supplement, free)
- [ ] **NFL MCP server** — `mcp-servers/nfl-data/` with same caching/rate-limiting pattern as MLB
- [ ] **Football stat tables** — `FootballPlayerStats`, `FootballTeamStats` (sport-specific, NOT renaming baseball tables)
- [ ] **Points-based scoring engine** — compute fantasy points from stats using league scoring rules
- [ ] **Weekly lineup setting** — per-game kickoff lock (Thursday lock ≠ Sunday lock ≠ Monday lock)
- [ ] **`GameSlate` concept** — groups of games with per-slate lock times (TNF, SUN_EARLY, SUN_LATE, SNF, MNF)
- [ ] **H2H weekly matchups** — leverage existing Matchup model, round-robin schedule
- [ ] **Bye week handling** — flag players on bye, warn before lineup lock
- [ ] **Waiver wire** — FAAB (reuse baseball system) + inverse-record priority option
- [ ] **Football AI** — start/sit recommendations, trade analyzer, weekly digest, draft advice
- [ ] **NFL cron schedule** — weekly stats sync (post-game), daily roster/injury sync

**Scope reduction:** Ship with points-only scoring (no H2H categories for football at launch). Most football leagues use points anyway.

### Phase 3: Revenue & Launch Prep (May 27 – Jul 7, 6 weeks)
**Goal:** Stripe payments, self-service signup, content marketing, newsletter — everything needed to accept money by August.

**Monetization:**
- [ ] **Stripe Checkout** (hosted) — Pro ($9.99/mo) and Season Pass ($19.99/season)
- [ ] **Webhook handler** — signature verification, idempotency table, mount BEFORE `express.json()`
- [ ] **`requirePro` middleware** — gate AI features, auction draft, keeper tools, unlimited leagues
- [ ] **Billing portal** — Stripe Customer Portal for self-service management
- [ ] **Free tier** — snake draft, basic standings, transactions, 1 league
- [ ] **7-day free trial** for Pro

**Self-Service:**
- [ ] **League creation wizard** — sport selector → format → settings → invite
- [ ] **Public league directory** — browse open leagues by sport, join
- [ ] **Rate limiting** — 5 leagues/hour per user, CAPTCHA on public creation

**Content Marketing (starts June):**
- [ ] **AI-generated football draft kit** — free PDF download, email-gated (lead gen)
- [ ] **Live auction demo video** — record baseball auction with AI bid advice visible
- [ ] **Public weekly digest** — "NFL Offseason AI Analysis" on marketing site (SEO)
- [ ] **Marketing site updates** — football-focused landing page, pricing page

**Newsletter:**
- [ ] **Email templates** — weekly digest teaser + link back to app (via Resend)
- [ ] **Subscriber preferences** — `User.emailPreferences` JSON column
- [ ] **Signed unsubscribe tokens** — HMAC-based, CAN-SPAM compliant
- [ ] **Physical mailing address** in email footer (CAN-SPAM requirement)

**Business Dashboard:**
- [ ] **Admin-only page** at `/admin/business` — PostHog metrics + Stripe revenue
- [ ] **Signup funnel**, feature usage heatmap, sport breakdown, churn metrics

### Phase 4: Polish & Football Launch (Jul 8 – Aug 4, 4 weeks)
**Goal:** Load testing, mobile optimization, marketing campaign, launch.

- [ ] **Load testing** — 100 concurrent WebSocket draft rooms (requires Redis + Railway Pro)
- [ ] **Infrastructure scaling** — Railway Pro ($20/mo), Redis for WS pub/sub, Supabase Pro for connection pooling
- [ ] **Mobile optimization** — all football pages responsive at 390px
- [ ] **Onboarding flow** — first-time user experience, guided league creation
- [ ] **Error tracking** — Sentry integration
- [ ] **Monitoring** — uptime, WebSocket health, NFL sync health, Stripe webhook delivery
- [ ] **`FOOTBALL_ENABLED` feature flag** — kill switch for football without affecting baseball
- [ ] **Marketing campaign** — Reddit (r/fantasyfootball), podcast outreach, Twitter/X, email drip

**🚀 FOOTBALL LAUNCH — August 2026 Draft Season**

### Phase 5: Growth & Expansion (Aug 5+, ongoing)
**Goal:** Basketball, event games, predictive analytics, social features, engagement.

**Basketball (Oct 2026):**
- [ ] **Basketball sport config** — PTS, REB, AST, STL, BLK, FG%, FT%, 3PM, TO
- [ ] **NBA data provider** — ESPN or NBA Stats API
- [ ] **Daily lineup setting** — basketball plays daily, not weekly

**Event Games (Feb–Mar 2027):**
- [ ] **Super Bowl squares** — 10x10 grid, random number assignment, payment tracking
- [ ] **Super Bowl prop pool** — list of props, user picks, result calculation
- [ ] **March Madness brackets** — 64-team tournament bracket, round-by-round scoring
- [ ] **March Madness Calcutta auction** — same auction engine, teams as "players" (95% code reuse)
- [ ] **Event model** — `Event` + `EventEntry` tables, `EventType` enum (BRACKET, SQUARES, PROP_POOL, CALCUTTA)

**Predictive Analytics:**
- [ ] **Trade simulator** — LLM projects standings impact of proposed trades
- [ ] **Playoff odds** — Monte Carlo simulation from current standings
- [ ] **Hot/cold streak prediction** — rolling performance trends
- [ ] **Injury risk badges** — LLM analysis of player injury history + workload

**Social & Content AI:**
- [ ] **League storylines** — AI tracks narratives across the season
- [ ] **Social sharing cards** — Satori/Vercel OG for trades, draft picks, standings
- [ ] **Audio recaps** — TTS-powered 2-minute weekly audio (ElevenLabs)

**Engagement:**
- [ ] **Achievement badges** — "First Trade", "Waiver Wire Wizard", "Auction Shark"
- [ ] **Push notifications** — trade proposed, waiver processed, player alerts
- [ ] **League chat** — Discord-style, integrated with transaction notifications

**Business Agent (`/ce:business`):**
- [ ] **Revenue analyst** sub-agent — scans codebase for monetization hooks
- [ ] **Competitive intel** sub-agent — web-searches competitors, builds comparison matrix
- [ ] **Trend radar** sub-agent — sports tech trends, emerging formats
- [ ] **Monthly cron pulse** — auto-commits `docs/business/monthly-pulse.md`

---

## L — Leverage Points

### What We Already Have (Reusable for Multi-Sport)

| Component | Reuse % | Notes |
|-----------|---------|-------|
| Auth + Users + Franchises | 100% | Sport-agnostic |
| League CRUD + Rules engine | 90% | Rules schema needs sport config |
| Auction engine (14 components) | 95% | Budget/bid logic is universal — March Madness Calcutta reuse! |
| Snake draft engine | 95% | Pick mechanics are sport-agnostic |
| Trade engine | 95% | Works for any sport with roster-based trading |
| Waiver/FAAB engine | 95% | Universal claim priority + budget system |
| Commissioner tools | 90% | Role management, season lifecycle universal |
| AI analysis framework | 70% | Prompts are sport-specific, but service layer reusable |
| Design system (`--lg-*` tokens) | 100% | Already sport-neutral |
| PostHog analytics | 100% | Just add `sport` property to events |
| Email (Resend) | 100% | Templates need sport-specific content |
| Archive/History | 85% | Schema needs sport-specific stat columns |

### The Calcutta Insight
The March Madness Calcutta auction is the same mechanic as our baseball auction: instead of auctioning players, you auction tournament teams. Same bidding, same budget management, same real-time UX — different sport. This is the sneaker model: **same silhouette, different colorway**.

### Our Moat
**League-context AI that compounds over time.** Every existing AI tool gives generic advice. FBST's AI knows your league's scoring, your roster, your opponents' tendencies, your auction history. This gets better every season — creating compounding lock-in that's impossible to replicate without the data.

### Two Game Types
1. **Leagues** (season-long): Fantasy football, basketball, baseball — full draft, trades, waivers, weekly scoring
2. **Events** (one-off): March Madness brackets, Super Bowl squares/props — casual, viral, low commitment

Events are the casual on-ramp; leagues are the retention engine. Both live under "My Games" in the app.

---

## A — Architecture Decisions

### Decision 1: Single App, Sport Selector
One app at `app.thefantasticleagues.com`. User picks sport when creating a league. Shared auth, shared infrastructure, sport-specific modules.

### Decision 2: Sport Config Registry (not Strategy pattern, not DI)
```
server/src/sports/
├── index.ts              # SportConfig interface, SPORT_CONFIGS registry, getSportConfig()
├── baseball/
│   ├── config.ts         # positions, categories, roster slots, default rules
│   ├── dataProvider.ts   # MlbDataProvider (wraps MLB Stats API)
│   ├── aiPrompts.ts      # Baseball-specific AI prompt templates
│   └── sync.ts           # MLB player/stat sync cron jobs
├── football/
│   ├── config.ts         # QB/RB/WR/TE/K/DEF/FLEX, PPR/Standard scoring
│   ├── dataProvider.ts   # NflDataProvider (Sleeper + ESPN APIs)
│   ├── aiPrompts.ts      # Football-specific AI prompt templates
│   └── sync.ts           # NFL player/stat sync cron jobs
└── basketball/
    └── ...               # Phase 5
```
Plain `Record<SportCode, SportConfig>` registry — not class hierarchy. Works identically on client and server. Yahoo Fantasy uses the same pattern (`game_key` discriminator).

### Decision 3: Sport-Specific Stat Tables (not EAV, not JSON blob)
```
BaseballPlayerStats    (existing PlayerStatsPeriod, keep as-is)
FootballPlayerStats    (new: passYds, passTD, rushYds, rushTD, rec, recYds, recTD...)
BasketballPlayerStats  (new: PTS, REB, AST, STL, BLK, FG%, FT%, 3PM, TO)
```
Each sport gets its own stat tables (~3-5 per sport). Avoids migrating existing baseball data. SQL-level type safety and indexing. EAV is universally discouraged by PostgreSQL community.

### Decision 4: Player Model — Add, Don't Rename
```prisma
model Player {
  sport      SportCode @default(BASEBALL)  // discriminator
  externalId String?                       // NEW: for football/basketball
  mlbId      Int?      @unique             // KEEP: for baseball (826+ references)
  proTeam    String?                       // renamed from mlbTeam (simpler, fewer references)
  @@unique([sport, externalId])
}
```
Football uses `externalId`. Baseball keeps `mlbId`. Rename `mlbId` → `externalId` as a future dedicated refactor, NOT during the sport abstraction phase.

### Decision 5: Extend LeagueContext (NOT separate SportContext)
Sport is derived from the league. One context, one source of truth:
```typescript
// LeagueContext extended:
const contextValue = {
  leagueId, setLeagueId, leagues, outfieldMode, scoringFormat,
  seasonStatus, myTeamId,
  sportCode,    // NEW: "BASEBALL" | "FOOTBALL" | "BASKETBALL"
  sportConfig,  // NEW: full SportConfig object, memoized
};
```

### Decision 6: NFL Data — Sleeper (primary) + ESPN (supplement)
- **Sleeper API** (free, documented): player database, weekly stats, projections, injury status, trending
- **ESPN API** (free, undocumented): schedule, live scoreboard, bye weeks
- **Paid upgrade path**: MySportsFeeds ($10-25/mo) or SportsData.io ($50/mo) when revenue justifies it

### Decision 7: Draft Engine Abstraction
Auction and snake draft share infrastructure:
- **Shared**: Player pool, roster management, team state, UI chrome, WebSocket infra
- **Auction-specific**: Bidding, budget, nomination queue, spending pace
- **Snake-specific**: Pick order, round tracking, auto-pick, pick trading

Both implement a `DraftEngine` interface with common hooks.

### Decision 8: Per-Game Lineup Lock (Football)
Football locks lineups per-kickoff, not per-period:
- **GameSlate** concept: THU, SUN_EARLY, SUN_LATE, SUN_NIGHT, MNF
- Per-player lock derived from their team's game start time
- Thursday starters lock Thursday; Sunday starters stay editable until Sunday

---

## N — Next Steps (Immediate)

### Session 54 (Current)
1. ~~CI fix: standings test mock~~ ✅
2. ~~Brainstorm: business agent + feature ideas~~ ✅
3. ~~Plan: multi-sport platform~~ ✅
4. ~~Update CPLAN with football-first pivot~~ ✅

### Session 55 (Next)
1. Fix P1/P2 findings from code review (waiver round field disconnect, commissioner date parsing, dead budget state)
2. Begin Phase 1: create `SportConfig` interface and `sports/baseball/config.ts`
3. Add `sport` column to League and Player models (migration)

### Sessions 56-57
1. Complete Phase 1: extract all baseball config, wrap in registry, parameterize standings
2. All 730+ tests passing with abstraction layer in place

### Sessions 58-62
1. Phase 2: Football sport config, NFL data provider, football stat tables
2. Phase 2: Points scoring engine, weekly lineup setting, H2H matchups

---

## Timeline Summary

```
Apr 2026  ████████████████████ Phase 1: Sport Abstraction (3 weeks)
May 2026  ████████████████████████████████████████ Phase 2: Football Core (5 weeks)
Jun 2026  ████████████████████████████████████████████████ Phase 3: Revenue + Launch Prep (6 weeks)
Jul 2026  ████████████████████████████████ Phase 4: Polish + Launch (4 weeks)
Aug 2026  🚀 FOOTBALL LAUNCH — Draft Season
Sep 2026+ Phase 5: Basketball, Events, Predictive Analytics, Business Agent
```

## Sport Priority & Audience

| Sport | Type | Target Launch | US Audience |
|-------|------|--------------|-------------|
| **Football** | League | **Aug 2026** (PRIMARY) | ~40M players |
| **Basketball** | League | Oct 2026 | ~15M players |
| **Super Bowl** | Event | Feb 2027 | 100M+ viewers |
| **March Madness** | Event | Mar 2027 | ~70M brackets/year |
| **Baseball** | League | Already live (private beta) | ~10M players |

---

## Revenue Model

| Tier | Price | Features |
|------|-------|----------|
| **Free** | $0 | Snake draft, basic standings, transactions, 1 league |
| **Pro** | $9.99/mo | Auction draft, AI insights, trade analyzer, keeper tools, unlimited leagues |
| **Season Pass** | $19.99/season | Same as Pro, single-season payment |

**Go-to-Market:** Content marketing (draft kits, demo videos, public digests) → Reddit/podcasts/Twitter → email capture → conversion funnel

**Success Metrics (by Oct 2026):** 500+ users, 50+ paying, 100+ leagues, $500+ MRR

---

## Appendix: The Sneaker Model Calendar

| Month | Fantasy Moment | Platform Event |
|-------|---------------|----------------|
| Jun | NFL offseason | Draft kit release, email capture campaign |
| Jul | Training camp | Projection updates, early access for Pro |
| Aug | Football draft season | 🚀 LAUNCH — League creation surge |
| Sep | NFL regular season | In-season AI features, weekly digest emails |
| Oct | NBA season starts | Basketball launch, second sport wave |
| Feb | Super Bowl | Super Bowl squares + props (event games launch) |
| Mar | March Madness | Bracket + Calcutta auction (event games) |
| Apr | MLB Opening Day | Baseball season (existing, now public) |
| Jul | MLB Trade Deadline | Trade Analyzer Pro, countdown UI |

---

## Appendix: Infrastructure Budget

| Phase | Monthly Cost | What |
|-------|-------------|------|
| Current (baseball beta) | $5 | Railway Hobby |
| Phase 1-2 (development) | $5-10 | Railway Hobby + Redis |
| Phase 3 (pre-launch) | $30-40 | Railway Pro + Redis + Stripe test mode |
| Phase 4 (launch month) | $75-100 | Railway Pro (2 instances) + Redis + Supabase Pro |
| Phase 5 (growth) | $100-150 | Scale based on user count |

---

## Appendix: Design Direction

### Brand Identity Evolution
- **Current**: Baseball emoji logo, "TFL" header, dark liquid glass
- **Near-term**: Professional wordmark, sport-neutral but premium. Bold condensed typography.
- **Long-term**: Each sport gets its own visual identity (colorway). Seasonal themes.

### Mobile Priorities
1. Bottom tab navigation (5 tabs)
2. Swipe-to-reveal actions on player rows
3. Pull-to-refresh with branded animation
4. iOS Live Activities for game scores (future)
