import React from "react";
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
} from "lucide-react";

const stats = [
  { label: "Total Lines of Code", value: "46,870+", icon: FileCode },
  { label: "Client (React/TS)", value: "19,910", icon: Monitor },
  { label: "Server (Node/TS)", value: "26,960", icon: Server },
  { label: "Test Coverage", value: "7,800+ lines", icon: TestTube },
  { label: "Database Models", value: "27", icon: Database },
  { label: "API Endpoints", value: "116", icon: Plug },
  { label: "Feature Modules", value: "16", icon: Layers },
  { label: "Git Commits", value: "124", icon: GitCommit },
  { label: "Tests Passing", value: "387", icon: TestTube },
  { label: "DB Schema Lines", value: "688", icon: Braces },
  { label: "DB Migrations", value: "9", icon: Database },
  { label: "Est. Tokens Used", value: "~60M+", icon: Bot },
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
      { name: "Prisma ORM", desc: "Type-safe database access with 27 models" },
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
      { name: "Google Gemini AI", desc: "AI-powered player analysis" },
      { name: "xlsx", desc: "Excel file parsing for archive imports" },
      { name: "csv-parse", desc: "CSV data processing for stats" },
    ],
  },
  {
    category: "Testing & Quality",
    items: [
      { name: "Vitest", desc: "Fast unit & integration test framework" },
      { name: "React Testing Library", desc: "Component testing" },
      { name: "ESLint", desc: "Code linting with TypeScript rules" },
      { name: "387 tests", desc: "302 server + 85 client tests" },
    ],
  },
  {
    category: "Infrastructure & Deployment",
    items: [
      { name: "Render", desc: "Hosting with SSL termination" },
      { name: "Supabase", desc: "Managed PostgreSQL + Auth + Storage" },
      { name: "Git / GitHub", desc: "Version control, PRs, CI" },
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
];

const tools = [
  { name: "Claude Code", desc: "AI pair programming — authored ~95% of the codebase" },
  { name: "Claude Code CLI", desc: "Primary development interface — terminal-based" },
  { name: "GitHub", desc: "Source control & pull requests" },
  { name: "Supabase Dashboard", desc: "Database management & auth config" },
  { name: "Render Dashboard", desc: "Deployment & monitoring" },
  { name: "Prisma Studio", desc: "Database GUI for development" },
  { name: "Postman", desc: "API testing & debugging" },
  { name: "Chrome DevTools", desc: "Frontend debugging & network inspection" },
];

export default function Tech() {
  return (
    <div className="px-4 py-6 md:px-6 md:py-10 max-w-5xl mx-auto space-y-10">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-[var(--lg-text-primary)]">
          Under the Hood
        </h1>
        <p className="mt-2 text-sm text-[var(--lg-text-secondary)]">
          A look at the technology, tools, and effort behind The Fantastic Leagues.
          Built from November 2025 to present — 124 commits, 46,870+ lines of
          TypeScript, and an estimated 60 million+ AI tokens.
        </p>
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

      {/* Feature Modules */}
      <div>
        <h2 className="text-lg font-semibold text-[var(--lg-text-primary)] mb-4">
          16 Feature Modules
        </h2>
        <p className="text-sm text-[var(--lg-text-secondary)] mb-3">
          The codebase is organized by domain — each module encapsulates its own
          routes, services, pages, components, and API client.
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
              <span className="text-sm font-medium text-[var(--lg-text-primary)]">
                {t.name}
              </span>
              <span className="text-sm text-[var(--lg-text-muted)]">— {t.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Timeline */}
      <div>
        <h2 className="text-lg font-semibold text-[var(--lg-text-primary)] mb-4">
          Project Timeline
        </h2>
        <div className="rounded-lg border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] p-4 space-y-3 text-sm">
          <div className="flex gap-3">
            <span className="font-medium text-[var(--lg-text-primary)] w-24 shrink-0">Nov 2025</span>
            <span className="text-[var(--lg-text-secondary)]">Project started — initial scaffolding, auth, and database schema</span>
          </div>
          <div className="flex gap-3">
            <span className="font-medium text-[var(--lg-text-primary)] w-24 shrink-0">Dec 2025</span>
            <span className="text-[var(--lg-text-secondary)]">Core features: teams, rosters, players, standings engine</span>
          </div>
          <div className="flex gap-3">
            <span className="font-medium text-[var(--lg-text-primary)] w-24 shrink-0">Jan 2026</span>
            <span className="text-[var(--lg-text-secondary)]">Auction draft with WebSocket, trades, waivers, commissioner tools</span>
          </div>
          <div className="flex gap-3">
            <span className="font-medium text-[var(--lg-text-primary)] w-24 shrink-0">Feb 2026</span>
            <span className="text-[var(--lg-text-secondary)]">Archive system, historical data, design system overhaul, dark mode</span>
          </div>
          <div className="flex gap-3">
            <span className="font-medium text-[var(--lg-text-primary)] w-24 shrink-0">Mar 2026</span>
            <span className="text-[var(--lg-text-secondary)]">Season lifecycle, keeper prep, fielding stats, auction hardening (DB persistence, auto-finish, position limits), 387 tests</span>
          </div>
        </div>
      </div>

      {/* Footer note */}
      <p className="text-xs text-[var(--lg-text-muted)] text-center pb-4">
        Built with Claude Code — estimated 60M+ tokens across 16 sessions
      </p>
    </div>
  );
}
