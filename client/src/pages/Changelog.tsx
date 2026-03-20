import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  GitCommit,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Bug,
  Sparkles,
  Wrench,
  Shield,
  Zap,
  TestTube,
  Layers,
  Database,
  Globe,
  Users,
} from "lucide-react";

/* ── Data ────────────────────────────────────────────────────────── */

interface ChangelogEntry {
  version: string;
  date: string;
  session: string;
  title: string;
  highlights: string[];
  changes: { type: "feat" | "fix" | "perf" | "refactor" | "test" | "docs" | "security"; description: string }[];
}

const changelog: ChangelogEntry[] = [
  {
    version: "0.31.0",
    date: "Mar 20, 2026",
    session: "Session 31",
    title: "Auction UX, MLB Home, Guide Rewrite & Code Review",
    highlights: [
      "9 of 12 auction enhancements complete (timer, sold visual, keeper cost, settings)",
      "MLB-powered Home page with live scores & transactions",
      "Guide split into 3 pages with Playwright screenshots",
    ],
    changes: [
      { type: "feat", description: "Nomination timer countdown (30s visible, red pulse at <10s)" },
      { type: "feat", description: "'Going Once, Going Twice, SOLD!' escalation visual (5s/3s/1s)" },
      { type: "feat", description: "Keeper cost preview ($bid+5) when high bidder" },
      { type: "feat", description: "Auction settings panel with 6 per-user toggles" },
      { type: "feat", description: "Auction Excel export on completion screen" },
      { type: "feat", description: "MLB-powered Home page with live scores, transactions, date nav" },
      { type: "feat", description: "About page with product overview and feature breakdown" },
      { type: "feat", description: "Guide split into 3 pages (Account, Auction, FAQ) with screenshots" },
      { type: "feat", description: "Commissioner roster release button in RosterGrid" },
      { type: "feat", description: "Sidebar collapse/expand caret, condensed 6 to 4 sections" },
      { type: "feat", description: "mlb-feed server module (3 endpoints: scores, transactions, my-players)" },
      { type: "feat", description: "Bid timer dropdown (15s increments)" },
      { type: "feat", description: "Tooltips on auction column headers" },
      { type: "fix", description: "Proxy bid auth bypass (GET+DELETE required no ownership check)" },
      { type: "fix", description: "Proxy bid deletion bug" },
      { type: "fix", description: "Unbounded chat array (memory leak)" },
      { type: "fix", description: "Bid picker validation" },
      { type: "refactor", description: "Type safety: teams:any[] to AuctionTeam[], duplicate interfaces removed" },
      { type: "refactor", description: "useCallback on handlers, win sound detection, rate limiter fix" },
      { type: "test", description: "MCP phases 7-8: 21 integration tests, full README" },
      { type: "docs", description: "Print/PDF styles for Guide pages" },
    ],
  },
  {
    version: "0.27.0",
    date: "Mar 19, 2026",
    session: "Session 27",
    title: "6-Agent Code Review, P1/P2 Fixes & Roadmap",
    highlights: [
      "All 3 P1 critical fixes for auction reliability",
      "Visual /roadmap page with project health scorecard",
      "positionToSlots/PITCHER_CODES consolidated into sportConfig.ts",
    ],
    changes: [
      { type: "fix", description: "Awaited AuctionLot.update in finishCurrentLot (data integrity)" },
      { type: "perf", description: "DraftLog re-fetches only on WIN events, not every log event" },
      { type: "perf", description: "checkPositionLimit uses in-memory state (~690 fewer DB queries)" },
      { type: "security", description: "player-season-stats now requires leagueId (no default to 1)" },
      { type: "fix", description: "persistState logs errors instead of silently swallowing" },
      { type: "refactor", description: "positionToSlots(), PITCHER_CODES, NL_TEAMS consolidated to sportConfig.ts" },
      { type: "refactor", description: "Added TWP (two-way player) to PITCHER_CODES" },
      { type: "refactor", description: "Removed unused ThemedTable imports, dead ternary, double useLeague()" },
      { type: "perf", description: "Added useMemo on teamMap and completedLots in AuctionDraftLog" },
      { type: "feat", description: "Visual /roadmap page with health scorecard, audit recommendations, findings timeline" },
      { type: "feat", description: "Cost comparison section on /tech page (AI vs US dev shop vs offshore)" },
      { type: "docs", description: "Consolidated TODO.md with all CR-## findings" },
    ],
  },
  {
    version: "0.26.0",
    date: "Mar 19, 2026",
    session: "Session 26",
    title: "2025 Stats from MLB API & Auction Bid Tracking",
    highlights: [
      "Real 2025 stats for all 1,652 MLB players",
      "Sortable stat columns across Players and Auction pages",
      "Draft Board log with per-lot bid history",
    ],
    changes: [
      { type: "feat", description: "2025 season stats from MLB API with 30-day SQLite cache and CSV fallback" },
      { type: "feat", description: "Sortable stat columns (R, HR, RBI, SB, AVG, W, SV, K, ERA, WHIP)" },
      { type: "feat", description: "Auction bid history tracking via AuctionLot/AuctionBid models" },
      { type: "feat", description: "Draft Board log with expandable per-lot bid history" },
      { type: "refactor", description: "Removed $ column from Player Pool tab" },
    ],
  },
  {
    version: "0.25.0",
    date: "Mar 19, 2026",
    session: "Session 25",
    title: "Player Data Polish, Full Team Names, OF Mapping",
    highlights: [
      "Full team names replacing 3-letter codes throughout",
      "OF position mapping controlled by league rule",
      "6 new server tests",
    ],
    changes: [
      { type: "feat", description: "Full fantasy team names in PlayerDetailModal, AuctionValues, Team page" },
      { type: "feat", description: "OF position mapping (CF/RF/LF → OF) controlled by outfieldMode league rule" },
      { type: "fix", description: "Transaction section shows last 3 transactions (2-year window, not 30-day)" },
      { type: "fix", description: "Profile tab team fallback to mlbTeam when API returns no currentTeam" },
      { type: "fix", description: "League 1 stats_source updated from NL to ALL" },
      { type: "test", description: "6 new server tests for player routes and mlbSyncService" },
      { type: "docs", description: "Season lifecycle sequence diagram in docs/howto.md" },
    ],
  },
  {
    version: "0.24.0",
    date: "Mar 18, 2026",
    session: "Session 24",
    title: "Live Data Integration & Auction Readiness",
    highlights: [
      "Live standings powered by PlayerStatsPeriod data",
      "All 30 MLB teams synced (not just NL)",
      "4 test leagues prepped for live auction",
    ],
    changes: [
      { type: "feat", description: "Live standings computation from PlayerStatsPeriod via computeTeamStatsFromDb" },
      { type: "feat", description: "Admin stats sync endpoint: POST /api/admin/sync-stats" },
      { type: "feat", description: "syncAllPlayers() syncs all 30 MLB teams with team-change detection" },
      { type: "feat", description: "Auction pause/resume available to commissioners (not just admins)" },
      { type: "feat", description: "NL/AL/All player pool filter toggle in auction UI" },
      { type: "test", description: "20 new tests: 11 standings routes, 7 mlbSyncService, 2 admin" },
    ],
  },
  {
    version: "0.23.0",
    date: "Mar 18, 2026",
    session: "Session 23",
    title: "Auth System Overhaul & MCP Server",
    highlights: [
      "Password reset flow, pre-signup email invites",
      "MCP MLB Data Proxy with SQLite cache",
      "644 tests passing",
    ],
    changes: [
      { type: "feat", description: "Password reset flow via Supabase Auth" },
      { type: "feat", description: "Pre-signup email invites with auto-accept on first login" },
      { type: "feat", description: "MCP MLB Data Proxy server with 8 tools, SQLite cache, rate limiter" },
      { type: "feat", description: "Google OAuth verification" },
      { type: "feat", description: "Custom SMTP via Resend for transactional emails" },
      { type: "test", description: "Keeper lock E2E testing (3 scenarios)" },
    ],
  },
  {
    version: "0.21.0",
    date: "Mar 17, 2026",
    session: "Session 21",
    title: "6-Agent Code Review (PR #37)",
    highlights: [
      "15 findings resolved from 6-agent parallel review",
      "Budget floor check, endAuction transaction, Mermaid hardening",
    ],
    changes: [
      { type: "security", description: "Mermaid securityLevel hardened" },
      { type: "fix", description: "endAuction wrapped in $transaction for atomicity" },
      { type: "fix", description: "Budget floor check added to auction bidding" },
      { type: "refactor", description: "Roto scoring deduplicated in archiveStatsService" },
      { type: "refactor", description: "Double-casts removed in teamService" },
    ],
  },
  {
    version: "0.18.0",
    date: "Mar 16, 2026",
    session: "Sessions 18-20",
    title: "Season-Aware Feature Gating",
    highlights: [
      "Full season lifecycle: SETUP → DRAFT → IN_SEASON → COMPLETED",
      "useSeasonGating() hook + requireSeasonStatus middleware",
      "116 server tests added",
    ],
    changes: [
      { type: "feat", description: "Season lifecycle management (SETUP → DRAFT → IN_SEASON → COMPLETED)" },
      { type: "feat", description: "useSeasonGating() hook for client-side feature visibility" },
      { type: "feat", description: "requireSeasonStatus() middleware for server-side enforcement" },
      { type: "feat", description: "Commissioner tab gating and breadcrumb status bar" },
      { type: "feat", description: "Franchise schema refactor for multi-season leagues" },
      { type: "test", description: "116 new server tests across 10 feature modules" },
    ],
  },
  {
    version: "0.14.0",
    date: "Mar 12, 2026",
    session: "Sessions 11-14",
    title: "Archive System & Design Overhaul",
    highlights: [
      "17 years of Excel archives imported (2008-2025)",
      "Complete design system with dark mode",
      "Custom CSS tokens across all components",
    ],
    changes: [
      { type: "feat", description: "Historical archive system parsing 17 years of Excel spreadsheets" },
      { type: "feat", description: "Grid detection, side-by-side table unrolling, fuzzy player name matching" },
      { type: "feat", description: "Complete design system overhaul with custom CSS tokens" },
      { type: "feat", description: "Dark mode support across all pages" },
      { type: "refactor", description: "Deleted all sci-fi/military naming from 30+ files" },
    ],
  },
  {
    version: "0.10.0",
    date: "Mar 8, 2026",
    session: "Sessions 7-10",
    title: "Auction, Trades, Waivers & Security",
    highlights: [
      "Live auction draft with WebSocket real-time bidding",
      "Trade proposal system with voting",
      "Security audit: hardcoded credentials + missing auth fixed",
    ],
    changes: [
      { type: "feat", description: "Live auction draft with WebSocket (bidding, auto-finish, concurrent protection)" },
      { type: "feat", description: "Trade proposal system with multi-team voting" },
      { type: "feat", description: "FAAB waiver claims workflow" },
      { type: "feat", description: "Commissioner admin tools" },
      { type: "security", description: "Removed hardcoded DB credentials from scripts" },
      { type: "security", description: "Added auth middleware to 3 unprotected endpoints" },
    ],
  },
  {
    version: "0.6.0",
    date: "Dec 2025",
    session: "Sessions 3-6",
    title: "Core Features",
    highlights: [
      "Teams, rosters, player search",
      "Standings computation engine",
      "Auth migration to Bearer tokens",
    ],
    changes: [
      { type: "feat", description: "Team management and roster views" },
      { type: "feat", description: "Player search with MLB Stats API integration" },
      { type: "feat", description: "Standings computation engine with category rankings" },
      { type: "refactor", description: "Auth migration — 20+ files updated to Bearer tokens" },
    ],
  },
  {
    version: "0.2.0",
    date: "Nov 2025",
    session: "Sessions 1-2",
    title: "Scaffolding",
    highlights: [
      "Vite + Express + Prisma initial setup",
      "Database schema with first 10 models",
      "Supabase auth integration",
    ],
    changes: [
      { type: "feat", description: "Initial project scaffolding: Vite + Express + Prisma" },
      { type: "feat", description: "Database schema design with first 10 models" },
      { type: "feat", description: "Supabase Auth integration (Google/Yahoo OAuth)" },
    ],
  },
];

const typeConfig: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  feat: { label: "Feature", icon: Sparkles, color: "text-emerald-400" },
  fix: { label: "Fix", icon: Bug, color: "text-amber-400" },
  perf: { label: "Perf", icon: Zap, color: "text-blue-400" },
  refactor: { label: "Refactor", icon: Wrench, color: "text-purple-400" },
  test: { label: "Test", icon: TestTube, color: "text-cyan-400" },
  docs: { label: "Docs", icon: Layers, color: "text-[var(--lg-text-muted)]" },
  security: { label: "Security", icon: Shield, color: "text-red-400" },
};

/* ── Components ──────────────────────────────────────────────────── */

function ChangelogRelease({ entry }: { entry: ChangelogEntry }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-[var(--lg-tint)] transition-colors"
      >
        <div className="flex flex-col items-center gap-0.5">
          <code className="text-sm font-semibold text-[var(--lg-accent)] tabular-nums">
            {entry.version}
          </code>
          <span className="text-[10px] text-[var(--lg-text-muted)]">{entry.session}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-[var(--lg-text-primary)]">
              {entry.title}
            </h3>
            <span className="text-xs text-[var(--lg-text-muted)]">{entry.date}</span>
          </div>
          <ul className="mt-1 space-y-0.5">
            {entry.highlights.map((h) => (
              <li key={h} className="text-xs text-[var(--lg-text-secondary)] truncate">
                • {h}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs text-[var(--lg-text-muted)] tabular-nums">
            {entry.changes.length} changes
          </span>
          {open ? (
            <ChevronUp className="w-4 h-4 text-[var(--lg-text-muted)]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[var(--lg-text-muted)]" />
          )}
        </div>
      </button>

      {open && (
        <div className="px-5 pb-4 space-y-1.5">
          {entry.changes.map((change, idx) => {
            const cfg = typeConfig[change.type];
            const TypeIcon = cfg.icon;
            return (
              <div
                key={idx}
                className="flex items-start gap-2 text-sm py-1.5 px-3 rounded-md bg-[var(--lg-tint)]"
              >
                <TypeIcon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${cfg.color}`} />
                <span className={`text-[10px] font-semibold uppercase w-14 shrink-0 mt-0.5 ${cfg.color}`}>
                  {cfg.label}
                </span>
                <span className="text-[var(--lg-text-secondary)]">{change.description}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ChangelogStats() {
  const totalChanges = changelog.reduce((s, e) => s + e.changes.length, 0);
  const typeBreakdown = changelog.reduce<Record<string, number>>((acc, e) => {
    e.changes.forEach((c) => { acc[c.type] = (acc[c.type] || 0) + 1; });
    return acc;
  }, {});
  const sorted = Object.entries(typeBreakdown).sort((a, b) => b[1] - a[1]);

  return (
    <div className="rounded-lg border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] p-5">
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="text-center">
          <div className="text-xl font-semibold text-[var(--lg-text-primary)] tabular-nums">
            {changelog.length}
          </div>
          <div className="text-[10px] text-[var(--lg-text-muted)] uppercase">Releases</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-semibold text-[var(--lg-text-primary)] tabular-nums">
            {totalChanges}
          </div>
          <div className="text-[10px] text-[var(--lg-text-muted)] uppercase">Total Changes</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-semibold text-[var(--lg-text-primary)] tabular-nums">
            31
          </div>
          <div className="text-[10px] text-[var(--lg-text-muted)] uppercase">Sessions</div>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {sorted.map(([type, count]) => {
          const cfg = typeConfig[type];
          return (
            <span
              key={type}
              className={`text-[10px] font-semibold uppercase px-2 py-1 rounded ${cfg.color} bg-[var(--lg-tint)]`}
            >
              {cfg.label}: {count}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ── Main Page ───────────────────────────────────────────────────── */

export default function Changelog() {
  return (
    <div className="px-4 py-6 md:px-6 md:py-10 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <GitCommit className="w-5 h-5 text-[var(--lg-accent)]" />
            <h1 className="text-2xl font-semibold text-[var(--lg-text-primary)]">
              Changelog
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
          Release history across all development sessions. Each entry maps to a session
          in the build journal — features shipped, bugs fixed, and improvements made.
        </p>
      </div>

      {/* Stats */}
      <ChangelogStats />

      {/* Releases */}
      <div className="space-y-3">
        {changelog.map((entry) => (
          <ChangelogRelease key={entry.version} entry={entry} />
        ))}
      </div>

      {/* Footer */}
      <p className="text-xs text-[var(--lg-text-muted)] text-center pb-4">
        Derived from{" "}
        <code className="bg-[var(--lg-tint)] px-1 py-0.5 rounded">FEEDBACK.md</code>{" "}
        and git history |{" "}
        <Link to="/tech" className="text-[var(--lg-accent)] hover:underline">
          Under the Hood
        </Link>
      </p>
    </div>
  );
}
