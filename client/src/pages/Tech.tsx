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
  ArrowRight,
  Package,
  Shield,
  Activity,
  Lock,
  Globe,
  Search,
} from "lucide-react";
import { Link } from "react-router-dom";
import MermaidDiagram from "../components/MermaidDiagram";

/* ── Data ────────────────────────────────────────────────────────── */

const stats = [
  { label: "Total Lines of Code", value: "60,630+", icon: FileCode },
  { label: "Client (React/TS)", value: "31,195", icon: Monitor },
  { label: "Server (Node/TS)", value: "29,435", icon: Server },
  { label: "Test Coverage", value: "9,200+ lines", icon: TestTube },
  { label: "Database Models", value: "30", icon: Database },
  { label: "API Endpoints", value: "119", icon: Plug },
  { label: "Feature Modules", value: "19", icon: Layers },
  { label: "Git Commits", value: "195+", icon: GitCommit },
  { label: "Tests Passing", value: "730", icon: TestTube },
  { label: "DB Schema Lines", value: "723", icon: Braces },
  { label: "DB Migrations", value: "10", icon: Database },
  { label: "Est. Tokens Used", value: "~75M+", icon: Bot },
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
      { name: "PostHog", desc: "Product analytics — pageviews, user identity, event tracking (lazy-loaded)" },
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
      { name: "691 tests", desc: "454 server + 187 client + 50 MCP tests" },
    ],
  },
  {
    category: "Infrastructure & Deployment",
    items: [
      { name: "Render", desc: "Hosting with SSL termination" },
      { name: "Supabase", desc: "Managed PostgreSQL + Auth + Storage" },
      { name: "Git / GitHub", desc: "Version control, PRs, CI" },
      { name: "MCP (Model Context Protocol)", desc: "Tool server for Claude Code CLI integration" },
      { name: "PostHog Cloud", desc: "Product analytics hosting" },
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
  { name: "auction", desc: "Live auction draft with WebSocket, chat, sounds, settings" },
  { name: "keeper-prep", desc: "Keeper selection workflows" },
  { name: "commissioner", desc: "Commissioner admin tools" },
  { name: "seasons", desc: "Season lifecycle management" },
  { name: "admin", desc: "System admin, CSV import" },
  { name: "archive", desc: "Historical data import/export" },
  { name: "periods", desc: "Period standings & payouts" },
  { name: "franchises", desc: "Organization-level settings & membership" },
  { name: "mlb-feed", desc: "Live MLB scores, transactions, my-players-today" },
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
  {
    date: "Mar 2026",
    title: "Sessions 24-25: Live Data & Auction Prep",
    detail: "Wired live standings from PlayerStatsPeriod data. All-team MLB sync (30 teams). Admin stats sync endpoint. Full team names replacing 3-letter codes throughout. OF position mapping controlled by league rule. Player detail modal enriched with transactions, fielding stats, profile fallbacks. Season lifecycle documented. 4 test leagues with 8 teams each prepped for live auction. 670 tests passing.",
  },
  {
    date: "Mar 2026",
    title: "Session 26: 2025 Stats & Auction Bid Tracking",
    detail: "Players page and auction Player Pool now show real 2025 season stats fetched from MLB Stats API (batched requests for all 1,652 players, 30-day SQLite cache, CSV fallback). All stat columns sortable. Auction bid history tracked via AuctionLot/AuctionBid models — Draft Board log shows completed auctions in nomination order with expandable per-lot bid history for owner tendency analysis.",
  },
  {
    date: "Mar 2026",
    title: "Session 27: 6-Agent Code Review, Fixes & Roadmap",
    detail: "Ran a comprehensive code review using 6 parallel agents (TypeScript, Security, Performance, Architecture, Simplicity, Pattern Recognition) on PR #43. Synthesized 16 findings across P1/P2/P3. Fixed all 3 P1s (awaited AuctionLot.update, winCount-based re-fetch, in-memory checkPositionLimit) and 5 P2s (leagueId validation, error logging, positionToSlots/PITCHER_CODES/NL_TEAMS consolidated into sportConfig.ts). Built visual /roadmap page with project health scorecard (8.5/10), audit recommendations, progress tracking, and cross-links to /tech.",
  },
  {
    date: "Mar 2026",
    title: "Session 28: Meta Pages, Analytics & Full Tech Debt Cleanup",
    detail: "Built 3 new pages (/changelog, /status, /analytics) and added 4 new sections to /tech. Added to /roadmap: Velocity chart, Risk Register, Session planner. Fixed all remaining P2s (CR-09 type import, CR-10 StatKey union). Completed all P3s: extracted statsService.ts (CR-15), added compact ThemedTable variant via React context and migrated auction tables (CR-16), lazy-loaded xlsx + generative-ai saving 3.5MB startup (RD-01), enforced Prisma singleton across 8 scripts (RD-02), npm audit in CI (RD-03), moved shared components to components/shared/ (RD-04). 68 of 69 total items resolved — only TD-Q03 intentionally deferred.",
  },
  {
    date: "Mar 2026",
    title: "Session 29: Auction Enhancements — Proxy Bids, Force Assign, Timers",
    detail: "Implemented eBay-style proxy/max bids with server-side auto-bidding resolution (competing proxies settle at loser's max + $1, private per-team). Added commissioner Force Assign to manually assign players to teams (bypasses auction for verbal deals). Made bid timer and nomination timer configurable via league rules. Added Decline/Pass toggle for team owners to sit out a player's bidding. 12 future auction feature ideas added to backlog (AUC-01 through AUC-12).",
  },
  {
    date: "Mar 2026",
    title: "Session 31: 19 PRs, Auction UX, My Val, MLB Home, Guide Rewrite",
    detail: "Massive session with 19 PRs merged (#46-#64). Completed 10 of 12 auction enhancements plus personalized My Val — roster-aware player valuation with 4 factors (position need, budget pressure, scarcity, market pressure). Val column colors (green/red) with hover tooltips showing base vs adjusted breakdown. Public guide pages, compact tabs, default league filter. Multi-user test script for My Val validation. Resource page audit. Also: opening bid picker (AUC-01), watchlist (AUC-02), chat (AUC-03), sounds (AUC-04), value/surplus (AUC-05), spending pace (AUC-06), nomination timer countdown (AUC-08), 'Going Once/Twice/SOLD!' visual (AUC-09), keeper cost preview (AUC-12). Position needs matrix (AUC-07), auction settings panel with 6 per-user toggles and Excel export. MLB-powered Home page with live scores, transactions, and date navigation via mlb-feed module. Guide rewritten into 3 pages with Playwright screenshots. Code review fixing 5 P1s and 9 P2s. CI pipeline fix. 691 tests passing across 60,630+ lines of TypeScript.",
  },
  {
    date: "Mar 2026",
    title: "Session 32: 25 Features — Reliability, AI, Auction UX, Platform Quality",
    detail: "Pre-auction reliability blitz with 25 shipped features. 6 AI endpoints (post-draft grades, trade analyzer, keeper recommender, waiver advisor, weekly insights, auction bid advisor) — all Zod-validated, cached, with deduped concurrent requests. React error boundaries (root + feature-level) with PostHog crash reporting. WebSocket reconnect indicator with exponential backoff. PostHog analytics expanded from 8 to 18 tracked events. Mobile auction tested at 390x844. Pre-draft rankings CSV import (AUC-10) and post-auction trade block (AUC-11). PWA installable app. Browser push notifications. Commissioner tab reorg (6→5 tabs). SS/MI position counting fix. 9 code review fixes (P1+P2). 699 tests passing.",
  },
  {
    date: "Mar 2026",
    title: "Session 33: Production Deployment & Code Review Hardening",
    detail: "Production deployment readiness for Render. 6-agent code review (security, architecture, simplicity, learnings) with all P2/P3 findings resolved. CSP hardened — scoped wss: to specific origins, added HSTS (1yr), PostHog domains added. Static asset caching with maxAge/immutable for Vite-hashed files. Service worker same-origin check. Render config overhauled — production domain, VITE_* build-time vars, Node 20 pinned, 60s graceful shutdown. Express v5 removed from root deps. Auction retrospective endpoint with DraftReport component for post-draft analytics. Guide additions. 710 tests passing.",
  },
  {
    date: "Mar 2026",
    title: "Session 35: Live Auction Production Fixes & Code Quality Sweep",
    detail: "Critical production fixes during live auction draft. Auction showed 0 teams — root cause: useAuctionState.ts used hardcoded /api/ paths instead of ${API_BASE}, routing through Cloudflare instead of direct to Render. Fixed 49 hardcoded paths across 22 files (complete API_BASE migration). Player names in Teams tab — server now sends mlbId/playerName in roster data. Force-assigned players immediately marked as taken via enrichedPlayers useMemo overlaying auction state. Position dropdown shows MI/CI roster slots via positionToSlots(). Ohtani two-way stats split — pitcher row shows pitching stats only. Position matrix colors reversed (green=full, not red). 5-agent code review (security, architecture, performance, simplicity, patterns) resolved all 5 P2 findings: server type drift, duplicate players.find(), unnecessary as-any cast, || to ?? nullish coalescing, inline constant dedup. Compound learning docs: deployment checklist, production outage post-mortem, UX fixes. Pre-deploy audit memory saved. 660 tests passing.",
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

const costComparison = {
  aiCost: {
    tokens: "~75M+",
    apiCost: "$150–250",
    subscriptionCost: "$100–200/mo",
    totalRange: "$200–$2,400",
    note: "Claude Code subscription + API tokens over 33 sessions (Nov 2025–Mar 2026)",
  },
  usDevShop: {
    rateRange: "$150–250/hr",
    hoursLow: 800,
    hoursHigh: 1200,
    totalLow: "$120K",
    totalHigh: "$300K",
    timeline: "6–12 months",
    note: "Full-stack agency (NY/SF/Austin). Includes PM, design, frontend, backend, QA, DevOps. Based on 18 feature modules, 119 API endpoints, 30 DB models, real-time WebSocket, OAuth, live MLB data integration.",
  },
  offshore: {
    rateRange: "$25–60/hr",
    hoursLow: 800,
    hoursHigh: 1200,
    totalLow: "$20K",
    totalHigh: "$72K",
    timeline: "4–9 months",
    note: "Offshore team (India/China). Lower hourly rate but often requires more hours due to communication overhead, timezone gaps, and iteration cycles. PM/QA often separate line items.",
  },
  scope: [
    "60,630+ lines of TypeScript (strict mode)",
    "18 mirrored client/server feature modules",
    "119 API endpoints + WebSocket real-time auction",
    "30 Prisma database models with 10 migrations",
    "710 automated tests (unit + integration)",
    "OAuth integration (Google/Yahoo via Supabase)",
    "Live MLB Stats API integration with caching proxy",
    "MCP server with 8 tools, rate limiter, circuit breaker",
    "Excel/CSV import, AI-powered player analysis",
    "Full design system with light/dark mode",
  ],
};

// ─── API Explorer Data ───

interface ApiRoute {
  method: "GET" | "POST" | "PATCH" | "DELETE" | "PUT";
  path: string;
  auth: string;
  description: string;
}

interface ApiModule {
  name: string;
  prefix: string;
  routes: ApiRoute[];
}

const apiModules: ApiModule[] = [
  {
    name: "auth", prefix: "/api/auth",
    routes: [
      { method: "GET", path: "/me", auth: "requireAuth", description: "Get current user profile" },
      { method: "GET", path: "/health", auth: "none", description: "Health check" },
      { method: "POST", path: "/dev-login", auth: "none", description: "Dev-only login (gated)" },
      { method: "POST", path: "/register", auth: "none", description: "Email/password registration" },
    ],
  },
  {
    name: "leagues", prefix: "/api/leagues",
    routes: [
      { method: "GET", path: "/", auth: "requireAuth", description: "List user's leagues" },
      { method: "GET", path: "/:id", auth: "requireLeagueMember", description: "League detail" },
      { method: "GET", path: "/:id/rules", auth: "requireLeagueMember", description: "League rules" },
      { method: "PATCH", path: "/:id/rules", auth: "requireCommissioner", description: "Update rules" },
      { method: "POST", path: "/join", auth: "requireAuth", description: "Join via invite code" },
    ],
  },
  {
    name: "teams", prefix: "/api/teams",
    routes: [
      { method: "GET", path: "/", auth: "requireLeagueMember", description: "List league teams" },
      { method: "GET", path: "/:teamCode", auth: "requireLeagueMember", description: "Team detail + roster" },
      { method: "PATCH", path: "/:id", auth: "requireTeamOwner", description: "Update team" },
    ],
  },
  {
    name: "players", prefix: "/api/players",
    routes: [
      { method: "GET", path: "/", auth: "requireAuth", description: "Search/filter players" },
      { method: "GET", path: "/:id", auth: "requireAuth", description: "Player detail" },
      { method: "GET", path: "/:id/fielding", auth: "requireAuth", description: "Fielding stats" },
      { method: "GET", path: "/season-stats", auth: "requireAuth", description: "Season stats with roster info" },
      { method: "GET", path: "/period-stats", auth: "requireAuth", description: "Period stats" },
      { method: "GET", path: "/auction-values", auth: "requireAuth", description: "Auction values" },
    ],
  },
  {
    name: "auction", prefix: "/api/auction",
    routes: [
      { method: "POST", path: "/init", auth: "requireAdmin", description: "Initialize auction" },
      { method: "POST", path: "/nominate", auth: "requireAuth", description: "Nominate player" },
      { method: "POST", path: "/bid", auth: "requireAuth", description: "Place bid" },
      { method: "POST", path: "/finish", auth: "requireAdmin", description: "Finish current lot" },
      { method: "POST", path: "/undo-finish", auth: "requireAdmin", description: "Undo last finish" },
      { method: "POST", path: "/pause", auth: "requireCommissioner", description: "Pause auction" },
      { method: "POST", path: "/resume", auth: "requireCommissioner", description: "Resume auction" },
      { method: "POST", path: "/reset", auth: "requireAdmin", description: "Reset auction" },
      { method: "POST", path: "/force-assign", auth: "requireCommissioner", description: "Force assign player" },
      { method: "POST", path: "/proxy-bid", auth: "requireAuth", description: "Set max/proxy bid" },
      { method: "GET", path: "/my-proxy-bid", auth: "requireAuth", description: "Get my proxy bid" },
      { method: "DELETE", path: "/proxy-bid", auth: "requireAuth", description: "Cancel proxy bid" },
      { method: "GET", path: "/state", auth: "requireLeagueMember", description: "Get auction state" },
      { method: "GET", path: "/bid-history", auth: "requireAuth", description: "Bid history" },
    ],
  },
  {
    name: "trades", prefix: "/api/trades",
    routes: [
      { method: "GET", path: "/", auth: "requireLeagueMember", description: "List trades" },
      { method: "POST", path: "/", auth: "requireAuth", description: "Propose trade" },
      { method: "POST", path: "/:id/vote", auth: "requireAuth", description: "Vote on trade" },
      { method: "POST", path: "/:id/process", auth: "requireAdmin", description: "Process trade" },
    ],
  },
  {
    name: "waivers", prefix: "/api/waivers",
    routes: [
      { method: "GET", path: "/", auth: "requireLeagueMember", description: "List claims" },
      { method: "POST", path: "/", auth: "requireAuth", description: "Submit claim" },
      { method: "POST", path: "/process", auth: "requireAdmin", description: "Process claims" },
      { method: "DELETE", path: "/:id", auth: "requireAuth", description: "Cancel claim" },
    ],
  },
  {
    name: "commissioner", prefix: "/api/commissioner",
    routes: [
      { method: "GET", path: "/overview", auth: "requireCommissioner", description: "League overview" },
      { method: "POST", path: "/roster-lock", auth: "requireCommissioner", description: "Lock/unlock rosters" },
      { method: "POST", path: "/trade", auth: "requireCommissioner", description: "Commissioner trade" },
      { method: "POST", path: "/invite", auth: "requireCommissioner", description: "Send invite" },
    ],
  },
  {
    name: "admin", prefix: "/api/admin",
    routes: [
      { method: "POST", path: "/leagues", auth: "requireAdmin", description: "Create league" },
      { method: "POST", path: "/import-rosters", auth: "requireAdmin", description: "Import CSV rosters" },
      { method: "POST", path: "/sync-mlb", auth: "requireAdmin", description: "Sync MLB players" },
      { method: "POST", path: "/sync-stats", auth: "requireAdmin", description: "Sync period stats" },
      { method: "GET", path: "/audit-log", auth: "requireAdmin", description: "View audit log" },
    ],
  },
  {
    name: "mlb-feed", prefix: "/api/mlb-feed",
    routes: [
      { method: "GET", path: "/scores", auth: "requireAuth", description: "Live MLB scores by date" },
      { method: "GET", path: "/transactions", auth: "requireAuth", description: "Recent MLB transactions" },
      { method: "GET", path: "/my-players-today", auth: "requireAuth", description: "My rostered players playing today" },
    ],
  },
];

// ─── Bundle Size Data ───

interface BundleDep {
  name: string;
  diskSize: string;
  gzipSize: string;
  note: string;
  concern: "none" | "watch" | "optimize";
}

const bundleDeps: BundleDep[] = [
  { name: "mermaid", diskSize: "70 MB", gzipSize: "~250 KB", note: "ERD diagrams on /tech only — consider lazy-loading", concern: "optimize" },
  { name: "lucide-react", diskSize: "44 MB", gzipSize: "~8 KB", note: "Tree-shaken — only imported icons are bundled", concern: "none" },
  { name: "posthog-js", diskSize: "34 MB", gzipSize: "~35 KB", note: "Lazy-loaded via dynamic import()", concern: "none" },
  { name: "@supabase/supabase-js", diskSize: "12 MB", gzipSize: "~25 KB", note: "Auth + realtime client", concern: "none" },
  { name: "react-dom", diskSize: "6.3 MB", gzipSize: "~42 KB", note: "Core React rendering", concern: "none" },
  { name: "@dnd-kit/core", diskSize: "2.8 MB", gzipSize: "~12 KB", note: "Drag-and-drop (auction + roster)", concern: "none" },
  { name: "@radix-ui/*", diskSize: "5.2 MB", gzipSize: "~15 KB", note: "Accessible UI primitives (shadcn)", concern: "none" },
  { name: "xlsx (server)", diskSize: "2.3 MB", gzipSize: "N/A", note: "Server-only — archive Excel parsing. Consider lazy-load", concern: "watch" },
  { name: "@google/generative-ai (server)", diskSize: "1.2 MB", gzipSize: "N/A", note: "Server-only — AI player analysis. Consider lazy-load", concern: "watch" },
];

// ─── Dependency Health Data ───

interface DepHealth {
  name: string;
  current: string;
  latest: string;
  status: "current" | "minor-behind" | "major-behind";
  category: string;
}

const depHealth: DepHealth[] = [
  { name: "react", current: "18.3", latest: "19.x", status: "major-behind", category: "Frontend" },
  { name: "typescript", current: "5.3", latest: "5.7", status: "minor-behind", category: "Tooling" },
  { name: "vite", current: "5.x", latest: "6.x", status: "major-behind", category: "Tooling" },
  { name: "prisma", current: "5.x", latest: "6.x", status: "major-behind", category: "Backend" },
  { name: "express", current: "4.x", latest: "5.x", status: "major-behind", category: "Backend" },
  { name: "vitest", current: "1.x", latest: "3.x", status: "major-behind", category: "Testing" },
  { name: "tailwindcss", current: "3.x", latest: "4.x", status: "major-behind", category: "Frontend" },
  { name: "react-router-dom", current: "6.x", latest: "7.x", status: "major-behind", category: "Frontend" },
  { name: "@supabase/supabase-js", current: "2.x", latest: "2.x", status: "current", category: "Auth" },
  { name: "zod", current: "3.x", latest: "3.x", status: "current", category: "Validation" },
];

/* ── Sub-Components ──────────────────────────────────────────────── */

function ApiExplorer() {
  const [open, setOpen] = useState(false);
  const [expandedModule, setExpandedModule] = useState<string | null>(null);
  const totalRoutes = apiModules.reduce((s, m) => s + m.routes.length, 0);

  const methodColor: Record<string, string> = {
    GET: "text-emerald-400 bg-emerald-500/10",
    POST: "text-blue-400 bg-blue-500/10",
    PATCH: "text-amber-400 bg-amber-500/10",
    DELETE: "text-red-400 bg-red-500/10",
    PUT: "text-purple-400 bg-purple-500/10",
  };

  return (
    <div className="rounded-lg border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-5 py-4 flex items-center gap-3 text-left hover:bg-[var(--lg-tint)] transition-colors"
      >
        <Search className="w-5 h-5 text-[var(--lg-accent)]" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-[var(--lg-text-primary)]">
            API Explorer
          </h3>
          <p className="text-xs text-[var(--lg-text-muted)]">
            {totalRoutes} endpoints across {apiModules.length} modules
          </p>
        </div>
        {open ? <ChevronUp className="w-5 h-5 text-[var(--lg-text-muted)]" /> : <ChevronDown className="w-5 h-5 text-[var(--lg-text-muted)]" />}
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-2">
          {apiModules.map((mod) => {
            const isExpanded = expandedModule === mod.name;
            return (
              <div key={mod.name} className="rounded-lg border border-[var(--lg-border-faint)] overflow-hidden">
                <button
                  onClick={() => setExpandedModule(isExpanded ? null : mod.name)}
                  className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-[var(--lg-tint)] transition-colors"
                >
                  <code className="text-xs font-medium text-[var(--lg-accent)]">{mod.name}</code>
                  <span className="text-[10px] text-[var(--lg-text-muted)] flex-1">{mod.prefix}</span>
                  <span className="text-[10px] text-[var(--lg-text-muted)] tabular-nums">{mod.routes.length} routes</span>
                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-[var(--lg-text-muted)]" /> : <ChevronDown className="w-3.5 h-3.5 text-[var(--lg-text-muted)]" />}
                </button>
                {isExpanded && (
                  <div className="px-3 pb-2 space-y-1">
                    {mod.routes.map((route, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs py-1 px-2 rounded bg-[var(--lg-tint)]">
                        <span className={`font-semibold w-12 text-center px-1 py-0.5 rounded text-[10px] ${methodColor[route.method]}`}>
                          {route.method}
                        </span>
                        <code className="text-[var(--lg-text-primary)] font-mono flex-1">{mod.prefix}{route.path}</code>
                        <span className="text-[10px] text-[var(--lg-text-muted)] bg-[var(--lg-bg-card)] px-1.5 py-0.5 rounded border border-[var(--lg-border-faint)]">
                          {route.auth}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BundleSize() {
  const [open, setOpen] = useState(false);

  const concernColor: Record<string, string> = {
    none: "text-emerald-400",
    watch: "text-amber-400",
    optimize: "text-red-400",
  };

  return (
    <div className="rounded-lg border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-5 py-4 flex items-center gap-3 text-left hover:bg-[var(--lg-tint)] transition-colors"
      >
        <Package className="w-5 h-5 text-[var(--lg-accent)]" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-[var(--lg-text-primary)]">
            Bundle Size & Dependencies
          </h3>
          <p className="text-xs text-[var(--lg-text-muted)]">
            Key dependencies by size — {bundleDeps.length} packages tracked
          </p>
        </div>
        {open ? <ChevronUp className="w-5 h-5 text-[var(--lg-text-muted)]" /> : <ChevronDown className="w-5 h-5 text-[var(--lg-text-muted)]" />}
      </button>

      {open && (
        <div className="px-5 pb-5">
          <div className="space-y-1.5 overflow-x-auto">
            {bundleDeps.map((dep) => (
              <div key={dep.name} className="flex items-center gap-3 text-sm py-2 px-3 rounded-md bg-[var(--lg-tint)] min-w-[500px]">
                <span className={`w-2 h-2 rounded-full shrink-0 ${dep.concern === "none" ? "bg-emerald-500" : dep.concern === "watch" ? "bg-amber-500" : "bg-red-500"}`} />
                <span className="font-medium text-[var(--lg-text-primary)] w-48 shrink-0">{dep.name}</span>
                <span className="text-xs text-[var(--lg-text-muted)] tabular-nums w-16 shrink-0">{dep.diskSize}</span>
                <span className="text-xs text-[var(--lg-text-muted)] tabular-nums w-16 shrink-0">{dep.gzipSize}</span>
                <span className={`text-xs flex-1 ${concernColor[dep.concern]}`}>{dep.note}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-4 text-[10px] text-[var(--lg-text-muted)]">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Good</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Watch</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Optimize</span>
          </div>
        </div>
      )}
    </div>
  );
}

function DependencyHealth() {
  const [open, setOpen] = useState(false);

  const statusConfig: Record<string, { label: string; color: string }> = {
    current: { label: "Current", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
    "minor-behind": { label: "Minor", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
    "major-behind": { label: "Major", color: "text-red-400 bg-red-500/10 border-red-500/20" },
  };

  const currentCount = depHealth.filter((d) => d.status === "current").length;
  const majorCount = depHealth.filter((d) => d.status === "major-behind").length;

  return (
    <div className="rounded-lg border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-5 py-4 flex items-center gap-3 text-left hover:bg-[var(--lg-tint)] transition-colors"
      >
        <Shield className="w-5 h-5 text-[var(--lg-accent)]" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-[var(--lg-text-primary)]">
            Dependency Health
          </h3>
          <p className="text-xs text-[var(--lg-text-muted)]">
            {currentCount} current · {majorCount} major versions behind
          </p>
        </div>
        {open ? <ChevronUp className="w-5 h-5 text-[var(--lg-text-muted)]" /> : <ChevronDown className="w-5 h-5 text-[var(--lg-text-muted)]" />}
      </button>

      {open && (
        <div className="px-5 pb-5">
          <div className="space-y-1.5 overflow-x-auto">
            {depHealth.map((dep) => {
              const cfg = statusConfig[dep.status];
              return (
                <div key={dep.name} className="flex items-center gap-3 text-sm py-2 px-3 rounded-md bg-[var(--lg-tint)] min-w-[450px]">
                  <span className="font-medium text-[var(--lg-text-primary)] w-40 shrink-0">{dep.name}</span>
                  <span className="text-xs text-[var(--lg-text-muted)] tabular-nums w-12 shrink-0">{dep.current}</span>
                  <span className="text-[var(--lg-text-muted)]">→</span>
                  <span className="text-xs text-[var(--lg-text-primary)] tabular-nums w-12 shrink-0">{dep.latest}</span>
                  <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border ${cfg.color}`}>
                    {cfg.label}
                  </span>
                  <span className="text-xs text-[var(--lg-text-muted)] flex-1 text-right">{dep.category}</span>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[10px] text-[var(--lg-text-muted)] leading-relaxed">
            Major version upgrades are tracked but not urgent — the current versions are stable and well-tested.
            React 19, Vite 6, and Prisma 6 upgrades planned for off-season.
          </p>
        </div>
      )}
    </div>
  );
}

function CostEstimate() {
  const [open, setOpen] = useState(false);
  const c = costComparison;

  return (
    <div className="rounded-lg border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-5 py-4 flex items-center gap-3 text-left hover:bg-[var(--lg-tint)] transition-colors"
      >
        <Cpu className="w-5 h-5 text-[var(--lg-accent)]" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-[var(--lg-text-primary)]">
            What Would This Cost to Build?
          </h3>
          <p className="text-xs text-[var(--lg-text-muted)]">
            AI-assisted vs. US dev shop vs. offshore — estimated cost comparison
          </p>
        </div>
        {open ? (
          <ChevronUp className="w-5 h-5 text-[var(--lg-text-muted)]" />
        ) : (
          <ChevronDown className="w-5 h-5 text-[var(--lg-text-muted)]" />
        )}
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-5">
          {/* Comparison cards */}
          <div className="grid gap-3 md:grid-cols-3">
            {/* AI */}
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
              <div className="text-[10px] font-semibold uppercase text-emerald-400 tracking-wide mb-2">
                AI-Assisted (Claude Code)
              </div>
              <div className="text-2xl font-semibold text-emerald-400 tabular-nums mb-1">
                {c.aiCost.totalRange}
              </div>
              <div className="text-xs text-[var(--lg-text-muted)] mb-3">
                {c.aiCost.tokens} tokens &middot; 33 sessions &middot; 5 months
              </div>
              <div className="text-[10px] text-[var(--lg-text-secondary)] leading-relaxed">
                {c.aiCost.note}
              </div>
            </div>

            {/* US Dev Shop */}
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
              <div className="text-[10px] font-semibold uppercase text-amber-400 tracking-wide mb-2">
                US Dev Shop
              </div>
              <div className="text-2xl font-semibold text-amber-400 tabular-nums mb-1">
                {c.usDevShop.totalLow}–{c.usDevShop.totalHigh}
              </div>
              <div className="text-xs text-[var(--lg-text-muted)] mb-3">
                {c.usDevShop.rateRange} &middot; {c.usDevShop.hoursLow}–{c.usDevShop.hoursHigh} hrs &middot; {c.usDevShop.timeline}
              </div>
              <div className="text-[10px] text-[var(--lg-text-secondary)] leading-relaxed">
                {c.usDevShop.note}
              </div>
            </div>

            {/* Offshore */}
            <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4">
              <div className="text-[10px] font-semibold uppercase text-blue-400 tracking-wide mb-2">
                Offshore (India/China)
              </div>
              <div className="text-2xl font-semibold text-blue-400 tabular-nums mb-1">
                {c.offshore.totalLow}–{c.offshore.totalHigh}
              </div>
              <div className="text-xs text-[var(--lg-text-muted)] mb-3">
                {c.offshore.rateRange} &middot; {c.offshore.hoursLow}–{c.offshore.hoursHigh} hrs &middot; {c.offshore.timeline}
              </div>
              <div className="text-[10px] text-[var(--lg-text-secondary)] leading-relaxed">
                {c.offshore.note}
              </div>
            </div>
          </div>

          {/* Scope */}
          <div>
            <div className="text-[10px] font-semibold uppercase text-[var(--lg-text-muted)] mb-2 tracking-wide">
              Scope Used for Estimates
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              {c.scope.map((item) => (
                <div key={item} className="flex items-start gap-2 text-xs text-[var(--lg-text-secondary)] py-0.5">
                  <span className="text-[var(--lg-accent)] mt-0.5">•</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Disclaimer */}
          <p className="text-[10px] text-[var(--lg-text-muted)] leading-relaxed border-t border-[var(--lg-border-faint)] pt-3">
            These are rough estimates based on industry rates (2025-2026). Actual costs vary significantly based on team
            experience, project management overhead, design requirements, and iteration cycles. The AI-assisted approach
            required domain expertise to direct — Claude Code wrote ~95% of the code, but architectural decisions,
            design choices, and domain knowledge came from 20 years of running this league.
          </p>
        </div>
      )}
    </div>
  );
}

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
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-semibold text-[var(--lg-text-primary)]">
            Under the Hood
          </h1>
          <Link
            to="/roadmap"
            className="text-xs font-medium text-[var(--lg-accent)] hover:underline flex items-center gap-1"
          >
            Roadmap <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <p className="mt-2 text-sm text-[var(--lg-text-secondary)]">
          A look at what it took to build The Fantastic Leagues — the tools, the process,
          the decisions, and the numbers. Built from November 2025 to present across
          33 sessions, 60,630+ lines of TypeScript, and an estimated 75 million+ AI tokens.
        </p>
        <p className="mt-1 text-xs text-[var(--lg-text-muted)]">
          Last updated: March 20, 2026
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
          Building a 57K-line full-stack app through conversational AI requires structure.
          Here's the system that made it work across 33 sessions.
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

      {/* Cost Estimate */}
      <CostEstimate />

      {/* API Explorer */}
      <ApiExplorer />

      {/* Bundle Size */}
      <BundleSize />

      {/* Dependency Health */}
      <DependencyHealth />

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
          18 Feature Modules
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
            <div key={entry.title} className="flex gap-4">
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
        Built with Claude Code — estimated 75M+ tokens across 33 sessions |{" "}
        <Link to="/roadmap" className="text-[var(--lg-accent)] hover:underline">
          Roadmap
        </Link>
      </p>
    </div>
  );
}
