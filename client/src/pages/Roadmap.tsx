import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Zap,
  Layers,
  Sparkles,
  Activity,
  Rocket,
  Target,
  Calendar,
  TrendingUp,
  Users,
  BarChart3,
  Bell,
  Globe,
  Smartphone,
  Bot,
  Shield,
  FileText,
  Wifi,
  Download,
  PlayCircle,
  Trophy,
  DollarSign,
  Search,
  RefreshCw,
  Database,
} from "lucide-react";

/* ── Data ────────────────────────────────────────────────────────── */

const LAST_UPDATED = "April 5, 2026 (Session 57)";

// ─── Product Roadmap ───

interface RoadmapItem {
  title: string;
  description: string;
  icon: React.ElementType;
  effort: "Small" | "Medium" | "Large";
  status: "planned" | "in-progress" | "done";
  tags: string[];
}

interface RoadmapPhase {
  label: string;
  timeframe: string;
  color: string;
  borderColor: string;
  bgColor: string;
  icon: React.ElementType;
  items: RoadmapItem[];
}

const productRoadmap: RoadmapPhase[] = [
  {
    label: "In-Season 2026 — Engagement & Remote UX",
    timeframe: "April – September 2026",
    color: "text-emerald-400",
    borderColor: "border-emerald-500/30",
    bgColor: "bg-emerald-500/5",
    icon: Rocket,
    items: [
      {
        title: "In-App League Chat",
        description: "Real-time league chat with polls, reactions, GIF support, and commissioner pinned messages. Sleeper proved this is the #1 engagement driver — mid-season drop-off is the biggest killer of fantasy leagues.",
        icon: Users,
        effort: "Large",
        status: "done",
        tags: ["engagement", "ux"],
      },
      {
        title: "Push Notifications (Web + Mobile)",
        description: "Web Push API for PWA: trade proposals, waiver results, lineup lock reminders, injury alerts, commissioner announcements. Every competitor has this — our biggest gap for remote managers.",
        icon: Bell,
        effort: "Medium",
        status: "done",
        tags: ["notifications", "mobile"],
      },
      {
        title: "Local Timezone Display",
        description: "All times in user's local timezone via Intl.DateTimeFormat auto-detection. Countdown timers ('waiver closes in 3h 22m') instead of absolute times. Critical for multi-timezone leagues.",
        icon: Globe,
        effort: "Small",
        status: "done",
        tags: ["ux", "remote"],
      },
      {
        title: "FanGraphs Projection Import",
        description: "Import Steamer/ZiPS/ATC projection CSVs ($15/mo FanGraphs membership). Show projected stats on Players page, use in AI trade analysis and waiver advice. Best ROI data add — breaks even at 3 Pro users.",
        icon: TrendingUp,
        effort: "Medium",
        status: "planned",
        tags: ["data", "projections"],
      },
      {
        title: "Statcast Analytics Integration",
        description: "Exit velocity, barrel rate, xBA, xSLG, sprint speed on player profiles via Baseball Savant (free). Surface in PlayerDetailModal and AI insights for data-driven decisions.",
        icon: Zap,
        effort: "Medium",
        status: "planned",
        tags: ["data", "analytics"],
      },
      {
        title: "League Health Dashboard",
        description: "Commissioner view: last login per manager, lineup set rate, waiver activity, trade engagement. Proactively identify and re-engage managers dropping off mid-season.",
        icon: Activity,
        effort: "Small",
        status: "done",
        tags: ["commissioner", "engagement"],
      },
      {
        title: "Period Awards & Engagement Hooks",
        description: "Auto-generated 'Manager of the Period', 'Pickup of the Period', 'Category Kings'. Keeps mid-season engagement high. Displayed on Home page via PeriodAwardsCard.",
        icon: Sparkles,
        effort: "Small",
        status: "done",
        tags: ["engagement", "ai"],
      },
      {
        title: "Smart Deadline Warnings",
        description: "'Trade deadline in 48h — you have 2 pending proposals'. 'Waiver closes in 3h 22m'. Contextual banners on Dashboard, push notification triggers.",
        icon: Bell,
        effort: "Small",
        status: "done",
        tags: ["ux", "remote"],
      },
    ],
  },
  {
    label: "Paid APIs & Data Integrations",
    timeframe: "Summer 2026",
    color: "text-amber-400",
    borderColor: "border-amber-500/30",
    bgColor: "bg-amber-500/5",
    icon: Database,
    items: [
      {
        title: "FanGraphs Membership ($15/mo)",
        description: "Steamer, ZiPS, ATC, THE BAT projection CSVs. WAR, wRC+, FIP, park factors. No API — weekly CSV import. Breaks even with 3 Pro users at $29/season.",
        icon: TrendingUp,
        effort: "Medium",
        status: "planned",
        tags: ["data", "paid-api"],
      },
      {
        title: "Baseball Savant / Statcast (Free)",
        description: "Exit velo, barrel rate, xBA, xSLG, xwOBA, sprint speed. Free CSV export via pybaseball or direct download. No API — scraping is standard practice (pybaseball has 3K+ GitHub stars).",
        icon: Zap,
        effort: "Medium",
        status: "planned",
        tags: ["data", "free"],
      },
      {
        title: "X/Twitter Insider Feed ($10-30/mo)",
        description: "Breaking news from Passan, Rosenthal, Heyman via pay-per-use API ($0.01/tweet). Only pull baseball insiders. Much cheaper than $200/mo Basic tier. Breaks even with 5 Pro users.",
        icon: Globe,
        effort: "Medium",
        status: "planned",
        tags: ["data", "paid-api", "news"],
      },
      {
        title: "Yahoo Fantasy API (Free)",
        description: "League import/sync from Yahoo: settings, rosters, standings. Free with OAuth. Migration tool for Yahoo users to try FBST without rebuilding their league.",
        icon: Users,
        effort: "Medium",
        status: "planned",
        tags: ["data", "free", "growth"],
      },
    ],
  },
  {
    label: "Scoring & Format Expansion",
    timeframe: "Late 2026",
    color: "text-cyan-400",
    borderColor: "border-cyan-500/30",
    bgColor: "bg-cyan-500/5",
    icon: Target,
    items: [
      {
        title: "Head-to-Head Category Scoring",
        description: "Weekly H2H matchups with category wins (R, HR, RBI, SB, AVG vs W, SV, K, ERA, WHIP). Required for market expansion — roto-only limits us to ~30% of fantasy baseball players.",
        icon: Target,
        effort: "Large",
        status: "done",
        tags: ["scoring", "feature"],
      },
      {
        title: "Points-Based Scoring",
        description: "Configurable points per stat event. Standard alongside H2H and roto for full scoring flexibility. All major platforms support all three.",
        icon: BarChart3,
        effort: "Large",
        status: "done",
        tags: ["scoring", "feature"],
      },
      {
        title: "Snake Draft Mode",
        description: "Support snake draft alongside auction. Draft order management, pick trading, live draft board with auto-pick timer. Required for non-auction leagues.",
        icon: Target,
        effort: "Large",
        status: "done",
        tags: ["draft"],
      },
      {
        title: "Pre-Trade AI Advisor",
        description: "'Should I do this trade?' with projected category impact, surplus value analysis, and keeper implications. Extends existing post-trade analysis to pre-trade. Unique vs all competitors.",
        icon: Bot,
        effort: "Medium",
        status: "done",
        tags: ["ai", "trades"],
      },
      {
        title: "Conditional Waiver Claims",
        description: "'Claim X only if Y is unavailable'. 'Only pick up X if I also drop Z'. Requested on every platform but never built. True differentiator.",
        icon: Layers,
        effort: "Medium",
        status: "done",
        tags: ["waivers", "feature"],
      },
    ],
  },
  {
    label: "Monetization & Growth",
    timeframe: "2027 Season Launch",
    color: "text-pink-400",
    borderColor: "border-pink-500/30",
    bgColor: "bg-pink-500/5",
    icon: DollarSign,
    items: [
      {
        title: "Seasonal Pricing Model",
        description: "Free: full league hosting. Pro ($29/season): AI features, projections, Statcast, priority notifications. Commissioner ($49/season per league): league health dashboard, custom scoring, archive, announcement system.",
        icon: DollarSign,
        effort: "Medium",
        status: "done",
        tags: ["business", "saas"],
      },
      {
        title: "Stripe Payment Integration",
        description: "Stripe Checkout for seasonal subscriptions. Multi-currency for international users. Founding member lifetime deals ($99). Referral discounts.",
        icon: DollarSign,
        effort: "Medium",
        status: "planned",
        tags: ["business", "payments"],
      },
      {
        title: "SEO & Marketing",
        description: "Landing pages, blog content, social media. Target serious keeper/dynasty leagues first — they have highest willingness to pay ($93/yr avg on tools).",
        icon: Search,
        effort: "Medium",
        status: "planned",
        tags: ["growth", "marketing"],
      },
      {
        title: "Yahoo League Import",
        description: "One-click import of Yahoo league settings, rosters, and history. Lowers switching cost to zero. #1 growth lever for user acquisition.",
        icon: Users,
        effort: "Medium",
        status: "planned",
        tags: ["growth", "migration"],
      },
    ],
  },
  {
    label: "Platform Evolution",
    timeframe: "2027+",
    color: "text-purple-400",
    borderColor: "border-purple-500/30",
    bgColor: "bg-purple-500/5",
    icon: Trophy,
    items: [
      {
        title: "Fantasy Football (H2H)",
        description: "Head-to-head fantasy football: snake/auction drafts, weekly matchups, waiver wire, trades. Aug 2027 target. Leverage sport-agnostic engine.",
        icon: Target,
        effort: "Large",
        status: "planned",
        tags: ["football", "multi-sport"],
      },
      {
        title: "Sport-Agnostic Engine",
        description: "Phase 1 complete: SportConfig interface, baseball.ts extracted, getSportConfig() registry (server + client). Foundation for football, basketball, hockey.",
        icon: Layers,
        effort: "Large",
        status: "in-progress",
        tags: ["architecture", "saas"],
      },
      {
        title: "Multi-League Dashboard",
        description: "Franchise-level view: manage multiple leagues, compare rosters across leagues, unified transaction history.",
        icon: Layers,
        effort: "Large",
        status: "planned",
        tags: ["franchise", "saas"],
      },
      {
        title: "Historical Analytics & Trophy Case",
        description: "Multi-year owner analytics, draft tendencies, trade patterns. Season records, awards, cross-year performance tracking. Leverage 20+ years of archived data.",
        icon: TrendingUp,
        effort: "Large",
        status: "done",
        tags: ["archive", "ai"],
      },
      {
        title: "AI Commissioner Assistant",
        description: "AI-powered recommendations: fair trade evaluation, waiver priority suggestions, league health monitoring, automated rule enforcement.",
        icon: Sparkles,
        effort: "Large",
        status: "planned",
        tags: ["ai", "commissioner"],
      },
      {
        title: "March Madness & Pick'em",
        description: "NCAA bracket challenges, weekly pick'em across sports, confidence pools. Casual entry point for non-fantasy users.",
        icon: Trophy,
        effort: "Large",
        status: "planned",
        tags: ["multi-sport", "casual"],
      },
    ],
  },
];

// ─── Completed Features ───

interface CompletedFeature {
  title: string;
  description: string;
  session: string;
}

interface CompletedGroup {
  label: string;
  items: CompletedFeature[];
}

const completedFeatures: CompletedGroup[] = [
  {
    label: "Session 57 — League Board, Pricing, Sport Engine, Trophy Case, 10 Features",
    items: [
      { title: "League Board", description: "Card-based async communication: Commissioner announcements, Trade Block (auto-synced from rosters), Banter. Thread replies, thumbs up/down reactions.", session: "57" },
      { title: "Pricing Page", description: "Seasonal pricing: Free / Pro $29/season / Commissioner $49/season. Founding member lifetime deal ($99). FAQ.", session: "57" },
      { title: "Sport-Agnostic Engine Phase 1", description: "SportConfig interface, baseball.ts extracted, getSportConfig() registry. Foundation for football (Aug 2027) and basketball (Oct 2027).", session: "57" },
      { title: "Trophy Case", description: "Dynasty scores, championship history, all-time records from 20+ years of archived HistoricalStanding data.", session: "57" },
      { title: "Local Timezone Display", description: "timeUtils.ts: cached Intl.DateTimeFormat, three-tier display (countdown/relative/absolute), useCountdownSeconds hook.", session: "57" },
      { title: "League Health Dashboard", description: "Commissioner 'Health' tab: per-team engagement scoring (0-100), status badges, at-risk first sort.", session: "57" },
      { title: "Period Awards", description: "Manager of Period, Pickup of Period, Category Kings. PeriodAwardsCard on Home page.", session: "57" },
      { title: "Pre-Trade AI Advisor", description: "Enhanced /analyze with keeper detection, position scarcity, category impact. TradeAnalysisModal.", session: "57" },
      { title: "Concepts Lab", description: "Interactive prototype page at /concepts for testing new features before building.", session: "57" },
      { title: "Batch AI Insights", description: "POST /api/teams/ai-insights/generate-all for backfilling insights across all teams.", session: "57" },
      { title: "Smart Deadline Warnings", description: "Countdown pill banners on Dashboard: period end, next period, season end. Blue/amber/red urgency with live countdown.", session: "57" },
      { title: "Push Notifications", description: "Web Push API with VAPID keys. PushSubscription + NotificationPreference models. Wired into trades + waivers alongside email.", session: "57" },
      { title: "H2H Category Scoring", description: "ScoringEngine interface with Roto/H2HCategory/Points implementations. Round-robin matchup generation. Matchups tab on Season page.", session: "57" },
      { title: "Points-Based Scoring", description: "Configurable fantasy point weights. Default: R=1, HR=4, RBI=1, SB=2, W=7, SV=5, K=1.", session: "57" },
      { title: "Snake Draft Mode", description: "DraftBoard grid with WebSocket live picks. Auto-pick, pause/resume, On the Clock indicator.", session: "57" },
      { title: "In-App League Chat", description: "WebSocket chat with ChatPanel (slide-over desktop, full-screen mobile). Unread badges. System messages on trades/waivers.", session: "57" },
      { title: "Conditional Waiver Claims", description: "ONLY_IF_UNAVAILABLE / ONLY_IF_AVAILABLE / PAIR_WITH conditions. evaluateCondition() in processing. FAILED_CONDITION status.", session: "57" },
      { title: "Sport Engine Phase 2", description: "League.sport wired through API → LeagueContext → standings + auction. Foundation for football + basketball.", session: "57" },
      { title: "Rule Lock Tiers", description: "Season-phase rule enforcement. 10 waiver config fields. Padlock icons on locked commissioner settings.", session: "57" },
      { title: "User Profiles", description: "Public profiles with bio, experience, preferred formats, payment handles. Edit mode + public view.", session: "57" },
      { title: "League Invites + Public Leagues", description: "/join/:inviteCode page, PRIVATE/PUBLIC/OPEN visibility, Community Board with real listings.", session: "57" },
      { title: "7-Agent Code Review + P1 Fixes", description: "42 findings across TypeScript, Security, Performance, Architecture, Simplicity, Agent-Native reviewers. 5 P1 security fixes deployed.", session: "57" },
    ],
  },
  {
    label: "Session 56 — Watchlist & Trading Block, Email Notifications, ADA, 7-Agent Review",
    items: [
      { title: "Watchlist UI", description: "Private per-team watchlist: player search across 2,277 players, inline notes, tag toggles (trade-target, add-drop, monitor), PlayerDetailModal on name click.", session: "56" },
      { title: "Trading Block UI", description: "Public league-wide trading block: 'asking for' field, grouped by team in league view. /trading-block page + sidebar link. Ownership gating via myTeamId.", session: "56" },
      { title: "Email Notifications", description: "Trade proposed/processed/vetoed + waiver results via Resend. notifyTeamOwners() helper, sanitizeSubject() security, List-Unsubscribe header, fire-and-forget.", session: "56" },
      { title: "Weekly AAA Prospects Sync", description: "syncAAARosters() on Monday 14:00 UTC cron. Position overwrite bug fixed (no longer overwrites posPrimary on update). Admin manual trigger.", session: "56" },
      { title: "ADA Table Compliance", description: "scope='col' on all <th>, aria-label on all ThemedTable, aria-sort='none' on unsorted columns, caption prop, focus ring upgrade to --lg-accent.", session: "56" },
      { title: "Frozen First Column", description: "'frozen' prop on ThemedTh/ThemedTd: sticky left-0 with opaque bg + separator. --lg-table-sticky-col-bg design token (light + dark).", session: "56" },
      { title: "Shared Components", description: "PlayerFilterBar (~180 LOC deduped from Players + AddDropTab), PlayerNameCell, TeamNameLink. displayPos() centralized in playerDisplay.ts.", session: "56" },
      { title: "SW Cache Fix", description: "Production sw.js cached with max-age=1y immutable. Dedicated /sw.js route with no-cache headers. updateViaCache='none'. Bumped v2→v4.", session: "56" },
      { title: "7-Agent Code Review", description: "TypeScript, Security, Performance, Architecture, Simplicity, Agent-Native, Learnings. 18 findings, all 8 P2s resolved.", session: "56" },
      { title: "Test Fixes", description: "5 pre-existing client test failures fixed (findMyTeam mock, label updates). 486 server + 187 client = 673 tests, 0 failures.", session: "56" },
    ],
  },
  {
    label: "Session 55 — Daily Diamond, Table Standardization, Mobile Scroll Fix",
    items: [
      { title: "Daily Diamond Newspaper Layout", description: "Serif masthead, hero card with MLB highlight thumbnails, 60+ headline templates, On Deck section, pulse bar, 30 rotating editorial columns.", session: "55" },
      { title: "Table Density Standardization", description: "All tables use compact density from centralized table.tsx. Removed 40+ per-cell padding overrides.", session: "55" },
      { title: "Mobile Table Scroll Fix", description: "overflow-x-hidden → overflow-x-clip on AppShell. min-w-[600px] on ThemedTable. max-w-[100vw] on Players page.", session: "55" },
      { title: "Service Worker External URL Fix", description: "SW was intercepting all external URLs (MLB images, YouTube, Google Fonts). Added isSameOrigin guard.", session: "55" },
    ],
  },
  {
    label: "Session 51 (cont.) — Period Stats Fix, Data Audit, Security Review",
    items: [
      { title: "Period-to-Date Stats Fixed", description: "Daily stats path was showing 1 day instead of cumulative totals. Now requires 80% daily coverage before using daily path, falls back to PlayerStatsPeriod.", session: "51" },
      { title: "Period Tab Stats/Points Toggle", description: "Switch between raw stat values (R, HR, AVG, ERA, etc.) and roto points in the Period view. Stats mode sorts by stat value, Points mode shows roto allocation.", session: "51" },
      { title: "Weekly Insights Data-Backed", description: "AI now receives actual per-player stat lines. Players with 0 IP shown as 'HAS NOT PITCHED'. No more hallucinated performance claims.", session: "51" },
      { title: "Team Table Column Corrections", description: "Hitters: POS, PLAYER, TM, G, AB, R, HR, RBI, SB, AVG. Pitchers: removed SO. Standard baseball column order.", session: "51" },
      { title: "Security Review Fixes", description: "4 fixes: period-roster auth, DST bug in nextDayEffective, claim drop releasedAt filter, trade reverse effective dates.", session: "51" },
      { title: "Performance Review Fixes", description: "count→findFirst, batched upserts, deduplicated prevTeamStats computation.", session: "51" },
      { title: "YouTube Embed Fix", description: "Error 153 resolved: origin param, expanded CSP, non-embeddable videos filtered server-side.", session: "51" },
    ],
  },
  {
    label: "Session 51 — Stats Attribution, Railway Migration, Marketing Site",
    items: [
      { title: "Date-Aware Stats Attribution", description: "PlayerStatsDaily model, nextDayEffective() utility, dual-path aggregation. Mid-period trades/drops correctly split stats between teams.", session: "51" },
      { title: "Weekly Insights Overhaul", description: "Player-focused: Hot Bats, Pitching, Roster Alert. Comparative grading relative to rivals. 'Week of 3/30' labels, 'Updated Every Monday'.", session: "51" },
      { title: "Railway Migration", description: "Moved from Render to Railway ($5/mo). Always-on containers, no cold starts, WebSocket support, native cron.", session: "51" },
      { title: "Marketing Site Separation", description: "www.thefantasticleagues.com on Astro + Tina.io (GitHub Pages). app.thefantasticleagues.com on Railway. Two repos, two hosts.", session: "51" },
      { title: "DNS Migration to Cloudflare", description: "Full DNS control. Apex + www → GitHub Pages, app → Railway. No more Squarespace proxy interference.", session: "51" },
      { title: "Period Roster View", description: "Team page period selector shows all players who were on the team during a period, including traded/dropped with status badges.", session: "51" },
      { title: "Activity Tabs Reorder", description: "Waivers > Add/Drop > Trades > History. Default tab: Waivers.", session: "51" },
      { title: "Trade Asset Types", description: "FUTURE_BUDGET (deferred budget on draft transition) and WAIVER_PRIORITY (override swap) with full server + client processing.", session: "50-51" },
    ],
  },
  {
    label: "Session 33 — Production Deploy & Hardening",
    items: [
      { title: "Production Deployment", description: "Render config overhauled: production domain, VITE_* build-time vars, Node 20 pinned, 60s graceful shutdown.", session: "33" },
      { title: "CSP Hardening", description: "Scoped wss: to wss://*.supabase.co. Added PostHog domains. Removed stale fbst-api.onrender.com.", session: "33" },
      { title: "HSTS Header", description: "Strict-Transport-Security (1 year, includeSubDomains) via helmet.", session: "33" },
      { title: "Static Asset Caching", description: "maxAge 1 year + immutable on Vite-hashed assets via express.static.", session: "33" },
      { title: "Auction Retrospective", description: "Post-draft analytics endpoint + DraftReport component: bargains, overpays, position spending, team efficiency.", session: "33" },
      { title: "6-Agent Code Review", description: "Security, architecture, simplicity, learnings review. All P2/P3 findings resolved.", session: "33" },
    ],
  },
  {
    label: "Session 32 — Reliability & AI",
    items: [
      { title: "React Error Boundaries", description: "Root + feature-level (Auction, Commissioner) boundaries with friendly error card, retry button, PostHog crash reporting.", session: "32" },
      { title: "Offline/Reconnect Indicator", description: "Amber 'Reconnecting...' banner on WS disconnect. Auto-reconnect with exponential backoff (1s→15s). Polling safety net.", session: "32" },
      { title: "PostHog Analytics Enhancement", description: "18 tracked events across auth, auction, trades, waivers, keepers, and error boundaries.", session: "32" },
      { title: "Mobile Auction Testing & Fix", description: "Tested 390x844 viewport. Fixed AppShell overflow causing right-edge clipping. All auction controls verified.", session: "32" },
      { title: "Table Density System", description: "3-tier density (compact/default/comfortable), SortableHeader, zebra striping, semantic value tokens.", session: "37" },
      { title: "AI Insights Fixes", description: "Fixed trade analyzer middleware (req.body), weekly insights missing teamId, user team lookup on AIHub.", session: "37" },
      { title: "Code Quality Sweep", description: "splitTwoWayStats() extraction, mlbGetJson<T> generics, enrichedPlayers rosterFingerprint.", session: "37" },
      { title: "Security: User PII Fix", description: "GET /leagues/:id was exposing full User model (passwordHash, resetToken, isAdmin). Now returns only safe fields.", session: "37" },
      { title: "5-Agent Code Review", description: "Security sentinel, performance oracle, architecture strategist, TypeScript reviewer, simplicity reviewer — 12 findings, 1 critical fixed.", session: "37" },
      { title: "AI Post-Draft Grade", description: "AI grades each team's draft A-F with reasoning. Considers value, budget management, balance, bargain hunting.", session: "32" },
      { title: "AI Trade Analyzer", description: "Evaluates trade fairness, identifies winner, provides analysis and recommendation via POST /api/trades/analyze.", session: "32" },
      { title: "AI Keeper Recommender", description: "Ranks all players by keeper value with reasoning. Considers cost, position scarcity, budget impact.", session: "32" },
      { title: "AI Waiver Bid Advisor", description: "Suggests FAAB bid amount with confidence level. Considers player quality, position need, budget.", session: "32" },
      { title: "AI Weekly Insights", description: "3-5 actionable insights per team across roster, standings, budget, pitching, hitting categories.", session: "32" },
      { title: "AI Auction Draft Advisor", description: "Real-time 'Should I bid?' recommendation with max bid, reasoning, and confidence level.", session: "32" },
      { title: "AUC-10: Pre-Draft Rankings", description: "CSV upload/paste in Settings. Private 'My Rank' column in Player Pool. localStorage per league.", session: "32" },
      { title: "AUC-11: Trade Block", description: "Toggle players as tradeable on AuctionComplete. Visible to all teams on Team page. DB-backed.", session: "32" },
      { title: "Commissioner Reorg", description: "6→5 tabs: League, Members, Teams, Season, Trades. All functionality preserved.", session: "32" },
      { title: "PWA Installable App", description: "manifest.json + service worker. Network-first caching. Installable on phone home screen.", session: "32" },
      { title: "Browser Push Notifications", description: "Your turn / Outbid / Won notifications. Web Notifications API with Settings toggle.", session: "32" },
      { title: "SS/MI Position Fix", description: "Server was double-counting eligible roster slots. Now uses assigned position for accurate counts.", session: "32" },
      { title: "Code Quality Polish", description: "ErrorBoundary cleanup: no unused fallback prop, single error state, design tokens on reconnect banner.", session: "32" },
      { title: "Live Standings Dashboard", description: "Real-time standings powered by PlayerStatsPeriod. Period-over-period trends with category breakdowns.", session: "24" },
      { title: "Automated Stats Sync", description: "Two daily cron jobs: player roster sync (12:00 UTC) and stats sync (13:00 UTC). Zero manual intervention.", session: "24" },
      { title: "Waiver Claim Workflow", description: "Full FAAB waiver system: submit claims with bid amount, priority ordering, commissioner processing, cancel with audit trail.", session: "13" },
    ],
  },
  {
    label: "Session 31 (19 PRs merged)",
    items: [
      { title: "Personalized My Val", description: "Roster-aware player valuation with 4 factors: position need, budget pressure, scarcity, market pressure.", session: "31" },
      { title: "Val Column Colors & Tooltips", description: "Green for bargains, red for overpay. Hover tooltips show base vs adjusted value breakdown.", session: "31" },
      { title: "Public Guide Pages", description: "Guide pages accessible without login. Default league filter improvements.", session: "31" },
      { title: "Market Pressure Factor", description: "League-wide budget/spots ratio adjusts all My Val values dynamically.", session: "31" },
      { title: "Multi-User Test Script", description: "Automated test script for validating My Val across multiple users.", session: "31" },
      { title: "Resource Page Audit", description: "Cleanup and audit of resource pages.", session: "31" },
      { title: "Position Needs Matrix", description: "Compact grid in Teams tab showing filled/limit per position per team.", session: "31" },
      { title: "Nomination Timer Countdown", description: "Visible 30s countdown during nominating phase, pulses red at <10s.", session: "31" },
      { title: "'Going Once, Going Twice, SOLD!' Visual", description: "Escalating visual at 5s/3s/1s with amber/red/bounce sequence and red glow border.", session: "31" },
      { title: "Keeper Cost Preview", description: "Shows next year keeper cost ($bid+5) when you're the high bidder.", session: "31" },
      { title: "MLB-Powered Home Page", description: "Live MLB scores, transactions, date navigation, dashboard cards.", session: "31" },
      { title: "About Page", description: "Product overview, features list, commissioner tools breakdown.", session: "31" },
      { title: "Guide Split into 3 Pages", description: "Account, Auction, FAQ with Playwright screenshots in light/dark mode.", session: "31" },
      { title: "Auction Settings Panel", description: "6 per-user toggles for sounds, chat, pace tracker, values, keeper cost, sold animation.", session: "31" },
      { title: "Auction Excel Export", description: "Download draft results as Excel on auction completion screen.", session: "31" },
      { title: "Commissioner Roster Release", description: "Release button in RosterGrid for commissioner player management.", session: "31" },
      { title: "Sidebar Overhaul", description: "Collapse/expand caret, condensed from 6 to 4 sections.", session: "31" },
      { title: "MCP Phases 7-8", description: "21 integration tests, full README documentation for MLB Data Proxy.", session: "31" },
      { title: "CI Pipeline Fix", description: "Fixed Supabase placeholder env vars for GitHub Actions CI (PRs #58-59).", session: "31" },
      { title: "Code Review Fixes", description: "5 P1 + 9 P2 fixes: proxy bid auth bypass, unbounded chat, type safety, useCallback.", session: "31" },
    ],
  },
  {
    label: "Auction Features (Session 29-30)",
    items: [
      { title: "Nominator Sets Opening Bid", description: "Inline $ picker on nomination — nominator chooses starting bid (default $1). Auto-nominations from queue still use $1.", session: "30" },
      { title: "Watchlist / Favorites", description: "Star icon on every player row with filtered view. Persisted per league in localStorage.", session: "30" },
      { title: "Chat / Trash Talk", description: "Real-time chat via WebSocket. Rate-limited (5 msgs/10s), 500 char max, ephemeral.", session: "30" },
      { title: "Sound Effects & Notifications", description: "Web Audio API oscillator tones — nomination ding, outbid alert, your-turn sweep, win arpeggio. Mute toggle. Zero deps.", session: "30" },
      { title: "Value Over Replacement", description: "Val column shows $dollar_value. Surplus display (value - current bid) with green/red color coding.", session: "30" },
      { title: "Spending Pace Tracker", description: "League summary bar, per-team budget progress bars, avg cost, hot/cold icons at +/-25% of league avg.", session: "30" },
      { title: "Proxy Bids & Force Assign", description: "Commissioner can proxy bid for absent owners and force-assign players to teams.", session: "29" },
      { title: "Configurable Timers", description: "Bid and nomination timers configurable by commissioner. Decline/pass support.", session: "29" },
      { title: "Queue Reorder & UX Polish", description: "Drag-to-reorder nomination queue, reset clarity improvements, spacing refinements.", session: "29" },
    ],
  },
  {
    label: "Season Management (Sessions 17-20)",
    items: [
      { title: "Season Lifecycle", description: "Full season state machine: SETUP -> DRAFT -> IN_SEASON -> COMPLETED with auto-transitions.", session: "18" },
      { title: "Feature Gating", description: "useSeasonGating() hook + requireSeasonStatus middleware. Auction requires DRAFT, trades require IN_SEASON.", session: "18-20" },
      { title: "Franchise Schema", description: "Org-level Franchise + FranchiseMembership models as parent above League.", session: "17" },
      { title: "Keeper Prep Workflow", description: "Full keeper selection flow: populate, status, roster view, save, lock/unlock.", session: "19" },
    ],
  },
  {
    label: "Core Platform (Sessions 1-16)",
    items: [
      { title: "Live Standings", description: "Period/season standings computed live from PlayerStatsPeriod. All 30 MLB teams synced.", session: "24" },
      { title: "Archive Import", description: "Excel import + sync for historical seasons. 20+ years of league data.", session: "14" },
      { title: "Trade System", description: "Trade proposals, voting, commissioner processing with roster + budget impact.", session: "10" },
      { title: "Commissioner Tools", description: "Roster lock, trade processing, waiver processing, league settings, team management.", session: "12" },
      { title: "Player Search & Detail", description: "Full player search with stats, fielding data, and detail modals.", session: "8" },
      { title: "MCP MLB Data Proxy", description: "8-tool MCP server with SQLite cache, circuit breaker, rate limiter for MLB Stats API.", session: "25" },
      { title: "Docs & Guide Pages", description: "In-app documentation, league guide, and tech overview pages.", session: "30" },
    ],
  },
];

/* ── Helpers ──────────────────────────────────────────────────────── */

function effortBadge(effort: string) {
  const colors: Record<string, string> = {
    Small: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    Medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    Large: "bg-red-500/10 text-red-400 border-red-500/20",
  };
  return (
    <span
      className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border ${colors[effort] ?? ""}`}
    >
      {effort}
    </span>
  );
}

/* ── Sub-Components ──────────────────────────────────────────────── */

function ProductRoadmapSection() {
  const [expandedPhase, setExpandedPhase] = useState<number | null>(0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Rocket className="w-5 h-5 text-[var(--lg-accent)]" />
        <h2 className="text-lg font-semibold text-[var(--lg-text-primary)]">
          Product Roadmap
        </h2>
      </div>
      <p className="text-sm text-[var(--lg-text-secondary)]">
        Where we're headed — from this week's live auction through the 2026 season and beyond.
      </p>

      <div className="space-y-3">
        {productRoadmap.map((phase, phaseIdx) => {
          const isOpen = expandedPhase === phaseIdx;
          const PhaseIcon = phase.icon;
          const totalCount = phase.items.length;
          const inProgressCount = phase.items.filter(i => i.status === "in-progress").length;

          return (
            <div
              key={phase.label}
              className={`rounded-lg border ${phase.borderColor} ${phase.bgColor} overflow-hidden`}
            >
              <button
                onClick={() => setExpandedPhase(isOpen ? null : phaseIdx)}
                className="w-full px-5 py-4 flex items-center gap-3 text-left hover:opacity-90 transition-opacity"
              >
                <PhaseIcon className={`w-5 h-5 ${phase.color} shrink-0`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <h3 className={`text-sm font-semibold ${phase.color}`}>
                      {phase.label}
                    </h3>
                    <span className="text-xs text-[var(--lg-text-muted)]">
                      {phase.timeframe}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-[var(--lg-text-muted)] tabular-nums">
                      {totalCount} items
                    </span>
                    {inProgressCount > 0 && (
                      <span className="text-[10px] font-semibold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                        {inProgressCount} active
                      </span>
                    )}
                  </div>
                </div>
                {isOpen ? (
                  <ChevronUp className="w-5 h-5 text-[var(--lg-text-muted)]" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-[var(--lg-text-muted)]" />
                )}
              </button>

              {isOpen && (
                <div className="px-4 pb-4 space-y-2">
                  {phase.items.map((item) => {
                    const ItemIcon = item.icon;
                    return (
                      <div
                        key={item.title}
                        className="rounded-lg border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] p-4"
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5">
                            {item.status === "done" ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            ) : item.status === "in-progress" ? (
                              <Activity className="w-4 h-4 text-amber-400" />
                            ) : (
                              <Circle className="w-4 h-4 text-[var(--lg-text-muted)]" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <h4 className="text-sm font-semibold text-[var(--lg-text-primary)]">
                                {item.title}
                              </h4>
                              {item.status === "in-progress" && (
                                <span className="text-[10px] font-semibold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                                  In Progress
                                </span>
                              )}
                              {effortBadge(item.effort)}
                            </div>
                            <p className="text-sm text-[var(--lg-text-secondary)] leading-relaxed mb-2">
                              {item.description}
                            </p>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {item.tags.map((tag) => (
                                <span
                                  key={tag}
                                  className="text-[10px] text-[var(--lg-text-muted)] bg-[var(--lg-tint)] px-1.5 py-0.5 rounded"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>
                          <ItemIcon className="w-4 h-4 text-[var(--lg-text-muted)] shrink-0 mt-0.5" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CompletedFeaturesSection() {
  const [open, setOpen] = useState(false);
  const totalCompleted = completedFeatures.reduce((s, g) => s + g.items.length, 0);

  return (
    <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-5 py-4 flex items-center gap-3 text-left hover:opacity-90 transition-opacity"
      >
        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-[var(--lg-text-primary)]">
            Completed Features
          </h2>
          <p className="text-xs text-[var(--lg-text-muted)]">
            {totalCompleted} features shipped across 34 sessions
          </p>
        </div>
        {open ? (
          <ChevronUp className="w-5 h-5 text-[var(--lg-text-muted)]" />
        ) : (
          <ChevronDown className="w-5 h-5 text-[var(--lg-text-muted)]" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4">
          {completedFeatures.map((group) => (
            <div
              key={group.label}
              className="rounded-lg border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] p-4"
            >
              <div className="flex items-baseline gap-2 mb-3">
                <h3 className="text-sm font-semibold text-[var(--lg-text-primary)]">
                  {group.label}
                </h3>
                <span className="text-xs text-emerald-500 tabular-nums">
                  {group.items.length} shipped
                </span>
              </div>
              <div className="space-y-2">
                {group.items.map((item) => (
                  <div key={item.title} className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-sm font-medium text-[var(--lg-text-primary)]">
                          {item.title}
                        </span>
                        <span className="text-[10px] text-[var(--lg-text-muted)] tabular-nums">
                          Session {item.session}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--lg-text-secondary)] leading-relaxed mt-0.5">
                        {item.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Main Page ───────────────────────────────────────────────────── */

export default function Roadmap() {
  const plannedCount = productRoadmap.reduce(
    (sum, phase) => sum + phase.items.filter(i => i.status !== "done").length,
    0
  );
  const completedCount = completedFeatures.reduce((s, g) => s + g.items.length, 0);

  return (
    <div className="px-4 py-6 md:px-6 md:py-10 max-w-5xl mx-auto space-y-10">
      {/* Header */}
      <div>
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-semibold text-[var(--lg-text-primary)]">
            Roadmap
          </h1>
          <Link
            to="/tech"
            className="text-xs font-medium text-[var(--lg-accent)] hover:underline flex items-center gap-1"
          >
            Under the Hood <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <p className="mt-2 text-sm text-[var(--lg-text-secondary)]">
          What we're building next — and what we've already shipped.
        </p>
        <p className="mt-1 text-xs text-[var(--lg-text-muted)]">
          Last updated: {LAST_UPDATED}
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] p-4 text-center">
          <div className="text-2xl font-semibold text-[var(--lg-accent)] tabular-nums">
            {plannedCount}
          </div>
          <div className="text-xs text-[var(--lg-text-muted)] font-medium uppercase mt-1">
            Planned
          </div>
        </div>
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 text-center">
          <div className="text-2xl font-semibold text-emerald-500 tabular-nums">
            {completedCount}
          </div>
          <div className="text-xs text-[var(--lg-text-muted)] font-medium uppercase mt-1">
            Shipped
          </div>
        </div>
      </div>

      {/* Product Roadmap */}
      <ProductRoadmapSection />

      {/* Completed Features */}
      <CompletedFeaturesSection />

      {/* Footer */}
      <p className="text-xs text-[var(--lg-text-muted)] text-center pb-4">
        <Link to="/tech" className="text-[var(--lg-accent)] hover:underline">
          Under the Hood
        </Link>{" "}
        — project health, test coverage, and architecture details
      </p>
    </div>
  );
}
