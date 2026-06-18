// client/src/pages/design/StagingDocsPreview.tsx
//
// STATIC MOCKUP — no business logic, no API calls.
// Purpose: visual review of the "Staging Environment" admin docs page
// before it is wired into the real Docs sidebar.
//
// Route: /design/staging-docs

import { useState } from "react";
import {
  Database,
  Terminal,
  Server,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  FlaskConical,
  Globe,
  Zap,
  Copy,
  Check,
} from "lucide-react";

// ─── Design tokens (mirror the live app) ────────────────────────────────────

const C = {
  card: "rounded-lg border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)]",
  text: "text-[var(--lg-text-primary)]",
  muted: "text-[var(--lg-text-muted)]",
  secondary: "text-[var(--lg-text-secondary)]",
  accent: "text-[var(--lg-accent)]",
  tint: "bg-[var(--lg-tint)]",
  border: "border-[var(--lg-border-faint)]",
};

// ─── Small atoms ────────────────────────────────────────────────────────────

function SectionH2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className={`text-base font-semibold ${C.text} mt-0 mb-3 flex items-center gap-2`}>
      {children}
    </h2>
  );
}

function Prose({ children }: { children: React.ReactNode }) {
  return <p className={`text-sm ${C.secondary} leading-relaxed mb-3`}>{children}</p>;
}

function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className={`text-xs ${C.tint} px-1.5 py-0.5 rounded font-mono ${C.accent} border ${C.border}`}>
      {children}
    </code>
  );
}

function CodeBlock({ children, label }: { children: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(children).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className={`relative rounded-md ${C.tint} border ${C.border} my-3`}>
      {label && (
        <div className={`px-3 pt-2 pb-0 text-[10px] font-semibold uppercase tracking-wider ${C.muted}`}>
          {label}
        </div>
      )}
      <pre className="px-4 py-3 overflow-x-auto text-xs">
        <code className={C.secondary}>{children}</code>
      </pre>
      <button
        onClick={copy}
        className={`absolute top-2 right-2 p-1.5 rounded ${C.tint} border ${C.border} ${C.muted} hover:${C.text} transition-colors`}
        title="Copy"
      >
        {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
      </button>
    </div>
  );
}

function StatusBadge({
  children,
  variant,
}: {
  children: React.ReactNode;
  variant: "ok" | "warn" | "info" | "neutral";
}) {
  const styles = {
    ok: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    warn: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    info: "bg-sky-500/10 text-sky-400 border-sky-500/30",
    neutral: "bg-[var(--lg-tint)] text-[var(--lg-text-muted)] border-[var(--lg-border-faint)]",
  };
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded border ${styles[variant]}`}>
      {children}
    </span>
  );
}

function BulletItem({ children }: { children: React.ReactNode }) {
  return (
    <div className={`flex items-start gap-2 text-sm ${C.secondary} my-1`}>
      <span className={`mt-2 w-1 h-1 rounded-full bg-[var(--lg-text-muted)] shrink-0`} />
      <span>{children}</span>
    </div>
  );
}

function StepItem({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 my-2">
      <span className={`shrink-0 w-5 h-5 rounded-full border ${C.border} flex items-center justify-center text-[10px] font-bold ${C.muted} mt-0.5`}>
        {n}
      </span>
      <div className={`text-sm ${C.secondary} flex-1`}>{children}</div>
    </div>
  );
}

// ─── Section card wrapper ────────────────────────────────────────────────────

function Section({
  icon: Icon,
  iconColor,
  title,
  id,
  children,
}: {
  icon: React.ElementType;
  iconColor: string;
  title: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <div id={id} className={`${C.card} p-5`}>
      <SectionH2>
        <span className={`w-7 h-7 rounded-md flex items-center justify-center ${iconColor}`}>
          <Icon size={15} />
        </span>
        {title}
      </SectionH2>
      {children}
    </div>
  );
}

// ─── Stats API table ─────────────────────────────────────────────────────────

const API_TABLE = [
  { sport: "MLB", api: "MLB Stats API (official)", base: "statsapi.mlb.com", key: "None — public", status: "live", notes: "Live player/schedule data" },
  { sport: "NFL", api: "ESPN Fantasy API (unofficial)", base: "fantasy.espn.com/apis/v3", key: "ESPN_S2 cookie", status: "planned", notes: "Phase 2 scaffolding" },
  { sport: "NBA", api: "NBA Stats API (unofficial)", base: "stats.nba.com", key: "None — public", status: "planned", notes: "Phase 2 scaffolding" },
];

// ─── Troubleshooting entries ─────────────────────────────────────────────────

const TROUBLE = [
  {
    problem: "seed-staging.ts fails with P1001 (connection timeout)",
    solution: (
      <>
        Check <InlineCode>.env.staging</InlineCode> — make sure <InlineCode>DATABASE_URL</InlineCode> points
        to the <strong>staging</strong> Supabase pooler, not prod. Both URLs must end with{" "}
        <InlineCode>?connection_limit=1</InlineCode> (free tier IPv6 pooler constraint).
      </>
    ),
  },
  {
    problem: "Players not populating after seed",
    solution: (
      <>
        MLB Stats API throttles burst requests. Run <InlineCode>npm run seed:staging -- --sport mlb --delay 500</InlineCode>{" "}
        to add a 500ms delay between player fetch batches.
      </>
    ),
  },
  {
    problem: "Prisma schema out of sync with staging DB",
    solution: (
      <>
        Run <InlineCode>DATABASE_URL=$(cat .env.staging | grep DATABASE_URL | cut -d= -f2) npx prisma migrate deploy</InlineCode>{" "}
        from the <InlineCode>server/</InlineCode> directory to apply any pending migrations.
      </>
    ),
  },
  {
    problem: "CI passes but staging deploy fails",
    solution: (
      <>
        Railway uses <InlineCode>NODE_ENV=production</InlineCode> — devDependencies are not installed.
        Any import used at runtime (not just in tests) must be in <InlineCode>dependencies</InlineCode>,
        not <InlineCode>devDependencies</InlineCode>.
      </>
    ),
  },
];

// ─── Jump-to nav ─────────────────────────────────────────────────────────────

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "access", label: "Access & Setup" },
  { id: "seed", label: "Seed & Reset" },
  { id: "apis", label: "Stats APIs" },
  { id: "troubleshooting", label: "Troubleshooting" },
];

// ─── Page ────────────────────────────────────────────────────────────────────

export default function StagingDocsPreview() {
  const [activeSection, setActiveSection] = useState("overview");

  const scrollTo = (id: string) => {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="flex h-[calc(100svh-64px)]">

      {/* ── Right-rail jump nav ── */}
      <aside className="hidden xl:flex flex-col w-52 shrink-0 border-r border-[var(--lg-border-faint)] py-6 px-4 gap-1 overflow-y-auto">
        <p className={`text-[10px] font-semibold uppercase tracking-wider ${C.muted} mb-2`}>On this page</p>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => scrollTo(s.id)}
            className={`text-left text-xs px-2 py-1.5 rounded transition-colors ${
              activeSection === s.id
                ? `${C.tint} ${C.accent} font-medium`
                : `${C.muted} hover:${C.text} hover:${C.tint}`
            }`}
          >
            {s.label}
          </button>
        ))}
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-8 space-y-5">

          {/* Page header */}
          <div>
            <div className={`flex items-center gap-1.5 text-xs ${C.muted} mb-3`}>
              <span>Admin</span>
              <ChevronRight size={12} />
              <span>Docs</span>
              <ChevronRight size={12} />
              <span className={C.text}>Staging Environment</span>
            </div>

            <div className="flex items-start justify-between gap-4 mb-1">
              <h1 className={`text-2xl font-semibold ${C.text} leading-tight`}>
                Staging Environment
              </h1>
              <StatusBadge variant="warn">Phase 0 · In Progress</StatusBadge>
            </div>
            <p className={`text-sm ${C.muted}`}>
              Last updated: June 2026 · Admin-only reference
            </p>
          </div>

          {/* ── 1. Overview ── */}
          <Section id="overview" icon={FlaskConical} iconColor="bg-fuchsia-500/10 text-fuchsia-400" title="Overview">
            <Prose>
              The staging environment is a <strong>fully isolated copy</strong> of the TFL app running
              against a separate Supabase project. It is designed for:
            </Prose>

            <div className="grid sm:grid-cols-2 gap-2 mb-4">
              {[
                { icon: Zap, label: "Feature testing", desc: "Test new leagues, drafts, and scoring rules without touching prod data." },
                { icon: Globe, label: "Multi-sport scaffolding", desc: "Create NFL and NBA league fixtures before the live stats pipelines are wired." },
                { icon: RefreshCw, label: "Safe resets", desc: "Tear down and re-seed at any time — one command, no prod risk." },
                { icon: Server, label: "CI integration", desc: "A future CI step can seed staging automatically on PR merges to main." },
              ].map(({ icon: Icon, label, desc }) => (
                <div key={label} className={`${C.tint} rounded-md border ${C.border} p-3 flex gap-3`}>
                  <Icon size={15} className={`${C.muted} mt-0.5 shrink-0`} />
                  <div>
                    <div className={`text-xs font-semibold ${C.text} mb-0.5`}>{label}</div>
                    <div className={`text-xs ${C.muted}`}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className={`border-l-2 border-amber-500/40 pl-3 py-1 rounded-r text-sm ${C.secondary}`}>
              <strong className="text-amber-400">Important:</strong> Local <InlineCode>.env</InlineCode> still
              points to <strong>prod</strong> Supabase. Any write from <InlineCode>localhost</InlineCode> without
              swapping the URL hits production. Always use <InlineCode>.env.staging</InlineCode> explicitly.
            </div>
          </Section>

          {/* ── 2. Access & Setup ── */}
          <Section id="access" icon={Database} iconColor="bg-sky-500/10 text-sky-400" title="Access & Setup">
            <Prose>
              Staging is a second Supabase project with its own connection string. Configure it alongside
              prod without clobbering the existing <InlineCode>.env</InlineCode>.
            </Prose>

            <h3 className={`text-xs font-semibold uppercase tracking-wide ${C.muted} mt-4 mb-2`}>
              1 · Create the Supabase staging project
            </h3>
            <StepItem n={1}>Log into <strong>supabase.com</strong> → New Project → name it <InlineCode>tfl-staging</InlineCode>.</StepItem>
            <StepItem n={2}>Under <strong>Settings → Database</strong>, copy the <em>Transaction pooler</em> connection string (port 6543).</StepItem>
            <StepItem n={3}>
              Append <InlineCode>?connection_limit=1</InlineCode> to the URL — the free-tier pooler requires this
              (IPv6 direct connection is disabled on free plans).
            </StepItem>

            <h3 className={`text-xs font-semibold uppercase tracking-wide ${C.muted} mt-5 mb-2`}>
              2 · Create .env.staging
            </h3>
            <CodeBlock label=".env.staging (template)">
{`# Copy this file — do NOT commit values to git
NODE_ENV=staging

# Staging Supabase — separate project from prod
DATABASE_URL="postgresql://postgres.xxxx:password@aws-0-us-west-1.pooler.supabase.com:6543/postgres?connection_limit=1"
DIRECT_URL="postgresql://postgres.xxxx:password@aws-0-us-west-1.pooler.supabase.com:6543/postgres?connection_limit=1"

# App
PORT=3001
CLIENT_URL=http://localhost:5174
JWT_SECRET=staging-secret-change-me

# Stats APIs (same as prod — all public)
MLB_STATS_API_BASE=https://statsapi.mlb.com/api/v1`}
            </CodeBlock>

            <h3 className={`text-xs font-semibold uppercase tracking-wide ${C.muted} mt-5 mb-2`}>
              3 · Run migrations against staging
            </h3>
            <CodeBlock label="server/ directory">
{`# Apply all pending Prisma migrations to staging DB
DATABASE_URL=$(grep DATABASE_URL .env.staging | cut -d= -f2-) \\
  npx prisma migrate deploy`}
            </CodeBlock>

            <div className={`flex items-start gap-2 mt-3 text-sm ${C.secondary}`}>
              <CheckCircle2 size={14} className="text-emerald-400 mt-0.5 shrink-0" />
              <span>
                After this step you should see <InlineCode>All migrations have been successfully applied</InlineCode>.
                The schema is now in sync with prod but the database is empty — proceed to Seed & Reset.
              </span>
            </div>
          </Section>

          {/* ── 3. Seed & Reset ── */}
          <Section id="seed" icon={RefreshCw} iconColor="bg-emerald-500/10 text-emerald-400" title="Seed & Reset">
            <Prose>
              The seed script (<InlineCode>scripts/seed-staging.ts</InlineCode>) creates a complete
              test environment: league, teams, owners, and live player data pulled from the MLB Stats API.
              It is idempotent — safe to run multiple times.
            </Prose>

            <h3 className={`text-xs font-semibold uppercase tracking-wide ${C.muted} mt-2 mb-2`}>
              One-command seed
            </h3>
            <CodeBlock label="from repo root">
{`# Full seed (MLB only — Phase 0)
npm run seed:staging

# Reset + re-seed (destructive: clears all staging data first)
npm run seed:staging -- --reset

# Seed a specific sport only
npm run seed:staging -- --sport mlb`}
            </CodeBlock>

            <h3 className={`text-xs font-semibold uppercase tracking-wide ${C.muted} mt-5 mb-2`}>
              What the seed script creates
            </h3>
            <div className="overflow-x-auto rounded-md border border-[var(--lg-border-faint)]">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--lg-border-faint)]">
                    {["Resource", "Count", "Source"].map((h) => (
                      <th key={h} className={`text-left py-2 px-3 font-semibold ${C.muted}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["League", "1 (OGBA-Staging)", "Hardcoded fixture"],
                    ["Teams / owners", "10", "Hardcoded fixture"],
                    ["MLB players (active)", "~750", "MLB Stats API — live"],
                    ["Pitcher stats seed", "Current season", "MLB Stats API — live"],
                    ["Hitter stats seed", "Current season", "MLB Stats API — live"],
                    ["Draft picks (snake)", "10 rounds × 10 teams", "Generated fixture"],
                  ].map(([r, c, s]) => (
                    <tr key={r as string} className="border-b border-[var(--lg-border-faint)]/50">
                      <td className={`py-2 px-3 ${C.text} font-medium`}>{r}</td>
                      <td className={`py-2 px-3 ${C.secondary}`}>{c}</td>
                      <td className={`py-2 px-3 ${C.muted}`}>{s}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 className={`text-xs font-semibold uppercase tracking-wide ${C.muted} mt-5 mb-2`}>
              Seed script structure (to be implemented)
            </h3>
            <CodeBlock label="scripts/seed-staging.ts (outline)">
{`// 1. Parse CLI flags (--reset, --sport, --delay)
// 2. Load .env.staging via dotenv
// 3. If --reset: truncate all rows (transaction)
// 4. Upsert League + Team fixtures
// 5. Fetch players from stats API and upsert Player rows
// 6. Seed PlayerStatsPeriod for current season
// 7. Log summary: N players, N stats rows, elapsed time`}
            </CodeBlock>
          </Section>

          {/* ── 4. Stats APIs ── */}
          <Section id="apis" icon={Globe} iconColor="bg-amber-500/10 text-amber-400" title="Stats APIs by Sport">
            <Prose>
              Staging always pulls from <strong>live stats APIs</strong> — no synthetic data.
              This ensures player rosters, stats, and eligibility reflect real-world state.
            </Prose>

            <div className="overflow-x-auto rounded-md border border-[var(--lg-border-faint)]">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--lg-border-faint)]">
                    {["Sport", "API", "Base URL", "Auth Key", "Phase"].map((h) => (
                      <th key={h} className={`text-left py-2 px-3 font-semibold ${C.muted}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {API_TABLE.map((row) => (
                    <tr key={row.sport} className="border-b border-[var(--lg-border-faint)]/50">
                      <td className={`py-2 px-3 font-semibold ${C.text}`}>{row.sport}</td>
                      <td className={`py-2 px-3 ${C.secondary}`}>{row.api}</td>
                      <td className={`py-2 px-3 font-mono ${C.muted} text-[10px]`}>{row.base}</td>
                      <td className={`py-2 px-3 ${C.muted}`}>{row.key}</td>
                      <td className="py-2 px-3">
                        <StatusBadge variant={row.status === "live" ? "ok" : "neutral"}>
                          {row.status}
                        </StatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className={`mt-3 text-xs ${C.muted}`}>
              NFL and NBA APIs are listed for planning purposes. No integration code exists yet — Phase 2.
            </div>

            <h3 className={`text-xs font-semibold uppercase tracking-wide ${C.muted} mt-5 mb-2`}>
              MLB Stats API — key endpoints used
            </h3>
            {[
              ["/sports/1/players?season={year}&gameType=R", "Active roster (all MLB players)"],
              ["/schedule?sportId=1&date={date}", "Daily game schedule"],
              ["/people/{mlbId}/stats?stats=season&group=hitting", "Season hitting stats"],
              ["/people/{mlbId}/stats?stats=season&group=pitching", "Season pitching stats"],
            ].map(([endpoint, desc]) => (
              <div key={endpoint as string} className={`flex items-start gap-3 py-1.5 border-b ${C.border} last:border-0`}>
                <code className={`text-[10px] font-mono ${C.accent} shrink-0 mt-0.5`}>{endpoint}</code>
                <span className={`text-xs ${C.muted} flex-1`}>{desc}</span>
              </div>
            ))}
          </Section>

          {/* ── 5. Troubleshooting ── */}
          <Section id="troubleshooting" icon={AlertTriangle} iconColor="bg-red-500/10 text-red-400" title="Troubleshooting">
            <div className="space-y-4">
              {TROUBLE.map((t, i) => (
                <div key={i} className={`rounded-md ${C.tint} border ${C.border} p-4`}>
                  <div className={`flex items-start gap-2 mb-2`}>
                    <AlertTriangle size={13} className="text-amber-400 mt-0.5 shrink-0" />
                    <span className={`text-sm font-medium ${C.text}`}>{t.problem}</span>
                  </div>
                  <div className={`text-sm ${C.secondary} pl-5`}>{t.solution}</div>
                </div>
              ))}
            </div>

            <div className={`mt-4 rounded-md border border-sky-500/20 bg-sky-500/5 p-4`}>
              <div className="flex items-center gap-2 mb-1">
                <Terminal size={13} className="text-sky-400" />
                <span className={`text-xs font-semibold text-sky-300`}>Still stuck?</span>
              </div>
              <p className={`text-xs ${C.muted}`}>
                Check Railway deployment logs for the <InlineCode>tfl-staging</InlineCode> service,
                or inspect the Supabase staging project logs under <strong>Database → Logs</strong>.
                Staging errors do not page anyone — it's a safe sandbox.
              </p>
            </div>
          </Section>

          {/* Footer */}
          <div className={`text-center text-xs ${C.muted} pb-6 pt-2`}>
            Admin docs · Staging Environment · TFL Phase 0
          </div>
        </div>
      </main>
    </div>
  );
}
