import React, { useState } from "react";
import {
  Code2,
  Database,
  Server,
  Monitor,
  GitCommit,
  TestTube,
  Layers,
  Plug,
  Cpu,
  FileCode,
  Braces,
  Bot,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Lightbulb,
  BookOpen,
  Workflow,
} from "lucide-react";
import MermaidDiagram from "../components/MermaidDiagram";

/* ── Data ────────────────────────────────────────────────────────── */

const stats = [
  { label: "Total Lines of Code", value: "46,870+", icon: FileCode },
  { label: "Client (React/TS)", value: "19,910", icon: Monitor },
  { label: "Server (Node/TS)", value: "26,960", icon: Server },
  { label: "Test Coverage", value: "7,800+ lines", icon: TestTube },
  { label: "Database Models", value: "30", icon: Database },
  { label: "API Endpoints", value: "116", icon: Plug },
  { label: "Feature Modules", value: "17", icon: Layers },
  { label: "Git Commits", value: "138", icon: GitCommit },
  { label: "Tests Passing", value: "644", icon: TestTube },
  { label: "DB Schema Lines", value: "723", icon: Braces },
  { label: "DB Migrations", value: "10", icon: Database },
  { label: "Est. Tokens Used", value: "~65M+", icon: Bot },
];

const techStack = [
  {
    category: "Frontend",
    items: [
      { name: "React 18", desc: "UI library with hooks & functional components" },
      { name: "TypeScript", desc: "Strict mode across entire codebase" },
      { name: "Vite", desc: "Dev server & production bundler" },
      { name: "Tailwind CSS", desc: "Utility-first styling with custom design tokens" },
      { name: "React Router v6", desc: "Client-side routing with nested layouts" },
      { name: "Lucide React", desc: "Icon library" },
      { name: "Radix UI", desc: "Accessible UI primitives (shadcn-style)" },
      { name: "Headless UI", desc: "Unstyled accessible components" },
      { name: "dnd-kit", desc: "Drag-and-drop for auction & roster management" },
    ],
  },
  {
    category: "Backend",
    items: [
      { name: "Node.js + Express", desc: "REST API server" },
      { name: "TypeScript (ESM)", desc: "Strict mode, ES modules" },
      { name: "Prisma ORM", desc: "Type-safe database access with 30 models" },
      { name: "Zod", desc: "Runtime request validation" },
      { name: "Helmet", desc: "Security headers" },
      { name: "express-rate-limit", desc: "API rate limiting" },
      { name: "Multer", desc: "File upload handling (Excel/CSV imports)" },
      { name: "node-cron", desc: "Scheduled jobs" },
      { name: "WebSocket (ws)", desc: "Real-time auction updates" },
    ],
  },
  {
    category: "Database & Auth",
    items: [
      { name: "PostgreSQL", desc: "Primary database (hosted on Supabase)" },
      { name: "Supabase Auth", desc: "Google/Yahoo OAuth + email/password auth" },
      { name: "Supabase JS Client", desc: "Client-side session management" },
      { name: "Supabase Admin SDK", desc: "Server-side JWT verification" },
      { name: "bcryptjs", desc: "Password hashing" },
      { name: "jsonwebtoken", desc: "JWT token handling" },
    ],
  },
  {
    category: "Data & Integrations",
    items: [
      { name: "MLB Stats API", desc: "Live player data & statistics" },
      { name: "MCP MLB Data Proxy", desc: "Local MCP server with SQLite cache, rate limiter, circuit breaker (8 tools)" },
      { name: "Google Gemini AI", desc: "AI-powered player analysis" },
      { name: "Resend", desc: "Transactional email for league invites" },
      { name: "xlsx", desc: "Excel file parsing for archive imports" },
      { name: "csv-parse", desc: "CSV data processing for stats" },
      { name: "better-sqlite3", desc: "Persistent MLB API cache (WAL mode)" },
    ],
  },
  {
    category: "Testing & Quality",
    items: [
      { name: "Vitest", desc: "Fast unit & integration test framework" },
      { name: "React Testing Library", desc: "Component testing" },
      { name: "Supertest", desc: "HTTP-level route testing" },
      { name: "ESLint", desc: "Code linting with TypeScript rules" },
      { name: "644 tests", desc: "428 server + 187 client + 29 MCP tests" },
    ],
  },
  {
    category: "Infrastructure & Deployment",
    items: [
      { name: "Render", desc: "Hosting with SSL termination" },
      { name: "Supabase", desc: "Managed PostgreSQL + Auth + Storage" },
      { name: "Git / GitHub", desc: "Version control, PRs, CI" },
      { name: "MCP (Model Context Protocol)", desc: "Tool server for Claude Code CLI integration" },
    ],
  },
];

const featureModules = [
  { name: "auth", desc: "Login, signup, OAuth, password reset" },
  { name: "leagues", desc: "League CRUD, rules, invite codes" },
  { name: "teams", desc: "Team management, roster views" },
  { name: "players", desc: "Player search, stats, detail modals" },
  { name: "roster", desc: "Roster grid, controls, CSV import" },
  { name: "standings", desc: "Standings computation engine" },
  { name: "trades", desc: "Trade proposals & voting" },
  { name: "waivers", desc: "FAAB waiver claims workflow" },
  { name: "transactions", desc: "Transaction history & activity feed" },
  { name: "auction", desc: "Live auction draft with WebSocket" },
  { name: "keeper-prep", desc: "Keeper selection workflows" },
  { name: "commissioner", desc: "Commissioner admin tools" },
  { name: "seasons", desc: "Season lifecycle management" },
  { name: "admin", desc: "System admin, CSV import" },
  { name: "archive", desc: "Historical data import/export" },
  { name: "periods", desc: "Period standings & payouts" },
  { name: "franchises", desc: "Organization-level settings & membership" },
];

const erdDiagrams: { label: string; chart: string }[] = [
  {
    label: "Core: Organizations, Leagues & Users",
    chart: `erDiagram
    Franchise ||--o{ League : "has many"
    Franchise ||--o{ FranchiseMembership : "has many"
    User ||--o{ FranchiseMembership : "has many"
    User ||--o{ LeagueMembership : "has many"
    User ||--o{ TeamOwnership : "owns"
    League ||--o{ LeagueMembership : "has many"
    League ||--o{ Team : "has many"
    League ||--o{ Season : "has many"
    League ||--o{ LeagueRule : "has many"
    League ||--|| AuctionSession : "has one"

    Franchise {
        int id PK
        string name UK
        boolean isPublic
        string inviteCode UK
        string tradeReviewPolicy
    }
    User {
        int id PK
        string email UK
        string name
        string googleSub UK
        string yahooSub UK
        boolean isAdmin
    }
    League {
        int id PK
        string name
        int season
        enum draftMode
        int franchiseId FK
        boolean isPublic
    }
    Season {
        int id PK
        int leagueId FK
        int year
        enum status
    }
    LeagueRule {
        int id PK
        int leagueId FK
        string category
        string key
        string value
        boolean isLocked
    }
    LeagueMembership {
        int id PK
        int leagueId FK
        int userId FK
        enum role
    }
    FranchiseMembership {
        int id PK
        int franchiseId FK
        int userId FK
        enum role
    }
    AuctionSession {
        int id PK
        int leagueId FK
        json state
    }`,
  },
  {
    label: "Teams, Rosters & Players",
    chart: `erDiagram
    Team ||--o{ Roster : "has many"
    Team ||--o{ TeamOwnership : "has max 2"
    Team ||--o{ FinanceLedger : "has many"
    Team ||--o{ AuctionBid : "bids"
    Team }o--|| Team : "priorTeam"
    Player ||--o{ Roster : "on many"
    Player ||--o{ PlayerAlias : "has many"
    Player ||--o{ AuctionLot : "nominated in"
    AuctionLot ||--o{ AuctionBid : "has many"

    Team {
        int id PK
        int leagueId FK
        string name
        string code
        int budget
        int ownerUserId FK
        int priorTeamId FK
    }
    TeamOwnership {
        int id PK
        int teamId FK
        int userId FK
    }
    Player {
        int id PK
        int mlbId UK
        string name
        string posPrimary
        string posList
        string mlbTeam
    }
    Roster {
        int id PK
        int teamId FK
        int playerId FK
        string source
        int price
        datetime acquiredAt
        datetime releasedAt
        boolean isKeeper
    }
    PlayerAlias {
        int id PK
        int playerId FK
        string source
        string alias
    }
    AuctionLot {
        int id PK
        int playerId FK
        int nominatingTeamId
        string status
        int finalPrice
    }
    AuctionBid {
        int id PK
        int lotId FK
        int teamId FK
        int amount
    }
    FinanceLedger {
        int id PK
        int teamId FK
        string type
        int amount
    }`,
  },
  {
    label: "Trades, Waivers & Transactions",
    chart: `erDiagram
    Trade ||--o{ TradeItem : "has many"
    Trade }o--|| Team : "proposedBy"
    TradeItem }o--|| Team : "sender"
    TradeItem }o--|| Team : "recipient"
    TradeItem }o--o| Player : "involves"
    WaiverClaim }o--|| Team : "claimedBy"
    WaiverClaim }o--|| Player : "adding"
    WaiverClaim }o--o| Player : "dropping"
    TransactionEvent }o--o| Team : "involves"
    TransactionEvent }o--o| Player : "involves"

    Trade {
        int id PK
        int leagueId FK
        int proposerId FK
        enum status
        datetime processedAt
    }
    TradeItem {
        int id PK
        int tradeId FK
        int senderId FK
        int recipientId FK
        enum assetType
        int playerId FK
        int amount
    }
    WaiverClaim {
        int id PK
        int teamId FK
        int playerId FK
        int dropPlayerId FK
        int bidAmount
        enum status
    }
    TransactionEvent {
        int id PK
        int leagueId FK
        string rowHash UK
        int teamId FK
        int playerId FK
        string transactionType
    }`,
  },
  {
    label: "Stats & Standings",
    chart: `erDiagram
    Season ||--o{ Period : "has many"
    Period ||--o{ TeamStatsPeriod : "has many"
    Period ||--o{ PlayerStatsPeriod : "has many"
    Team ||--o{ TeamStatsPeriod : "has many"
    Team ||--|| TeamStatsSeason : "has one"
    Player ||--o{ PlayerStatsPeriod : "has many"

    Period {
        int id PK
        string name
        datetime startDate
        datetime endDate
        int leagueId FK
        int seasonId FK
    }
    TeamStatsPeriod {
        int id PK
        int teamId FK
        int periodId FK
        int R
        int HR
        int RBI
        int SB
        float AVG
        int W
        int S
        float ERA
        float WHIP
        int K
    }
    TeamStatsSeason {
        int id PK
        int teamId FK
        int R
        int HR
        int RBI
        int SB
        float AVG
    }
    PlayerStatsPeriod {
        int id PK
        int playerId FK
        int periodId FK
        int AB
        int H
        int R
        int HR
        int W
        int SV
        int K
        float IP
    }`,
  },
  {
    label: "Historical Archive",
    chart: `erDiagram
    HistoricalSeason ||--o{ HistoricalPeriod : "has many"
    HistoricalSeason ||--o{ HistoricalStanding : "has many"
    HistoricalPeriod ||--o{ HistoricalPlayerStat : "has many"

    HistoricalSeason {
        int id PK
        int year
        int leagueId FK
    }
    HistoricalPeriod {
        int id PK
        int seasonId FK
        int periodNumber
        datetime startDate
        datetime endDate
    }
    HistoricalPlayerStat {
        int id PK
        int periodId FK
        string playerName
        string mlbId
        string teamCode
        boolean isPitcher
        string position
        int draftDollars
        boolean isKeeper
    }
    HistoricalStanding {
        int id PK
        int seasonId FK
        string teamCode
        int totalScore
        int finalRank
    }
    RosterEntry {
        int id PK
        int year
        string teamCode
        string playerName
        string position
        int acquisitionCost
    }`,
  },
];

const tools = [
  { name: "Claude Code (CLI)", desc: "Primary development interface — AI pair programming in the terminal, authored ~95% of the codebase" },
  { name: "Claude Opus 4", desc: "The model powering Claude Code — handles architecture decisions, multi-file refactors, test writing" },
  { name: "GitHub", desc: "Source control, pull requests, code review" },
  { name: "Supabase Dashboard", desc: "Database management, auth config, SQL editor" },
  { name: "Render Dashboard", desc: "Deployment, monitoring, environment variables" },
  { name: "Prisma Studio", desc: "Database GUI for development and data inspection" },
  { name: "Postman", desc: "API testing and debugging" },
  { name: "Chrome DevTools", desc: "Frontend debugging, network inspection, responsive testing" },
  { name: "MCP Servers", desc: "MLB Data Proxy — 8 tools for player lookup, stats, standings, roster sync via Claude Code" },
  { name: "Resend Dashboard", desc: "Transactional email monitoring and API key management" },
];

const architectureChart = `flowchart LR
    Browser["Browser<br/>(React + Vite)"]
    API["Express API<br/>(:4010)"]
    DB[("PostgreSQL<br/>(Supabase)")]
    Auth["Supabase Auth<br/>(OAuth + JWT)"]
    WS["WebSocket<br/>(ws)"]
    MLB["MLB Stats API"]
    AI["Google Gemini"]
    MCP["MCP MLB Proxy<br/>(SQLite cache)"]
    Email["Resend<br/>(Email)"]

    Browser -->|"REST /api/*"| API
    Browser -->|"ws://auction"| WS
    Browser -->|"Session tokens"| Auth
    API -->|"Prisma ORM"| DB
    API -->|"JWT verify"| Auth
    API -->|"Player data"| MLB
    API -->|"Shared cache"| MCP
    API -->|"AI analysis"| AI
    API -->|"Invite emails"| Email
    MCP -->|"Cached requests"| MLB
    WS -->|"Auction state"| API
`;

const buildJournal = [
  {
    date: "Nov 2025",
    title: "Session 1-2: Scaffolding",
    detail: "Initial project setup with Vite + Express + Prisma. Database schema design, Supabase auth integration (Google/Yahoo OAuth). First 10 models. Everything in one conversation.",
  },
  {
    date: "Dec 2025",
    title: "Sessions 3-6: Core Features",
    detail: "Teams, rosters, player search with MLB Stats API integration. Built the standings computation engine that aggregates CSV player stats into team-level category rankings. Session 5 was a major auth migration — fixed 20+ files to use Bearer tokens instead of raw localStorage.",
  },
  {
    date: "Jan 2026",
    title: "Sessions 7-10: The Hard Stuff",
    detail: "Live auction draft with WebSocket (real-time bidding, auto-finish timers, concurrent-finish protection). Trade proposal system with voting. FAAB waiver claims. Commissioner tools. Session 8 was a security audit — found hardcoded DB credentials and missing auth on 3 endpoints, fixed same session.",
  },
  {
    date: "Feb 2026",
    title: "Sessions 11-14: Archive & Design",
    detail: "Historical archive system that parses 17 years of Excel spreadsheets (2008-2025) with wildly different layouts — grid detection, side-by-side table unrolling, fuzzy player name matching. Complete design system overhaul: custom CSS tokens, dark mode, responsive layouts. Deleted all sci-fi/military naming from 30+ files.",
  },
  {
    date: "Mar 2026",
    title: "Sessions 15-20: Hardening",
    detail: "Season lifecycle (SETUP > DRAFT > IN_SEASON > COMPLETED) with server-side guards and client-side gating. Franchise schema refactor for multi-season leagues. Keeper prep workflows. 116 new server tests added in one session. Service extraction from oversized route files. Console-to-structured-logger migration. Zero circular dependencies.",
  },
  {
    date: "Mar 2026",
    title: "Sessions 21-23: Polish & Auth",
    detail: "6-agent code review resolved 15 findings. Auth system overhaul: password reset, pre-signup email invites with auto-accept on first login, Google OAuth verification. Custom SMTP via Resend for transactional emails. MCP MLB Data Proxy server with SQLite cache and rate limiter. Keeper lock E2E testing. 644 tests passing.",
  },
];

const workflowSteps = [
  {
    title: "CLAUDE.md as the Source of Truth",
    desc: "A 300+ line project instructions file that Claude Code reads at the start of every session. Contains architecture decisions, conventions, file structure, cross-feature dependency map, and testing strategy. This is what makes multi-session development work — without it, each conversation would start from scratch.",
  },
  {
    title: "Session Structure",
    desc: "Each session starts by reading CLAUDE.md, running the test suite to verify baseline, and checking git log for recent changes. Work happens in focused blocks — build a feature, write tests, run tests, commit. Sessions end with FEEDBACK.md updates and CLAUDE.md revisions if architecture changed.",
  },
  {
    title: "FEEDBACK.md as Session Memory",
    desc: "A running log of what was done, what's pending, and what concerns surfaced in each session. When context windows fill up or sessions restart, this file ensures nothing falls through the cracks. It's the difference between continuous progress and repeatedly rediscovering the same issues.",
  },
  {
    title: "How I Direct vs. Delegate",
    desc: "I make the architectural decisions: feature scope, data model design, which trade-offs to accept. Claude Code handles the implementation: writing route handlers, building React components, writing tests, refactoring. I review every diff before committing. The ratio is roughly 5% direction, 95% execution.",
  },
  {
    title: "Terminal-Only Development",
    desc: "No VS Code, no IDE. Everything happens in Claude Code CLI — file reads, edits, git operations, test runs, even debugging. The browser is only for visual verification. This sounds limiting but it forces a workflow where every change is explicit and reviewable.",
  },
];

const lessons = [
  {
    label: "CLAUDE.md is the most important file in the repo",
    detail: "More important than any code file. It's the institutional knowledge that makes AI development compound instead of reset. Every convention, every cross-feature dependency, every 'don't do this because we tried it and it broke' — it all lives here. Without it, session 20 would be as slow as session 1.",
  },
  {
    label: "Tests are non-negotiable with AI-generated code",
    detail: "AI can write plausible-looking code that's subtly wrong. The only reliable safety net is tests. Going from 0 to 644 tests wasn't optional — it was the mechanism that let me trust the output and move fast. Every major session now starts and ends with a full test run.",
  },
  {
    label: "The hardest problems were data, not logic",
    detail: "Parsing 17 years of inconsistent Excel spreadsheets — different column layouts, abbreviated player names, side-by-side tables, merged cells — was harder than building the auction WebSocket system. AI is excellent at structured problems and mediocre at messy real-world data.",
  },
  {
    label: "Security needs explicit attention",
    detail: "AI doesn't automatically think about auth, authorization, or input validation unless you ask. Session 8's security audit found real vulnerabilities (hardcoded credentials, missing auth middleware). Now every endpoint gets auth by convention, documented in CLAUDE.md, enforced by tests.",
  },
  {
    label: "Small sessions beat marathon sessions",
    detail: "Context windows fill up. Long sessions lead to contradictory decisions. The best results came from focused 2-3 hour sessions with clear goals, ending with documented state. The FEEDBACK.md loop makes this work — pick up exactly where you left off.",
  },
];

/* ── Sub-Components ──────────────────────────────────────────────── */

function DatabaseERD() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  return (
    <div>
      <h2 className="text-lg font-semibold text-[var(--lg-text-primary)] mb-2">
        Database Schema
      </h2>
      <p className="text-sm text-[var(--lg-text-secondary)] mb-4">
        30 models across 5 domains — PostgreSQL via Prisma ORM with 723 lines of schema.
        Click a section to view its entity-relationship diagram.
      </p>
      <div className="space-y-2">
        {erdDiagrams.map((d, idx) => {
          const isOpen = openIdx === idx;
          return (
            <div
              key={d.label}
              className="rounded-lg border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] overflow-hidden"
            >
              <button
                onClick={() => setOpenIdx(isOpen ? null : idx)}
                className="w-full px-4 py-3 flex items-center gap-2 text-left hover:bg-[var(--lg-tint)] transition-colors"
              >
                <Database className="w-4 h-4 text-[var(--lg-text-muted)]" />
                <span className="text-sm font-medium text-[var(--lg-text-primary)] flex-1">
                  {d.label}
                </span>
                {isOpen ? (
                  <ChevronUp className="w-4 h-4 text-[var(--lg-text-muted)]" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-[var(--lg-text-muted)]" />
                )}
              </button>
              {isOpen && (
                <div className="px-4 pb-4 overflow-x-auto">
                  <MermaidDiagram chart={d.chart} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Main Page ───────────────────────────────────────────────────── */

export default function Tech() {
  return (
    <div className="px-4 py-6 md:px-6 md:py-10 max-w-5xl mx-auto space-y-12">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-[var(--lg-text-primary)]">
          Under the Hood
        </h1>
        <p className="mt-2 text-sm text-[var(--lg-text-secondary)]">
          A look at what it took to build The Fantastic Leagues — the tools, the process,
          the decisions, and the numbers. Built from November 2025 to present across
          23 sessions, 46,870+ lines of TypeScript, and an estimated 65 million+ AI tokens.
        </p>
      </div>

      {/* Genesis */}
      <div>
        <h2 className="text-lg font-semibold text-[var(--lg-text-primary)] mb-3">
          Genesis
        </h2>
        <div className="rounded-lg border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] p-5 space-y-3 text-sm text-[var(--lg-text-secondary)] leading-relaxed">
          <p>
            The Fantastic Leagues started as a fantasy baseball league among friends in 2004.
            For 20 years it was managed through Excel spreadsheets, manual stat tracking, email
            chains, and a patchwork of third-party tools that never quite fit how our league worked.
          </p>
          <p>
            In November 2025, I started building a dedicated platform to replace all of it — not
            as a general-purpose fantasy app, but as a tool purpose-built for our specific league
            rules: rotisserie scoring with 10 categories, auction drafts with keeper eligibility,
            FAAB waiver budgets, and 6-period standings across a full MLB season.
          </p>
          <p>
            The entire codebase was built using Claude Code as an AI pair programmer.
            I'm not a professional software engineer — I'm a league commissioner who wanted a
            better tool. Claude Code wrote roughly 95% of the code; I directed the architecture,
            made design decisions, reviewed every change, and handled the domain knowledge that
            only comes from running the same league for two decades.
          </p>
        </div>
      </div>

      {/* AI Development Workflow */}
      <div>
        <h2 className="text-lg font-semibold text-[var(--lg-text-primary)] mb-3">
          How This Was Built: The AI Development Workflow
        </h2>
        <p className="text-sm text-[var(--lg-text-secondary)] mb-4">
          Building a 47K-line full-stack app through conversational AI requires structure.
          Here's the system that made it work across 23 sessions.
        </p>
        <div className="space-y-3">
          {workflowSteps.map((step) => (
            <div
              key={step.title}
              className="rounded-lg border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="w-4 h-4 text-[var(--lg-accent)]" />
                <h3 className="text-sm font-semibold text-[var(--lg-text-primary)]">
                  {step.title}
                </h3>
              </div>
              <p className="text-sm text-[var(--lg-text-secondary)] leading-relaxed">
                {step.desc}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Architecture Overview */}
      <div>
        <h2 className="text-lg font-semibold text-[var(--lg-text-primary)] mb-3">
          Architecture Overview
        </h2>
        <p className="text-sm text-[var(--lg-text-secondary)] mb-4">
          A standard client-server architecture with a few interesting pieces:
          WebSocket for real-time auction bidding, Supabase for managed auth,
          and the MLB Stats API for live player data.
        </p>
        <div className="rounded-lg border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] p-4 overflow-x-auto">
          <MermaidDiagram chart={architectureChart} />
        </div>
      </div>

      {/* Stats Grid */}
      <div>
        <h2 className="text-lg font-semibold text-[var(--lg-text-primary)] mb-4">
          By the Numbers
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-lg border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] p-4 flex flex-col gap-1"
            >
              <div className="flex items-center gap-2 text-[var(--lg-text-muted)]">
                <s.icon className="w-4 h-4" />
                <span className="text-xs font-medium uppercase tracking-wide">
                  {s.label}
                </span>
              </div>
              <span className="text-xl font-semibold text-[var(--lg-text-primary)] tabular-nums">
                {s.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Tech Stack */}
      <div>
        <h2 className="text-lg font-semibold text-[var(--lg-text-primary)] mb-4">
          Tech Stack
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {techStack.map((group) => (
            <div
              key={group.category}
              className="rounded-lg border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] p-4"
            >
              <h3 className="text-sm font-semibold text-[var(--lg-text-primary)] mb-3">
                {group.category}
              </h3>
              <ul className="space-y-2">
                {group.items.map((item) => (
                  <li key={item.name} className="flex gap-2 text-sm">
                    <span className="font-medium text-[var(--lg-text-primary)] whitespace-nowrap">
                      {item.name}
                    </span>
                    <span className="text-[var(--lg-text-muted)]">— {item.desc}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Database Structure */}
      <DatabaseERD />

      {/* Feature Modules */}
      <div>
        <h2 className="text-lg font-semibold text-[var(--lg-text-primary)] mb-4">
          17 Feature Modules
        </h2>
        <p className="text-sm text-[var(--lg-text-secondary)] mb-3">
          The codebase is organized by domain — each module encapsulates its own
          routes, services, pages, components, and API client. Mirrored structure
          on client and server.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {featureModules.map((m) => (
            <div
              key={m.name}
              className="flex items-baseline gap-2 rounded-md border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] px-3 py-2"
            >
              <code className="text-xs font-medium text-[var(--lg-accent)] bg-[var(--lg-tint)] px-1.5 py-0.5 rounded">
                {m.name}
              </code>
              <span className="text-sm text-[var(--lg-text-secondary)]">{m.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Build Journal */}
      <div>
        <h2 className="text-lg font-semibold text-[var(--lg-text-primary)] mb-4">
          Build Journal
        </h2>
        <p className="text-sm text-[var(--lg-text-secondary)] mb-4">
          The real arc of building this — not just features shipped, but problems hit
          and decisions made along the way.
        </p>
        <div className="space-y-0">
          {buildJournal.map((entry, idx) => (
            <div key={entry.date} className="flex gap-4">
              {/* Timeline line */}
              <div className="flex flex-col items-center">
                <div className="w-3 h-3 rounded-full bg-[var(--lg-accent)] shrink-0 mt-1" />
                {idx < buildJournal.length - 1 && (
                  <div className="w-px flex-1 bg-[var(--lg-border-subtle)]" />
                )}
              </div>
              {/* Content */}
              <div className="pb-6">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-xs font-medium text-[var(--lg-accent)] uppercase tracking-wide">
                    {entry.date}
                  </span>
                  <span className="text-sm font-semibold text-[var(--lg-text-primary)]">
                    {entry.title}
                  </span>
                </div>
                <p className="text-sm text-[var(--lg-text-secondary)] leading-relaxed">
                  {entry.detail}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tools Used */}
      <div>
        <h2 className="text-lg font-semibold text-[var(--lg-text-primary)] mb-4">
          Tools Used
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {tools.map((t) => (
            <div
              key={t.name}
              className="flex items-baseline gap-2 rounded-md border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] px-3 py-2"
            >
              <span className="text-sm font-medium text-[var(--lg-text-primary)] whitespace-nowrap">
                {t.name}
              </span>
              <span className="text-sm text-[var(--lg-text-muted)]">— {t.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Lessons Learned */}
      <div>
        <h2 className="text-lg font-semibold text-[var(--lg-text-primary)] mb-3">
          Lessons Learned
        </h2>
        <p className="text-sm text-[var(--lg-text-secondary)] mb-4">
          What I'd tell someone starting a similar project with AI today.
        </p>
        <div className="space-y-3">
          {lessons.map((lesson) => (
            <div
              key={lesson.label}
              className="rounded-lg border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] p-4"
            >
              <div className="flex items-start gap-2 mb-2">
                <Lightbulb className="w-4 h-4 text-[var(--lg-accent)] mt-0.5 shrink-0" />
                <h3 className="text-sm font-semibold text-[var(--lg-text-primary)]">
                  {lesson.label}
                </h3>
              </div>
              <p className="text-sm text-[var(--lg-text-secondary)] leading-relaxed ml-6">
                {lesson.detail}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer note */}
      <p className="text-xs text-[var(--lg-text-muted)] text-center pb-4">
        Built with Claude Code — estimated 65M+ tokens across 23 sessions
      </p>
    </div>
  );
}
