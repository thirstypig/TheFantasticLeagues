# Brainstorm: FBST Business Strategist Agent + Multi-Sport Platform Vision

**Date:** 2026-03-31
**Status:** Draft
**Scope:** Business intelligence agent for CE pipeline, multi-sport expansion (football launch Aug 2026), event-based games, growth strategy

---

## What We're Building

### 1. Business Strategist Agent (`ce:business` or `business-strategist`)

An FBST-specific compound-engineering agent that analyzes the codebase, market, and trends to produce actionable business intelligence. Runs on-demand (like `/ce:review`) and outputs both strategic reports and implementation todos.

**Agent Capabilities (3 pillars):**

#### Pillar 1: Revenue Opportunity Analysis
- Scan codebase for features that could be gated behind a paywall (AI insights, draft reports, advanced stats)
- Identify upsell triggers (e.g., "You've used 3 of 5 free AI analyses this week")
- Analyze pricing psychology: freemium vs trial vs season-pass models
- Suggest ad placement spots that don't degrade UX (between sections, post-draft, email footer)
- Evaluate affiliate potential (sports merchandise, sports betting partnerships, DFS cross-promotion)
- Subscription tier modeling: what features at what price points maximize conversion

#### Pillar 2: Competitive Intelligence
- Web-search competitors (Yahoo Fantasy, ESPN, Sleeper, Fantrax, FantasyPros, Ottoneu)
- Feature gap matrix: what they have that FBST doesn't, and vice versa
- Pricing comparison across platforms
- Differentiation angles — FBST's moat: AI-powered auction leagues, NL-only support, real-time AI bid advice
- Identify underserved niches (auction-only leagues, keeper leagues, NL/AL-only, dynasty formats)

#### Pillar 3: Trend Analysis
- Sports tech trends: AI in fantasy, real-time data, social features
- Adjacent market insights: DFS (FanDuel/DraftKings), sports betting integration, NFT/collectible fatigue or revival
- Fantasy industry growth data (user counts, revenue, engagement patterns)
- Emerging formats: best-ball, pick'em, survivor pools, prop bets
- Content trends: podcasts, video, newsletters in fantasy sports space

**Output Format:**
1. **Strategic reports** → `docs/business/` directory (revenue scorecard, competitor matrix, trend radar)
2. **Implementation todos** → `todos/` directory with specific tasks (e.g., "Add Stripe checkout", "Add og:image meta tags")
3. **Business dashboard** → An in-app page showing MRR, signup funnel, feature usage, churn metrics

**Agent Workflow:**
```
/ce:business                    # Full analysis (all 3 pillars)
/ce:business revenue            # Revenue opportunities only
/ce:business compete            # Competitive analysis only
/ce:business trends             # Trend radar only
```

**Tools the agent would use:**
- `WebSearch` — competitor pricing, market data, trend articles
- `WebFetch` — scrape competitor feature pages, pricing pages
- `Grep/Glob/Read` — analyze codebase for monetization hooks
- `Write` — generate reports and todos

---

### 2. Out-of-the-Box FBST Features

#### A. Predictive Analytics Engine
- **Injury probability model** — track player injury history, workload, age; display risk badges on roster
- **Hot/cold streak prediction** — rolling 14-day performance trends with momentum indicators
- **Playoff odds simulator** — Monte Carlo simulation based on remaining schedule + current standings
- **"What-if" trade simulator** — project how standings would change if a specific trade goes through
- **Start/sit optimizer** — daily lineup recommendations based on matchup data, park factors, weather
- **Breakout/bust alerts** — flag rookies trending up, veterans trending down

#### B. Social & Content AI
- **Auto-generated league newsletter** — weekly email digest (already have the data from league digest, just need email delivery via Resend)
- **Trash talk generator** — AI-powered smack talk based on matchup context ("Your pitching staff has a 5.40 ERA this week, maybe try the bullpen at this point")
- **Highlight reels** — curate top MLB plays featuring rostered players (MLB Film Room API or YouTube clips)
- **Social sharing cards** — shareable images for trades, draft picks, weekly standings (og:image generation)
- **Audio/podcast recaps** — TTS-powered 2-minute weekly audio recap per league (ElevenLabs or similar)
- **League storylines** — AI tracks narratives across the season ("The Skunk Dogs have won 5 periods in a row", "The Dodger Dawgs' keeper strategy is paying off")

#### C. Engagement & Gamification
- **Achievements/badges** — "First Trade", "Waiver Wire Wizard" (10 successful claims), "Auction Shark" (best value draft)
- **Season-long challenges** — "Own a player who hits 40 HR", "Win 3 consecutive periods"
- **Commissioner awards** — end-of-season voting: MVP Owner, Best Trade, Worst Drop
- **Push notifications** — trade proposed, waiver processed, your player just hit a homer, period standings update
- **Live activity feed** — real-time stream of league events (like a sports ticker)

#### D. Advanced League Features
- **Snake draft engine** — already in roadmap, ~60-70% code shared with auction
- **H2H matchup system** — head-to-head weekly scoring as alternative to rotisserie
- **Dynasty/keeper league tools** — multi-year player valuation, prospect rankings, minor league stats
- **Custom scoring** — configurable category weights, points-based scoring option
- **Multi-league dashboard** — manage multiple leagues from one view
- **Commissioner AI assistant** — "Set up a 12-team NL-only auction league with standard categories"

#### E. Monetization-Ready Features
- **Premium AI tier** — gate advanced features (trade simulator, playoff odds, keeper recommendations) behind Pro
- **Season Pass** — one-time payment for full season access (appeals to "I don't want a subscription" users)
- **League sponsorship** — branded league pages for bars, sports shops, podcasts (B2B angle)
- **API access** — developer tier for fantasy content creators, podcast hosts, newsletter writers
- **White-label** — other fantasy platforms license your AI engine

---

### 3. Multi-Sport Platform Vision

**Critical pivot:** Current baseball season is NOT the launch target. **Football season (Aug 2026)** is the real launch window. Basketball, March Madness, and Super Bowl follow.

#### Architecture: Single App, Sport Selector
- One app at `app.thefantasticleagues.com`
- User picks sport when creating a league
- Shared infrastructure: auth, leagues, teams, trades, waivers, auction engine, AI pipeline
- Sport-specific modules: roster positions, scoring categories, player data source, schedule

#### Two Game Types
1. **Leagues** (season-long): Fantasy football, basketball, baseball — full draft, trades, waivers, weekly scoring
2. **Events** (one-off): March Madness brackets, Super Bowl squares/props — short-lived, viral, casual-fan friendly

Both live under "My Games" in the app. Shared auth + payments. Events are the casual on-ramp; leagues are the retention engine.

#### Sport Priority & Timeline
| Sport | Type | Target Launch | Audience Size |
|-------|------|--------------|---------------|
| **Football** | League | **Aug 2026** (primary launch) | Largest — ~40M US fantasy football players |
| **Basketball** | League | Oct 2026 | ~15M players |
| **Super Bowl** | Event | Feb 2027 | Massive casual reach — 100M+ viewers |
| **March Madness** | Event | Mar 2027 | ~70M brackets filled yearly |
| **Baseball** | League | Already live (private beta) | ~10M players |

#### What's Sport-Agnostic (Reusable)
- Auth, user profiles, league CRUD, team management
- Auction draft engine, snake draft engine
- Trade proposals, voting, processing
- Waiver claims (FAAB + priority)
- AI analysis pipeline (swap stats context per sport)
- Weekly digest, newsletter, notifications
- Commissioner tools, season lifecycle
- Payments, subscription management

#### What's Sport-Specific (Must Build Per Sport)
- `sportConfig.ts` — positions, scoring categories, roster slots
- Player data source — MLB Stats API (baseball), ESPN/Sleeper API (football), NBA API (basketball)
- Schedule/scoring periods — weekly for football, daily/period for baseball
- Position eligibility rules — flex spots (football), utility (baseball)
- Projection data — different CSV sources per sport

### 4. Go-to-Market Strategy

**Launch target:** Football draft season, August 2026

#### Content Marketing (starts May-June 2026)
- **AI-generated draft kit / cheat sheets** — free PDF download, email-gated (lead gen)
- **Live auction demo video** — record your league's baseball auction with AI bid advice visible. Post on YouTube/Reddit.
- **Weekly public digest** — "NFL Offseason AI Analysis" on marketing site. SEO magnet for "AI fantasy football."

#### Channels
- **Reddit** — r/fantasyfootball (1.2M members), r/fantasybaseball (200K). Show the AI features — that's the hook.
- **Fantasy podcasts** — partnership/affiliate deals. Offer podcasters custom branded leagues or affiliate revenue.
- **Twitter/X** — fantasy football community is massive and vocal. AI hot takes drive engagement.
- **SEO** — target "AI fantasy football", "auction draft tool", "fantasy football AI advice" keywords on marketing site

#### Conversion Funnel
```
Free content (draft kit, public digest, demo video)
  → Email capture
    → Free tier account (basic leagues, limited AI)
      → Pro tier ($9.99/mo or $19.99/season pass)
        → Annual plan discount
```

#### Business Dashboard (Admin-Only)
An in-app page at `/admin/business` (behind `requireAdmin` middleware) showing:
- Signup funnel (PostHog data): visitors → signups → league creators → Pro conversions
- MRR / ARR tracker
- Feature usage heatmap (which AI features are most used)
- Churn metrics (who cancelled Pro and why)
- Sport breakdown (how many leagues per sport)
- Event participation (March Madness entries, Super Bowl squares sold)

---

## Why This Approach

### Business Agent Rationale
- **FBST-specific** because the fantasy sports market has unique dynamics (seasonal revenue, sports calendar dependency, competitor landscape) that a generic agent wouldn't understand
- **Three pillars** cover the full business lifecycle: find opportunities (revenue), understand the market (compete), spot the future (trends)
- **Reports + todos + dashboard** ensures insights lead to action, not just documents that collect dust
- The agent leverages tools already available (WebSearch, WebFetch, codebase analysis) — no new infrastructure needed

### Feature Rationale
- **Predictive analytics** is the #1 differentiator — Yahoo/ESPN don't offer AI-powered trade simulations or streak prediction
- **Social/content AI** drives engagement AND provides marketing material (shareable cards = free acquisition)
- **Newsletter email** is low-hanging fruit — digest data already exists, just needs Resend delivery
- **Gamification** increases retention without requiring new backend infrastructure

---

## Key Decisions

### Business Agent
1. **FBST-specific** — tailored to fantasy sports SaaS, not a generic tool
2. **Three capability pillars**: Revenue, Competitive Intelligence, Trends
3. **Triple output**: Strategic reports (docs/business/), implementation todos, admin-only business dashboard
4. **Agent frequency**: Monthly auto (cron) + on-demand deep dives
5. **Architecture**: Skill-based with 3 parallel sub-agents + monthly cron pulse

### Product & Features
6. **AI feature priority**: Predictive analytics + social/content AI (not chat assistant or auto-management)
7. **Predictions**: LLM + stats context (no custom ML yet) — Gemini/Claude with projections per sport
8. **Newsletter**: Teaser + link format via Resend — drives users back to app

### Multi-Sport Platform
9. **Single app, sport selector** — one codebase, user picks sport at league creation
10. **Two game types**: Leagues (season-long) + Events (brackets, squares, props)
11. **Football is primary launch** — Aug 2026 draft season. Baseball stays as private beta.
12. **Sport priority**: Football → Basketball → Super Bowl → March Madness
13. **Event games** as casual on-ramp — low commitment, viral sharing, converts to league players

### Business Model
14. **Revenue model**: Freemium with Pro tier ($9.99/mo) gating AI features — Season Pass ($19.99) as alternative
15. **Analytics**: PostHog (self-hosted) for product analytics, funnels, retention
16. **Business dashboard**: Admin-only at `/admin/business`
17. **Go-to-market**: Content marketing (draft kits, demo videos, public digests) → Reddit/podcasts → email capture → conversion
18. **Goal**: Parallel tracks — ship features, attract users, monetize simultaneously

---

## Resolved Questions

1. **Agent frequency** — Monthly auto-run (cron via RemoteTrigger) commits a pulse report to `docs/business/monthly-pulse.md`, plus on-demand `/ce:business` for deep dives before launches or strategy decisions.

2. **Dashboard data source** — PostHog (self-hosted) for full product analytics: funnels, retention, feature flags, event tracking. Generous free tier, privacy-respecting, no vendor lock-in.

3. **Newsletter timing** — Teaser + link format. Short highlights (power rankings, hot team, stat of the week) with "Read full digest in the app" CTA. Drives engagement back to the product.

4. **Competitive data freshness** — Monthly auto-run will cache and diff competitor data. Agent stores previous snapshot in `docs/business/competitor-snapshot.json` and highlights changes in the pulse report.

5. **Predictive model approach** — LLM + stats context (Gemini/Claude with real stats + projections CSV). Works immediately at current scale (<100 users). Upgrade to custom ML when 2+ seasons of league data exist.

## Open Questions

1. **Social card generation** — Server-side image generation (Satori/Vercel OG) vs. client-side canvas vs. external service (Bannerbear, Placid)? Defer until social features are prioritized.

---

## Chosen Approach: Skill-Based + Monthly Auto (Hybrid of A + C)

**On-demand:** `/ce:business` skill launches 3 parallel sub-agents:
- `revenue-analyst` — scans codebase + web for monetization opportunities
- `competitive-intel` — web searches competitors, builds comparison matrix
- `trend-radar` — searches for industry trends, emerging tech

**Scheduled:** Monthly cron (RemoteTrigger) runs condensed version, commits `docs/business/monthly-pulse.md` with competitor diffs and trend highlights.

**Why this approach:**
- Parallel sub-agents maximize speed (like `/ce:review`)
- Monthly auto keeps competitive intelligence fresh without noise
- Modular — can run individual pillars (`/ce:business revenue`) for focused analysis
- Fits existing CE pipeline patterns (skill → sub-agents → reports + todos)
