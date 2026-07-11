---
title: "Multi-Sport Platform + Business Strategist Agent"
type: feat
status: active
date: 2026-03-31
deepened: 2026-03-31
origin: docs/brainstorms/2026-03-31-business-agent-and-feature-ideas-brainstorm.md
---

# Multi-Sport Platform + Business Strategist Agent

## Enhancement Summary

**Deepened on:** 2026-03-31
**Research agents used:** 8 (NFL APIs, Stripe SaaS patterns, sport abstraction architecture, architecture review, security review, performance review, deployment verification, institutional learnings)

### Critical Corrections from Research

1. **DO NOT rename `mlbId` → `externalId` in Phase 1.** Add `externalId` as a NEW column alongside `mlbId`. The rename touches 826+ references across 81 files — too risky for Phase 1. Football uses `externalId`; baseball keeps `mlbId`. Rename later as a dedicated refactor. *(Architecture + Deployment agents)*

2. **DO NOT create separate `SportContext.tsx`.** Extend `LeagueContext` with `sportCode` and `sportConfig` fields — sport is derived from league, not independent. One context, one source of truth. *(Architecture + Sport Abstraction agents)*

3. **Per-game lineup lock is a MISSING REQUIREMENT.** Football locks lineups per-kickoff (Thursday players lock Thursday while Sunday players stay editable). The current `Period` model has one start/end date — insufficient. Need a `GameSlate` concept. *(Architecture + Deployment agents)*

4. **Move `/ce:business` agent to post-launch.** It adds zero user value for the August launch. Focus Phase 4 on polish and marketing. *(Architecture agent)*

5. **Ship football with points-only scoring (no H2H categories) for August.** Most football leagues use points anyway. Reduces Phase 2 scope. *(Architecture agent)*

### Key Research Findings

**NFL Data Source:** Use **Sleeper API** (free, documented, fantasy-focused) as primary + **ESPN API** (free, undocumented) as supplement. Sleeper provides weekly stats, projections, injury status, trending players. ESPN fills gaps (schedule, live scoreboard). Total cost at launch: $0. Upgrade to paid MySportsFeeds ($10-25/mo) when revenue justifies it.

**Stripe Integration:** Use Stripe Checkout (hosted) — not Elements. Webhook handler MUST be mounted BEFORE `express.json()` middleware (raw body required for signature verification). Add `ProcessedWebhookEvent` table for idempotency. Season Pass modeled as `mode: "payment"` checkout with metadata tagging.

**Sport Config Pattern:** Registry pattern (`Record<SportCode, SportConfig>`) — not Strategy pattern, not DI. Plain object lookup, shared between client and server. Yahoo Fantasy uses the same pattern (`game_key` discriminator).

**Database Strategy Confirmed:** Sport-specific stat tables is correct. EAV universally discouraged by PostgreSQL community. SportsDB (open-source reference) uses the same approach.

**Infrastructure Budget:** Launch month (August): $75-100/mo (Railway Pro + Redis + Supabase Pro). Current $5/mo WILL NOT handle football draft rooms. WebSocket needs Redis pub/sub for multi-instance support.

**Security Priorities:** Stripe webhook signature verification (CRITICAL), `requirePro` middleware with no caching (HIGH), league creation rate limiting (HIGH), CAN-SPAM physical address in emails (HIGH), signed unsubscribe tokens (MEDIUM).

### Institutional Learnings Applied

- **Hardcoded API paths** (docs/solutions/deployment/) — ALL new sport API routes must use `${API_BASE}`, never hardcoded `/api/`
- **MLB API deprecation** (docs/solutions/api-changes/) — NFL APIs will deprecate too. Use call-time labeling + fallback chains
- **Ohtani two-way split** (docs/solutions/logic-errors/) — Derived ID pattern reusable for multi-position players in football/basketball
- **Auction production outage** (docs/solutions/runtime-errors/) — Network log audit + ID namespace mapping methodology applies to football player pools

---

## Overview

Transform FBST from a private baseball-only league tool into a multi-sport fantasy platform with AI-powered differentiation, event-based games, and a built-in business intelligence agent. **Primary launch target: football draft season, August 2026** (~5 months).

The platform supports two game types:
1. **Leagues** (season-long): Fantasy football, basketball, baseball — full draft, trades, waivers, AI insights
2. **Events** (one-off): March Madness brackets, Super Bowl squares/props — casual, viral, low commitment

A new `/ce:business` compound-engineering agent provides ongoing revenue analysis, competitive intelligence, and trend monitoring.

## Problem Statement / Motivation

- **Market size**: Fantasy football has ~40M US players vs ~10M for baseball. Football is the growth engine.
- **Revenue**: Zero revenue currently. 8 users in a private baseball league. Need paying customers.
- **Timing**: Football draft season (Aug 2026) is 5 months away. Miss it, wait a full year.
- **Differentiation**: AI-powered features (bid advice, trade simulator, weekly digest) are unique — no major competitor offers this. But it only matters if people can access it.
- **Compounding knowledge**: The `/ce:business` agent ensures business intelligence is systematized, not ad-hoc.

(see brainstorm: docs/brainstorms/2026-03-31-business-agent-and-feature-ideas-brainstorm.md)

## Proposed Solution

A 5-phase plan over 5 months, each phase building on the last. Phases 1-3 are critical path to football launch. Phases 4-5 are post-launch growth.

## Technical Approach

### Architecture

**Single app, sport selector.** One codebase at `app.thefantasticleagues.com`. User picks sport when creating a league. Shared infrastructure, sport-specific modules.

```
server/src/
├── sports/                    # NEW: Sport-specific configs
│   ├── index.ts               # getSportConfig(sport), SportConfig interface
│   ├── baseball/
│   │   ├── config.ts          # positions, categories, roster slots
│   │   ├── dataProvider.ts    # MLB Stats API integration
│   │   ├── aiPrompts.ts       # baseball-specific AI templates
│   │   └── sync.ts            # MLB player/stat sync
│   ├── football/
│   │   ├── config.ts          # QB/RB/WR/TE/K/DEF, PPR/standard scoring
│   │   ├── dataProvider.ts    # ESPN/Sleeper API integration
│   │   ├── aiPrompts.ts       # football-specific AI templates
│   │   └── sync.ts            # NFL player/stat sync
│   └── basketball/
│       └── ...                # NBA config (Phase 5)
├── features/                  # Existing (mostly sport-agnostic)
└── lib/
    └── sportConfig.ts         # DEPRECATED → re-exports from sports/baseball/config.ts
```

```
client/src/
├── sports/                    # NEW: Client-side sport configs
│   ├── index.ts               # useSportConfig() hook
│   ├── baseball/config.ts
│   ├── football/config.ts
│   └── basketball/config.ts
├── contexts/
│   ├── LeagueContext.tsx       # MODIFIED: adds sport awareness
│   └── SportContext.tsx        # NEW: app-wide sport context
└── features/                  # Existing (mostly sport-agnostic)
```

**Stat storage strategy: Sport-specific stat tables** (Option 3 from research — safest):
```
BaseballPlayerStats    (existing PlayerStatsPeriod, renamed)
FootballPlayerStats    (new: passYds, passTD, rushYds, rushTD, rec, recYds, recTD...)
BasketballPlayerStats  (new: PTS, REB, AST, STL, BLK, FG%, FT%, 3PM, TO)
```
This avoids migrating existing baseball data and keeps queries simple per sport.

### Implementation Phases

---

#### Phase 1: Sport Abstraction Layer (Apr 1–21, 3 weeks)

**Goal:** Decouple baseball-specific code into a pluggable sport module system without breaking existing functionality.

**Why first:** Every subsequent phase depends on this. Football can't be added until baseball is abstracted.

##### Tasks

- [ ] **Create `SportConfig` interface** — `server/src/sports/index.ts`
  ```typescript
  interface SportConfig {
    sport: Sport;                    // "BASEBALL" | "FOOTBALL" | "BASKETBALL"
    positions: PositionConfig[];     // position definitions with slots
    categories: CategoryConfig[];   // scoring categories with direction
    rosterSlots: RosterSlotConfig[];// how positions map to roster slots
    defaultRules: LeagueRuleSet;    // default league rules
    isPitcher?: (pos: string) => boolean; // sport-specific helpers
  }
  ```
- [ ] **Extract `server/src/sports/baseball/config.ts`** from existing `sportConfig.ts` — move all constants (POS_ORDER, CATEGORY_CONFIG, DEFAULT_RULES, NL_TEAMS, AL_TEAMS, OPENING_DAYS)
- [ ] **Extract `client/src/sports/baseball/config.ts`** from existing `client/src/lib/sportConfig.ts`
- [ ] **Create backward-compat re-exports** — existing `sportConfig.ts` files re-export from `sports/baseball/` so no import paths break
- [ ] **Add `sport` column to `League` model** — `sport Sport @default(BASEBALL)` enum
- [ ] **Add `sport` column to `Player` model** — discriminator for multi-sport player tables
- [ ] **Rename `mlbId` → `externalId`** on Player model (add alias for backward compat)
- [ ] **Rename `mlbTeam` → `proTeam`** on Player model (add alias for backward compat)
- [ ] **Create `SportContext.tsx`** — client-side sport awareness, derived from league's sport
- [ ] **Update `LeagueContext.tsx`** — include `sport` in context value
- [ ] **Create `SportDataProvider` interface** — `server/src/sports/index.ts`
  ```typescript
  interface SportDataProvider {
    syncPlayers(season: number): Promise<void>;
    syncStats(periodId: number): Promise<void>;
    searchPlayers(query: string, sport: Sport): Promise<SearchResult[]>;
    getPlayerInfo(externalId: string): Promise<PlayerDetail>;
  }
  ```
- [ ] **Wrap existing MLB sync in `MlbDataProvider`** — implement SportDataProvider, no behavior change
- [ ] **Update cron jobs** — parameterize by sport instead of hardcoding MLB
- [ ] **Update standings service** — read categories from `SportConfig` instead of hardcoded `CATEGORY_CONFIG`
- [ ] **Run all 730 tests** — zero regressions allowed

**Acceptance criteria:**
- All existing baseball functionality works identically
- New league creation defaults to `sport: "BASEBALL"`
- `getSportConfig("BASEBALL")` returns current config
- `getSportConfig("FOOTBALL")` returns a stub (empty positions, etc.)
- No hardcoded baseball references remain in shared infrastructure

**Effort:** Large (3 weeks)

---

#### Phase 2: Football Core (Apr 22 – May 26, 5 weeks)

**Goal:** Full fantasy football support — snake draft, auction draft, roster management, weekly scoring, trades, waivers, AI insights.

**Why:** Football is the #1 growth market. Must be feature-complete for August draft season.

##### Tasks

**2A. Football Sport Config (Week 1)**
- [ ] **Create `server/src/sports/football/config.ts`**
  - Positions: QB, RB, WR, TE, K, DEF, FLEX, BENCH, IR
  - Scoring: PPR (default), Half-PPR, Standard as format variants
  - Categories: Pass Yds, Pass TD, Rush Yds, Rush TD, Receptions, Rec Yds, Rec TD, FG Made, Points Allowed, Sacks, INT, Fumble Recovery
  - Roster slots: 1 QB, 2 RB, 2 WR, 1 TE, 1 FLEX, 1 K, 1 DEF, 6 BENCH, 1 IR (configurable)
- [ ] **Create `client/src/sports/football/config.ts`** — mirror server config
- [ ] **Create football default rules** — standard 10-team, $200 auction budget, snake draft order

**2B. NFL Data Provider (Weeks 1-2)**
- [ ] **Research NFL data sources** — ESPN API, Sleeper API, or NFL Stats API
  - ESPN: `/v3/sports/football/nfl/athletes` — free, well-documented, large community
  - Sleeper: `/v1/players/nfl` — free, fantasy-focused, includes projections
- [ ] **Create `NflDataProvider`** implementing `SportDataProvider`
- [ ] **Create NFL MCP server** (`mcp-servers/nfl-data/`) — same caching/rate-limiting pattern as MLB
- [ ] **NFL player sync** — positions, teams, bye weeks, injury status
- [ ] **NFL stats sync** — weekly stats per player (or daily for flexibility)

**2C. Football Stat Models (Week 2)**
- [ ] **Create Prisma models:**
  ```prisma
  model FootballPlayerStats {
    id        Int      @id @default(autoincrement())
    playerId  Int
    periodId  Int
    // Passing
    passAttempts  Int @default(0)
    passCompletions Int @default(0)
    passYards     Int @default(0)
    passTD        Int @default(0)
    interceptions Int @default(0)
    // Rushing
    rushAttempts  Int @default(0)
    rushYards     Int @default(0)
    rushTD        Int @default(0)
    // Receiving
    receptions    Int @default(0)
    recYards      Int @default(0)
    recTD         Int @default(0)
    targets       Int @default(0)
    // Kicking
    fgMade        Int @default(0)
    fgAttempts    Int @default(0)
    xpMade        Int @default(0)
    // Defense
    pointsAllowed Int @default(0)
    sacks         Float @default(0)
    defINT        Int @default(0)
    fumbleRec     Int @default(0)
    defTD         Int @default(0)
    @@unique([playerId, periodId])
  }

  model FootballTeamStats {
    id        Int @id @default(autoincrement())
    teamId    Int
    periodId  Int
    totalPoints Float @default(0)
    // Per-category breakdowns for roto/H2H categories
    @@unique([teamId, periodId])
  }
  ```
- [ ] **Run migration** — new tables only, no changes to existing baseball tables

**2D. Football Standings & Scoring (Weeks 3-4)**
- [ ] **Points-based scoring engine** — compute fantasy points from `FootballPlayerStats` using league's scoring rules
- [ ] **H2H weekly matchups** — leverage existing `Matchup` model, generate round-robin schedule
- [ ] **Weekly standings** — W-L-T record, total points for/against, playoff race
- [ ] **Bye week handling** — flag players on bye, warn before lineup lock
- [ ] **Lineup setting** — weekly lineup submission with position validation, lock at game kickoff
- [ ] **Waiver wire** — FAAB (same system as baseball) + inverse-record priority option

**2E. Football AI Integration (Week 5)**
- [ ] **Create `server/src/sports/football/aiPrompts.ts`** — football-specific prompts
- [ ] **Start/sit recommendations** — matchup-based analysis using LLM + stats context
- [ ] **Trade analyzer** — project roster impact of proposed trades
- [ ] **Weekly digest** — football version (power rankings, pickup suggestions, waiver targets)
- [ ] **Draft advice** — auction value analysis and snake draft pick recommendations

**Acceptance criteria:**
- Create a football league, draft (snake or auction), set lineups, score weekly
- H2H matchups with W-L records
- AI weekly digest and trade analysis for football
- NFL player data syncing correctly
- All baseball features continue to work

**Effort:** Large (5 weeks)

---

#### Phase 3: Revenue & Launch Prep (May 27 – Jul 7, 6 weeks)

**Goal:** Stripe integration, self-service signup, marketing content, email newsletter — everything needed to accept money and attract users by August.

##### Tasks

**3A. Stripe Integration (Weeks 1-2)**
- [ ] **Add Prisma models:**
  ```prisma
  model Subscription {
    id              Int      @id @default(autoincrement())
    userId          Int
    stripeCustomerId    String  @unique
    stripeSubscriptionId String? @unique
    plan            PlanTier @default(FREE)
    status          SubStatus @default(ACTIVE)
    currentPeriodEnd DateTime?
    cancelAtPeriodEnd Boolean @default(false)
    createdAt       DateTime @default(now())
    updatedAt       DateTime @updatedAt
    user            User     @relation(fields: [userId], references: [id])
  }

  enum PlanTier { FREE, PRO, SEASON_PASS }
  enum SubStatus { ACTIVE, PAST_DUE, CANCELLED, TRIALING }
  ```
- [ ] **Stripe Checkout** — session creation for Pro ($9.99/mo) and Season Pass ($19.99/season)
- [ ] **Stripe webhooks** — `checkout.session.completed`, `invoice.paid`, `customer.subscription.deleted`
- [ ] **`requirePro` middleware** — gate features behind subscription check
- [ ] **Billing portal** — manage subscription, update payment, cancel
- [ ] **Feature gating:**
  - **Free:** Snake draft, basic standings, transactions, 1 league
  - **Pro ($9.99/mo):** Auction draft, AI insights, trade analyzer, keeper tools, unlimited leagues
  - **Season Pass ($19.99):** Same as Pro, single-season payment

**3B. Self-Service League Creation (Week 3)**
- [ ] **League creation wizard** — sport selector → format → settings → invite
- [ ] **Sport-aware defaults** — football: 10-team snake, PPR scoring; baseball: 8-team auction, roto
- [ ] **Invite flow** — shareable link + email invites via Resend
- [ ] **Public league directory** — browse open leagues by sport, join

**3C. Newsletter System (Week 3)**
- [ ] **Email templates** — weekly digest teaser, new sport announcement, season kickoff
- [ ] **Subscriber preferences** — `User.emailPreferences` JSON column (sports, frequency)
- [ ] **Batch sending** — Resend broadcast API for newsletter delivery
- [ ] **Teaser + link format** — short highlights with "Read full digest in app" CTA
- [ ] **Unsubscribe** — one-click unsubscribe link in footer

**3D. Content Marketing / SEO (Weeks 4-5)**
- [ ] **AI-generated draft kit** — free PDF download (email-gated lead gen)
  - Football auction values + snake rankings for 2026 season
  - Generated by AI analysis service with football projections CSV
- [ ] **Public weekly digest page** — "NFL AI Analysis" on marketing site (Astro)
  - Not league-specific — general fantasy football analysis
  - SEO target: "AI fantasy football", "fantasy football AI advice"
- [ ] **Live auction demo video** — record your league's baseball auction with AI bid advice visible
- [ ] **Marketing site updates** — football-focused landing page, sport selector, pricing page
- [ ] **og:image generation** — shareable social cards for draft picks, trades (Satori/Vercel OG)

**3E. Business Dashboard (Week 6)**
- [ ] **Admin-only page** at `/admin/business` (behind `requireAdmin`)
- [ ] **PostHog integration** — pull metrics via PostHog API:
  - Signup funnel: visitors → signups → league creators → Pro conversions
  - Feature usage heatmap (which AI features are most used)
  - Sport breakdown (leagues per sport)
  - Retention cohorts (weekly/monthly active)
- [ ] **Revenue metrics** — Stripe API for MRR, ARR, churn rate
- [ ] **Dashboard components:**
  ```
  ┌─────────────┬──────────────┬───────────────┐
  │ MRR: $XX    │ Users: XXX   │ Leagues: XX   │
  ├─────────────┴──────────────┴───────────────┤
  │ Signup Funnel                               │
  │ Visit → Signup → League → Pro               │
  ├─────────────────────────────────────────────┤
  │ Feature Usage Heatmap                       │
  │ AI Digest ████████ 78%                      │
  │ Trade Sim ██████   52%                      │
  │ Bid Advice ████    34%                      │
  ├─────────────────────────────────────────────┤
  │ Sport Breakdown     │ Churn Rate            │
  │ Football: 60%       │ Monthly: 5%           │
  │ Baseball: 30%       │ Post-Draft: 12%       │
  │ Basketball: 10%     │                       │
  └─────────────────────┴───────────────────────┘
  ```

**Acceptance criteria:**
- User can sign up, create a football league, pay for Pro, and draft
- Newsletter emails sent weekly to opted-in users
- Draft kit downloadable from marketing site (email-gated)
- Business dashboard shows real metrics from PostHog + Stripe
- All payment flows work end-to-end (checkout, webhook, gating, cancel)

**Effort:** Large (6 weeks)

---

#### Phase 4: Football Launch + Business Agent (Jul 8 – Aug 4, 4 weeks)

**Goal:** Polish, stress test, launch marketing campaign, and build the `/ce:business` agent.

##### Tasks

**4A. Launch Prep (Weeks 1-2)**
- [ ] **Load testing** — simulate 100 concurrent draft rooms
- [ ] **Mobile optimization** — all football pages responsive at 390px
- [ ] **Error handling** — graceful degradation for API failures, rate limits
- [ ] **Onboarding flow** — first-time user experience (guided league creation)
- [ ] **Help/FAQ** — common questions, getting started guide
- [ ] **Deploy to production** — Railway, Cloudflare CDN, SSL

**4B. Marketing Campaign (Weeks 2-3)**
- [ ] **Reddit launch posts** — r/fantasyfootball, r/ff_startup (show AI features)
- [ ] **Podcast outreach** — 5-10 fantasy football podcasters, offer affiliate or branded leagues
- [ ] **Twitter/X campaign** — AI hot takes, draft kit promotion, weekly threads
- [ ] **SEO audit** — verify marketing site indexing, fix meta tags, submit sitemap
- [ ] **Email drip** — captured emails get 3-email sequence: welcome → draft kit → Pro trial

**4C. Business Strategist Agent (Weeks 3-4)**
- [ ] **Create `/ce:business` skill** — `.claude/skills/business/SKILL.md`
  ```
  /ce:business              # Full analysis (all 3 pillars)
  /ce:business revenue      # Revenue opportunities only
  /ce:business compete      # Competitive analysis only
  /ce:business trends       # Trend radar only
  ```
- [ ] **Create `revenue-analyst` sub-agent** — scans codebase for monetization hooks, suggests feature gating, pricing
- [ ] **Create `competitive-intel` sub-agent** — web-searches competitors (Yahoo, ESPN, Sleeper, Fantrax), builds comparison matrix, diffs against previous run
- [ ] **Create `trend-radar` sub-agent** — searches for sports tech trends, AI-in-fantasy news, emerging formats
- [ ] **Output: Strategic reports** → `docs/business/` directory
  - `competitor-matrix.md` — feature/pricing comparison table
  - `revenue-scorecard.md` — current revenue, opportunities, recommended actions
  - `trend-radar.md` — emerging trends with relevance to FBST
- [ ] **Output: Implementation todos** → `todos/` directory with specific tasks
- [ ] **Output: Business dashboard data** — feed insights into `/admin/business` page
- [ ] **Monthly cron** — RemoteTrigger runs condensed analysis, commits `docs/business/monthly-pulse.md`
- [ ] **Competitor snapshot** — `docs/business/competitor-snapshot.json` for diffing changes

**Acceptance criteria:**
- `/ce:business` runs successfully, produces reports + todos
- Monthly cron commits pulse reports automatically
- Football launch campaign reaches >1000 potential users
- App handles 100 concurrent draft rooms without degradation
- At least 10 leagues created by external users (not your league)

**Effort:** Large (4 weeks)

---

#### Phase 5: Post-Launch Growth (Aug 5+, ongoing)

**Goal:** Basketball, event games, predictive analytics, social features.

##### Tasks

**5A. Basketball (Oct 2026)**
- [ ] **Create `server/src/sports/basketball/config.ts`** — PTS, REB, AST, STL, BLK, FG%, FT%, 3PM, TO
- [ ] **NBA data provider** — ESPN or NBA Stats API
- [ ] **Basketball stat models** — `BasketballPlayerStats`
- [ ] **Daily lineup setting** — basketball plays daily, not weekly

**5B. Event Games (Feb-Mar 2027)**
- [ ] **Super Bowl squares** — 10x10 grid, random number assignment, payment tracking
- [ ] **Super Bowl prop pool** — list of props, user picks, result calculation
- [ ] **March Madness brackets** — 64-team tournament bracket, round-by-round scoring
- [ ] **March Madness Calcutta auction** — same auction engine, different player pool (teams as players)
  (see brainstorm: "The Calcutta insight" — auction engine is reusable across sports/events)
- [ ] **Event models:**
  ```prisma
  model Event {
    id        Int       @id @default(autoincrement())
    type      EventType // BRACKET, SQUARES, PROP_POOL, CALCUTTA
    sport     Sport
    name      String
    status    EventStatus // OPEN, LOCKED, COMPLETED
    config    Json      // type-specific settings
    createdBy Int
    createdAt DateTime  @default(now())
    entries   EventEntry[]
  }

  model EventEntry {
    id        Int   @id @default(autoincrement())
    eventId   Int
    userId    Int
    picks     Json  // bracket picks, square numbers, prop selections
    score     Float @default(0)
    event     Event @relation(fields: [eventId], references: [id])
  }
  ```

**5C. Predictive Analytics**
- [ ] **Trade simulator** — LLM projects standings impact of proposed trades
- [ ] **Playoff odds** — Monte Carlo simulation from current standings + remaining schedule
- [ ] **Hot/cold streak prediction** — rolling performance trends with momentum indicators
- [ ] **Injury risk badges** — LLM analysis of player injury history + workload

**5D. Social & Content AI**
- [ ] **League storylines** — AI tracks narratives across the season
- [ ] **Social sharing cards** — Satori/Vercel OG for trades, draft picks, weekly standings
- [ ] **Audio recaps** — TTS-powered 2-minute weekly audio (ElevenLabs)

**Effort:** Ongoing

---

## System-Wide Impact

### Interaction Graph
- Sport selector on league creation → sets `League.sport` → propagates to `LeagueContext` → all feature components read sport from context → `getSportConfig(sport)` returns correct positions/categories/rules
- Player sync crons → read league sport → dispatch to correct `SportDataProvider` → populate sport-specific stat tables
- Standings computation → read categories from `SportConfig` → query correct stat table → rank teams

### Error & Failure Propagation
- NFL API failure → `NflDataProvider` returns cached data (same pattern as MLB MCP cache)
- Stripe webhook failure → retry with exponential backoff (Stripe handles this)
- Sport config missing → `getSportConfig()` throws → caught at route level → 500 with generic error

### State Lifecycle Risks
- **Migration risk:** Adding `sport` column to League/Player with default `BASEBALL` is safe (additive, non-breaking)
- **Stat table separation:** No risk to existing baseball data — new tables, no migrations on old ones
- **Stripe webhook ordering:** `checkout.session.completed` must fire before subscription is active — use Stripe's `payment_intent.succeeded` as confirmation

### API Surface Parity
- All league CRUD endpoints gain optional `sport` parameter (default: BASEBALL)
- New endpoints: `POST /api/leagues` accepts `sport` in body
- Player endpoints: filtered by sport automatically via league context
- Admin sync endpoints: `POST /api/admin/sync-nfl`, `POST /api/admin/sync-nba` alongside existing `sync-mlb`

### Integration Test Scenarios
1. Create football league → auction draft → verify football stat columns populated (not baseball)
2. User with one baseball league + one football league → verify dashboard shows correct sport per league
3. Pro subscription → access AI features → cancel → verify features gated again
4. NFL player sync → verify positions map to football slots (not baseball positions)
5. Weekly football scoring → H2H matchup → verify W-L record updates correctly

## Acceptance Criteria

### Functional Requirements
- [ ] User can create leagues for baseball, football (basketball in Phase 5)
- [ ] Football has full feature parity with baseball (draft, trades, waivers, AI, standings)
- [ ] Stripe payments work end-to-end (checkout, webhook, gating, cancel)
- [ ] Newsletter emails sent weekly to opted-in users
- [ ] `/ce:business` agent produces reports and todos
- [ ] Business dashboard shows real metrics at `/admin/business`
- [ ] Marketing site has football-focused landing page, pricing, draft kit

### Non-Functional Requirements
- [ ] 100 concurrent draft rooms without degradation
- [ ] Page load <1.5s for all pages
- [ ] Mobile responsive at 390px
- [ ] All tests passing (730+ existing + new football tests)
- [ ] TypeScript strict mode, zero `any` in new code

### Quality Gates
- [ ] Each phase ends with browser verification (Playwright)
- [ ] Each phase updates CLAUDE.md and FEEDBACK.md
- [ ] New feature modules follow existing patterns (routes, services, api, pages, components)
- [ ] AI prompts validated with real data before launch

## Success Metrics

| Metric | Target (by Oct 2026) | How Measured |
|--------|---------------------|--------------|
| Registered users | 500+ | PostHog |
| Paying users (Pro) | 50+ | Stripe |
| Active leagues | 100+ | DB query |
| Football leagues | 70+ | DB query (sport=FOOTBALL) |
| MRR | $500+ | Stripe dashboard |
| Newsletter subscribers | 1000+ | Resend audience |
| Draft kit downloads | 500+ | PostHog event |

## Dependencies & Prerequisites

| Dependency | Status | Blocker? |
|-----------|--------|----------|
| Existing baseball codebase | Live, 730 tests passing | No |
| PostHog | Already integrated (18 events tracked) | No |
| Resend | Working (invite emails) | No |
| Stripe account | Not created | Yes (Phase 3) |
| NFL data source (ESPN/Sleeper API) | Research needed | Yes (Phase 2) |
| Marketing site (Astro) | Live at www.thefantasticleagues.com | No |
| Railway hosting | Active ($5/mo) | No — may need to scale |

## Risk Analysis & Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| NFL data source unreliable | High | Medium | Evaluate 2+ sources (ESPN + Sleeper); cache aggressively |
| 5-month timeline too tight | High | Medium | Football MVP (draft + basic scoring) by Aug; polish post-launch |
| Stripe integration complexity | Medium | Low | Well-documented; use Stripe Checkout (hosted) to minimize work |
| Sport abstraction breaks baseball | High | Low | Phase 1 is ALL about this; 730 tests must pass |
| Low adoption at launch | Medium | Medium | Content marketing starts 2 months before launch; free tier lowers barrier |
| PostHog self-hosted ops burden | Low | Low | Start with PostHog Cloud free tier; self-host later if needed |

## Alternative Approaches Considered

1. **Football-only separate app** — Rejected. Duplicates infrastructure, fragments user base, doubles maintenance.
2. **Generic stat columns (JSON blob)** — Rejected for launch. Loses DB-level querying; harder to debug. Sport-specific stat tables are safer.
3. **Build custom ML for predictions** — Deferred to post-launch. LLM + stats context works now at current scale.
4. **Yahoo/ESPN API integration (overlay)** — Rejected. Dependency on third-party platforms; no control over user experience.

## Future Considerations

- **Basketball** (Oct 2026): Same pattern as football — sport config + data provider + stat tables
- **March Madness Calcutta** (Mar 2027): Reuse auction engine — identical mechanics, different player pool (teams as "players")
- **Super Bowl squares/props** (Feb 2027): New `Event` model — lightweight, viral, casual
- **Multi-sport subscriptions**: One Pro subscription covers all sports
- **API access tier**: Developer tier for content creators ($49/mo)
- **White-label**: License AI engine to other fantasy platforms

## Timeline Summary

```
Apr 2026  ████████████████████ Phase 1: Sport Abstraction (3 weeks)
May 2026  ████████████████████████████████████████ Phase 2: Football Core (5 weeks)
Jun 2026  ████████████████████████████████████████████████ Phase 3: Revenue + Launch Prep (6 weeks)
Jul 2026  ████████████████████████████████ Phase 4: Polish + Launch + Business Agent (4 weeks)
Aug 2026  🚀 FOOTBALL LAUNCH — Draft Season
Sep 2026  Phase 5 begins (basketball, events, predictive analytics)
```

## Sources & References

### Origin
- **Brainstorm document:** [docs/brainstorms/2026-03-31-business-agent-and-feature-ideas-brainstorm.md](../brainstorms/2026-03-31-business-agent-and-feature-ideas-brainstorm.md)
  - Key decisions: football-first launch, single app with sport selector, /ce:business agent with 3 pillars, PostHog analytics, teaser newsletters
- **SaaS Vision:** [docs/plans/CPLAN-saas-vision.md](CPLAN-saas-vision.md) — master strategic roadmap, sport module structure, Calcutta insight
- **Phase 1 Plan:** [docs/plans/2026-03-23-saas-phase-1-plan.md](2026-03-23-saas-phase-1-plan.md) — snake draft, self-service, Stripe, marketing
- **Phase 2 Plan:** [docs/plans/2026-03-24-feat-phase2-format-expansion-plan.md](2026-03-24-feat-phase2-format-expansion-plan.md) — format enum, snake draft engine, H2H matchups

### Internal References
- Sport config: `server/src/lib/sportConfig.ts`, `client/src/lib/sportConfig.ts`
- League context: `client/src/contexts/LeagueContext.tsx`
- Standings service: `server/src/features/standings/services/standingsService.ts`
- AI analysis: `server/src/services/aiAnalysisService.ts`
- MLB data: `mcp-servers/mlb-data/`, `server/src/lib/mlbApi.ts`
- PostHog: `client/src/lib/posthog.ts`, `client/src/components/PostHogTracker.tsx`
- Email: `server/src/lib/emailService.ts`

### External References
- ESPN API (NFL): `https://site.api.espn.com/apis/site/v2/sports/football/nfl`
- Sleeper API: `https://docs.sleeper.com/`
- Stripe Checkout: `https://stripe.com/docs/payments/checkout`
- PostHog: `https://posthog.com/docs`
- Resend: `https://resend.com/docs`
