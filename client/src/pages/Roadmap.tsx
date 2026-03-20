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
} from "lucide-react";

/* ── Data ────────────────────────────────────────────────────────── */

const LAST_UPDATED = "March 20, 2026 (Session 31)";

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
        description: "First live auction draft with 8 owners, real-time bidding via WebSocket, bid tracking, and draft board log.",
        icon: Target,
        effort: "Large",
        status: "in-progress",
        tags: ["auction", "milestone"],
      },
      {
        title: "Production Deployment",
        description: "Deploy all changes to Render. Verify Supabase auth, MLB API caching, and WebSocket connections in production.",
        icon: Globe,
        effort: "Small",
        status: "planned",
        tags: ["infrastructure"],
      },
      {
        title: "Post-Auction Retrospective",
        description: "After the live draft: review auction logs, analyze bid patterns, identify UX issues from real usage, document findings.",
        icon: BarChart3,
        effort: "Small",
        status: "planned",
        tags: ["process"],
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
        title: "Automated Stats Sync",
        description: "Scheduled daily sync of MLB stats during the season via cron job. Auto-compute period standings. Zero manual intervention.",
        icon: Activity,
        effort: "Medium",
        status: "planned",
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
        status: "planned",
        tags: ["waivers"],
      },
      {
        title: "PostHog Analytics",
        description: "Track key product metrics: daily active users, feature adoption, auction engagement, page performance.",
        icon: BarChart3,
        effort: "Small",
        status: "planned",
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
        status: "planned",
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
        status: "planned",
        tags: ["auction"],
      },
      {
        title: "Post-Auction Trade Block",
        description: "Immediately after draft, owners flag players they'd be willing to trade. Jump-starts the trade market.",
        icon: Users,
        effort: "Small",
        status: "planned",
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
    label: "Long Term",
    timeframe: "July 2026+ (Off-Season & Beyond)",
    color: "text-blue-400",
    borderColor: "border-blue-500/30",
    bgColor: "bg-blue-500/5",
    icon: Calendar,
    items: [
      {
        title: "Mobile-Responsive Redesign",
        description: "Full mobile experience for auction bidding, standings checking, and trade management on phones.",
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
        tags: ["franchise"],
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
        title: "Snake Draft Mode",
        description: "Support snake draft format alongside auction. Draft order management, pick trading, live draft board with auto-pick timer.",
        icon: Target,
        effort: "Large",
        status: "planned",
        tags: ["draft"],
      },
      {
        title: "Public League Directory",
        description: "Allow commissioners to list leagues publicly. Join via invite code or discovery. Onboarding flow for new owners.",
        icon: Globe,
        effort: "Medium",
        status: "planned",
        tags: ["growth"],
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
    label: "Session 31 (10 PRs merged)",
    items: [
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
            {totalCompleted} features shipped across 31 sessions
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
