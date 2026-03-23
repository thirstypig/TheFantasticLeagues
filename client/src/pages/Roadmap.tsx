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
} from "lucide-react";

/* ── Data ────────────────────────────────────────────────────────── */

const LAST_UPDATED = "March 23, 2026 (Session 37)";

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
    label: "Short Term",
    timeframe: "Now – April 2026",
    color: "text-emerald-400",
    borderColor: "border-emerald-500/30",
    bgColor: "bg-emerald-500/5",
    icon: Rocket,
    items: [
      {
        title: "Live Auction Draft (Mar 22)",
        description: "First live auction draft completed. Fixed API routing (49 hardcoded paths), player name display, force-assign availability, position dropdowns (MI/CI), Ohtani stats split, and position matrix colors.",
        icon: Target,
        effort: "Large",
        status: "done",
        tags: ["auction", "milestone"],
      },
      {
        title: "Position Eligibility Refresh",
        description: "Synced position eligibility from MLB fielding stats. 199 players updated with multi-position eligibility (20+ GP threshold, configurable per league).",
        icon: RefreshCw,
        effort: "Medium",
        status: "done",
        tags: ["players", "data"],
      },
      {
        title: "AAA Prospect Sync",
        description: "622 Triple-A prospects added to player pool. Maps AAA teams to MLB parent orgs via parentOrgId. Total players: 2,274.",
        icon: Users,
        effort: "Medium",
        status: "done",
        tags: ["players", "data"],
      },
      {
        title: "AI Insights Hub",
        description: "New /ai page showing all 9 AI features (draft grades, trade analysis, keeper recs, waiver advice, weekly insights) with Available/Locked states.",
        icon: Bot,
        effort: "Medium",
        status: "done",
        tags: ["ai", "ux"],
      },
      {
        title: "Sidebar Nav Condensed",
        description: "Collapsible nav sections, season-gated items, Cmd+B keyboard shortcut, accessibility improvements (aria-current, Escape key).",
        icon: Layers,
        effort: "Small",
        status: "done",
        tags: ["ux"],
      },
      {
        title: "Production Deployment",
        description: "Deploy all changes to Render. CSP hardened, HSTS enabled, static caching, Node 20 pinned, graceful shutdown aligned.",
        icon: Globe,
        effort: "Small",
        status: "done",
        tags: ["infrastructure"],
      },
      {
        title: "Modern Table Redesign",
        description: "3-tier density system (compact/default/comfortable), SortableHeader component, zebra striping, semantic value tokens. Applied to Players, StatsTables, AuctionValues.",
        icon: Layers,
        effort: "Large",
        status: "in-progress",
        tags: ["ux", "tables"],
      },
      {
        title: "Player News Feed",
        description: "Per-player news from RotoWire RSS + ESPN undocumented API + MLB transactions. Unified timeline in PlayerDetailModal.",
        icon: Bell,
        effort: "Medium",
        status: "planned",
        tags: ["players", "data"],
      },
    ],
  },
  {
    label: "Medium Term",
    timeframe: "April – June 2026 (In-Season)",
    color: "text-amber-400",
    borderColor: "border-amber-500/30",
    bgColor: "bg-amber-500/5",
    icon: TrendingUp,
    items: [
      {
        title: "Live Standings Dashboard",
        description: "Real-time standings powered by automated MLB stats sync. Period-over-period trends, category breakdowns, playoff race tracker.",
        icon: BarChart3,
        effort: "Medium",
        status: "done",
        tags: ["standings", "feature"],
      },
      {
        title: "Automated Stats Sync",
        description: "Scheduled daily sync of MLB stats during the season via cron job. Auto-compute period standings. Zero manual intervention.",
        icon: Activity,
        effort: "Medium",
        status: "done",
        tags: ["automation"],
      },
      {
        title: "Trade Analysis & Projections",
        description: "Show projected standings impact before proposing a trade. Category-level gains/losses for both sides. Leverage AI analysis.",
        icon: TrendingUp,
        effort: "Large",
        status: "planned",
        tags: ["trades", "ai"],
      },
      {
        title: "Notification System",
        description: "Email and/or in-app notifications for: trade proposals, waiver results, period rollovers, commissioner announcements.",
        icon: Bell,
        effort: "Medium",
        status: "planned",
        tags: ["notifications"],
      },
      {
        title: "Waiver Claim Workflow",
        description: "Full FAAB waiver UI for owners: submit claims with priority + bid amount, view pending claims, get results after processing.",
        icon: Users,
        effort: "Medium",
        status: "done",
        tags: ["waivers"],
      },
      {
        title: "PostHog Analytics",
        description: "18 tracked events: auth, auction (bid/nominate/chat/proxy/reconnect), trades, waivers, keepers, errors. SPA pageviews + identity.",
        icon: BarChart3,
        effort: "Small",
        status: "done",
        tags: ["analytics"],
      },
    ],
  },
  {
    label: "Auction Enhancements",
    timeframe: "Post-Draft Backlog",
    color: "text-violet-400",
    borderColor: "border-violet-500/30",
    bgColor: "bg-violet-500/5",
    icon: Target,
    items: [
      {
        title: "Position Needs Matrix",
        description: "Grid showing each team's filled/open positions in Team List tab. Reveals who needs the current player most.",
        icon: Layers,
        effort: "Medium",
        status: "done",
        tags: ["auction", "strategy"],
      },
      {
        title: "Nomination Timer Countdown",
        description: "Visible 30s countdown during nominating phase, pulses red at <10s.",
        icon: Activity,
        effort: "Small",
        status: "done",
        tags: ["auction", "ux"],
      },
      {
        title: "'Going Once, Going Twice' Visual",
        description: "Escalating visual at 5s/3s/1s — 'Going once' (amber), 'Going twice' (red), 'SOLD!' (bounce). Red glow border on nominee card.",
        icon: Sparkles,
        effort: "Medium",
        status: "done",
        tags: ["auction", "ux"],
      },
      {
        title: "Pre-Draft Rankings Import",
        description: "Owners upload personal player rankings (CSV) as a private column in Player Pool for reference during bidding.",
        icon: BarChart3,
        effort: "Medium",
        status: "done",
        tags: ["auction"],
      },
      {
        title: "Post-Auction Trade Block",
        description: "Immediately after draft, owners flag players they'd be willing to trade. Jump-starts the trade market.",
        icon: Users,
        effort: "Small",
        status: "done",
        tags: ["auction", "trades"],
      },
      {
        title: "Keeper Cost Preview",
        description: "Shows 'Keeper next year: $bid+5' when you're the high bidder during live auction.",
        icon: TrendingUp,
        effort: "Small",
        status: "done",
        tags: ["auction", "keeper"],
      },
    ],
  },
  {
    label: "AI Features",
    timeframe: "Post-Auction — AI-Powered Intelligence",
    color: "text-pink-400",
    borderColor: "border-pink-500/30",
    bgColor: "bg-pink-500/5",
    icon: Bot,
    items: [
      {
        title: "Post-Draft Grade",
        description: "AI grades each team's draft (A-F) with reasoning. Considers value efficiency, budget management, roster balance, bargain hunting.",
        icon: Bot,
        effort: "Small",
        status: "done",
        tags: ["ai", "auction"],
      },
      {
        title: "Auction Draft Advisor",
        description: "'Should I bid?' recommendation based on budget, roster needs, position scarcity, and league context. Real-time during auction.",
        icon: Bot,
        effort: "Medium",
        status: "done",
        tags: ["ai", "auction"],
      },
      {
        title: "Trade Analyzer",
        description: "'Is this trade fair?' — evaluates fairness (fair/slightly_unfair/unfair), identifies winner, provides analysis and recommendation.",
        icon: Bot,
        effort: "Medium",
        status: "done",
        tags: ["ai", "trades"],
      },
      {
        title: "Keeper Recommender",
        description: "'Which players should I keep?' — ranks all roster players by keeper value considering cost, position scarcity, and budget impact.",
        icon: Bot,
        effort: "Small",
        status: "done",
        tags: ["ai", "keeper"],
      },
      {
        title: "Waiver Bid Advisor",
        description: "Suggests FAAB bid amount with confidence level based on player quality, position need, and budget preservation.",
        icon: Bot,
        effort: "Small",
        status: "done",
        tags: ["ai", "waivers"],
      },
      {
        title: "Weekly AI Insights",
        description: "3-5 actionable insights per team: roster, standings, budget, pitching, hitting categories with an overall letter grade.",
        icon: Bot,
        effort: "Medium",
        status: "done",
        tags: ["ai", "analytics"],
      },
    ],
  },
  {
    label: "Platform Quality",
    timeframe: "Pre-Season & Ongoing",
    color: "text-cyan-400",
    borderColor: "border-cyan-500/30",
    bgColor: "bg-cyan-500/5",
    icon: Shield,
    items: [
      {
        title: "Mobile Auction Testing",
        description: "Tested on 390x844 viewport. Fixed AppShell mobile overflow. Stacked layout verified with all controls accessible.",
        icon: Smartphone,
        effort: "Small",
        status: "done",
        tags: ["mobile", "testing"],
      },
      {
        title: "Offline / Reconnect Indicator",
        description: "Amber 'Reconnecting...' banner on WebSocket disconnect. Auto-reconnect with exponential backoff. Polling as safety net.",
        icon: Wifi,
        effort: "Small",
        status: "done",
        tags: ["ux", "reliability"],
      },
      {
        title: "React Error Boundaries",
        description: "Root + feature-level boundaries (Auction, Commissioner). Friendly error card with retry button. PostHog crash tracking.",
        icon: Shield,
        effort: "Small",
        status: "done",
        tags: ["reliability"],
      },
      {
        title: "Browser Push Notifications",
        description: "Web Notifications for 'your turn', 'outbid', and 'you won'. Toggle in Settings. Auto-close after 5s.",
        icon: Bell,
        effort: "Medium",
        status: "done",
        tags: ["notifications", "ux"],
      },
      {
        title: "PWA (Installable App)",
        description: "manifest.json + service worker. Network-first caching. Installable on phone home screen. Dark theme.",
        icon: Download,
        effort: "Medium",
        status: "done",
        tags: ["mobile", "pwa"],
      },
      {
        title: "Auction Replay",
        description: "Lot-by-lot playback with play/pause, skip, speed control (1x/2x/4x). Player headshots, bid timeline, scrubber bar.",
        icon: PlayCircle,
        effort: "Medium",
        status: "done",
        tags: ["auction", "feature"],
      },
      {
        title: "Bid History Visualization",
        description: "Per-lot bid escalation with CSS bar charts. Search/sort, team color legend, expandable lot cards, summary stats.",
        icon: BarChart3,
        effort: "Medium",
        status: "done",
        tags: ["auction", "analytics"],
      },
      {
        title: "Code Quality Polish",
        description: "Removed unused ErrorBoundary fallback prop, design tokens for reconnect banner, simplified ErrorBoundary to single error state.",
        icon: FileText,
        effort: "Small",
        status: "done",
        tags: ["quality", "cleanup"],
      },
    ],
  },
  {
    label: "SaaS Phase 1 — Baseball Platform",
    timeframe: "Summer 2026 (Post-Season Launch)",
    color: "text-blue-400",
    borderColor: "border-blue-500/30",
    bgColor: "bg-blue-500/5",
    icon: Rocket,
    items: [
      {
        title: "Multi-League Support",
        description: "Full franchise-level dashboard: manage multiple leagues from one view, compare rosters across leagues, unified transaction history.",
        icon: Layers,
        effort: "Large",
        status: "planned",
        tags: ["franchise", "saas"],
      },
      {
        title: "Snake Draft Mode",
        description: "Support snake draft format alongside auction. Draft order management, pick trading, live draft board with auto-pick timer.",
        icon: Target,
        effort: "Large",
        status: "planned",
        tags: ["draft"],
      },
      {
        title: "Public League Directory & Self-Service Onboarding",
        description: "Commissioners create leagues publicly. Join via invite code or discovery. Self-service signup, league creation, and team management.",
        icon: Globe,
        effort: "Large",
        status: "planned",
        tags: ["growth", "saas"],
      },
      {
        title: "Mobile-Responsive Redesign",
        description: "Full mobile experience for auction bidding, standings checking, and trade management on phones.",
        icon: Smartphone,
        effort: "Large",
        status: "planned",
        tags: ["mobile", "design"],
      },
      {
        title: "Historical Analytics & Trends",
        description: "Multi-year owner analytics: draft tendencies, trade patterns, winning strategies. Leverage 20+ years of archived league data.",
        icon: TrendingUp,
        effort: "Large",
        status: "planned",
        tags: ["archive", "ai"],
      },
      {
        title: "AI Commissioner Assistant",
        description: "AI-powered recommendations for commissioners: fair trade evaluation, waiver priority suggestions, league health monitoring.",
        icon: Sparkles,
        effort: "Large",
        status: "planned",
        tags: ["ai", "commissioner"],
      },
      {
        title: "SEO & Marketing",
        description: "Search engine optimization for organic discovery. Landing pages, blog content, social media presence. Target fantasy baseball community.",
        icon: Search,
        effort: "Medium",
        status: "planned",
        tags: ["growth", "marketing"],
      },
    ],
  },
  {
    label: "SaaS Phase 2 — Multi-Sport Expansion",
    timeframe: "2027+ (Platform Evolution)",
    color: "text-purple-400",
    borderColor: "border-purple-500/30",
    bgColor: "bg-purple-500/5",
    icon: Trophy,
    items: [
      {
        title: "Fantasy Football (Head-to-Head)",
        description: "Head-to-head fantasy football with weekly matchups, snake/auction drafts, waiver wire, and trade system. Compete with Yahoo Fantasy.",
        icon: Target,
        effort: "Large",
        status: "planned",
        tags: ["football", "multi-sport"],
      },
      {
        title: "March Madness Brackets",
        description: "NCAA tournament bracket challenges. Group pools, scoring rules, live bracket updates, upset tracking.",
        icon: Trophy,
        effort: "Large",
        status: "planned",
        tags: ["basketball", "multi-sport"],
      },
      {
        title: "Pick'em Games",
        description: "Weekly pick'em contests across sports — straight picks, spreads, confidence pools. Season-long leaderboards.",
        icon: BarChart3,
        effort: "Medium",
        status: "planned",
        tags: ["pick-em", "multi-sport"],
      },
      {
        title: "Game Calculators & Scoreboards",
        description: "Live game calculators, scoring tools, and interactive scoreboards. Real-time stats dashboards across sports.",
        icon: Activity,
        effort: "Medium",
        status: "planned",
        tags: ["tools", "multi-sport"],
      },
      {
        title: "SaaS Pricing & Monetization",
        description: "Tiered pricing model: free tier (basic leagues), premium (AI features, analytics, priority support), enterprise (custom branding, API access).",
        icon: DollarSign,
        effort: "Medium",
        status: "planned",
        tags: ["business", "saas"],
      },
      {
        title: "Sport-Agnostic Engine",
        description: "Abstract the core engine (drafts, rosters, trades, standings, scoring) to support any sport via configuration. Pluggable data providers per sport.",
        icon: Layers,
        effort: "Large",
        status: "planned",
        tags: ["architecture", "saas"],
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
            {totalCompleted} features shipped across 33 sessions
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
