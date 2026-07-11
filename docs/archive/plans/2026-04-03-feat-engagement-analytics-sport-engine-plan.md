---
title: "Engagement, Analytics, Pre-Trade AI, Sport-Agnostic Engine"
type: feat
status: active
date: 2026-04-03
deepened: 2026-04-03
origin: docs/brainstorms/2026-04-03-competitive-analysis-pricing-strategy-brainstorm.md
---

# Engagement, Analytics, Pre-Trade AI & Sport-Agnostic Engine

## Enhancement Summary

**Deepened on:** April 3, 2026
**Sections enhanced:** 6 features
**Research agents used:** Timezone best practices, Engagement dashboards & gamification, Sport-agnostic engine architecture, Historical analytics & trophy case UI

### Key Improvements from Research
1. **Three-tier time display** (Sleeper pattern): countdown for imminent → relative for recent → local absolute for everything else
2. **Weighted engagement scoring** with time decay — 8 event types, not just login recency. Streak mechanics are the #1 retention driver for 26-week seasons
3. **Sport-agnostic engine**: Registry + Strategy + Factory patterns. Sleeper API (free) for NFL, BallDontLie (free) for NBA. Separate stat tables per sport, NOT one mega table
4. **Dynasty scoring formula**: Championships (100pts) + finish points + category dominance + longevity bonus — adapted for roto baseball
5. **Achievement badges**: 10+ collectible badges ("Iron Manager", "Trade Baron", "Waiver Wizard") visible on team pages — social comparison drives action

### New Considerations Discovered
- `Intl.DateTimeFormat` instances should be cached (2-10x faster than recreating per call)
- Temporal API now ships in Chrome 144+ and Firefox 139+ but Safari needs polyfill — skip for now
- Streak tracking is the single most powerful retention mechanic for long seasons
- FBST's existing `Franchise` + `FranchiseMembership` model is the right foundation for cross-year owner tracking
- Skip Temporal (workflow orchestration) — node-cron is sufficient at current scale

## Overview

6 features spanning quick wins to foundational architecture, prioritized by the competitive analysis brainstorm. Features 1-3 address the in-season engagement gap identified vs Sleeper. Feature 4 extends our AI advantage. Features 5-6 lay the foundation for multi-sport expansion.

## Feature 1: Local Timezone Display

### Problem
All times display in a single format. Managers in different timezones see confusing absolute times. Countdown timers ("closes in 3h 22m") are universally useful.

### Approach
Create `client/src/lib/timeUtils.ts` with timezone-aware formatting utilities. The codebase already uses `toLocaleDateString`/`toLocaleTimeString` in 10+ places — standardize into shared functions.

**Key learnings:** Date-only strings must anchor to noon UTC (`new Date(dateString + "T12:00:00Z")`) to avoid off-by-one timezone shifts (see `docs/solutions/logic-errors/period-date-timezone-shift.md`).

### Files to Create/Modify

```typescript
// client/src/lib/timeUtils.ts (NEW)

/** Format a date in user's local timezone */
export function formatLocalDate(date: Date | string, opts?: Intl.DateTimeFormatOptions): string

/** Format time in user's local timezone */
export function formatLocalTime(date: Date | string): string

/** "3h 22m" countdown from now to target */
export function formatCountdown(target: Date | string): string

/** "Today", "Yesterday", "Mon, Apr 3" relative date */
export function formatRelativeDate(date: Date | string): string

/** Safe date parse — anchors date-only strings to noon UTC */
export function safeParseDate(dateStr: string): Date
```

### Apply To
- [ ] `client/src/pages/Home.tsx` — game times in scores widget, Daily Diamond date
- [ ] `client/src/features/periods/pages/Season.tsx` — period dates, updated-at timestamp
- [ ] `client/src/features/transactions/pages/ActivityPage.tsx` — waiver deadlines
- [ ] `client/src/features/trades/pages/TradesPage.tsx` — trade timestamps
- [ ] `client/src/features/auction/components/` — auction timestamps
- [ ] `client/src/components/shared/StatsTables.tsx` — period meeting dates
- [ ] Add countdown timer component for waiver/trade deadline banners on Dashboard

### Research Insights

**Three-Tier Display Pattern (Sleeper-style):**
```typescript
function formatEventTime(epochMs: number): string {
  const diff = epochMs - Date.now();
  // < 24h away: countdown ("in 3h 22m")
  if (diff > 0 && diff < 86_400_000) {
    const h = Math.floor(diff / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    return h > 0 ? `in ${h}h ${m}m` : `in ${m}m`;
  }
  // Past events < 7 days: relative ("2 hours ago", "yesterday")
  if (diff < 0 && Math.abs(diff) < 7 * 86_400_000) {
    return relativeTime(new Date(epochMs)); // Intl.RelativeTimeFormat
  }
  // Everything else: local absolute ("Tue, Apr 7, 8:59 PM PDT")
  return cachedFormatter.format(new Date(epochMs));
}
```

**Performance:** Cache `Intl.DateTimeFormat` instances (2-10x faster than `toLocaleString()`). Create a `Map<string, Intl.DateTimeFormat>` keyed by serialized options.

**Countdown Hook:**
```typescript
function useCountdownSeconds(targetMs: number) {
  const [remaining, setRemaining] = useState(Math.max(0, Math.ceil((targetMs - Date.now()) / 1000)));
  useEffect(() => {
    const id = setInterval(() => {
      setRemaining(Math.max(0, Math.ceil((targetMs - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(id);
  }, [targetMs]);
  return remaining;
}
```
Always recompute from `Date.now()` (never accumulate) — `setInterval` drifts when tabs are backgrounded.

**Pitfall:** `new Date("2026-04-03")` parses as midnight UTC, not local. Use noon-UTC anchoring from existing learning: `new Date(dateStr + "T12:00:00Z")`.

**Library choice:** Skip Luxon, skip Temporal polyfill. Use native `Intl.DateTimeFormat` + `Intl.RelativeTimeFormat` (zero bundle cost) + `date-fns` v4 for arithmetic only.

### Effort: Small (1 session)

---

## Feature 2: League Health Dashboard

### Problem
Commissioners have no visibility into which managers are engaged vs dropping off. Mid-season disengagement is the #1 league-killer for fantasy baseball's 26-week season.

### Approach
New "League Health" tab in the Commissioner page. Compute engagement metrics from existing `AuditLog` data + new `User.lastLogin` field.

### Schema Change

```prisma
// prisma/schema.prisma — User model
model User {
  // ... existing fields
  lastLogin DateTime?  // Set on each successful auth
}
```

**Migration:** `npx prisma migrate dev --name add-user-last-login`

### Server Endpoint

```typescript
// server/src/features/commissioner/routes.ts
// GET /api/commissioner/:leagueId/health
// Returns per-team engagement metrics

interface TeamHealth {
  teamId: number;
  teamName: string;
  teamCode: string;
  ownerName: string;
  lastLogin: string | null;        // from User.lastLogin
  daysSinceLogin: number | null;
  waiverClaimsThisSeason: number;  // count from WaiverClaim
  tradesThisSeason: number;        // count from Trade (proposer or party)
  periodsWithLineupSet: number;    // count of periods with active roster
  totalPeriods: number;
  engagementScore: number;         // 0-100 computed metric
  status: "active" | "at-risk" | "inactive";  // based on score
}
```

### Engagement Score Formula
```
score = (
  loginRecency * 30 +      // 30 pts: logged in last 7 days = 30, 14 days = 20, 30 days = 10, else 0
  waiverActivity * 25 +    // 25 pts: ≥3 claims = 25, 1-2 = 15, 0 = 0
  tradeActivity * 20 +     // 20 pts: ≥2 trades = 20, 1 = 10, 0 = 0
  lineupSetRate * 25        // 25 pts: 100% = 25, 80%+ = 20, 50%+ = 10, else 0
)
status = score >= 70 ? "active" : score >= 40 ? "at-risk" : "inactive"
```

### Client Component

```
client/src/features/commissioner/components/LeagueHealthTab.tsx (NEW)
```

Visual: Table with team name, owner, last login, waiver claims, trades, lineup %, engagement score badge (green/amber/red). Sort by score ascending to surface at-risk teams first.

### Files to Modify
- [ ] `prisma/schema.prisma` — add `lastLogin` to User
- [ ] `server/src/features/auth/routes.ts` — set `lastLogin` on successful auth
- [ ] `server/src/features/commissioner/routes.ts` — new `/health` endpoint
- [ ] `client/src/features/commissioner/pages/Commissioner.tsx` — add tab
- [ ] `client/src/features/commissioner/components/LeagueHealthTab.tsx` — new component

### Research Insights

**Improved Engagement Score (weighted, with time decay):**
```
score = (
  logins_7d × 2 +              // max ~14 pts
  lineup_changes_7d × 8 +      // max ~16 pts (THE #1 signal)
  trades_proposed_30d × 10 +   // max ~20 pts
  waiver_claims_30d × 6 +      // max ~18 pts
  digest_reads_7d × 3 +        // max ~6 pts
  player_searches_7d × 1 +     // max ~7 pts
  ai_insights_viewed_7d × 2 +  // max ~6 pts
  chat_messages_7d × 1          // max ~7 pts (future)
) × timeDecayMultiplier
// Normalize to 0-100
```
**Time decay:** Last 7 days = 1.0x, 8-14 days = 0.7x, 15-30 days = 0.4x.

**Refined risk thresholds:**
- HIGH: No login 14+ days OR score < 20 OR score dropped 40%+ in 2 weeks
- MEDIUM: No login 7-13 days OR score 20-39 OR no roster moves in 14 days
- LOW: Score 40-59 with declining trend

**Dashboard UX (research-backed priority):**
1. **Headline:** "League Health: 74/100" — single aggregate number
2. **At-risk list** with one-click "Send Nudge Email" action
3. **Weekly activity summary** (trades, waivers, lineup changes, chat)
4. **Engagement trend sparkline** (last 4-6 weeks)
5. **Manager leaderboard** ranked by score (social comparison drives action)

**The "empty roster" detector:** Flag managers who haven't set a lineup for 2+ consecutive periods — this is the #1 sign of disengagement and hurts the whole league (opponents get free wins).

### Effort: Medium (1 session)

---

## Feature 3: Monthly Awards & Engagement Hooks

### Problem
No recognition for good performance during the season. Mid-season disengagement drops. Awards create conversation and competition.

### Approach
Compute awards at each period close. Store in `AiInsight` (type: "period_awards"). Display on Home page and in weekly digest. For OGBA: "Pickups of the Period" tracks which waiver claims produced the most value.

### Award Types

| Award | Computation | Data Source |
|-------|------------|-------------|
| **Manager of the Period** | Highest point gain this period | `TeamStatsPeriod.totalPoints` delta |
| **Pickup of the Period** | Waiver add with highest production | `WaiverClaim` (SUCCESS) + player stats since claim date |
| **Trade Winner** | Trade with highest surplus value (if AI analysis exists) | `Trade.aiAnalysis` |
| **Hot Streak** | Most consecutive period improvements | `TeamStatsSeason` cross-period comparison |
| **Category King** | Best single-category performance | `TeamStatsPeriod` per-category leaders |

### Server Implementation

```typescript
// server/src/services/periodAwardsService.ts (NEW)

export async function computePeriodAwards(leagueId: number, periodId: number): Promise<PeriodAwards>

interface PeriodAwards {
  managerOfPeriod: { teamId: number; teamName: string; pointsGained: number };
  pickupOfPeriod: { teamId: number; playerName: string; claimPrice: number; statsProduced: string } | null;
  tradeWinner: { tradeId: number; teamName: string; surplusValue: string } | null;
  categoryKings: { category: string; teamName: string; value: number }[];
}
```

### "Pickups of the Period" for OGBA
Query all `WaiverClaim` with `status: "SUCCESS"` in the period date range. For each claimed player, compute their stats from claim date to period end. Rank by total fantasy value produced.

### Storage
```typescript
// AiInsight with type: "period_awards"
// weekKey: "P1" / "P2" / etc. (period identifier)
// data: JSON (PeriodAwards)
```

### Display
- Home page: Awards card below Weekly Digest (collapsible)
- Weekly digest email: Include top awards
- Season page: Awards column in period matrix (hover for details)

### Files to Create/Modify
- [ ] `server/src/services/periodAwardsService.ts` — new service
- [ ] `server/src/features/periods/routes.ts` — trigger awards computation on period close
- [ ] `client/src/pages/Home.tsx` — awards display card
- [ ] `server/src/features/mlb-feed/services/digestService.ts` — include awards in digest

### Research Insights

**Streak Tracking (single most powerful retention mechanic):**
- "Lineup streak" — consecutive periods with a set lineup. Breaking a streak feels costly → drives habitual engagement
- Display on team page: "14-period lineup streak" with a flame icon
- Include in weekly digest: "James has set his lineup 14 weeks straight!"

**Achievement Badges (collectible, visible on team pages):**

| Badge | Criteria | Rarity |
|-------|----------|--------|
| Iron Manager | Set lineup every single period | Gold |
| Trade Baron | 10+ trades in a season | Silver |
| Waiver Wizard | 20+ successful waiver claims | Silver |
| Eagle Eye | Picked up a player within 7 days before their breakout | Gold |
| Draft Genius | 3+ drafted players finished top-10 at position | Gold |
| Comeback Kid | Won after being in last place at any point | Platinum |
| Category King | Led league in a category for full season | Silver |
| Perfect Period | Won all categories in a scoring period | Platinum |
| All-In | Used every feature (trade, waiver, chat, poll, lineup) | Bronze |
| Wooden Spoon | Last place finish (tongue-in-cheek) | Bronze |

**Mid-Season Reset (Week 13):** Introduce "Second Half Standings" to give struggling teams a fresh narrative and reason to re-engage.

**Display locations:**
- Team page: Badge grid (earned = colored, unearned = grey)
- Digest email: "New badges earned this period"
- Season page: Awards column in period matrix
- Home page: "Awards" card below Weekly Digest

### Effort: Medium (1 session)

---

## Feature 4: Pre-Trade AI Advisor

### Problem
Currently AI analysis runs AFTER a trade is processed. Team owners want "should I do this?" analysis BEFORE proposing.

### Approach
Reuse existing `aiAnalysisService.analyzeTrade()` with a new on-demand endpoint. The client already has `client/src/features/trades/api.ts:analyzeTrade()` — it just needs a UI trigger.

### Existing Infrastructure
- `POST /api/trades/analyze` endpoint already exists (`trades/routes.ts`)
- `aiAnalysisService.analyzeTrade(items, teams, leagueId)` already works
- Client API `analyzeTrade(leagueId, items)` already typed

### What's Needed
The **server endpoint exists** but may need enhancement for pre-trade context:
- Add projected category impact on BOTH teams (before vs after)
- Add keeper implications (is a keeper being traded?)
- Add position scarcity analysis (does the receiving team need this position?)

### Client UI
Add "Analyze Trade" button on the trade proposal form (TradesPage). When clicked:
1. User selects players/assets for each side (existing TradeAssetSelector)
2. Click "Analyze Before Proposing"
3. Modal shows AI analysis: fairness, category impact, surplus value, keeper flag
4. User can then "Propose Trade" or adjust

### Files to Modify
- [ ] `server/src/features/trades/routes.ts` — enhance `/analyze` response with category projections
- [ ] `server/src/services/aiAnalysisService.ts` — add pre-trade context to prompt
- [ ] `client/src/features/trades/pages/TradesPage.tsx` — add "Analyze" button in proposal flow
- [ ] `client/src/features/trades/components/TradeAnalysisModal.tsx` — new modal for AI results

### Effort: Medium (1 session)

---

## Feature 5: Sport-Agnostic Engine

### Problem
The entire codebase is baseball-specific. To support football (Aug 2027), basketball (Oct 2027), and other sports, we need abstraction layers.

### Approach
Registry pattern. Each sport registers its configuration (positions, categories, roster rules, data provider). The core engine (drafts, rosters, trades, standings, scoring) operates on the sport config interface.

### Architecture

```
server/src/lib/sports/
├── index.ts           # Sport registry + getSportConfig(sport)
├── types.ts           # SportConfig interface
├── baseball.ts        # MLB-specific config (extracted from sportConfig.ts)
├── football.ts        # NFL-specific config (future)
└── basketball.ts      # NBA-specific config (future)

client/src/lib/sports/
├── index.ts           # Client sport registry
├── types.ts           # Shared types
├── baseball.ts        # Client baseball config
└── football.ts        # Client football config (future)
```

### SportConfig Interface

```typescript
// server/src/lib/sports/types.ts

export interface SportConfig {
  id: string;                    // "baseball", "football", "basketball"
  name: string;                  // "Fantasy Baseball"
  positions: PositionConfig[];   // C, 1B, 2B, ... or QB, RB, WR, ...
  categories: CategoryConfig[];  // R, HR, RBI, ... or PassYds, RushYds, ...
  rosterSlots: RosterSlotConfig[];
  scoringFormats: string[];      // ["ROTO", "H2H_CATEGORIES", "H2H_POINTS"]
  draftFormats: string[];        // ["AUCTION", "SNAKE"]
  seasonMonths: [number, number]; // [3, 10] for baseball (Mar-Oct)
  dataProvider: string;          // "mlb-stats-api", "sleeper-nfl", etc.
  defaultRules: Record<string, any>;
}

export interface PositionConfig {
  code: string;        // "C", "1B", "QB", "RB"
  name: string;        // "Catcher", "Quarterback"
  group: "offense" | "defense" | "pitcher" | "hitter" | "flex";
  isMultiSlot?: boolean; // MI, CI, FLEX
  slotEligible?: string[]; // ["2B", "SS"] for MI
}

export interface CategoryConfig {
  id: string;          // "R", "HR", "PassYds"
  name: string;        // "Runs", "Home Runs", "Passing Yards"
  group: string;       // "hitting", "pitching", "passing", "rushing"
  isLowerBetter?: boolean; // ERA, WHIP
  formatFn: string;    // "int", "rate", "decimal2"
}
```

### Migration Path

**Phase 1 — Extract (no behavioral change):**
- Move baseball constants from `sportConfig.ts` → `sports/baseball.ts`
- Create `SportConfig` interface
- Add `getSportConfig(sport: string)` that returns baseball config
- All existing code calls `getSportConfig("baseball")` — zero behavioral change

**Phase 2 — Wire (add sport to League):**
- Add `sport String @default("baseball")` to League model
- Update `getSportConfig` calls to use `league.sport`
- Standings, auction, roster code reads from config instead of hardcoded constants

**Phase 3 — Expand (add new sports):**
- Create `sports/football.ts` with NFL positions, categories, roster slots
- Integrate Sleeper API as data provider
- Create football-specific UI components

### Schema Change

```prisma
model League {
  // ... existing fields
  sport String @default("baseball")  // "baseball", "football", "basketball"
}
```

### Files to Create/Modify
- [ ] `server/src/lib/sports/types.ts` — SportConfig interface
- [ ] `server/src/lib/sports/baseball.ts` — extract from sportConfig.ts
- [ ] `server/src/lib/sports/index.ts` — registry + getSportConfig()
- [ ] `client/src/lib/sports/` — mirror structure
- [ ] `prisma/schema.prisma` — add `sport` to League
- [ ] `server/src/lib/sportConfig.ts` — re-export from sports/baseball for backward compat
- [ ] `server/src/features/standings/services/standingsService.ts` — use SportConfig
- [ ] `server/src/features/auction/routes.ts` — use SportConfig

### Research Insights

**Recommended Data APIs per Sport:**

| Sport | Primary API | Cost | Backup |
|-------|-----------|------|--------|
| MLB | MLB Stats API (current) | Free | MySportsFeeds |
| NFL | **Sleeper API** | Free (1000 req/min, no auth) | MySportsFeeds |
| NBA | **BallDontLie** | Free tier (5-60 req/min) | MySportsFeeds |

Sleeper API is fantasy-native (has projections, trending players, matchups). BallDontLie has an official MCP server and covers NBA/NFL/MLB/NHL — could eventually be the single provider.

**Database Schema — Separate Stat Tables (NOT one mega table):**
```
PlayerStatsBaseball    (existing PlayerStatsPeriod/Season)
PlayerStatsFootball    (new: passingYards, rushingYards, touchdowns, etc.)
PlayerStatsBasketball  (new: points, rebounds, assists, steals, blocks, etc.)
```
Why: Type safety, query performance (PostgreSQL indexes on typed columns), no NULL explosion, Prisma works better with concrete columns than JSON.

**Keep ONE Player table** with `sport` discriminator — avoids duplicating all FK relationships (Roster, Trade, WaiverClaim, etc.).

**Skip Temporal (workflow orchestration):** Not needed at current scale. `node-cron` handles all current background jobs. Revisit at SaaS scale with 1000+ leagues.

**Scoring format defaults by sport:**

| Sport | Default | Also Supported |
|-------|---------|---------------|
| Baseball | Roto | H2H Categories, H2H Points |
| Football | H2H Points | H2H Categories (rare) |
| Basketball | H2H Categories/9-cat | H2H Points, Roto |

### Effort: Large (2-3 sessions for Phase 1-2)

---

## Feature 6: Historical Analytics & Trophy Case

### Problem
20+ years of OGBA archived data exists in `HistoricalSeason`, `HistoricalStanding`, `HistoricalPlayerStat` models but there's no analytics or trophy visualization.

### Approach
Build on existing archive infrastructure. Compute all-time records, per-owner analytics, and season awards from historical data. Display as a "Trophy Case" on franchise/team pages.

### Analytics to Compute

| Metric | Source | Query |
|--------|--------|-------|
| **All-Time Championships** | `HistoricalStanding.finalRank = 1` | Group by teamCode, count |
| **All-Time Points Leader** | `HistoricalStanding.totalScore` | Sum across seasons by owner |
| **Best Single Season** | `HistoricalStanding.totalScore` | Max by teamCode |
| **Most Category Wins** | `HistoricalStanding` category scores | Count rank=1 per category across years |
| **Draft ROI** | Auction prices vs production | Compare draft cost to season stats |
| **Trade Frequency** | `Trade` count per owner per season | Aggregate |
| **Waiver Success Rate** | `WaiverClaim` SUCCESS vs total | Per owner |
| **Dynasty Score** | Weighted: championships × 10 + top-3 × 5 + seasons × 1 | Composite |

### Server Endpoint

```typescript
// GET /api/archive/trophy-case?leagueId=X
// Returns franchise-level analytics

interface TrophyCase {
  championships: { year: number; teamName: string; teamCode: string }[];
  allTimeStandings: { teamCode: string; totalPoints: number; seasons: number; avgRank: number }[];
  records: {
    bestSeason: { year: number; teamCode: string; totalScore: number };
    worstSeason: { year: number; teamCode: string; totalScore: number };
    bestCategory: Record<string, { year: number; teamCode: string; value: number }>;
    longestStreak: { teamCode: string; consecutiveTopThree: number };
  };
  hallOfFame: { teamCode: string; dynastyScore: number; championships: number; seasons: number }[];
}
```

### Client UI
- New tab on Archive page: "Trophy Case"
- Championship banner at top (gold, silver, bronze per year)
- All-time leaderboard table
- Records section (best/worst season, category records)
- Hall of Fame with dynasty scores
- Per-owner card with their historical stats when clicked

### Files to Create/Modify
- [ ] `server/src/features/archive/services/trophyCaseService.ts` — new service
- [ ] `server/src/features/archive/routes.ts` — new `/trophy-case` endpoint
- [ ] `client/src/features/archive/components/TrophyCaseTab.tsx` — new component
- [ ] `client/src/features/archive/pages/ArchivePage.tsx` — add Trophy Case tab

### Research Insights

**Dynasty Score Formula (adapted for roto baseball):**
```
Dynasty Score =
  Championships × 100 +          // 1st place
  RunnerUp × 60 +                // 2nd place
  ThirdPlace × 40 +              // 3rd place
  SUM((N - finish + 1) × 5) +   // per-season finish bonus
  CategoryTitles × 10 +          // led league in a category for full season
  PeriodCategoryWins × 2 +       // led a category in a period
  SeasonsPlayed × 5 +            // longevity
  NeverFinishedLast × 25 -       // consistency bonus
  LastPlaceFinishes × 10 -       // penalty
  InactiveSeasons × 15           // penalty
```

**Visualization Recommendations:**

| Chart | Use Case | Library |
|-------|----------|---------|
| **Bump chart** | Standings position over years (dynasty visualization) | Recharts custom or D3 |
| **Radar/spider chart** | Owner profiles (championships, categories, trades, longevity) | Recharts `<Radar>` |
| **Heatmap** | Category performance by owner × category (color = rank) | Tailwind CSS grid |
| **Sparklines** | Inline tiny charts showing finish position trend per owner | Recharts |
| **Bar chart** | All-time records (most wins, highest score) | Recharts `<BarChart>` |

**Cross-Year Owner Tracking:**
FBST already has `Franchise` + `FranchiseMembership` — use `Franchise.id` as the permanent key. Team names are cosmetic per-season labels. Display: "Los Doyers (formerly: Dodger Dawgs, Blue Crew)".

**Record Categories to Track:**
- Season records: highest total score, most category wins, best single period
- All-time: most championships, most top-3, highest career avg score
- Draft: best surplus value, biggest steal, biggest bust
- Streaks: longest championship drought, most consecutive top-half finishes
- Milestones: "Los Doyers needs 2 more category titles to tie the all-time record"

**Display Pattern (League Legacy style):**
```
+----------------------------------------------+
| ALL-TIME RECORD: Home Runs (Single Period)   |
|  42 HR — Los Doyers (2024, Period 8)         |
|  Previous: 38 HR — Skunk Dogs (2023, P12)   |
+----------------------------------------------+
```

### Effort: Medium (1-2 sessions)

---

## Implementation Order

| Priority | Feature | Effort | Dependencies |
|----------|---------|--------|-------------|
| 1 | Local Timezone Display | Small | None |
| 2 | League Health Dashboard | Medium | Schema migration (lastLogin) |
| 3 | Monthly Awards | Medium | Standings data |
| 4 | Pre-Trade AI Advisor | Medium | Existing AI infrastructure |
| 5 | Historical Analytics & Trophy Case | Medium | Existing archive data |
| 6 | Sport-Agnostic Engine | Large | None (but foundational) |

Features 1-4 can be built in-season (immediate value). Feature 5 uses existing data. Feature 6 is foundational for 2027 expansion.

## Acceptance Criteria

### Local Timezone
- [ ] All times display in user's local timezone
- [ ] Countdown timers on Dashboard for waiver/trade deadlines
- [ ] Date-only strings use noon-UTC anchoring (timezone-safe)

### League Health
- [ ] Commissioner tab shows per-team engagement metrics
- [ ] Red/amber/green status badges based on engagement score
- [ ] `User.lastLogin` updated on each auth
- [ ] Sort by score ascending (at-risk teams first)

### Monthly Awards
- [ ] Awards computed at period close
- [ ] "Pickup of the Period" shows waiver claim value
- [ ] Displayed on Home page and in weekly digest
- [ ] Stored in AiInsight table (deduped by period)

### Pre-Trade AI
- [ ] "Analyze Before Proposing" button on trade form
- [ ] Shows fairness, category impact, surplus value, keeper flag
- [ ] Uses existing AI infrastructure (no new API costs)
- [ ] Response cached per trade combination

### Sport-Agnostic Engine
- [ ] SportConfig interface defined with all required fields
- [ ] Baseball config extracted from sportConfig.ts
- [ ] `getSportConfig()` registry function working
- [ ] League model has `sport` field
- [ ] Existing baseball functionality unchanged (Phase 1)

### Trophy Case
- [ ] Championship history from HistoricalStanding
- [ ] All-time leaderboard
- [ ] Category records across all seasons
- [ ] Dynasty score ranking

## Sources

- **Origin brainstorm:** [docs/brainstorms/2026-04-03-competitive-analysis-pricing-strategy-brainstorm.md](../brainstorms/2026-04-03-competitive-analysis-pricing-strategy-brainstorm.md) — engagement gaps vs Sleeper, seasonal pricing, AI differentiation
- **Timezone learning:** `docs/solutions/logic-errors/period-date-timezone-shift.md` — noon-UTC anchoring
- **Season year learning:** `docs/solutions/logic-errors/hardcoded-season-year-constants.md` — dynamic year calculation
- **Trade data learning:** `docs/solutions/logic-errors/trade-reversal-ghost-roster-double-counting.md` — date-aware roster queries
- **Existing AI:** `server/src/services/aiAnalysisService.ts` — analyzeTrade, generateLeagueDigest
- **Existing archive:** `server/src/features/archive/` — HistoricalSeason, HistoricalStanding models
- **Existing standings:** `server/src/features/standings/services/standingsService.ts` — category computation
