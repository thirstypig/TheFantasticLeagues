import React from 'react';
import { Link } from 'react-router-dom';
import {
  Gavel, Users, BarChart3, TrendingUp, Shield, Zap,
  Star, MessageCircle, Volume2, Target, Clock, Globe,
  Layers, Database, Activity, ArrowRight, Smartphone
} from 'lucide-react';
import { Logo } from '../components/ui/Logo';

function FeatureCard({ icon: Icon, title, desc, accent }: { icon: React.ElementType; title: string; desc: string; accent?: string }) {
  return (
    <div className="p-4 rounded-xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] hover:border-[var(--lg-accent)]/30 transition-colors group">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${accent || 'bg-[var(--lg-accent)]/10 text-[var(--lg-accent)]'}`}>
        <Icon size={18} />
      </div>
      <h3 className="font-semibold text-sm text-[var(--lg-text-heading)] mb-1">{title}</h3>
      <p className="text-xs text-[var(--lg-text-muted)] leading-relaxed">{desc}</p>
    </div>
  );
}

function StatBlock({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="text-2xl md:text-3xl font-bold text-[var(--lg-accent)] tabular-nums">{value}</div>
      <div className="text-[10px] font-semibold uppercase text-[var(--lg-text-muted)] tracking-wide mt-0.5">{label}</div>
    </div>
  );
}

export default function About() {
  return (
    <div className="px-4 py-6 md:px-6 md:py-10 max-w-4xl mx-auto space-y-10">
      {/* Hero */}
      <div className="text-center space-y-4">
        <div className="flex justify-center">
          <Logo size={48} />
        </div>
        <h1 className="text-3xl md:text-4xl font-bold text-[var(--lg-text-heading)] tracking-tight">
          The Fantastic Leagues
        </h1>
        <p className="text-sm md:text-base text-[var(--lg-text-secondary)] max-w-xl mx-auto leading-relaxed">
          A modern fantasy baseball platform built for competitive leagues that take their auction drafts seriously.
          Real-time bidding, live MLB data, and tools that make managing your team a pleasure.
        </p>
        <div className="flex justify-center gap-3 pt-2">
          <Link
            to="/guide"
            className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold rounded-xl bg-[var(--lg-accent)] text-white hover:opacity-90 transition-opacity"
          >
            League Guide <ArrowRight size={14} />
          </Link>
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold rounded-xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] text-[var(--lg-text-primary)] hover:bg-[var(--lg-tint-hover)] transition-colors"
          >
            Sign In
          </Link>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex justify-center gap-8 md:gap-16 py-6 border-y border-[var(--lg-border-subtle)]">
        <StatBlock value="17" label="Feature Modules" />
        <StatBlock value="670+" label="Tests Passing" />
        <StatBlock value="116" label="API Endpoints" />
        <StatBlock value="30" label="MLB Teams" />
      </div>

      {/* Core Features */}
      <div>
        <h2 className="text-lg font-semibold text-[var(--lg-text-heading)] mb-4">Core Features</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <FeatureCard
            icon={Gavel}
            title="Live Auction Draft"
            desc="Real-time WebSocket-powered auction with bid timers, proxy bidding, and auto-nomination queues. Supports 4-16 teams simultaneously."
            accent="bg-blue-500/10 text-blue-400"
          />
          <FeatureCard
            icon={BarChart3}
            title="Live Standings"
            desc="Roto standings computed from real MLB stats across configurable scoring periods. 10 categories: R, HR, RBI, SB, AVG, W, SV, K, ERA, WHIP."
            accent="bg-emerald-500/10 text-emerald-400"
          />
          <FeatureCard
            icon={Users}
            title="Trade Center"
            desc="Propose trades involving players and budget. Both parties accept, commissioner processes. Full transaction history with audit trail."
            accent="bg-purple-500/10 text-purple-400"
          />
          <FeatureCard
            icon={Shield}
            title="Keeper System"
            desc="End-of-season keeper selection with cost escalation. Commissioner locks keepers, non-keepers release for next year's auction."
            accent="bg-amber-500/10 text-amber-400"
          />
          <FeatureCard
            icon={Activity}
            title="Waiver Claims (FAAB)"
            desc="Blind-bid waiver system using Free Agent Acquisition Budget. Remaining auction budget carries over as FAAB for in-season pickups."
            accent="bg-red-500/10 text-red-400"
          />
          <FeatureCard
            icon={Clock}
            title="Season Management"
            desc="Full lifecycle: SETUP → DRAFT → IN_SEASON → COMPLETED. Commissioner controls phase transitions with gated features per phase."
            accent="bg-cyan-500/10 text-cyan-400"
          />
        </div>
      </div>

      {/* Auction Features */}
      <div>
        <h2 className="text-lg font-semibold text-[var(--lg-text-heading)] mb-4">Auction Draft Tools</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[
            { icon: Target, title: "Proxy Bidding", desc: "eBay-style auto-bid up to your max" },
            { icon: Star, title: "Watchlist", desc: "Star players for quick filtering" },
            { icon: MessageCircle, title: "Live Chat", desc: "Trash talk during the draft" },
            { icon: Volume2, title: "Sound Alerts", desc: "Outbid, your turn, win notifications" },
            { icon: TrendingUp, title: "Value Overlay", desc: "Surplus/deficit vs. projected value" },
            { icon: BarChart3, title: "Spending Pace", desc: "Budget bars and hot/cold indicators" },
            { icon: Zap, title: "Custom Opening Bid", desc: "Nominator sets the starting price" },
            { icon: Layers, title: "Nomination Queue", desc: "Pre-load your picks, auto-nominate" },
            { icon: Globe, title: "Real-time Sync", desc: "WebSocket + polling fallback" },
          ].map(f => (
            <div key={f.title} className="flex gap-2 p-2.5 rounded-lg bg-[var(--lg-tint)] border border-[var(--lg-border-subtle)]">
              <f.icon size={14} className="text-[var(--lg-accent)] shrink-0 mt-0.5" />
              <div>
                <div className="text-[11px] font-semibold text-[var(--lg-text-primary)]">{f.title}</div>
                <div className="text-[10px] text-[var(--lg-text-muted)] leading-snug">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tech Stack */}
      <div>
        <h2 className="text-lg font-semibold text-[var(--lg-text-heading)] mb-4">Built With</h2>
        <div className="flex flex-wrap gap-2">
          {[
            "React 18", "TypeScript", "Node.js", "Express", "PostgreSQL", "Prisma ORM",
            "Supabase Auth", "WebSocket", "Tailwind CSS", "Vite", "Vitest",
            "MLB Stats API", "Web Audio API"
          ].map(t => (
            <span key={t} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[var(--lg-tint)] border border-[var(--lg-border-subtle)] text-[var(--lg-text-secondary)]">
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* Commissioner Tools */}
      <div>
        <h2 className="text-lg font-semibold text-[var(--lg-text-heading)] mb-4">Commissioner Tools</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { title: "League Rules Editor", desc: "Configure all league settings: roster size, budget, scoring categories, position limits, keeper rules, timers." },
            { title: "Roster Management", desc: "Assign, release, and import players. Manage keeper selections and locks." },
            { title: "Season Lifecycle", desc: "Create seasons, transition phases, manage scoring periods." },
            { title: "Trade & Waiver Processing", desc: "Approve trades, process waiver claims, force-assign players." },
            { title: "Auction Controls", desc: "Pause/resume, undo last pick, reset, force assign, configurable timers." },
            { title: "Member Management", desc: "Invite via code, assign teams, manage roles (owner, commissioner)." },
          ].map(t => (
            <div key={t.title} className="p-3 rounded-lg border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)]">
              <div className="text-xs font-semibold text-[var(--lg-text-primary)] mb-0.5">{t.title}</div>
              <div className="text-[11px] text-[var(--lg-text-muted)] leading-relaxed">{t.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Origin */}
      <div className="text-center py-6 border-t border-[var(--lg-border-subtle)]">
        <p className="text-sm text-[var(--lg-text-secondary)] max-w-lg mx-auto leading-relaxed">
          Born from a real fantasy baseball league running since 2004.
          Built with AI-assisted development across 30+ sessions.
        </p>
        <div className="flex justify-center gap-4 mt-4">
          <Link to="/tech" className="text-xs font-semibold text-[var(--lg-accent)] hover:opacity-80 transition-opacity">
            Under the Hood →
          </Link>
          <Link to="/roadmap" className="text-xs font-semibold text-[var(--lg-accent)] hover:opacity-80 transition-opacity">
            Roadmap →
          </Link>
          <Link to="/changelog" className="text-xs font-semibold text-[var(--lg-accent)] hover:opacity-80 transition-opacity">
            Changelog →
          </Link>
        </div>
      </div>
    </div>
  );
}
