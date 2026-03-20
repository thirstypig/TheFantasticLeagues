import React from "react";
import { Link } from "react-router-dom";
import {
  BarChart3,
  ArrowRight,
  TrendingUp,
  Users,
  MousePointer,
  Eye,
  Timer,
  Target,
  Zap,
  ExternalLink,
} from "lucide-react";

/* ── Data ────────────────────────────────────────────────────────── */

interface MetricCard {
  label: string;
  description: string;
  icon: React.ElementType;
  status: "tracking" | "planned";
}

const metrics: MetricCard[] = [
  { label: "Pageviews", description: "Page-level tracking with SPA-aware navigation events via PostHog", icon: Eye, status: "tracking" },
  { label: "User Identity", description: "Authenticated users identified by email for session continuity", icon: Users, status: "tracking" },
  { label: "Feature Adoption", description: "Which features owners use most — auction, trades, standings, archive", icon: Target, status: "planned" },
  { label: "Auction Engagement", description: "Bid velocity, nomination patterns, session duration during live drafts", icon: Zap, status: "planned" },
  { label: "Page Performance", description: "Load times, slow API calls, and rendering bottlenecks", icon: Timer, status: "planned" },
  { label: "Click Tracking", description: "Key interaction events — trade votes, waiver submissions, tab switches", icon: MousePointer, status: "planned" },
];

interface InsightItem {
  question: string;
  answer: string;
  source: string;
}

const earlyInsights: InsightItem[] = [
  {
    question: "What pages do owners visit most?",
    answer: "Track via PostHog pageview events. Expected top pages: Home (standings), Team roster, Auction, Activity feed.",
    source: "PostHog pageviews",
  },
  {
    question: "How engaged are owners during auction?",
    answer: "Measure via WebSocket bid events, nomination rate, and session duration. Draft Board log already tracks per-lot bid history.",
    source: "Auction bid history + PostHog",
  },
  {
    question: "Are trades and waivers being used?",
    answer: "Track proposal rate, vote response time, and waiver claim frequency. Low adoption may indicate UX friction.",
    source: "Transaction events + PostHog",
  },
  {
    question: "Which features need mobile optimization?",
    answer: "PostHog viewport data shows device breakdown. Pages with high mobile traffic but poor engagement need responsive work.",
    source: "PostHog device properties",
  },
];

const sessionVelocity = [
  { session: "1-2", items: 3, label: "Scaffolding" },
  { session: "3-6", items: 8, label: "Core features" },
  { session: "7-10", items: 14, label: "Auction, trades, security" },
  { session: "11-14", items: 12, label: "Archive, design" },
  { session: "15-17", items: 16, label: "Scripts, maintenance, franchise" },
  { session: "18-20", items: 22, label: "Season gating, testing" },
  { session: "21-23", items: 30, label: "Code review, auth, MCP" },
  { session: "24-25", items: 26, label: "Live data, auction prep" },
  { session: "26-27", items: 24, label: "Stats, bid tracking, roadmap" },
];

/* ── Components ──────────────────────────────────────────────────── */

function VelocityChart() {
  const maxItems = Math.max(...sessionVelocity.map((s) => s.items));
  const totalItems = sessionVelocity.reduce((s, v) => s + v.items, 0);

  return (
    <div className="rounded-lg border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] p-5">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-5 h-5 text-[var(--lg-accent)]" />
        <h2 className="text-lg font-semibold text-[var(--lg-text-primary)]">
          Development Velocity
        </h2>
        <span className="text-xs text-[var(--lg-text-muted)] ml-auto tabular-nums">
          {totalItems} items across 27 sessions
        </span>
      </div>

      <div className="space-y-2">
        {sessionVelocity.map((s) => {
          const pct = (s.items / maxItems) * 100;
          return (
            <div key={s.session} className="flex items-center gap-3">
              <span className="text-xs font-medium text-[var(--lg-text-muted)] w-12 shrink-0 tabular-nums text-right">
                S{s.session}
              </span>
              <div className="flex-1 h-4 rounded bg-[var(--lg-tint)] overflow-hidden relative">
                <div
                  className="h-full rounded bg-[var(--lg-accent)] transition-all"
                  style={{ width: `${pct}%` }}
                />
                <span className="absolute inset-y-0 left-2 flex items-center text-[10px] font-semibold text-white mix-blend-difference">
                  {s.items}
                </span>
              </div>
              <span className="text-xs text-[var(--lg-text-muted)] w-40 shrink-0 truncate">
                {s.label}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-4 pt-3 border-t border-[var(--lg-border-faint)] grid grid-cols-3 gap-4 text-center">
        <div>
          <div className="text-lg font-semibold text-[var(--lg-text-primary)] tabular-nums">
            {Math.round(totalItems / 27 * 10) / 10}
          </div>
          <div className="text-[10px] text-[var(--lg-text-muted)] uppercase">Avg per Session</div>
        </div>
        <div>
          <div className="text-lg font-semibold text-[var(--lg-text-primary)] tabular-nums">
            {maxItems}
          </div>
          <div className="text-[10px] text-[var(--lg-text-muted)] uppercase">Peak (S21-23)</div>
        </div>
        <div>
          <div className="text-lg font-semibold text-emerald-400 tabular-nums">
            +{Math.round(((sessionVelocity[sessionVelocity.length - 1].items - sessionVelocity[0].items) / sessionVelocity[0].items) * 100)}%
          </div>
          <div className="text-[10px] text-[var(--lg-text-muted)] uppercase">Growth</div>
        </div>
      </div>
    </div>
  );
}

/* ── Main Page ───────────────────────────────────────────────────── */

export default function Analytics() {
  const trackingCount = metrics.filter((m) => m.status === "tracking").length;
  const plannedCount = metrics.filter((m) => m.status === "planned").length;

  return (
    <div className="px-4 py-6 md:px-6 md:py-10 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[var(--lg-accent)]" />
            <h1 className="text-2xl font-semibold text-[var(--lg-text-primary)]">
              Analytics
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/roadmap"
              className="text-xs font-medium text-[var(--lg-accent)] hover:underline flex items-center gap-1"
            >
              Roadmap <ArrowRight className="w-3 h-3" />
            </Link>
            <Link
              to="/tech"
              className="text-xs font-medium text-[var(--lg-accent)] hover:underline flex items-center gap-1"
            >
              Under the Hood <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
        <p className="mt-2 text-sm text-[var(--lg-text-secondary)]">
          Product analytics powered by PostHog. Track how owners use the platform,
          identify adoption patterns, and make data-driven decisions about what to build next.
        </p>
      </div>

      {/* Development Velocity */}
      <VelocityChart />

      {/* Metrics Grid */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Target className="w-5 h-5 text-[var(--lg-accent)]" />
          <h2 className="text-lg font-semibold text-[var(--lg-text-primary)]">
            Product Metrics
          </h2>
          <span className="text-xs text-[var(--lg-text-muted)] ml-auto">
            {trackingCount} active · {plannedCount} planned
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {metrics.map((m) => {
            const Icon = m.icon;
            return (
              <div
                key={m.label}
                className="rounded-lg border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] p-4"
              >
                <div className="flex items-start gap-3">
                  <Icon className="w-4 h-4 text-[var(--lg-text-muted)] mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold text-[var(--lg-text-primary)]">
                        {m.label}
                      </h3>
                      <span
                        className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border ${
                          m.status === "tracking"
                            ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                            : "text-[var(--lg-text-muted)] bg-[var(--lg-tint)] border-[var(--lg-border-faint)]"
                        }`}
                      >
                        {m.status}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--lg-text-secondary)] leading-relaxed">
                      {m.description}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Key Questions */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="w-5 h-5 text-[var(--lg-accent)]" />
          <h2 className="text-lg font-semibold text-[var(--lg-text-primary)]">
            Questions to Answer
          </h2>
        </div>
        <div className="space-y-2">
          {earlyInsights.map((insight) => (
            <div
              key={insight.question}
              className="rounded-lg border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] p-4"
            >
              <h4 className="text-sm font-semibold text-[var(--lg-text-primary)] mb-1">
                {insight.question}
              </h4>
              <p className="text-sm text-[var(--lg-text-secondary)] leading-relaxed mb-2">
                {insight.answer}
              </p>
              <span className="text-[10px] text-[var(--lg-text-muted)] bg-[var(--lg-tint)] px-1.5 py-0.5 rounded">
                Source: {insight.source}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* PostHog CTA */}
      <div className="rounded-lg border border-[var(--lg-accent)]/20 bg-[var(--lg-accent)]/5 p-5 text-center">
        <BarChart3 className="w-8 h-8 text-[var(--lg-accent)] mx-auto mb-2" />
        <h3 className="text-sm font-semibold text-[var(--lg-text-primary)] mb-1">
          PostHog Dashboard
        </h3>
        <p className="text-xs text-[var(--lg-text-secondary)] mb-3">
          View live analytics, create funnels, and explore user behavior in the PostHog dashboard.
        </p>
        <a
          href="https://app.posthog.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--lg-accent)] hover:underline"
        >
          Open PostHog <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {/* Footer */}
      <p className="text-xs text-[var(--lg-text-muted)] text-center pb-4">
        Analytics integration:{" "}
        <code className="bg-[var(--lg-tint)] px-1 py-0.5 rounded">PostHog</code>{" "}
        (lazy-loaded, SPA-aware) |{" "}
        <Link to="/tech" className="text-[var(--lg-accent)] hover:underline">
          Under the Hood
        </Link>
      </p>
    </div>
  );
}
