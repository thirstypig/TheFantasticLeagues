import React from "react";
import { Link } from "react-router-dom";
import { Check, Star, Crown, Zap, Bot, BarChart3, Bell, Shield, Users, Trophy } from "lucide-react";

const tiers = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Full league management for every team",
    cta: "Get Started",
    ctaLink: "/signup",
    highlight: false,
    features: [
      { text: "Full league hosting", included: true },
      { text: "Auction & snake drafts", included: true },
      { text: "Live standings & stats", included: true },
      { text: "Trades & waiver claims", included: true },
      { text: "Daily Diamond dashboard", included: true },
      { text: "5 news sources (MLB, ESPN, Yahoo, Reddit, Trade Rumors)", included: true },
      { text: "Real-time MLB scores", included: true },
      { text: "Weekly league digest", included: true },
      { text: "Up to 2 leagues", included: true },
      { text: "AI draft report", included: false },
      { text: "Pre-trade AI advisor", included: false },
      { text: "Advanced analytics (Statcast)", included: false },
      { text: "Period awards & badges", included: false },
    ],
  },
  {
    name: "Pro",
    price: "$29",
    period: "per season",
    description: "AI-powered competitive advantage for serious managers",
    cta: "Coming 2027",
    ctaLink: null,
    highlight: true,
    features: [
      { text: "Everything in Free", included: true },
      { text: "AI draft report with surplus analysis", included: true },
      { text: "Pre-trade AI advisor ('Should I do this trade?')", included: true },
      { text: "AI waiver bid advisor with confidence levels", included: true },
      { text: "Weekly AI team insights with letter grades", included: true },
      { text: "Statcast analytics (exit velo, barrel rate, xBA)", included: true },
      { text: "Period awards & achievement badges", included: true },
      { text: "Priority push notifications", included: true },
      { text: "Unlimited leagues", included: true },
      { text: "League health dashboard", included: false },
      { text: "Custom scoring formats", included: false },
    ],
  },
  {
    name: "Commissioner",
    price: "$49",
    period: "per league / season",
    description: "Full control for league commissioners",
    cta: "Coming 2027",
    ctaLink: null,
    highlight: false,
    features: [
      { text: "Everything in Pro", included: true },
      { text: "League health dashboard (engagement metrics)", included: true },
      { text: "Commissioner announcement emails", included: true },
      { text: "Custom scoring (H2H, Points, Roto)", included: true },
      { text: "Historical archive import (Excel/CSV)", included: true },
      { text: "Trophy case & dynasty analytics", included: true },
      { text: "Smart deadline warnings", included: true },
      { text: "Calendar export (iCal/Google)", included: true },
      { text: "Priority support", included: true },
    ],
  },
];

const faqs = [
  {
    q: "When does the paid plan launch?",
    a: "The 2026 baseball season is 100% free. Paid plans launch for the 2027 season. Early adopters who create leagues in 2026 will get founding member pricing.",
  },
  {
    q: "What's 'per season' pricing?",
    a: "You pay once for the entire baseball season (March–October). No monthly billing, no surprise charges. Dynasty/keeper leagues get year-round access.",
  },
  {
    q: "Will there be a lifetime deal?",
    a: "Yes — the first 100 users can lock in lifetime access for $99 (a one-time payment). This covers all future seasons and all sports we add.",
  },
  {
    q: "What about football and basketball?",
    a: "Fantasy football launches August 2027, basketball in October 2027. Each sport is priced per season independently. Multi-sport bundles are planned.",
  },
  {
    q: "Can I try Pro features before paying?",
    a: "The entire 2026 season includes all features for free — including AI analysis, Statcast data, and commissioner tools. This IS your free trial.",
  },
  {
    q: "What payment methods do you accept?",
    a: "Stripe (credit/debit cards, Apple Pay, Google Pay). Multi-currency support for international users.",
  },
];

export default function Pricing() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8 md:px-6 md:py-12">
      {/* Coming Soon Banner */}
      <div className="mb-8 rounded-xl border border-amber-500/30 bg-amber-500/5 px-6 py-4 text-center">
        <div className="flex items-center justify-center gap-2 mb-1">
          <Zap className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-bold uppercase tracking-wider text-amber-400">Coming Soon</span>
          <Zap className="w-4 h-4 text-amber-400" />
        </div>
        <p className="text-sm text-[var(--lg-text-secondary)]">
          We're in early access. The 2026 season is <strong className="text-[var(--lg-accent)]">completely free</strong> for all features while we build out the platform. Paid tiers launch in 2027.
        </p>
      </div>

      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-3xl md:text-4xl font-bold text-[var(--lg-text-heading)] mb-3">
          Simple, Seasonal Pricing
        </h1>
        <p className="text-[var(--lg-text-secondary)] text-lg max-w-2xl mx-auto">
          Pay per season, not per month. The 2026 baseball season is <strong className="text-[var(--lg-accent)]">100% free</strong> for everyone.
        </p>
      </div>

      {/* Pricing Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
        {tiers.map((tier) => (
          <div
            key={tier.name}
            className={`rounded-2xl border p-6 flex flex-col ${
              tier.highlight
                ? "border-[var(--lg-accent)] bg-[var(--lg-accent)]/5 ring-2 ring-[var(--lg-accent)]/20 relative"
                : "border-[var(--lg-border-subtle)] bg-[var(--lg-tint)]"
            }`}
          >
            {tier.highlight && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-[var(--lg-accent)] text-white text-[10px] font-bold uppercase tracking-wider rounded-full">
                Most Popular
              </div>
            )}

            <div className="mb-6">
              <h3 className="text-lg font-bold text-[var(--lg-text-heading)]">{tier.name}</h3>
              <div className="flex items-baseline gap-1 mt-2">
                <span className="text-3xl font-bold text-[var(--lg-text-primary)]">{tier.price}</span>
                <span className="text-sm text-[var(--lg-text-muted)]">/{tier.period}</span>
              </div>
              <p className="text-xs text-[var(--lg-text-secondary)] mt-2">{tier.description}</p>
            </div>

            {tier.ctaLink ? (
              <Link
                to={tier.ctaLink}
                className={`w-full text-center py-2.5 px-4 rounded-xl font-semibold text-sm transition-all ${
                  tier.highlight
                    ? "bg-[var(--lg-accent)] text-white hover:opacity-90"
                    : "bg-[var(--lg-tint-hover)] text-[var(--lg-text-primary)] hover:bg-[var(--lg-accent)] hover:text-white"
                }`}
              >
                {tier.cta}
              </Link>
            ) : (
              <div className="w-full text-center py-2.5 px-4 rounded-xl font-semibold text-sm bg-[var(--lg-tint)] text-[var(--lg-text-muted)] border border-[var(--lg-border-subtle)]">
                {tier.cta}
              </div>
            )}

            <div className="mt-6 pt-6 border-t border-[var(--lg-border-faint)] flex-1">
              <ul className="space-y-3">
                {tier.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs">
                    {f.included ? (
                      <Check size={14} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                    ) : (
                      <span className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 rounded-full border border-[var(--lg-border-subtle)]" />
                    )}
                    <span className={f.included ? "text-[var(--lg-text-primary)]" : "text-[var(--lg-text-muted)] opacity-50"}>
                      {f.text}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>

      {/* Founding Member CTA */}
      <div className="lg-card p-8 text-center mb-16 bg-gradient-to-r from-[var(--lg-accent)]/5 to-purple-500/5 border-[var(--lg-accent)]/20">
        <Trophy size={32} className="text-amber-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-[var(--lg-text-heading)] mb-2">Founding Member Lifetime Deal</h2>
        <p className="text-sm text-[var(--lg-text-secondary)] max-w-lg mx-auto mb-4">
          First 100 users: <strong className="text-[var(--lg-accent)]">$99 one-time payment</strong> for lifetime access to all tiers, all sports, all future features. Forever.
        </p>
        <p className="text-[10px] text-[var(--lg-text-muted)] uppercase tracking-wide">
          Available when paid plans launch in 2027
        </p>
      </div>

      {/* FAQ */}
      <div className="max-w-2xl mx-auto">
        <h2 className="text-xl font-bold text-[var(--lg-text-heading)] mb-6 text-center">Frequently Asked Questions</h2>
        <div className="space-y-4">
          {faqs.map((faq, i) => (
            <div key={i} className="lg-card p-4">
              <h3 className="text-sm font-semibold text-[var(--lg-text-primary)] mb-2">{faq.q}</h3>
              <p className="text-xs text-[var(--lg-text-secondary)] leading-relaxed">{faq.a}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer link */}
      <div className="text-center mt-12 text-xs text-[var(--lg-text-muted)]">
        <Link to="/roadmap" className="text-[var(--lg-accent)] hover:underline">View full roadmap</Link>
        {" · "}
        <Link to="/tech" className="text-[var(--lg-accent)] hover:underline">Under the Hood</Link>
        {" · "}
        <Link to="/changelog" className="text-[var(--lg-accent)] hover:underline">Changelog</Link>
      </div>
    </div>
  );
}
