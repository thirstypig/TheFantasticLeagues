import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Glass, SectionLabel } from "../components/aurora/atoms";
import {
  ChevronRight,
  Users,
  MapPin,
  Sparkles,
  Lightbulb,
  FileText,
  Plug,
  Layout,
  Palette,
  Check,
  X,
  Circle,
  Clock,
} from "lucide-react";
import { useLeague } from "../contexts/LeagueContext";
import LeagueBoard from "../features/board/components/LeagueBoard";
import AdminCrossNav from "../features/admin/components/AdminCrossNav";
import RelatedTodos from "../features/admin/components/RelatedTodos";
import ColorLab from "../features/admin/components/ColorLab";

/* ── Strategic concepts ──────────────────────────────────────── */

type Phase = "explore" | "prototype" | "planned" | "live" | "deferred";

const PHASE_STYLE: Record<Phase, { label: string; cls: string }> = {
  explore: { label: "Exploring", cls: "text-sky-400 bg-sky-500/10 border-sky-500/30" },
  prototype: { label: "Prototype", cls: "text-fuchsia-400 bg-fuchsia-500/10 border-fuchsia-500/30" },
  planned: { label: "Planned", cls: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
  live: { label: "Live", cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
  deferred: { label: "Deferred", cls: "text-slate-400 bg-slate-500/10 border-slate-500/30" },
};

interface StrategicConcept {
  id: string;
  title: string;
  phase: Phase;
  tagline: string;
  description: string;
  competitors?: string[];
  todoLink?: string;
  roadmapLink?: string;
}

const STRATEGIC: StrategicConcept[] = [
  {
    id: "multi-sport-expansion",
    title: "Multi-Sport Expansion",
    phase: "explore",
    tagline: "Football launch Aug 2026, then NCAA Pick'em, March Madness, basketball",
    description:
      "Sport-agnostic engine: SportConfig interface (done), baseball.ts extracted (done). Next: football.ts with Sleeper API integration, NFL roster sync, H2H points scoring. Then NCAA Pick'em for fall 2026, March Madness for Q1 2027.",
    competitors: ["Yahoo Fantasy", "ESPN Fantasy", "Sleeper", "Fantrax"],
    todoLink: "/todo#features",
    roadmapLink: "/roadmap#platform",
  },
  {
    id: "commissioner-ai",
    title: "Commissioner AI Assistant",
    phase: "prototype",
    tagline: "AI co-pilot for league management — rule enforcement, dispute mediation",
    description:
      "Weekly digests already use Gemini/Claude. Extension: AI evaluates trade fairness, flags collusion patterns, drafts commissioner messages for disputes, suggests rule clarifications. Commissioner approves before action.",
    competitors: ["No current competitor does this"],
    roadmapLink: "/roadmap#commissioner",
  },
  {
    id: "dynasty-scoring",
    title: "Dynasty Trophy Case",
    phase: "planned",
    tagline: "All-time records, dynasty scores, championship history from 20+ years",
    description:
      "HistoricalStanding table has 20+ years of OGBA data. Build a Trophy Case showing: most titles, highest season point total, dynasty score (weighted championships + finishes), head-to-head all-time records, era-adjusted rankings.",
    todoLink: "/todo#features",
    roadmapLink: "/roadmap#growth",
  },
  {
    id: "live-scoring",
    title: "Real-Time Live Scoring",
    phase: "explore",
    tagline: "Per-pitch updates via MLB Gameday feed instead of daily sync",
    description:
      "Current stat sync runs daily at 13:00 UTC. Upgrade to near-real-time using MLB Gameday play-by-play feed. Websocket broadcast to clients. Critical for H2H head-to-head weekly matchups where tiebreakers matter.",
    competitors: ["ESPN Fantasy (live)", "Yahoo (live)"],
    roadmapLink: "/roadmap#platform",
  },
  {
    id: "pricing",
    title: "Seasonal Subscription Model",
    phase: "planned",
    tagline: "Free / Pro $29/season / Commissioner $49/season",
    description:
      "Stripe integration pending. Free tier: core league participation. Pro: AI insights, trade analyzer, push notifications. Commissioner: auction admin, force-assign, custom rules, waiver overrides. Founding member lifetime deal at $99 limited to first 100.",
    competitors: ["Fantrax ($20-30/season)", "ESPN (free + ads)", "Yahoo (free + ads)"],
    todoLink: "/todo#monetization",
    roadmapLink: "/roadmap#monetization",
  },
  {
    id: "public-leagues",
    title: "Public League Directory",
    phase: "prototype",
    tagline: "Discover page shows public leagues looking for members",
    description:
      "Current /discover page lists public leagues. Next: self-service league creation, invite codes, join requests with commissioner approval, filter by format/buy-in/timezone, featured leagues promotion.",
    todoLink: "/todo#features",
    roadmapLink: "/roadmap#growth",
  },
  {
    id: "mobile-app",
    title: "Mobile App (React Native)",
    phase: "deferred",
    tagline: "Native iOS/Android app — defer until PWA hits scaling limits",
    description:
      "Current responsive PWA handles mobile well. Expo/React Native port becomes worthwhile at ~10k MAU or if push notification engagement drops. Re-evaluate Q3 2027.",
  },
];

/* ── SEO Pages (planned but unpublished) ──────────────────────── */

interface SeoPage {
  slug: string;
  title: string;
  kind: "landing" | "blog";
  keywords: string[];
  wordCount: number;
  status: "draft" | "planned" | "published";
  targetDate?: string;
}

const SEO_PAGES: SeoPage[] = [
  { slug: "/features", title: "Features — Everything You Need for a Live Auction", kind: "landing", keywords: ["fantasy baseball auction", "live draft app", "keeper league software"], wordCount: 1200, status: "planned" },
  { slug: "/formats/auction", title: "Auction Fantasy Baseball Guide", kind: "landing", keywords: ["auction draft", "FAAB", "budget cap", "keeper"], wordCount: 1800, status: "planned" },
  { slug: "/formats/keeper", title: "Keeper League Rules & Strategy", kind: "landing", keywords: ["keeper rules", "dynasty vs keeper", "keeper cost inflation"], wordCount: 1500, status: "planned" },
  { slug: "/blog/how-to-run-auction", title: "How to Run a Live Auction Draft (2026 Guide)", kind: "blog", keywords: ["live auction", "auction draft", "commissioner guide"], wordCount: 2000, status: "published" },
  { slug: "/blog/fantasy-trade-eval", title: "Evaluating Fantasy Trades: A Surplus-Based Framework", kind: "blog", keywords: ["trade evaluation", "fantasy baseball trades", "player value"], wordCount: 1600, status: "published" },
  { slug: "/blog/faab-strategy", title: "FAAB Bidding Strategy: When to Spend, When to Save", kind: "blog", keywords: ["FAAB", "waiver bidding", "free agent"], wordCount: 1400, status: "published" },
  { slug: "/blog/nl-only-tips", title: "NL-Only League Tips From a 7-Year Commissioner", kind: "blog", keywords: ["NL-only", "mono-league", "auction strategy"], wordCount: 1300, status: "draft", targetDate: "2026-04-21" },
  { slug: "/blog/keeper-inflation", title: "Keeper Inflation Math: The $5 Tax Explained", kind: "blog", keywords: ["keeper rules", "inflation", "keeper cost"], wordCount: 1200, status: "draft", targetDate: "2026-04-28" },
  { slug: "/blog/ai-draft-reports", title: "We Built an AI Draft Report — Here's What It Got Right", kind: "blog", keywords: ["AI fantasy baseball", "draft analysis", "Gemini Claude"], wordCount: 1500, status: "planned", targetDate: "2026-05-05" },
  { slug: "/blog/commissioner-tools", title: "Every Fantasy Commissioner Tool We Wish Existed", kind: "blog", keywords: ["commissioner", "league management", "fantasy tools"], wordCount: 1400, status: "planned", targetDate: "2026-05-12" },
];

/* ── Integrations (ideal workflows) ───────────────────────────── */

interface Integration {
  name: string;
  kind: "auth" | "data" | "payments" | "email" | "analytics" | "ai" | "platform";
  status: "live" | "planned" | "explore" | "deferred";
  hasApi: "yes" | "partial" | "no";
  summary: string;
  workflow?: string[];
  notes?: string;
}

const INTEGRATIONS: Integration[] = [
  { name: "MLB Stats API", kind: "data", status: "live", hasApi: "yes", summary: "Free public API. Daily player/stats sync. 8 MCP tools wrapping it with caching.", workflow: ["Daily 12:00 UTC: roster sync for 30 teams", "Daily 13:00 UTC: player stats sync for active periods", "Weekly Monday: AAA prospects sync", "MCP proxy caches 24h player, 1h stats, 5min schedule"] },
  { name: "Supabase Auth", kind: "auth", status: "live", hasApi: "yes", summary: "OAuth (Google/Yahoo), email/password, JWT verification server-side.", workflow: ["User signs in via Supabase client", "Client attaches Bearer token to API calls", "Server verifies JWT via Supabase Admin SDK", "Auto-accept league invites on login"] },
  { name: "Google Gemini", kind: "ai", status: "live", hasApi: "yes", summary: "gemini-2.5-flash for draft reports, weekly insights, digests. 90s timeout.", workflow: ["Fire-and-forget on trade/waiver processing", "Zod schema validates JSON output", "Fallback to Anthropic Claude on error/quota"] },
  { name: "Anthropic Claude", kind: "ai", status: "live", hasApi: "yes", summary: "claude-sonnet-4 fallback when Gemini fails. 90s timeout, 8192 max tokens.", notes: "Used for complex multi-team draft reports where Gemini sometimes returns malformed JSON" },
  { name: "Resend", kind: "email", status: "live", hasApi: "yes", summary: "Transactional email for league invites.", workflow: ["Commissioner sends invite → POST /api/leagues/invites", "Resend delivers templated email with invite code", "Recipient clicks link → auto-accept on login"] },
  { name: "Stripe", kind: "payments", status: "planned", hasApi: "yes", summary: "Seasonal subscriptions: Pro $29, Commissioner $49.", workflow: ["User clicks Upgrade → POST /api/billing/checkout creates Session", "Redirect to Stripe Checkout", "On success: webhook POST /api/billing/webhook updates UserProfile.plan", "Feature gating via requirePlan() middleware"] },
  { name: "Sleeper API", kind: "data", status: "planned", hasApi: "yes", summary: "Football league import (Aug 2026 launch). No auth needed, JSON over HTTPS.", workflow: ["User enters Sleeper league ID", "GET /api/v1/league/{id} → roster, settings, rules", "Map to FBST League + Team schema", "Backfill historical seasons where available"] },
  { name: "ESPN Fantasy API", kind: "data", status: "explore", hasApi: "partial", summary: "Undocumented but usable. Cookie-based auth. Rate limiting unclear.", notes: "Would enable import from ESPN leagues; legal/ToS uncertain. Defer pending Sleeper success." },
  { name: "Yahoo Fantasy API", kind: "data", status: "deferred", hasApi: "yes", summary: "OAuth2 required, extensive docs. Worth ~Q4 2026.", notes: "Deferred due to OAuth complexity. Revisit once Sleeper pipeline is proven." },
  { name: "PostHog", kind: "analytics", status: "explore", hasApi: "yes", summary: "Product analytics: funnel analysis, session replay, feature flags.", notes: "Alternative to GA4 for product telemetry (GA4 remains for marketing site)" },
  { name: "Google Analytics 4", kind: "analytics", status: "planned", hasApi: "yes", summary: "Marketing site traffic, search console integration, conversion tracking.", todoLink: "/todo#content" } as any,
  { name: "FanGraphs", kind: "data", status: "deferred", hasApi: "no", summary: "No public API. $15/mo Fantasy-focused tier. Currently used for manual audits only." },
  { name: "Statcast", kind: "data", status: "explore", hasApi: "yes", summary: "Free via pybaseball or Baseball Savant. Exit velocity, launch angle, xwOBA for advanced projections." },
  { name: "Railway", kind: "platform", status: "live", hasApi: "yes", summary: "Production hosting. $5/mo. Zero-downtime deploys from GitHub main.", workflow: ["Push to main → GitHub webhook triggers Railway build", "Railway runs: npm install → build client/server → restart", "Env vars in Railway dashboard; secrets never in repo"] },
  { name: "Cloudflare", kind: "platform", status: "live", hasApi: "yes", summary: "DNS, CDN, HTTPS. No-cache headers on index.html to prevent stale deploys." },
];

/* ── UX Mockups (future UI concepts) ──────────────────────────── */

interface UxMockup {
  id: string;
  title: string;
  status: "idea" | "sketching" | "prototyped";
  summary: string;
  description: string;
  todoLink?: string;
}

const MOCKUPS: UxMockup[] = [
  {
    id: "live-auction-mobile",
    title: "Live Auction — Mobile-First Redesign",
    status: "prototyped",
    summary: "Rethink auction UX for one-handed mobile use during live draft",
    description: "Current auction works on mobile but isn't optimized. Prototype: thumb-zone bid buttons, swipeable player pool, bottom sheet for team view, haptic feedback on bid wins. Large-format winning team card replaces cramped log.",
  },
  {
    id: "trade-deck",
    title: "Trade Deck — Tinder-Style Block Browsing",
    status: "sketching",
    summary: "Swipe through trade block players, tap to propose",
    description: "Trading Block currently shows a flat list. Replace with swipeable card deck: player stats front, trade value surplus back. Swipe right = interested, left = pass. Tap 'Propose' opens trade builder pre-filled with swiped player.",
  },
  {
    id: "season-heatmap",
    title: "Season Heatmap — Category Dominance Over Time",
    status: "idea",
    summary: "Visualize who wins which categories week-by-week",
    description: "Grid: rows = teams, columns = periods, cells color-coded by category points earned. At a glance see who's the 'power hitting team' in May vs July. Click a cell for category breakdown.",
  },
  {
    id: "roster-comparator",
    title: "Roster Comparator — Two-Team Side-By-Side",
    status: "idea",
    summary: "Compare any two rosters with diff highlighting",
    description: "Select Team A and Team B, see rosters side-by-side with position matchups. Surplus values summed per position. Highlights: which team has better SS, who's weak at OF. Useful before proposing trades.",
  },
  {
    id: "commissioner-inbox",
    title: "Commissioner Inbox — Pending Actions Queue",
    status: "idea",
    summary: "Single pane of glass for commissioner decisions",
    description: "Current commissioner tools are spread across tabs. New: unified inbox showing pending waivers, disputed trades, rule questions flagged by AI, roster violations. Each item has one-click approve/reject.",
    todoLink: "/todo#features",
  },
];

/* ── Tab infrastructure ──────────────────────────────────────── */

type TabId = "strategic" | "seo" | "integrations" | "mockups" | "colors";

const TABS: { id: TabId; label: string; icon: any }[] = [
  { id: "strategic", label: "Strategic", icon: Lightbulb },
  { id: "seo", label: "SEO Pages", icon: FileText },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "mockups", label: "UX Mockups", icon: Layout },
  { id: "colors", label: "Colors", icon: Palette },
];

/* ── Marketplace preview (kept from old Concepts) ─────────────── */

const MARKETPLACE_CARDS = [
  { name: "OGBA 2027 — NL-Only Roto", details: "1 spot open · $50 buy-in · Keeper league · 7 years running", spots: 1 },
  { name: "Dynasty Baseball League", details: "2 spots open · Free · H2H Points · Year-round trading", spots: 2 },
  { name: "Competitive 5x5 Roto", details: "3 spots open · $100 buy-in · Redraft · Est. 2018", spots: 3 },
];

/* ── Main Page ──────────────────────────────────────────────── */

export default function Concepts() {
  const { leagueId } = useLeague();
  const { hash } = useLocation();
  const [tab, setTab] = useState<TabId>("strategic");
  const [expandedConcept, setExpandedConcept] = useState<string | null>(null);
  const [expandedMockup, setExpandedMockup] = useState<string | null>(null);

  // Deep-link support: /concepts#pricing auto-switches to the Strategic tab,
  // expands the matching concept, and scrolls to it. Also supports #seo-pages
  // etc. to jump to the SEO tab.
  useEffect(() => {
    if (!hash) return;
    const target = hash.replace(/^#/, "");
    // Tab alias shortcuts
    const tabAliases: Record<string, TabId> = {
      "seo-pages": "seo",
      seo: "seo",
      integrations: "integrations",
      mockups: "mockups",
      strategic: "strategic",
      colors: "colors",
      palette: "colors",
    };
    if (tabAliases[target]) {
      setTab(tabAliases[target]);
    }
    // Concept id → switch to Strategic tab + expand
    const concept = STRATEGIC.find((c) => c.id === target);
    if (concept) {
      setTab("strategic");
      setExpandedConcept(concept.id);
    }
    const el = document.getElementById(target);
    if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [hash]);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <Glass strong>
        <SectionLabel>✦ Concepts Lab</SectionLabel>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h1 style={{ fontFamily: "var(--am-display)", fontSize: 30, fontWeight: 300, color: "var(--am-text)", margin: 0, lineHeight: 1.1 }}>Concepts Lab</h1>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.4, textTransform: "uppercase", padding: "3px 8px", borderRadius: 99, background: "rgba(177, 75, 255, 0.15)", color: "rgb(196, 137, 255)" }}>BETA</span>
        </div>
        <div style={{ marginTop: 6, fontSize: 13, color: "var(--am-text-muted)" }}>Strategic features, SEO pages, integrations, and UX mockups we're exploring.</div>
        <div style={{ marginTop: 12 }}><AdminCrossNav /></div>
      </Glass>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-[var(--lg-border-faint)] overflow-x-auto">
        {TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                active
                  ? "text-[var(--lg-text-primary)] border-[var(--lg-accent)]"
                  : "text-[var(--lg-text-muted)] border-transparent hover:text-[var(--lg-text-primary)]"
              }`}
            >
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Strategic tab */}
      {tab === "strategic" && (
        <div className="space-y-4">
          <p className="text-xs text-[var(--lg-text-muted)]">
            Major feature concepts under consideration, ranked from exploring → live. Click any to expand.
          </p>
          {STRATEGIC.map(c => {
            const expanded = expandedConcept === c.id;
            const phaseStyle = PHASE_STYLE[c.phase];
            return (
              <div key={c.id} id={c.id} className="bg-[var(--lg-tint)] border border-[var(--lg-border-subtle)] rounded-xl overflow-hidden scroll-mt-24">
                <button
                  onClick={() => setExpandedConcept(expanded ? null : c.id)}
                  className="w-full p-4 text-left hover:bg-[var(--lg-bg-card)] transition-colors"
                >
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${phaseStyle.cls}`}>{phaseStyle.label}</span>
                      <h3 className="text-sm font-bold text-[var(--lg-text-heading)]">{c.title}</h3>
                    </div>
                    <p className="text-xs text-[var(--lg-text-muted)] flex-1 text-right sm:text-right">{c.tagline}</p>
                  </div>
                </button>
                {expanded && (
                  <div className="px-4 pb-4 border-t border-[var(--lg-border-faint)] pt-3 space-y-3">
                    <p className="text-xs text-[var(--lg-text-secondary)] leading-relaxed">{c.description}</p>
                    {c.id === "pricing" && (
                      <div className="rounded-md border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] p-3">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--lg-text-muted)]">Tier summary</span>
                          <Link to="/pricing" className="text-[10px] text-[var(--lg-accent)] hover:underline">
                            Full pricing page →
                          </Link>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div className="rounded border border-[var(--lg-border-subtle)] p-2">
                            <div className="font-semibold text-[var(--lg-text-primary)]">Free</div>
                            <div className="text-[var(--lg-text-muted)] text-[10px]">$0 · core league play · up to 2 leagues</div>
                          </div>
                          <div className="rounded border border-[var(--lg-accent)]/40 bg-[var(--lg-accent)]/5 p-2">
                            <div className="font-semibold text-[var(--lg-text-primary)]">Pro · $29/season</div>
                            <div className="text-[var(--lg-text-muted)] text-[10px]">AI draft report · trade advisor · Statcast</div>
                          </div>
                          <div className="rounded border border-[var(--lg-border-subtle)] p-2">
                            <div className="font-semibold text-[var(--lg-text-primary)]">Commissioner · $49/season</div>
                            <div className="text-[var(--lg-text-muted)] text-[10px]">Everything in Pro · auction admin · custom rules</div>
                          </div>
                        </div>
                      </div>
                    )}
                    <RelatedTodos kind="concept" anchor={c.id} />
                    {c.competitors && (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-bold uppercase text-[var(--lg-text-muted)]">Competitors:</span>
                        {c.competitors.map(comp => (
                          <span key={comp} className="text-[10px] px-2 py-0.5 rounded border border-[var(--lg-border-subtle)] text-[var(--lg-text-muted)]">
                            {comp}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      {c.todoLink && (
                        <Link to={c.todoLink} className="text-[10px] font-bold uppercase px-2 py-1 rounded border text-emerald-400 bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20">
                          → Todo
                        </Link>
                      )}
                      {c.roadmapLink && (
                        <Link to={c.roadmapLink} className="text-[10px] font-bold uppercase px-2 py-1 rounded border text-sky-400 bg-sky-500/10 border-sky-500/30 hover:bg-sky-500/20">
                          → Roadmap
                        </Link>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* SEO Pages tab */}
      {tab === "seo" && (
        <div className="space-y-4">
          <p className="text-xs text-[var(--lg-text-muted)]">Planned landing pages and blog posts for organic search. Target: 10 posts by July 2026.</p>
          <div className="bg-[var(--lg-tint)] border border-[var(--lg-border-subtle)] rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-[var(--lg-bg-card)] border-b border-[var(--lg-border-faint)]">
                <tr>
                  <th className="text-left p-3 font-bold text-[var(--lg-text-muted)] uppercase text-[10px]">Slug</th>
                  <th className="text-left p-3 font-bold text-[var(--lg-text-muted)] uppercase text-[10px]">Title</th>
                  <th className="text-left p-3 font-bold text-[var(--lg-text-muted)] uppercase text-[10px]">Keywords</th>
                  <th className="text-right p-3 font-bold text-[var(--lg-text-muted)] uppercase text-[10px]">Words</th>
                  <th className="text-left p-3 font-bold text-[var(--lg-text-muted)] uppercase text-[10px]">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--lg-border-faint)]">
                {SEO_PAGES.map(p => (
                  <tr key={p.slug} className="hover:bg-[var(--lg-bg-card)]/50">
                    <td className="p-3 font-mono text-[11px] text-[var(--lg-accent)]">{p.slug}</td>
                    <td className="p-3 text-[var(--lg-text-primary)]">{p.title}</td>
                    <td className="p-3 text-[var(--lg-text-muted)]">
                      <div className="flex flex-wrap gap-1">
                        {p.keywords.slice(0, 3).map(k => (
                          <span key={k} className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--lg-bg)] border border-[var(--lg-border-subtle)]">{k}</span>
                        ))}
                      </div>
                    </td>
                    <td className="p-3 text-right tabular-nums text-[var(--lg-text-muted)]">{p.wordCount}</td>
                    <td className="p-3">
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${
                        p.status === "published" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" :
                        p.status === "draft" ? "text-amber-400 bg-amber-500/10 border-amber-500/30" :
                        "text-slate-400 bg-slate-500/10 border-slate-500/30"
                      }`}>
                        {p.status}
                      </span>
                      {p.targetDate && <div className="text-[9px] text-[var(--lg-text-muted)] mt-0.5">{p.targetDate}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Integrations tab */}
      {tab === "integrations" && (
        <div className="space-y-4">
          <p className="text-xs text-[var(--lg-text-muted)]">Third-party services, their API availability, and integration status.</p>
          <div className="bg-[var(--lg-tint)] border border-[var(--lg-border-subtle)] rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-[var(--lg-bg-card)] border-b border-[var(--lg-border-faint)]">
                <tr>
                  <th className="text-left p-3 font-bold text-[var(--lg-text-muted)] uppercase text-[10px]">Service</th>
                  <th className="text-left p-3 font-bold text-[var(--lg-text-muted)] uppercase text-[10px]">Kind</th>
                  <th className="text-left p-3 font-bold text-[var(--lg-text-muted)] uppercase text-[10px]">API</th>
                  <th className="text-left p-3 font-bold text-[var(--lg-text-muted)] uppercase text-[10px]">Status</th>
                  <th className="text-left p-3 font-bold text-[var(--lg-text-muted)] uppercase text-[10px]">Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--lg-border-faint)]">
                {INTEGRATIONS.map(i => (
                  <tr key={i.name} className="hover:bg-[var(--lg-bg-card)]/50">
                    <td className="p-3 font-semibold text-[var(--lg-text-primary)]">{i.name}</td>
                    <td className="p-3 text-[var(--lg-text-muted)] capitalize">{i.kind}</td>
                    <td className="p-3">
                      {i.hasApi === "yes" ? <Check size={14} className="text-emerald-400" /> :
                       i.hasApi === "partial" ? <Circle size={14} className="text-amber-400" /> :
                       <X size={14} className="text-slate-500" />}
                    </td>
                    <td className="p-3">
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${
                        i.status === "live" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" :
                        i.status === "planned" ? "text-amber-400 bg-amber-500/10 border-amber-500/30" :
                        i.status === "explore" ? "text-sky-400 bg-sky-500/10 border-sky-500/30" :
                        "text-slate-400 bg-slate-500/10 border-slate-500/30"
                      }`}>
                        {i.status}
                      </span>
                    </td>
                    <td className="p-3 text-[var(--lg-text-muted)]">{i.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* UX Mockups tab */}
      {tab === "mockups" && (
        <div className="space-y-4">
          <p className="text-xs text-[var(--lg-text-muted)]">UI concepts and interactive prototypes under exploration.</p>
          {MOCKUPS.map(m => {
            const expanded = expandedMockup === m.id;
            return (
              <div key={m.id} id={m.id} className="bg-[var(--lg-tint)] border border-[var(--lg-border-subtle)] rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpandedMockup(expanded ? null : m.id)}
                  className="w-full p-4 text-left hover:bg-[var(--lg-bg-card)] transition-colors"
                >
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${
                        m.status === "prototyped" ? "text-fuchsia-400 bg-fuchsia-500/10 border-fuchsia-500/30" :
                        m.status === "sketching" ? "text-amber-400 bg-amber-500/10 border-amber-500/30" :
                        "text-slate-400 bg-slate-500/10 border-slate-500/30"
                      }`}>
                        <Clock size={10} className="inline mr-0.5" /> {m.status}
                      </span>
                      <h3 className="text-sm font-bold text-[var(--lg-text-heading)]">{m.title}</h3>
                    </div>
                    <p className="text-xs text-[var(--lg-text-muted)] flex-1 text-right">{m.summary}</p>
                  </div>
                </button>
                {expanded && (
                  <div className="px-4 pb-4 border-t border-[var(--lg-border-faint)] pt-3 space-y-3">
                    <p className="text-xs text-[var(--lg-text-secondary)] leading-relaxed">{m.description}</p>
                    {m.todoLink && (
                      <Link to={m.todoLink} className="inline-block text-[10px] font-bold uppercase px-2 py-1 rounded border text-emerald-400 bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20">
                        → Todo
                      </Link>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Colors tab */}
      {tab === "colors" && <ColorLab />}

      {/* Live features section (kept below tabs) */}
      <section className="pt-8 border-t border-[var(--lg-border-faint)]">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-5 h-5 text-[var(--lg-accent)]" />
          <h2 className="text-lg font-semibold text-[var(--lg-text-heading)]">Live: League Board</h2>
          <span className="text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">LIVE</span>
          <Link to="/board" className="ml-auto flex items-center gap-1 text-xs font-medium text-[var(--lg-accent)] hover:underline">
            Full page <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
        <LeagueBoard leagueId={leagueId} />
      </section>

      <section>
        <div className="flex items-center gap-2 mb-2">
          <Users className="w-5 h-5 text-[var(--lg-accent)]" />
          <h2 className="text-lg font-semibold text-[var(--lg-text-heading)]">Coming Soon: Community Marketplace</h2>
          <span className="text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full bg-[var(--lg-tint)] text-[var(--lg-text-muted)]">COMING SOON</span>
        </div>
        <p className="text-xs text-[var(--lg-text-muted)] mb-4 max-w-2xl">
          Find leagues looking for players. Post your team for adoption. Browse by format, buy-in, and timezone.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {MARKETPLACE_CARDS.map((listing, i) => (
            <div key={i} className="rounded-xl p-4 border border-[var(--lg-border-faint)] bg-[var(--lg-glass-bg)]">
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-sm font-semibold text-[var(--lg-text-primary)]">{listing.name}</h3>
                <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                  <MapPin className="w-3 h-3" /> {listing.spots} open
                </span>
              </div>
              <p className="text-xs text-[var(--lg-text-muted)]">{listing.details}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
