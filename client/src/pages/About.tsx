import React from 'react';
import { Link } from 'react-router-dom';
import {
  Gavel, Users, BarChart3, TrendingUp, Shield,
  Star, MessageCircle, Volume2, Target, Clock,
  Layers, Activity, ArrowRight
} from 'lucide-react';
import { Logo } from '../components/ui/Logo';

function FeatureCard({ icon: Icon, title, desc, accent }: { icon: React.ElementType; title: string; desc: string; accent?: string }) {
  return (
    <div className="p-4 rounded-xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] hover:border-[var(--lg-accent)]/30 transition-colors">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${accent || 'bg-[var(--lg-accent)]/10 text-[var(--lg-accent)]'}`}>
        <Icon size={18} />
      </div>
      <h3 className="font-semibold text-sm text-[var(--lg-text-heading)] mb-1">{title}</h3>
      <p className="text-xs text-[var(--lg-text-muted)] leading-relaxed">{desc}</p>
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
          A fantasy baseball platform built for competitive leagues that take their auction drafts seriously.
          Real-time bidding, live MLB data, and tools that make managing your team easy.
        </p>
        <div className="flex justify-center gap-3 pt-2">
          <Link
            to="/guide"
            className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold rounded-xl bg-[var(--lg-accent)] text-[var(--lg-on-accent)] hover:opacity-90 transition-opacity"
          >
            How It Works <ArrowRight size={14} />
          </Link>
          <Link
            to="/rules"
            className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold rounded-xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] text-[var(--lg-text-primary)] hover:bg-[var(--lg-tint-hover)] transition-colors"
          >
            League Rules
          </Link>
        </div>
      </div>

      {/* What You Can Do */}
      <div>
        <h2 className="text-lg font-semibold text-[var(--lg-text-heading)] mb-4">What You Can Do</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <FeatureCard
            icon={Gavel}
            title="Live Auction Draft"
            desc="Bid on players in real time with your league. Set proxy bids, build a nomination queue, and compete for the best roster."
            accent="bg-blue-500/10 text-blue-400"
          />
          <FeatureCard
            icon={BarChart3}
            title="Track Standings"
            desc="See how your team stacks up across all scoring categories. Standings update automatically from live MLB stats."
            accent="bg-emerald-500/10 text-emerald-400"
          />
          <FeatureCard
            icon={Users}
            title="Make Trades"
            desc="Propose trades with other owners — swap players, budget, or both. Track every move in the transaction history."
            accent="bg-purple-500/10 text-purple-400"
          />
          <FeatureCard
            icon={Shield}
            title="Keep Your Stars"
            desc="Select your best players as keepers at the end of each season. They carry over to next year's draft at a premium."
            accent="bg-amber-500/10 text-amber-400"
          />
          <FeatureCard
            icon={Activity}
            title="Claim Free Agents"
            desc="Use your remaining budget to pick up free agents through blind-bid waivers. Highest bid wins."
            accent="bg-red-500/10 text-red-400"
          />
          <FeatureCard
            icon={Clock}
            title="Stay in the Loop"
            desc="Live MLB scores, daily transactions, and real-time updates keep you connected throughout the season."
            accent="bg-cyan-500/10 text-cyan-400"
          />
        </div>
      </div>

      {/* Auction Draft Tools */}
      <div>
        <h2 className="text-lg font-semibold text-[var(--lg-text-heading)] mb-4">Auction Draft Tools</h2>
        <p className="text-sm text-[var(--lg-text-secondary)] mb-4">Everything you need for a smooth, competitive draft experience.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[
            { icon: Target, title: "Proxy Bidding", desc: "Set a max bid — the system bids for you" },
            { icon: Star, title: "Watchlist", desc: "Star your targets for quick access" },
            { icon: MessageCircle, title: "Live Chat", desc: "Talk with other owners during the draft" },
            { icon: Volume2, title: "Sound Alerts", desc: "Know when you're outbid or it's your turn" },
            { icon: TrendingUp, title: "Value Tracker", desc: "See if a player is a bargain or overpay" },
            { icon: BarChart3, title: "Budget Pace", desc: "Track spending across all teams" },
            { icon: Layers, title: "Auto-Nominate", desc: "Queue up players to nominate automatically" },
            { icon: Gavel, title: "Custom Bids", desc: "Start nominations at any price, not just $1" },
            { icon: Clock, title: "Going Once...", desc: "Visual countdown as the timer runs out" },
          ].map(f => (
            <div key={f.title} className="flex gap-2 p-2.5 rounded-lg bg-[var(--lg-tint)] border border-[var(--lg-border-subtle)]">
              <f.icon size={14} className="text-[var(--lg-accent)] shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-semibold text-[var(--lg-text-primary)]">{f.title}</div>
                <div className="text-xs text-[var(--lg-text-muted)] leading-snug">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* For Commissioners */}
      <div>
        <h2 className="text-lg font-semibold text-[var(--lg-text-heading)] mb-4">For Commissioners</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { title: "Set the Rules", desc: "Configure budget, roster size, scoring categories, keeper limits, and everything else your league needs." },
            { title: "Manage Rosters", desc: "Assign and release players, import rosters, handle keeper locks and releases." },
            { title: "Run the Season", desc: "Create seasons, set up scoring periods, and transition between phases." },
            { title: "Process Moves", desc: "Approve trades, process waiver claims, pause/resume the auction, and undo mistakes." },
            { title: "Invite Members", desc: "Send invite codes to owners. Assign teams and roles with a few clicks." },
            { title: "Control the Draft", desc: "Pause, resume, reset, force-assign players, and configure timers during the live auction." },
          ].map(t => (
            <div key={t.title} className="p-3 rounded-lg border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)]">
              <div className="text-xs font-semibold text-[var(--lg-text-primary)] mb-0.5">{t.title}</div>
              <div className="text-xs text-[var(--lg-text-muted)] leading-relaxed">{t.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="text-center py-6 border-t border-[var(--lg-border-subtle)]">
        <p className="text-sm text-[var(--lg-text-secondary)] max-w-lg mx-auto leading-relaxed">
          Born from a real fantasy baseball league running since 2004.
        </p>
        <div className="flex justify-center gap-4 mt-4">
          <Link to="/guide" className="text-xs font-semibold text-[var(--lg-accent)] hover:opacity-80 transition-opacity">
            How It Works →
          </Link>
          <Link to="/rules" className="text-xs font-semibold text-[var(--lg-accent)] hover:opacity-80 transition-opacity">
            League Rules →
          </Link>
        </div>
      </div>
    </div>
  );
}
