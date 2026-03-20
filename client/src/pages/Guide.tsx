import React from 'react';
import { Link } from 'react-router-dom';
import { UserPlus, Gavel, HelpCircle, ArrowRight } from 'lucide-react';

function GuideCard({ to, icon: Icon, title, desc, accent }: { to: string; icon: React.ElementType; title: string; desc: string; accent: string }) {
  return (
    <Link to={to} className="block p-6 rounded-xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] hover:border-[var(--lg-accent)]/30 hover:shadow-lg transition-all group">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-4 ${accent}`}>
        <Icon size={20} />
      </div>
      <h3 className="font-semibold text-[var(--lg-text-heading)] mb-1">{title}</h3>
      <p className="text-sm text-[var(--lg-text-muted)] leading-relaxed mb-3">{desc}</p>
      <span className="text-xs font-semibold text-[var(--lg-accent)] flex items-center gap-1 group-hover:gap-2 transition-all">
        Read guide <ArrowRight size={12} />
      </span>
    </Link>
  );
}

export default function Guide() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-6 md:px-6 md:py-10">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-semibold text-[var(--lg-text-heading)]">How to Use TFL</h1>
        <p className="text-sm text-[var(--lg-text-muted)] mt-1">Guides for getting started, running the auction draft, and more</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <GuideCard
          to="/guide/account"
          icon={UserPlus}
          title="Getting Started"
          desc="Create your account, enter your invite code, set up your profile and payment methods."
          accent="bg-emerald-500/10 text-emerald-400"
        />
        <GuideCard
          to="/guide/auction"
          icon={Gavel}
          title="Auction Draft"
          desc="How nominating, bidding, proxy bids, and all the auction tools work. Essential reading before draft day."
          accent="bg-blue-500/10 text-blue-400"
        />
        <GuideCard
          to="/guide/faq"
          icon={HelpCircle}
          title="FAQ"
          desc="Common questions about the auction, account management, trades, waivers, and payouts."
          accent="bg-amber-500/10 text-amber-400"
        />
      </div>

      <div className="mt-8 text-center">
        <p className="text-[10px] text-[var(--lg-text-muted)] opacity-40">
          <Link to="/about" className="hover:text-[var(--lg-accent)]">About TFL</Link>
          {' · '}
          <Link to="/rules" className="hover:text-[var(--lg-accent)]">League Rules</Link>
        </p>
      </div>
    </div>
  );
}
