import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  AlertCircle,
  Info,
  ArrowRight,
  Code2,
  Shield,
  Zap,
  Layers,
  Wrench,
  FileCode,
  Bug,
  Sparkles,
  Activity,
  TestTube,
  BookOpen,
  Terminal,
  Rocket,
  Target,
  Calendar,
  TrendingUp,
  Users,
  BarChart3,
  Bell,
  Globe,
  Smartphone,
  Lock,
} from "lucide-react";

/* ── Data ────────────────────────────────────────────────────────── */

const LAST_UPDATED = "March 20, 2026 (Session 30)";
const LAST_REVIEW = "Session 27 — 6-agent code review (Mar 19, 2026)";
const AUDIT_DATE = "March 19, 2026 (Session 26)";

const healthScore = 8.5;

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
        title: "Live Auction (Mar 22)",
        description: "First live auction draft with 8 owners, real-time bidding via WebSocket, bid tracking, and draft board log. All P1 infrastructure fixes complete.",
        icon: Target,
        effort: "Large",
        status: "in-progress",
        tags: ["auction", "milestone"],
      },
      {
        title: "Production Deployment",
        description: "Deploy all Session 26-27 changes to Render. Verify Supabase auth, MLB API caching, and WebSocket connections in production.",
        icon: Globe,
        effort: "Small",
        status: "planned",
        tags: ["infrastructure"],
      },
      {
        title: "GitHub Actions CI",
        description: "Run all 670 tests + TypeScript checks on every PR. Block merges on failure. Foundation for safe deployments.",
        icon: Shield,
        effort: "Small",
        status: "planned",
        tags: ["infrastructure", "quality"],
      },
      {
        title: "npm audit fix + Prisma Cascade",
        description: "Patch 7 security vulnerabilities (3 HIGH). Add onDelete: Cascade to 8+ schema relations to prevent data orphans.",
        icon: Lock,
        effort: "Small",
        status: "planned",
        tags: ["security", "data-integrity"],
      },
      {
        title: "Post-Auction Retrospective",
        description: "After the live draft: review auction logs, analyze bid patterns, identify UX issues from real usage, document findings.",
        icon: BarChart3,
        effort: "Small",
        status: "planned",
        tags: ["process"],
      },
      {
        title: "Stale Docs Cleanup",
        description: "Delete PORTS.md, fbst-PORTS.md, update PROJECT_STRUCTURE.MD. Add missing env vars to .env.example.",
        icon: BookOpen,
        effort: "Small",
        status: "planned",
        tags: ["documentation"],
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
        status: "planned",
        tags: ["standings", "feature"],
      },
      {
        title: "Trade Analysis & Projections",
        description: "Show projected standings impact before proposing a trade. Category-level gains/losses for both sides. Leverage AI analysis.",
        icon: TrendingUp,
        effort: "Large",
        status: "planned",
        tags: ["trades", "ai", "feature"],
      },
      {
        title: "Notification System",
        description: "Email and/or in-app notifications for: trade proposals, waiver results, period rollovers, commissioner announcements.",
        icon: Bell,
        effort: "Medium",
        status: "planned",
        tags: ["notifications", "feature"],
      },
      {
        title: "Waiver Claim Workflow Polish",
        description: "FAAB waiver UI for owners: submit claims with priority + bid amount, view pending claims, get results after processing.",
        icon: Users,
        effort: "Medium",
        status: "planned",
        tags: ["waivers", "feature"],
      },
      {
        title: "Automated Stats Sync",
        description: "Scheduled daily sync of MLB stats during the season via cron job. Auto-compute period standings. Zero manual intervention.",
        icon: Activity,
        effort: "Medium",
        status: "planned",
        tags: ["automation", "infrastructure"],
      },
      {
        title: "Expand Test Coverage",
        description: "Add client tests for 30+ untested components (auth, auction live, roster). Create shared test fixtures to eliminate mock duplication.",
        icon: TestTube,
        effort: "Large",
        status: "planned",
        tags: ["testing", "quality"],
      },
      {
        title: "PostHog Analytics Dashboard",
        description: "Track key product metrics: daily active users, feature adoption, auction engagement, page performance. Data-driven prioritization.",
        icon: BarChart3,
        effort: "Small",
        status: "planned",
        tags: ["analytics", "posthog"],
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
        title: "AUC-01: Nominator Sets Opening Bid",
        description: "Inline $ picker on Nom button — nominator chooses starting bid (default $1, clamped to maxBid). Auto-nominations from queue still use $1.",
        icon: Zap,
        effort: "Small",
        status: "done",
        tags: ["auction", "ux"],
      },
      {
        title: "AUC-02: Watchlist / Favorites",
        description: "Star icon on every player row (amber when starred). Filtered view via ★ button alongside All/Avail. Persisted per league in localStorage.",
        icon: Target,
        effort: "Small",
        status: "done",
        tags: ["auction", "ux"],
      },
      {
        title: "AUC-03: Chat / Trash Talk",
        description: "Real-time chat via WebSocket (bidirectional). Rate-limited (5 msgs/10s), 500 char max. Chat tab in ContextDeck. Ephemeral (no DB persistence).",
        icon: Users,
        effort: "Medium",
        status: "done",
        tags: ["auction", "social"],
      },
      {
        title: "AUC-04: Bid Notifications / Sound Effects",
        description: "Web Audio API oscillator tones — nomination ding, outbid alert, your-turn sweep, win arpeggio, critical tick. Mute toggle in header. Zero deps.",
        icon: Bell,
        effort: "Small",
        status: "done",
        tags: ["auction", "ux"],
      },
      {
        title: "AUC-05: Value Over Replacement",
        description: "Val column shows $dollar_value. During active bidding, surplus display (value - current bid) with green/red color coding for bargain/overpay.",
        icon: TrendingUp,
        effort: "Medium",
        status: "done",
        tags: ["auction", "analytics"],
      },
      {
        title: "AUC-06: Spending Pace Tracker",
        description: "League summary bar, per-team budget progress bars (green/amber/red), avg cost, $/spot remaining. Hot/cold icons (Flame/Snowflake) at ±25% of league avg.",
        icon: BarChart3,
        effort: "Medium",
        status: "done",
        tags: ["auction", "analytics"],
      },
      {
        title: "AUC-07: Position Needs Matrix",
        description: "Grid showing each team's filled/open positions in Team List tab. Reveals who needs the current player most.",
        icon: Layers,
        effort: "Medium",
        status: "planned",
        tags: ["auction", "strategy"],
      },
      {
        title: "AUC-08: Nomination Timer Countdown",
        description: "Visible countdown when it's your turn to nominate (30s default). Auto-skip exists but UX could be clearer.",
        icon: Activity,
        effort: "Small",
        status: "planned",
        tags: ["auction", "ux"],
      },
      {
        title: "AUC-09: 'Going Once, Going Twice' Visual",
        description: "Escalating visual flourish at 5s/3s/1s — border pulse, text callout, 'SOLD!' animation.",
        icon: Sparkles,
        effort: "Medium",
        status: "planned",
        tags: ["auction", "ux"],
      },
      {
        title: "AUC-10: Pre-Draft Rankings Import",
        description: "Owners upload personal player rankings (CSV) as a private column in Player Pool for reference during bidding.",
        icon: FileCode,
        effort: "Medium",
        status: "planned",
        tags: ["auction", "feature"],
      },
      {
        title: "AUC-11: Post-Auction Trade Block",
        description: "Immediately after draft, owners flag players they'd be willing to trade. Jump-starts the trade market.",
        icon: Users,
        effort: "Small",
        status: "planned",
        tags: ["auction", "trades"],
      },
      {
        title: "AUC-12: Keeper Cost Preview",
        description: "During bidding, show next year's keeper cost: 'If you keep next year: $bid + $5'. Helps with long-term strategy.",
        icon: TrendingUp,
        effort: "Small",
        status: "planned",
        tags: ["auction", "keeper"],
      },
    ],
  },
  {
    label: "Long Term",
    timeframe: "July 2026+ (Off-Season & Beyond)",
    color: "text-blue-400",
    borderColor: "border-blue-500/30",
    bgColor: "bg-blue-500/5",
    icon: Calendar,
    items: [
      {
        title: "Mobile-Responsive Redesign",
        description: "Full mobile experience for auction bidding, standings checking, and trade management on phones. Currently functional but not optimized for small screens.",
        icon: Smartphone,
        effort: "Large",
        status: "planned",
        tags: ["mobile", "design"],
      },
      {
        title: "Multi-League Support",
        description: "Full franchise-level dashboard: manage multiple leagues from one view, compare rosters across leagues, unified transaction history.",
        icon: Layers,
        effort: "Large",
        status: "planned",
        tags: ["franchise", "feature"],
      },
      {
        title: "Historical Analytics & Trends",
        description: "Multi-year owner analytics: draft tendencies, trade patterns, winning strategies. Leverage 20+ years of archived league data.",
        icon: TrendingUp,
        effort: "Large",
        status: "planned",
        tags: ["archive", "ai", "feature"],
      },
      {
        title: "AI Commissioner Assistant",
        description: "AI-powered recommendations for commissioners: fair trade evaluation, waiver priority suggestions, league health monitoring.",
        icon: Sparkles,
        effort: "Large",
        status: "planned",
        tags: ["ai", "commissioner", "feature"],
      },
      {
        title: "Snake Draft Mode",
        description: "Support snake draft format alongside auction. Draft order management, pick trading, live draft board with auto-pick timer.",
        icon: Target,
        effort: "Large",
        status: "planned",
        tags: ["draft", "feature"],
      },
      {
        title: "Public League Directory",
        description: "Allow commissioners to list leagues publicly. Join via invite code or discovery. Onboarding flow for new owners.",
        icon: Globe,
        effort: "Medium",
        status: "planned",
        tags: ["growth", "feature"],
      },
      {
        title: "Architecture Extraction",
        description: "Extract auction/routes.ts (874 LOC), CommissionerService (970 LOC), ArchivePage (1,088 LOC) into smaller focused modules.",
        icon: Layers,
        effort: "Large",
        status: "planned",
        tags: ["architecture", "maintenance"],
      },
    ],
  },
];

const auditCategories = [
  {
    label: "Architecture",
    score: 9,
    icon: Layers,
    detail: "17 feature modules, mirrored client/server, zero circular deps, cross-feature deps documented",
  },
  {
    label: "Code Quality",
    score: 9,
    icon: Code2,
    detail: "TypeScript strict mode, consistent naming, no @ts-ignore in source, minimal any annotations",
  },
  {
    label: "Security",
    score: 8.5,
    icon: Shield,
    detail: "Auth on all writes, Zod validation, rate limiting, audit logging, no XSS/SQLi risk",
  },
  {
    label: "Testing",
    score: 8.5,
    icon: TestTube,
    detail: "670 tests (454 server + 187 client + 29 MCP), production-grade integration tests",
  },
  {
    label: "Documentation",
    score: 8,
    icon: BookOpen,
    detail: "CLAUDE.md is excellent, FEEDBACK.md current, some secondary docs stale",
  },
  {
    label: "Tooling",
    score: 7.5,
    icon: Terminal,
    detail: "7 slash commands, MCP server, session checklists — but no CI/CD pipeline yet",
  },
];

const auditHighlights = [
  "46,870+ lines of TypeScript across 17 feature modules",
  "670 tests passing (including 84 integration tests)",
  "30 Prisma database models, 116 API endpoints",
  "No circular dependencies (verified with madge)",
  "Compounding institutional knowledge via CLAUDE.md + FEEDBACK.md + memory system",
];

interface Recommendation {
  id: number;
  action: string;
  effort: string;
  impact: string;
}

const auditRecommendations: { priority: string; color: string; items: Recommendation[] }[] = [
  {
    priority: "Critical",
    color: "text-red-400",
    items: [
      { id: 1, action: "Run npm audit fix", effort: "5 min", impact: "Patches 7 security vulnerabilities (3 HIGH)" },
      { id: 2, action: "Add onDelete: Cascade to 8+ schema relations", effort: "30 min", impact: "Prevents data orphans on deletion" },
    ],
  },
  {
    priority: "High Priority",
    color: "text-amber-400",
    items: [
      { id: 3, action: "Delete PORTS.md and fbst-PORTS.md", effort: "2 min", impact: "Eliminates doc confusion" },
      { id: 4, action: "Delete or update docs/PROJECT_STRUCTURE.MD", effort: "5 min", impact: "CLAUDE.md is canonical" },
      { id: 5, action: "Add GitHub Actions CI (run tests on PRs)", effort: "30 min", impact: "Catches bugs before merge" },
      { id: 6, action: "Add missing env vars to .env.example", effort: "15 min", impact: "Onboarding clarity" },
      { id: 7, action: "Add leagues server tests", effort: "1-2 hrs", impact: "Closes last server test gap" },
    ],
  },
  {
    priority: "Medium Priority",
    color: "text-blue-400",
    items: [
      { id: 8, action: "Create server/src/scripts/README.md", effort: "20 min", impact: "Documents 33 utility scripts" },
      { id: 9, action: "Add root npm scripts (check:types, clean)", effort: "15 min", impact: "Developer convenience" },
      { id: 10, action: "Create shared test helpers / fixtures", effort: "1-2 hrs", impact: "Eliminates mock duplication across 10+ test files" },
      { id: 11, action: "Expand client test coverage (auth, auction, roster)", effort: "3-4 hrs", impact: "30+ components untested" },
      { id: 12, action: "Refresh docs/ROADMAP.md and docs/SECURITY.md", effort: "30 min", impact: "Keeps secondary docs current" },
    ],
  },
  {
    priority: "Low Priority",
    color: "text-emerald-400",
    items: [
      { id: 13, action: "Add .husky/pre-commit hook", effort: "15 min", impact: "Runs tests before commit" },
      { id: 14, action: "Create render.yaml", effort: "20 min", impact: "Version-controlled deployment config" },
      { id: 15, action: "Archive stale one-off scripts", effort: "30 min", impact: "Reduces scripts/ clutter" },
      { id: 16, action: "Extract large files (CommissionerService, ArchivePage)", effort: "2-3 hrs", impact: "Better maintainability" },
    ],
  },
];

const summary = {
  total: 69,
  completed: 68,
  p1: 0,
  p2: 0,
  p3Open: 0,
  p3Existing: 1,
};

interface TodoItem {
  id: string;
  title: string;
  description: string;
  file?: string;
  effort: "Trivial" | "Small" | "Medium" | "Large";
  tags: string[];
  done: boolean;
  foundDate?: string;
  fixedDate?: string;
  source?: string;
}

const p1Items: TodoItem[] = [
  {
    id: "CR-01",
    title: "Await AuctionLot.update in finishCurrentLot",
    description:
      "Currently fire-and-forget — lot stays 'active' in DB if update fails while roster entry is already created. Data integrity risk for bid-history endpoint.",
    file: "server/src/features/auction/routes.ts:391-394",
    effort: "Small",
    tags: ["auction", "data-integrity"],
    done: true,
    foundDate: "Mar 19, 2026",
    fixedDate: "Mar 19, 2026",
    source: "6-agent code review (Session 27)",
  },
  {
    id: "CR-02",
    title: "AuctionDraftLog re-fetches on every log event",
    description:
      "useEffect depends on log.length but only WIN events add data. Causes 3-5x unnecessary API calls during live auction, multiplied by concurrent viewers.",
    file: "client/src/features/auction/components/AuctionDraftLog.tsx:57",
    effort: "Small",
    tags: ["auction", "performance"],
    done: true,
    foundDate: "Mar 19, 2026",
    fixedDate: "Mar 19, 2026",
    source: "6-agent code review (Session 27)",
  },
  {
    id: "CR-03",
    title: "checkPositionLimit re-queries DB on every bid",
    description:
      "Data already exists in state.teams[].pitcherCount/hitterCount and state.config. ~690 unnecessary queries per full auction.",
    file: "server/src/features/auction/routes.ts:259-288",
    effort: "Small",
    tags: ["auction", "performance"],
    done: true,
    foundDate: "Mar 19, 2026",
    fixedDate: "Mar 19, 2026",
    source: "6-agent code review (Session 27)",
  },
];

const p2Items: TodoItem[] = [
  {
    id: "CR-04",
    title: "player-season-stats defaults leagueId to 1",
    description:
      "No membership check — any authenticated user can view any league's roster composition and auction prices.",
    file: "server/src/features/players/routes.ts:478",
    effort: "Small",
    tags: ["security", "players"],
    done: true,
    foundDate: "Mar 19, 2026",
    fixedDate: "Mar 19, 2026",
    source: "6-agent code review (Session 27)",
  },
  {
    id: "CR-05",
    title: "persistState swallows errors silently",
    description:
      "Uses .catch(() => {}) — silent auction state loss if DB connection drops. Server restart would lose progress with no warning.",
    file: "server/src/features/auction/routes.ts:135",
    effort: "Small",
    tags: ["auction", "reliability"],
    done: true,
    foundDate: "Mar 19, 2026",
    fixedDate: "Mar 19, 2026",
    source: "6-agent code review (Session 27)",
  },
  {
    id: "CR-06",
    title: "positionToSlots() duplicated client/server",
    description:
      "Identical function in auction/routes.ts (server) and PlayerPoolTab.tsx (client). Should live in sportConfig.ts on both sides.",
    effort: "Small",
    tags: ["duplication", "sportConfig"],
    done: true,
    foundDate: "Mar 19, 2026",
    fixedDate: "Mar 19, 2026",
    source: "6-agent code review (Session 27)",
  },
  {
    id: "CR-07",
    title: "NL_TEAMS/AL_TEAMS redefined locally",
    description:
      "PlayerPoolTab.tsx defines its own copies instead of importing from sportConfig.ts. Local version has extra 'AZ' alias.",
    effort: "Small",
    tags: ["duplication", "sportConfig"],
    done: true,
    foundDate: "Mar 19, 2026",
    fixedDate: "Mar 19, 2026",
    source: "6-agent code review (Session 27)",
  },
  {
    id: "CR-08",
    title: "PITCHER_CODES naming inconsistency + missing TWP",
    description:
      "Same set under different names (PITCHER_CODES vs PITCHER_POS). Canonical sportConfig.ts missing 'TWP' for two-way players.",
    effort: "Small",
    tags: ["duplication", "sportConfig"],
    done: true,
    foundDate: "Mar 19, 2026",
    fixedDate: "Mar 19, 2026",
    source: "6-agent code review (Session 27)",
  },
  {
    id: "CR-09",
    title: "AuctionLogEvent redeclared with weak types",
    description:
      "AuctionDraftLog.tsx declares its own interface with type: string instead of importing the union type from types.ts.",
    effort: "Small",
    tags: ["type-safety", "auction"],
    done: true,
    foundDate: "Mar 19, 2026",
    fixedDate: "Mar 19, 2026",
    source: "6-agent code review (Session 27)",
  },
  {
    id: "CR-10",
    title: "@ts-expect-error for stat key access",
    description:
      "PlayerPoolTab.tsx uses @ts-expect-error for dynamic stat access. Should define a StatKey union type for sortKey state.",
    effort: "Small",
    tags: ["type-safety", "auction"],
    done: true,
    foundDate: "Mar 19, 2026",
    fixedDate: "Mar 19, 2026",
    source: "6-agent code review (Session 27)",
  },
];

const p3Items: TodoItem[] = [
  {
    id: "CR-11",
    title: "Unused imports in PlayerPoolTab.tsx",
    description:
      "ThemedTable components (5 symbols) and PITCHER_POS constant imported but never used.",
    effort: "Trivial",
    tags: ["dead-code"],
    done: true,
    foundDate: "Mar 19, 2026",
    fixedDate: "Mar 19, 2026",
    source: "6-agent code review (Session 27)",
  },
  {
    id: "CR-12",
    title: "Double useLeague() call in AuctionDraftLog",
    description: "Called on lines 44 and 59 — should be a single destructure.",
    effort: "Trivial",
    tags: ["dead-code"],
    done: true,
    foundDate: "Mar 19, 2026",
    fixedDate: "Mar 19, 2026",
    source: "6-agent code review (Session 27)",
  },
  {
    id: "CR-13",
    title: "Dead ternary: colCount always 9",
    description:
      "viewGroup === 'hitters' ? 9 : 9 — both branches return the same value.",
    effort: "Trivial",
    tags: ["dead-code"],
    done: true,
    foundDate: "Mar 19, 2026",
    fixedDate: "Mar 19, 2026",
    source: "6-agent code review (Session 27)",
  },
  {
    id: "CR-14",
    title: "Missing useMemo on teamMap and completedLots",
    description:
      "AuctionDraftLog recomputes Map and filter on every render (tab switch, expand, WebSocket updates).",
    effort: "Small",
    tags: ["performance"],
    done: true,
    foundDate: "Mar 19, 2026",
    fixedDate: "Mar 19, 2026",
    source: "6-agent code review (Session 27)",
  },
  {
    id: "CR-15",
    title: "Stats fetching logic inline in routes.ts",
    description:
      "~140 lines of MLB API fetching, caching, CSV fallback in players/routes.ts. Should extract to players/services/statsService.ts.",
    effort: "Medium",
    tags: ["architecture"],
    done: true,
    foundDate: "Mar 19, 2026",
    fixedDate: "Mar 19, 2026",
    source: "6-agent code review (Session 27)",
  },
  {
    id: "CR-16",
    title: "Raw <table> instead of ThemedTable",
    description:
      "AuctionDraftLog and PlayerPoolTab migrated to ThemedTable compact mode via React context.",
    effort: "Medium",
    tags: ["pattern-violation"],
    done: true,
    foundDate: "Mar 19, 2026",
    fixedDate: "Mar 19, 2026",
    source: "6-agent code review (Session 27)",
  },
];

const existingItems: TodoItem[] = [
  {
    id: "TD-Q03",
    title: "auction/routes.ts extraction (874 LOC)",
    description:
      "Real-time stateful system with in-memory state + timers. 72+ tests pass. Extraction risk outweighs benefit — revisit after auction season.",
    effort: "Large",
    tags: ["architecture"],
    done: false,
  },
  {
    id: "RD-01",
    title: "Lazy-load heavy modules",
    description:
      "xlsx (2.3MB) and @google/generative-ai (1.2MB) now lazy-loaded via dynamic import() on first use.",
    effort: "Small",
    tags: ["performance"],
    done: true,
    fixedDate: "Mar 19, 2026",
  },
  {
    id: "RD-02",
    title: "Prisma singleton enforcement",
    description:
      "8 scripts converted from new PrismaClient() to singleton import from db/prisma.ts.",
    effort: "Small",
    tags: ["maintenance"],
    done: true,
    fixedDate: "Mar 19, 2026",
  },
  {
    id: "RD-04",
    title: "Shared component extraction",
    description:
      "Moved PlayerDetailModal and StatsTables to client/src/components/shared/.",
    effort: "Small",
    tags: ["architecture"],
    done: true,
    fixedDate: "Mar 19, 2026",
  },
  {
    id: "RD-03",
    title: "npm audit in CI",
    description:
      "GitHub Actions CI workflow with npm audit --audit-level=critical on root, server, and client.",
    effort: "Small",
    tags: ["security"],
    done: true,
    fixedDate: "Mar 19, 2026",
  },
];

// ─── Historical Findings Timeline ───
// Tracks all P1/P2 items ever found across sessions for pattern analysis.

interface HistoricalFinding {
  id: string;
  severity: "P1" | "P2";
  title: string;
  category: string;
  foundDate: string;
  fixedDate: string;
  session: string;
  source: string;
}

const historicalFindings: HistoricalFinding[] = [
  // Session 7-8: First code review (6-agent)
  { id: "001", severity: "P1", title: "Hardcoded production DB credentials in scripts", category: "security", foundDate: "Mar 5, 2026", fixedDate: "Mar 5, 2026", session: "7-8", source: "6-agent code review" },
  { id: "002", severity: "P1", title: "Archive + roster import routes missing auth", category: "security", foundDate: "Mar 5, 2026", fixedDate: "Mar 5, 2026", session: "7-8", source: "6-agent code review" },
  { id: "003", severity: "P1", title: "Auction nominate/bid no ownership check", category: "security", foundDate: "Mar 5, 2026", fixedDate: "Mar 5, 2026", session: "7-8", source: "6-agent code review" },
  { id: "004", severity: "P1", title: "Roster add/delete missing ownership checks", category: "security", foundDate: "Mar 5, 2026", fixedDate: "Mar 5, 2026", session: "7-8", source: "6-agent code review" },
  { id: "005", severity: "P2", title: "Pervasive any types in standings service", category: "type-safety", foundDate: "Mar 5, 2026", fixedDate: "Mar 6, 2026", session: "7-9", source: "6-agent code review" },
  { id: "006", severity: "P2", title: "Cache standings computation", category: "performance", foundDate: "Mar 5, 2026", fixedDate: "Mar 6, 2026", session: "7-9", source: "6-agent code review" },
  { id: "007", severity: "P2", title: "~6 client files still use raw fetch()", category: "architecture", foundDate: "Mar 5, 2026", fixedDate: "Mar 6, 2026", session: "7-9", source: "6-agent code review" },
  { id: "010", severity: "P2", title: "Waivers GET endpoint info disclosure", category: "security", foundDate: "Mar 5, 2026", fixedDate: "Mar 5, 2026", session: "7-8", source: "6-agent code review" },
  // Session 16: Auction E2E testing
  { id: "E2E-01", severity: "P1", title: "Position limit enforcement blocking nominations (should be bid-only)", category: "auction", foundDate: "Mar 15, 2026", fixedDate: "Mar 15, 2026", session: "16", source: "E2E auction testing" },
  { id: "E2E-02", severity: "P1", title: "Queue stalls when teams fill at different rates", category: "auction", foundDate: "Mar 15, 2026", fixedDate: "Mar 15, 2026", session: "16", source: "E2E auction testing" },
  // Session 17: Franchise schema refactor
  { id: "F-01", severity: "P1", title: "inviteCode leaked in franchise API responses", category: "security", foundDate: "Mar 15, 2026", fixedDate: "Mar 15, 2026", session: "17", source: "Manual review" },
  { id: "F-02", severity: "P1", title: "FK cascade SET NULL on NOT NULL column", category: "data-integrity", foundDate: "Mar 15, 2026", fixedDate: "Mar 15, 2026", session: "17", source: "Manual review" },
  { id: "F-03", severity: "P2", title: "Missing indexes on FranchiseMembership", category: "performance", foundDate: "Mar 15, 2026", fixedDate: "Mar 15, 2026", session: "17", source: "Manual review" },
  // Session 21: Second code review (6-agent, PR #37)
  { id: "R2-01", severity: "P1", title: "Mermaid securityLevel not hardened", category: "security", foundDate: "Mar 17, 2026", fixedDate: "Mar 17, 2026", session: "21", source: "6-agent code review" },
  { id: "R2-02", severity: "P1", title: "endAuction not wrapped in $transaction", category: "data-integrity", foundDate: "Mar 17, 2026", fixedDate: "Mar 17, 2026", session: "21", source: "6-agent code review" },
  { id: "R2-03", severity: "P1", title: "Budget floor check missing in auction", category: "auction", foundDate: "Mar 17, 2026", fixedDate: "Mar 17, 2026", session: "21", source: "6-agent code review" },
  { id: "R2-04", severity: "P2", title: "Roto scoring duplicated 3x in archiveStatsService", category: "duplication", foundDate: "Mar 17, 2026", fixedDate: "Mar 17, 2026", session: "21", source: "6-agent code review" },
  { id: "R2-05", severity: "P2", title: "Double-casts in teamService", category: "type-safety", foundDate: "Mar 17, 2026", fixedDate: "Mar 17, 2026", session: "21", source: "6-agent code review" },
  // Session 27: Third code review (6-agent, PR #43)
  { id: "CR-01", severity: "P1", title: "AuctionLot.update fire-and-forget in finishCurrentLot", category: "data-integrity", foundDate: "Mar 19, 2026", fixedDate: "Mar 19, 2026", session: "27", source: "6-agent code review" },
  { id: "CR-02", severity: "P1", title: "DraftLog re-fetches on every log event (not just WINs)", category: "performance", foundDate: "Mar 19, 2026", fixedDate: "Mar 19, 2026", session: "27", source: "6-agent code review" },
  { id: "CR-03", severity: "P1", title: "checkPositionLimit queries DB on every bid (~690 queries)", category: "performance", foundDate: "Mar 19, 2026", fixedDate: "Mar 19, 2026", session: "27", source: "6-agent code review" },
  { id: "CR-04", severity: "P2", title: "player-season-stats defaults leagueId to 1 (no auth)", category: "security", foundDate: "Mar 19, 2026", fixedDate: "Mar 19, 2026", session: "27", source: "6-agent code review" },
  { id: "CR-05", severity: "P2", title: "persistState swallows errors silently", category: "reliability", foundDate: "Mar 19, 2026", fixedDate: "Mar 19, 2026", session: "27", source: "6-agent code review" },
  { id: "CR-06", severity: "P2", title: "positionToSlots() duplicated client/server", category: "duplication", foundDate: "Mar 19, 2026", fixedDate: "Mar 19, 2026", session: "27", source: "6-agent code review" },
  { id: "CR-07", severity: "P2", title: "NL_TEAMS/AL_TEAMS redefined locally", category: "duplication", foundDate: "Mar 19, 2026", fixedDate: "Mar 19, 2026", session: "27", source: "6-agent code review" },
  { id: "CR-08", severity: "P2", title: "PITCHER_CODES missing TWP for two-way players", category: "duplication", foundDate: "Mar 19, 2026", fixedDate: "Mar 19, 2026", session: "27", source: "6-agent code review" },
];

// ─── Tooling & Workflow Recommendations ───

interface ToolingItem {
  name: string;
  description: string;
  when: string;
  available: boolean;
}

const slashCommands: ToolingItem[] = [
  { name: "/check", description: "Run all tests + TypeScript checks in parallel", when: "Before/after any code change", available: true },
  { name: "/smoke-test", description: "Hit all API endpoints, report status codes", when: "After deploys or server restarts", available: true },
  { name: "/session-start", description: "Pre-session checklist (docs, tests, git log)", when: "Beginning of every session", available: true },
  { name: "/session-end", description: "Post-session checklist (tests, docs updates)", when: "End of every session", available: true },
  { name: "/feature-test", description: "Run tests for one feature module", when: "After touching a specific feature", available: true },
  { name: "/feature-overview", description: "Show routes, imports, tests, API for a feature", when: "Understanding or planning work on a feature", available: true },
  { name: "/db", description: "Natural language database queries via Prisma", when: "Ad-hoc data inspection", available: true },
];

const workflowTips: string[] = [
  "Run /session-start at the beginning of each session — it reads CLAUDE.md, runs tests, and checks git log",
  "Run /check before and after every significant code change — catches TypeScript errors and test failures early",
  "Use /feature-overview <name> before working on a module — shows you all files, routes, imports, and test coverage",
  "Run /smoke-test after any deployment — hits all 116 API endpoints and reports status codes",
  "Use /db for quick data checks — e.g., '/db how many players have is_pitcher = true'",
  "Use the MCP MLB Data Proxy tools (get-player-stats, search-players, etc.) for live MLB data queries",
  "Run /session-end to update FEEDBACK.md and CLAUDE.md — maintains continuity between sessions",
];

const missingTools: ToolingItem[] = [
  { name: "check:types", description: "Run tsc --noEmit for both client and server", when: "Quick type-check without full test suite", available: false },
  { name: "clean", description: "Remove build artifacts and caches", when: "After dependency updates or stale builds", available: false },
  { name: "GitHub Actions CI", description: "Automated tests on every PR", when: "Always — catches bugs before merge", available: false },
  { name: ".husky pre-commit", description: "Run tests before every git commit", when: "Always — prevents broken commits", available: false },
  { name: "render.yaml", description: "Version-controlled deployment config", when: "Infrastructure as code", available: false },
];

interface CompletedGroup {
  label: string;
  count: number;
  items: string[];
}

const completedGroups: CompletedGroup[] = [
  {
    label: "Security & Stability (Sessions 5-8)",
    count: 10,
    items: [
      "Rate limiting (express-rate-limit)",
      "Ownership validation (requireTeamOwner)",
      "IDOR protection",
      "Audit logging (writeAuditLog)",
      "Input validation (Zod schemas)",
      "Hardcoded DB credentials removed",
      "Archive + roster import auth",
      "Auction ownership checks",
      "Roster ownership checks",
      "Waivers info disclosure fix",
    ],
  },
  {
    label: "Resilience (Sessions 5-8)",
    count: 5,
    items: [
      "MLB API retry with backoff + circuit breaker",
      "Transaction timeouts (30s)",
      "Idempotency keys (crypto.randomUUID)",
      "Request ID tracking (x-request-id)",
      "Health check expansion (DB + Supabase)",
    ],
  },
  {
    label: "Test Coverage (Sessions 6-24)",
    count: 13,
    items: [
      "Server: archive (38), admin (19), roster (14), keeper-prep (8), players (13), periods (10), transactions (8), franchises (6)",
      "Client: auction (10), trades (23), teams (17), archive (16), remaining (36)",
    ],
  },
  {
    label: "Code Quality (Sessions 9-21)",
    count: 11,
    items: [
      "archive/routes extraction → archiveStatsService",
      "commissioner/routes extraction → CommissionerService",
      "Type safety: playerDisplay, TradesPage, archiveImport, any audit",
      "Consolidated playerDisplay → sportConfig",
      "Removed duplicate period APIs",
      "API barrel exports for waivers + seasons",
    ],
  },
  {
    label: "Season-Aware Feature Gating (Sessions 18-20)",
    count: 6,
    items: [
      "seasonStatus in LeagueContext",
      "useSeasonGating() hook",
      "Commissioner tab gating",
      "Breadcrumb status bar",
      "Owner-facing feature gating",
      "Server-side requireSeasonStatus middleware (10 tests)",
    ],
  },
  {
    label: "Maintenance & Infrastructure (Sessions 10-16)",
    count: 8,
    items: [
      "Deleted 29 one-off scripts, consolidated 15 → 6",
      "console.* → logger migration",
      "Archive matrix N+1 optimization",
      "TypeScript build errors resolved",
      "asyncHandler audit (all 17 modules)",
      "Zero circular dependencies (verified with madge)",
      "AppShell cleanup, RulesEditor simplification",
      "Commissioner design tokens, parseIntParam move",
    ],
  },
];

// ─── Session Velocity Data ───

const sessionVelocity = [
  { session: "1-2", items: 3 },
  { session: "3-6", items: 8 },
  { session: "7-10", items: 14 },
  { session: "11-14", items: 12 },
  { session: "15-17", items: 16 },
  { session: "18-20", items: 22 },
  { session: "21-23", items: 30 },
  { session: "24-25", items: 26 },
  { session: "26-27", items: 24 },
];

// ─── Risk Register ───

interface RiskItem {
  id: string;
  risk: string;
  impact: "High" | "Medium" | "Low";
  likelihood: "High" | "Medium" | "Low";
  mitigation: string;
  status: "mitigated" | "active" | "monitoring";
}

const riskRegister: RiskItem[] = [
  { id: "R1", risk: "Live auction WebSocket failure during draft", impact: "High", likelihood: "Low", mitigation: "Auto-finish timers, pause/resume, state persistence to DB, tested E2E on 4 leagues", status: "mitigated" },
  { id: "R2", risk: "MLB Stats API rate limiting or downtime", impact: "Medium", likelihood: "Medium", mitigation: "SQLite cache (30-day TTL), circuit breaker, CSV fallback, MCP proxy with token bucket", status: "mitigated" },
  { id: "R3", risk: "Supabase Auth outage locks all users out", impact: "High", likelihood: "Low", mitigation: "Dev login fallback (env-gated), session tokens cached client-side", status: "monitoring" },
  { id: "R4", risk: "Data integrity loss from non-transactional writes", impact: "High", likelihood: "Low", mitigation: "Key operations wrapped in $transaction (Session 21, 27). Audit ongoing", status: "mitigated" },
  { id: "R5", risk: "Security vulnerability in new endpoints", impact: "High", likelihood: "Medium", mitigation: "6-agent code review catches auth gaps. CLAUDE.md enforces requireAuth convention", status: "monitoring" },
  { id: "R6", risk: "No CI/CD — broken code merges to main", impact: "Medium", likelihood: "Medium", mitigation: "Manual /check before commit. GitHub Actions CI planned (Short Term roadmap)", status: "active" },
  { id: "R7", risk: "Large file complexity (auction/routes 874 LOC)", impact: "Low", likelihood: "High", mitigation: "72+ tests passing. Extraction deferred to post-auction season", status: "monitoring" },
];

// ─── Next Session Planning ───

interface NextSessionItem {
  priority: "P1" | "P2" | "P3";
  task: string;
  effort: string;
  context: string;
}

const nextSessionItems: NextSessionItem[] = [
  { priority: "P3", task: "Extract auction/routes.ts (TD-Q03)", effort: "Large", context: "Deferred to post-auction season — 874 LOC stateful system, 72+ tests" },
];

/* ── Helpers ──────────────────────────────────────────────────────── */

function tagIcon(tags: string[]) {
  if (tags.includes("security")) return Shield;
  if (tags.includes("performance")) return Zap;
  if (tags.includes("architecture")) return Layers;
  if (tags.includes("type-safety")) return Code2;
  if (tags.includes("duplication")) return FileCode;
  if (tags.includes("dead-code")) return Bug;
  if (tags.includes("maintenance")) return Wrench;
  if (tags.includes("pattern-violation")) return Sparkles;
  return Info;
}

function effortBadge(effort: string) {
  const colors: Record<string, string> = {
    Trivial: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
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

function ScoreRing({ score, size = 80 }: { score: number; size?: number }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = score / 10;
  const offset = circumference * (1 - pct);
  const color =
    score >= 8 ? "text-emerald-500" : score >= 6 ? "text-amber-400" : "text-red-400";
  const strokeColor =
    score >= 8
      ? "stroke-emerald-500"
      : score >= 6
        ? "stroke-amber-400"
        : "stroke-red-400";

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--lg-border-faint)"
          strokeWidth={6}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          className={strokeColor}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`text-xl font-semibold ${color} tabular-nums`}>
          {score}
        </span>
      </div>
    </div>
  );
}

function CategoryBar({
  score,
  icon: Icon,
  label,
  detail,
}: {
  score: number;
  icon: React.ElementType;
  label: string;
  detail: string;
}) {
  const pct = (score / 10) * 100;
  const color =
    score >= 8.5
      ? "bg-emerald-500"
      : score >= 7
        ? "bg-amber-400"
        : "bg-red-400";

  return (
    <div className="flex items-center gap-3">
      <Icon className="w-4 h-4 text-[var(--lg-text-muted)] shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-xs font-medium text-[var(--lg-text-primary)]">
            {label}
          </span>
          <span className="text-xs font-semibold text-[var(--lg-text-secondary)] tabular-nums">
            {score}/10
          </span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-[var(--lg-tint)] overflow-hidden">
          <div
            className={`h-full rounded-full ${color} transition-all`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-[10px] text-[var(--lg-text-muted)] mt-1 leading-relaxed">
          {detail}
        </p>
      </div>
    </div>
  );
}

function ProductRoadmap() {
  const [expandedPhase, setExpandedPhase] = useState<number | null>(0); // Short term open by default

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
          const doneCount = phase.items.filter(i => i.status === "done").length;
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
                      {phase.items.length} items
                    </span>
                    {inProgressCount > 0 && (
                      <span className="text-[10px] font-semibold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                        {inProgressCount} active
                      </span>
                    )}
                    {doneCount > 0 && (
                      <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                        {doneCount} done
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

function VelocityChart() {
  const maxItems = Math.max(...sessionVelocity.map((s) => s.items));
  const totalItems = sessionVelocity.reduce((s, v) => s + v.items, 0);

  return (
    <div className="rounded-lg border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] p-5">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-5 h-5 text-[var(--lg-accent)]" />
        <h2 className="text-lg font-semibold text-[var(--lg-text-primary)]">
          Session Velocity
        </h2>
        <span className="text-xs text-[var(--lg-text-muted)] ml-auto tabular-nums">
          {totalItems} items · 27 sessions · avg {Math.round(totalItems / 27 * 10) / 10}/session
        </span>
      </div>

      <div className="space-y-1.5">
        {sessionVelocity.map((s) => {
          const pct = (s.items / maxItems) * 100;
          return (
            <div key={s.session} className="flex items-center gap-3">
              <span className="text-xs font-medium text-[var(--lg-text-muted)] w-10 shrink-0 tabular-nums text-right">
                S{s.session}
              </span>
              <div className="flex-1 h-3.5 rounded bg-[var(--lg-tint)] overflow-hidden relative">
                <div
                  className="h-full rounded bg-[var(--lg-accent)] transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs font-semibold text-[var(--lg-text-primary)] w-6 shrink-0 tabular-nums text-right">
                {s.items}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RiskRegister() {
  const [open, setOpen] = useState(false);

  const impactColor: Record<string, string> = {
    High: "text-red-400",
    Medium: "text-amber-400",
    Low: "text-blue-400",
  };

  const statusBadge: Record<string, { label: string; color: string }> = {
    mitigated: { label: "Mitigated", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
    active: { label: "Active", color: "text-red-400 bg-red-500/10 border-red-500/20" },
    monitoring: { label: "Monitoring", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  };

  const activeCount = riskRegister.filter((r) => r.status === "active").length;
  const monitoringCount = riskRegister.filter((r) => r.status === "monitoring").length;

  return (
    <div className="rounded-lg border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] p-5">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 text-left hover:opacity-80 transition-opacity"
      >
        <Shield className="w-5 h-5 text-[var(--lg-accent)]" />
        <h2 className="text-lg font-semibold text-[var(--lg-text-primary)] flex-1">
          Risk Register
        </h2>
        <span className="text-xs text-[var(--lg-text-muted)]">
          {activeCount} active · {monitoringCount} monitoring · {riskRegister.length - activeCount - monitoringCount} mitigated
        </span>
        {open ? <ChevronUp className="w-5 h-5 text-[var(--lg-text-muted)]" /> : <ChevronDown className="w-5 h-5 text-[var(--lg-text-muted)]" />}
      </button>

      {open && (
        <div className="mt-4 space-y-2">
          {riskRegister.map((risk) => {
            const badge = statusBadge[risk.status];
            return (
              <div key={risk.id} className="rounded-lg border border-[var(--lg-border-faint)] bg-[var(--lg-tint)] p-3">
                <div className="flex items-start gap-3">
                  <span className="text-xs font-semibold text-[var(--lg-text-muted)] tabular-nums w-6 shrink-0 mt-0.5">{risk.id}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-medium text-[var(--lg-text-primary)]">{risk.risk}</span>
                      <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border ${badge.color}`}>
                        {badge.label}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--lg-text-secondary)] leading-relaxed mb-1">{risk.mitigation}</p>
                    <div className="flex items-center gap-3 text-[10px] text-[var(--lg-text-muted)]">
                      <span>Impact: <span className={`font-semibold ${impactColor[risk.impact]}`}>{risk.impact}</span></span>
                      <span>Likelihood: <span className={`font-semibold ${impactColor[risk.likelihood]}`}>{risk.likelihood}</span></span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SessionPlanning() {
  return (
    <div className="rounded-lg border border-[var(--lg-accent)]/20 bg-[var(--lg-accent)]/5 p-5">
      <div className="flex items-center gap-2 mb-3">
        <Calendar className="w-5 h-5 text-[var(--lg-accent)]" />
        <h2 className="text-lg font-semibold text-[var(--lg-text-primary)]">
          Next Session
        </h2>
        <span className="text-xs text-[var(--lg-text-muted)] ml-auto">
          Suggested focus items
        </span>
      </div>
      <div className="space-y-1.5">
        {nextSessionItems.map((item) => {
          const prColor = item.priority === "P1" ? "text-red-400" : item.priority === "P2" ? "text-amber-400" : "text-blue-400";
          return (
            <div key={item.task} className="flex items-center gap-3 text-sm py-2 px-3 rounded-md bg-[var(--lg-bg-card)] border border-[var(--lg-border-faint)]">
              <span className={`text-xs font-semibold ${prColor} w-5 shrink-0`}>{item.priority}</span>
              <span className="text-[var(--lg-text-primary)] font-medium flex-1 min-w-0">{item.task}</span>
              <span className="text-[10px] text-[var(--lg-text-muted)] bg-[var(--lg-tint)] px-1.5 py-0.5 rounded shrink-0">{item.effort}</span>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[10px] text-[var(--lg-text-muted)] leading-relaxed">
        Run <code className="bg-[var(--lg-tint)] px-1 py-0.5 rounded">/session-start</code> to begin — it reads CLAUDE.md, runs tests, and checks git log.
      </p>
    </div>
  );
}

function ProjectHealth() {
  return (
    <div className="rounded-lg border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] p-5">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="w-5 h-5 text-[var(--lg-accent)]" />
        <h2 className="text-lg font-semibold text-[var(--lg-text-primary)]">
          Project Health
        </h2>
        <span className="text-xs text-[var(--lg-text-muted)] ml-auto">
          Full audit: {AUDIT_DATE}
        </span>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Score ring + summary */}
        <div className="flex flex-col items-center gap-2 md:pr-6 md:border-r md:border-[var(--lg-border-faint)]">
          <ScoreRing score={healthScore} size={96} />
          <div className="text-center">
            <div className="text-sm font-semibold text-[var(--lg-text-primary)]">
              Excellent
            </div>
            <div className="text-[10px] text-[var(--lg-text-muted)] uppercase">
              Overall Health
            </div>
          </div>
        </div>

        {/* Category breakdowns */}
        <div className="flex-1 space-y-3">
          {auditCategories.map((cat) => (
            <CategoryBar
              key={cat.label}
              score={cat.score}
              icon={cat.icon}
              label={cat.label}
              detail={cat.detail}
            />
          ))}
        </div>
      </div>

      {/* Key highlights */}
      <div className="mt-5 pt-4 border-t border-[var(--lg-border-faint)]">
        <div className="text-[10px] font-semibold uppercase text-[var(--lg-text-muted)] mb-2 tracking-wide">
          Key Findings
        </div>
        <ul className="space-y-1">
          {auditHighlights.map((h) => (
            <li
              key={h}
              className="flex items-start gap-2 text-xs text-[var(--lg-text-secondary)]"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
              <span>{h}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function AuditRecommendations() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] p-5">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 text-left hover:opacity-80 transition-opacity"
      >
        <Sparkles className="w-5 h-5 text-[var(--lg-accent)]" />
        <h2 className="text-lg font-semibold text-[var(--lg-text-primary)] flex-1">
          Audit Recommendations
        </h2>
        <span className="text-xs text-[var(--lg-text-muted)]">
          16 items from Session 26 audit
        </span>
        {open ? (
          <ChevronUp className="w-5 h-5 text-[var(--lg-text-muted)]" />
        ) : (
          <ChevronDown className="w-5 h-5 text-[var(--lg-text-muted)]" />
        )}
      </button>

      {open && (
        <div className="mt-4 space-y-5">
          {auditRecommendations.map((group) => (
            <div key={group.priority}>
              <h3 className={`text-sm font-semibold ${group.color} mb-2`}>
                {group.priority}
              </h3>
              <div className="space-y-1.5">
                {group.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 text-sm py-1.5 px-3 rounded-md bg-[var(--lg-tint)]"
                  >
                    <span className="text-xs font-semibold text-[var(--lg-text-muted)] tabular-nums w-5 shrink-0 mt-0.5">
                      {item.id}.
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="text-[var(--lg-text-primary)] font-medium">
                        {item.action}
                      </span>
                      <span className="text-[var(--lg-text-muted)]">
                        {" "}— {item.impact}
                      </span>
                    </div>
                    <span className="text-[10px] font-semibold uppercase text-[var(--lg-text-muted)] bg-[var(--lg-bg-card)] px-1.5 py-0.5 rounded border border-[var(--lg-border-faint)] shrink-0">
                      {item.effort}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <p className="text-[10px] text-[var(--lg-text-muted)] pt-2 border-t border-[var(--lg-border-faint)]">
            Source: docs/AUDIT-2026-03-19.md Section 10
          </p>
        </div>
      )}
    </div>
  );
}

function FindingsTimeline() {
  const [open, setOpen] = useState(false);

  // Pattern analysis
  const categoryCount = historicalFindings.reduce<Record<string, number>>((acc, f) => {
    acc[f.category] = (acc[f.category] || 0) + 1;
    return acc;
  }, {});
  const sortedCategories = Object.entries(categoryCount).sort((a, b) => b[1] - a[1]);

  const p1Count = historicalFindings.filter(f => f.severity === "P1").length;
  const p2Count = historicalFindings.filter(f => f.severity === "P2").length;

  // Group by session
  const sessions = Array.from(new Set(historicalFindings.map(f => f.session)));

  return (
    <div className="rounded-lg border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] p-5">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 text-left hover:opacity-80 transition-opacity"
      >
        <Activity className="w-5 h-5 text-[var(--lg-accent)]" />
        <h2 className="text-lg font-semibold text-[var(--lg-text-primary)] flex-1">
          Findings History & Patterns
        </h2>
        <span className="text-xs text-[var(--lg-text-muted)]">
          {historicalFindings.length} findings across {sessions.length} reviews
        </span>
        {open ? (
          <ChevronUp className="w-5 h-5 text-[var(--lg-text-muted)]" />
        ) : (
          <ChevronDown className="w-5 h-5 text-[var(--lg-text-muted)]" />
        )}
      </button>

      {open && (
        <div className="mt-4 space-y-5">
          {/* Pattern Analysis */}
          <div className="rounded-lg border border-[var(--lg-border-faint)] bg-[var(--lg-tint)] p-4">
            <div className="text-[10px] font-semibold uppercase text-[var(--lg-accent)] tracking-wide mb-3">
              Pattern Analysis — What Keeps Breaking?
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
              <div className="text-center">
                <div className="text-xl font-semibold text-red-400 tabular-nums">{p1Count}</div>
                <div className="text-[10px] text-[var(--lg-text-muted)] uppercase">P1 Critical</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-semibold text-amber-400 tabular-nums">{p2Count}</div>
                <div className="text-[10px] text-[var(--lg-text-muted)] uppercase">P2 Important</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-semibold text-emerald-400 tabular-nums">{historicalFindings.length}</div>
                <div className="text-[10px] text-[var(--lg-text-muted)] uppercase">Total Fixed</div>
              </div>
            </div>

            <div className="text-[10px] font-semibold uppercase text-[var(--lg-text-muted)] tracking-wide mb-2">
              Top Categories (recurring themes)
            </div>
            <div className="space-y-1.5">
              {sortedCategories.map(([cat, count]) => {
                const pct = (count / historicalFindings.length) * 100;
                return (
                  <div key={cat} className="flex items-center gap-2">
                    <span className="text-xs font-medium text-[var(--lg-text-primary)] w-24 shrink-0">{cat}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-[var(--lg-border-faint)] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[var(--lg-accent)]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-[var(--lg-text-muted)] tabular-nums w-6 text-right">{count}</span>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 pt-3 border-t border-[var(--lg-border-faint)] space-y-1.5">
              <div className="text-[10px] font-semibold uppercase text-[var(--lg-text-muted)] tracking-wide">
                Key Insights
              </div>
              <p className="text-xs text-[var(--lg-text-secondary)] leading-relaxed">
                <span className="font-semibold text-[var(--lg-text-primary)]">Security</span> is the #1 recurring category — auth gaps found in Sessions 7, 17, and 27. Each code review catches new endpoints missing ownership checks. Consider adding a linting rule or middleware audit.
              </p>
              <p className="text-xs text-[var(--lg-text-secondary)] leading-relaxed">
                <span className="font-semibold text-[var(--lg-text-primary)]">Auction module</span> consistently surfaces data-integrity and performance issues (Sessions 16, 17, 21, 27). This is the most complex feature — plan extra review time for auction changes.
              </p>
              <p className="text-xs text-[var(--lg-text-secondary)] leading-relaxed">
                <span className="font-semibold text-[var(--lg-text-primary)]">Duplication</span> appears every review — constants and utility functions get copy-pasted across modules instead of imported from sportConfig.ts. The 6-agent review catches these reliably.
              </p>
            </div>
          </div>

          {/* Timeline */}
          <div>
            <div className="text-[10px] font-semibold uppercase text-[var(--lg-text-muted)] mb-2 tracking-wide">
              All Findings Timeline
            </div>
            <div className="space-y-1">
              {historicalFindings.map((f) => (
                <div
                  key={`${f.session}-${f.id}`}
                  className="flex items-center gap-2 text-xs py-1.5 px-3 rounded-md bg-[var(--lg-tint)]"
                >
                  <span className={`font-semibold w-5 shrink-0 ${f.severity === "P1" ? "text-red-400" : "text-amber-400"}`}>
                    {f.severity}
                  </span>
                  <span className="text-[var(--lg-text-primary)] font-medium flex-1 min-w-0 truncate">
                    {f.title}
                  </span>
                  <span className="text-[10px] text-[var(--lg-text-muted)] shrink-0 tabular-nums">
                    S{f.session}
                  </span>
                  <span className="text-[10px] text-[var(--lg-text-muted)] bg-[var(--lg-bg-card)] px-1.5 py-0.5 rounded border border-[var(--lg-border-faint)] shrink-0">
                    {f.category}
                  </span>
                  <span className="text-[10px] text-emerald-400 shrink-0">{f.fixedDate}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ToolingWorkflow() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] p-5">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 text-left hover:opacity-80 transition-opacity"
      >
        <Terminal className="w-5 h-5 text-[var(--lg-accent)]" />
        <h2 className="text-lg font-semibold text-[var(--lg-text-primary)] flex-1">
          Tooling & Workflow
        </h2>
        <span className="text-xs text-[var(--lg-text-muted)]">
          {slashCommands.length} slash commands + {missingTools.length} recommended additions
        </span>
        {open ? (
          <ChevronUp className="w-5 h-5 text-[var(--lg-text-muted)]" />
        ) : (
          <ChevronDown className="w-5 h-5 text-[var(--lg-text-muted)]" />
        )}
      </button>

      {open && (
        <div className="mt-4 space-y-5">
          {/* Available slash commands */}
          <div>
            <div className="text-[10px] font-semibold uppercase text-emerald-400 tracking-wide mb-2">
              Available Slash Commands
            </div>
            <div className="space-y-1.5">
              {slashCommands.map((cmd) => (
                <div key={cmd.name} className="flex items-start gap-3 text-sm py-1.5 px-3 rounded-md bg-[var(--lg-tint)]">
                  <code className="text-xs font-semibold text-[var(--lg-accent)] bg-[var(--lg-bg-card)] px-1.5 py-0.5 rounded border border-[var(--lg-border-faint)] shrink-0">
                    {cmd.name}
                  </code>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs text-[var(--lg-text-primary)] font-medium">{cmd.description}</span>
                    <span className="text-[10px] text-[var(--lg-text-muted)]"> — {cmd.when}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Workflow tips */}
          <div>
            <div className="text-[10px] font-semibold uppercase text-[var(--lg-text-muted)] tracking-wide mb-2">
              Workflow Tips
            </div>
            <ul className="space-y-1">
              {workflowTips.map((tip) => (
                <li key={tip} className="flex items-start gap-2 text-xs text-[var(--lg-text-secondary)] py-0.5">
                  <span className="text-[var(--lg-accent)] mt-0.5 shrink-0">•</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Missing / recommended */}
          <div>
            <div className="text-[10px] font-semibold uppercase text-amber-400 tracking-wide mb-2">
              Recommended Additions
            </div>
            <div className="space-y-1.5">
              {missingTools.map((tool) => (
                <div key={tool.name} className="flex items-start gap-3 text-sm py-1.5 px-3 rounded-md bg-amber-500/5 border border-amber-500/20">
                  <code className="text-xs font-semibold text-amber-400 bg-[var(--lg-bg-card)] px-1.5 py-0.5 rounded border border-[var(--lg-border-faint)] shrink-0">
                    {tool.name}
                  </code>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs text-[var(--lg-text-primary)] font-medium">{tool.description}</span>
                    <span className="text-[10px] text-[var(--lg-text-muted)]"> — {tool.when}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TodoCard({ item }: { item: TodoItem }) {
  const Icon = tagIcon(item.tags);
  return (
    <div className="rounded-lg border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          {item.done ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          ) : (
            <Circle className="w-4 h-4 text-[var(--lg-text-muted)]" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <code className="text-xs font-medium text-[var(--lg-accent)] bg-[var(--lg-tint)] px-1.5 py-0.5 rounded">
              {item.id}
            </code>
            <h3
              className={`text-sm font-semibold ${item.done ? "text-[var(--lg-text-muted)] line-through" : "text-[var(--lg-text-primary)]"}`}
            >
              {item.title}
            </h3>
          </div>
          <p className="text-sm text-[var(--lg-text-secondary)] leading-relaxed mb-2">
            {item.description}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            {effortBadge(item.effort)}
            {item.tags.map((tag) => (
              <span
                key={tag}
                className="text-[10px] text-[var(--lg-text-muted)] bg-[var(--lg-tint)] px-1.5 py-0.5 rounded"
              >
                {tag}
              </span>
            ))}
          </div>
          {/* Date timeline */}
          {(item.foundDate || item.fixedDate) && (
            <div className="mt-2 flex items-center gap-3 text-[10px] text-[var(--lg-text-muted)]">
              {item.foundDate && (
                <span>
                  Found: <span className="font-medium text-[var(--lg-text-secondary)]">{item.foundDate}</span>
                </span>
              )}
              {item.fixedDate && (
                <span>
                  Fixed: <span className="font-medium text-emerald-400">{item.fixedDate}</span>
                </span>
              )}
              {item.source && (
                <span className="opacity-60">via {item.source}</span>
              )}
            </div>
          )}
          {item.file && (
            <div className="mt-1">
              <code className="text-[10px] text-[var(--lg-text-muted)] font-mono">
                {item.file}
              </code>
            </div>
          )}
        </div>
        <Icon className="w-4 h-4 text-[var(--lg-text-muted)] shrink-0 mt-0.5" />
      </div>
    </div>
  );
}

function PrioritySection({
  level,
  label,
  sublabel,
  icon: SeverityIcon,
  iconColor,
  items,
}: {
  level: string;
  label: string;
  sublabel: string;
  icon: React.ElementType;
  iconColor: string;
  items: TodoItem[];
}) {
  const [showCompleted, setShowCompleted] = useState(false);
  const openItems = items.filter((i) => !i.done);
  const doneItems = items.filter((i) => i.done);
  const doneCount = doneItems.length;

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <SeverityIcon className={`w-5 h-5 ${iconColor}`} />
        <div className="flex-1">
          <div className="flex items-baseline gap-2">
            <h2 className="text-lg font-semibold text-[var(--lg-text-primary)]">
              {level} — {label}
            </h2>
            <span className="text-xs text-[var(--lg-text-muted)] tabular-nums">
              {doneCount}/{items.length}
            </span>
          </div>
          <p className="text-xs text-[var(--lg-text-muted)]">{sublabel}</p>
        </div>
      </div>

      {/* Open items */}
      {openItems.length > 0 && (
        <div className="space-y-2 mb-3">
          {openItems.map((item) => (
            <TodoCard key={item.id} item={item} />
          ))}
        </div>
      )}

      {/* Completed items — collapsible accordion */}
      {doneCount > 0 && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 overflow-hidden">
          <button
            onClick={() => setShowCompleted(!showCompleted)}
            className="w-full px-4 py-2.5 flex items-center gap-2 text-left hover:bg-emerald-500/10 transition-colors"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span className="text-xs font-semibold text-emerald-400 flex-1">
              {doneCount} completed {level} item{doneCount !== 1 ? "s" : ""}
            </span>
            {showCompleted ? (
              <ChevronUp className="w-4 h-4 text-emerald-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-emerald-400" />
            )}
          </button>
          {showCompleted && (
            <div className="px-3 pb-3 space-y-2">
              {doneItems.map((item) => (
                <TodoCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* All done message */}
      {openItems.length === 0 && doneCount > 0 && (
        <div className="text-xs text-emerald-400 font-medium mb-1 px-1">
          All {level} items resolved
        </div>
      )}
    </div>
  );
}

function CompletedSection() {
  const [open, setOpen] = useState(false);
  const totalCompleted = completedGroups.reduce((s, g) => s + g.count, 0);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 py-3 text-left hover:opacity-80 transition-opacity"
      >
        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-[var(--lg-text-primary)]">
            Completed
          </h2>
          <p className="text-xs text-[var(--lg-text-muted)]">
            {totalCompleted} items across Sessions 5-26
          </p>
        </div>
        {open ? (
          <ChevronUp className="w-5 h-5 text-[var(--lg-text-muted)]" />
        ) : (
          <ChevronDown className="w-5 h-5 text-[var(--lg-text-muted)]" />
        )}
      </button>

      {open && (
        <div className="space-y-4 mt-2">
          {completedGroups.map((group) => (
            <div
              key={group.label}
              className="rounded-lg border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] p-4"
            >
              <div className="flex items-baseline gap-2 mb-2">
                <h3 className="text-sm font-semibold text-[var(--lg-text-primary)]">
                  {group.label}
                </h3>
                <span className="text-xs text-emerald-500 tabular-nums">
                  {group.count} done
                </span>
              </div>
              <ul className="space-y-1">
                {group.items.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                    <span className="text-[var(--lg-text-secondary)]">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Main Page ───────────────────────────────────────────────────── */

export default function Roadmap() {
  const openCount = summary.p1 + summary.p2 + summary.p3Open + summary.p3Existing;
  const pct = Math.round((summary.completed / summary.total) * 100);

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
          Tracked items from tech debt audits, 6-agent code reviews, and feature
          planning. This page is the visual companion to{" "}
          <code className="text-xs bg-[var(--lg-tint)] px-1 py-0.5 rounded">
            TODO.md
          </code>{" "}
          in the repository.
        </p>
        <p className="mt-1 text-xs text-[var(--lg-text-muted)]">
          Last updated: {LAST_UPDATED} | Last review: {LAST_REVIEW}
        </p>
      </div>

      {/* Project Health Scorecard */}
      <ProjectHealth />

      {/* Product Roadmap */}
      <ProductRoadmap />

      {/* Session Velocity */}
      <VelocityChart />

      {/* Next Session Planning */}
      <SessionPlanning />

      {/* Risk Register */}
      <RiskRegister />

      {/* Audit Recommendations */}
      <AuditRecommendations />

      {/* Findings History & Patterns */}
      <FindingsTimeline />

      {/* Tooling & Workflow */}
      <ToolingWorkflow />

      {/* Progress Summary */}
      <div className="rounded-lg border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-[var(--lg-text-primary)]">
            Overall Progress
          </h2>
          <span className="text-sm font-semibold text-[var(--lg-accent)] tabular-nums">
            {summary.completed}/{summary.total} ({pct}%)
          </span>
        </div>

        {/* Progress bar */}
        <div className="w-full h-2 rounded-full bg-[var(--lg-tint)] overflow-hidden mb-4">
          <div
            className="h-full rounded-full bg-[var(--lg-accent)] transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Breakdown */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="text-center">
            <div className="text-xl font-semibold text-red-400 tabular-nums">
              {summary.p1}
            </div>
            <div className="text-[10px] font-medium uppercase text-[var(--lg-text-muted)]">
              P1 Critical
            </div>
          </div>
          <div className="text-center">
            <div className="text-xl font-semibold text-amber-400 tabular-nums">
              {summary.p2}
            </div>
            <div className="text-[10px] font-medium uppercase text-[var(--lg-text-muted)]">
              P2 Important
            </div>
          </div>
          <div className="text-center">
            <div className="text-xl font-semibold text-blue-400 tabular-nums">
              {summary.p3Open + summary.p3Existing}
            </div>
            <div className="text-[10px] font-medium uppercase text-[var(--lg-text-muted)]">
              P3 Nice-to-Have
            </div>
          </div>
          <div className="text-center">
            <div className="text-xl font-semibold text-emerald-500 tabular-nums">
              {summary.completed}
            </div>
            <div className="text-[10px] font-medium uppercase text-[var(--lg-text-muted)]">
              Completed
            </div>
          </div>
        </div>
      </div>

      {/* P1 */}
      <PrioritySection
        level="P1"
        label="Critical"
        sublabel="Fix before live auction (Mar 22, 2026)"
        icon={AlertCircle}
        iconColor="text-red-400"
        items={p1Items}
      />

      {/* P2 */}
      <PrioritySection
        level="P2"
        label="Important"
        sublabel="Security, duplication, type safety — fix soon"
        icon={AlertTriangle}
        iconColor="text-amber-400"
        items={p2Items}
      />

      {/* P3 */}
      <PrioritySection
        level="P3"
        label="Nice-to-Have"
        sublabel="Dead code cleanup, architecture, ongoing maintenance"
        icon={Info}
        iconColor="text-blue-400"
        items={[...p3Items, ...existingItems]}
      />

      {/* Completed */}
      <CompletedSection />

      {/* Footer */}
      <p className="text-xs text-[var(--lg-text-muted)] text-center pb-4">
        Source of truth:{" "}
        <code className="bg-[var(--lg-tint)] px-1 py-0.5 rounded">
          TODO.md
        </code>{" "}
        |{" "}
        <Link to="/tech" className="text-[var(--lg-accent)] hover:underline">
          Under the Hood
        </Link>
      </p>
    </div>
  );
}
