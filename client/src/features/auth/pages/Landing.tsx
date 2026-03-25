import React from "react";
import { Link } from "react-router-dom";
import { Logo } from "../../../components/ui/Logo";
import { useTheme } from "../../../contexts/ThemeContext";
import {
  Gavel, BarChart3, Brain, Shield, Archive, Smartphone,
  Trophy, ArrowLeftRight, ChevronRight, Sparkles, Check,
} from "lucide-react";

/* ── Data ─────────────────────────────────────────────────────── */

const scoringFormats = [
  { name: "Rotisserie", desc: "Season-long cumulative stats across 10 categories. The classic format.", available: true, icon: BarChart3 },
  { name: "H2H Categories", desc: "Weekly matchups — win more stat categories than your opponent each week.", available: false, icon: ArrowLeftRight },
  { name: "H2H Points", desc: "Weekly matchups — highest total points wins. Simple and exciting.", available: false, icon: Trophy },
];

const features = [
  { icon: Gavel, title: "Auction Engine", desc: "Real-time bidding with spending pace, value overlays, and AI bid advice. The most feature-rich auction draft on any platform." },
  { icon: Brain, title: "AI Insights", desc: "8 AI features powered by Google Gemini & Anthropic Claude. Draft grades, trade analysis, weekly insights — all context-aware to YOUR league." },
  { icon: Shield, title: "Commissioner Tools", desc: "Franchise management, season lifecycle, roster import, financial tracking, audit logs. Everything a commissioner needs." },
  { icon: Archive, title: "League History", desc: "Import 20 years of history from Excel. All-time records, past drafts, historical standings. Your league's story, preserved." },
  { icon: Smartphone, title: "Mobile-Ready", desc: "Bottom tab nav, responsive tables, touch-optimized controls. Manage your team from anywhere." },
  { icon: Sparkles, title: "League Digest", desc: "AI-generated weekly recap with team grades, hot/cold teams, and Trade of the Week poll. The league newsletter writes itself." },
];

const pricingTiers = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    desc: "Everything you need to run a league",
    features: ["Auction draft", "Rotisserie scoring", "10 teams", "Basic stats", "Commissioner tools"],
    cta: "Create Your League",
    ctaTo: "/signup",
    highlight: false,
  },
  {
    name: "Pro",
    price: "$9.99",
    period: "/mo",
    desc: "AI-powered league management",
    features: ["All Free features", "AI Insights (8 features)", "All draft formats", "H2H matchups", "Advanced analytics", "Priority support"],
    cta: "Coming Soon",
    ctaTo: "/signup",
    highlight: true,
    badge: "Most Popular",
  },
  {
    name: "Elite",
    price: "$29.99",
    period: "/mo",
    desc: "For serious commissioners",
    features: ["All Pro features", "Custom AI models", "White-label branding", "Multi-league management", "API access", "Dedicated support"],
    cta: "Coming Soon",
    ctaTo: "/signup",
    highlight: false,
  },
];

/* ── Component ────────────────────────────────────────────────── */

export default function Landing() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen bg-[var(--lg-bg-page)] text-[var(--lg-text-primary)]">

      {/* ── Public Header ── */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-[var(--lg-bg-page)]/80 border-b border-[var(--lg-border-faint)]">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3 md:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <Logo size={28} />
            <span className="text-sm font-bold tracking-tight text-[var(--lg-text-heading)]">TFL</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-[var(--lg-text-muted)]">
            <a href="#formats" className="hover:text-[var(--lg-text-primary)] transition-colors">Formats</a>
            <a href="#features" className="hover:text-[var(--lg-text-primary)] transition-colors">Features</a>
            <a href="#pricing" className="hover:text-[var(--lg-text-primary)] transition-colors">Pricing</a>
            <Link to="/changelog" className="hover:text-[var(--lg-text-primary)] transition-colors">Changelog</Link>
            <Link to="/roadmap" className="hover:text-[var(--lg-text-primary)] transition-colors">Roadmap</Link>
          </nav>
          <div className="flex items-center gap-3">
            <button onClick={toggleTheme} className="p-2 text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)]">{theme === "dark" ? "☀️" : "🌙"}</button>
            <Link to="/login" className="text-xs font-semibold text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)]">Sign In</Link>
            <Link to="/signup" className="px-4 py-2 rounded-xl bg-[var(--lg-accent)] text-white text-xs font-bold shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-95 transition-all">
              Start Free
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="max-w-4xl mx-auto px-4 pt-20 pb-16 md:pt-32 md:pb-24 text-center">
        <div className="animate-in fade-in zoom-in-95 duration-1000">
          <div className="mx-auto mb-8">
            <Logo size={72} />
          </div>
          <h1 className="text-4xl md:text-7xl font-bold tracking-tight text-[var(--lg-text-heading)] mb-6 leading-[1.05]">
            Fantasy Baseball,<br />
            <span className="text-[var(--lg-accent)]">Powered by AI</span>
          </h1>
          <p className="text-base md:text-lg font-medium text-[var(--lg-text-secondary)] mb-10 leading-relaxed max-w-xl mx-auto opacity-80">
            The only fantasy platform with league-context AI. Draft grades, trade analysis, weekly insights — all tailored to your league.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/signup" className="px-8 py-3.5 rounded-2xl bg-[var(--lg-accent)] text-white text-sm font-bold shadow-2xl shadow-blue-500/30 hover:scale-[1.02] active:scale-95 transition-all w-full sm:w-auto">
              Create Your League
            </Link>
            <a href="#features" className="flex items-center gap-1.5 px-6 py-3.5 rounded-2xl text-sm font-semibold text-[var(--lg-text-secondary)] hover:text-[var(--lg-text-primary)] transition-colors">
              See Features <ChevronRight size={14} />
            </a>
          </div>
          <p className="mt-4 text-[10px] text-[var(--lg-text-muted)] opacity-60">No credit card required</p>
        </div>
      </section>

      {/* ── Format Showcase ── */}
      <section id="formats" className="max-w-5xl mx-auto px-4 pb-20">
        <div className="text-center mb-10">
          <h2 className="text-2xl md:text-3xl font-bold text-[var(--lg-text-heading)] mb-2">Choose Your Format</h2>
          <p className="text-sm text-[var(--lg-text-muted)]">Play the way your league likes. More formats coming soon.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {scoringFormats.map(fmt => (
            <div key={fmt.name} className={`relative rounded-2xl border p-6 transition-all ${
              fmt.available
                ? "border-[var(--lg-accent)]/30 bg-[var(--lg-accent)]/5"
                : "border-[var(--lg-border-faint)] bg-[var(--lg-tint)] opacity-60"
            }`}>
              {fmt.available && (
                <span className="absolute top-3 right-3 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">Available</span>
              )}
              {!fmt.available && (
                <span className="absolute top-3 right-3 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-amber-500/10 text-amber-500 border border-amber-500/20">Planned</span>
              )}
              <fmt.icon size={24} className="text-[var(--lg-accent)] mb-3" />
              <h3 className="text-base font-semibold text-[var(--lg-text-primary)] mb-1">{fmt.name}</h3>
              <p className="text-xs text-[var(--lg-text-muted)] leading-relaxed">{fmt.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features Grid ── */}
      <section id="features" className="max-w-5xl mx-auto px-4 pb-20">
        <div className="text-center mb-10">
          <h2 className="text-2xl md:text-3xl font-bold text-[var(--lg-text-heading)] mb-2">Built for Serious Leagues</h2>
          <p className="text-sm text-[var(--lg-text-muted)]">Everything you need to run a world-class fantasy baseball league.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map(f => (
            <div key={f.title} className="rounded-2xl border border-[var(--lg-border-faint)] bg-[var(--lg-tint)] p-5 hover:border-[var(--lg-accent)]/20 transition-colors">
              <f.icon size={20} className="text-[var(--lg-accent)] mb-3" />
              <h3 className="text-sm font-semibold text-[var(--lg-text-primary)] mb-1">{f.title}</h3>
              <p className="text-xs text-[var(--lg-text-muted)] leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── AI Differentiator ── */}
      <section className="max-w-4xl mx-auto px-4 pb-20">
        <div className="rounded-2xl border border-[var(--lg-accent)]/20 bg-[var(--lg-accent)]/5 p-8 md:p-12 text-center">
          <Brain size={32} className="text-[var(--lg-accent)] mx-auto mb-4" />
          <h2 className="text-xl md:text-2xl font-bold text-[var(--lg-text-heading)] mb-3">The Only Platform with League-Context AI</h2>
          <p className="text-sm text-[var(--lg-text-secondary)] max-w-xl mx-auto leading-relaxed mb-6">
            Other tools give generic advice. Our AI knows your league's scoring, your roster, your opponents' tendencies, and your auction history. It gets smarter every season.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-lg mx-auto">
            {["Draft Grades", "Trade Analysis", "Weekly Insights", "Bid Advice"].map(f => (
              <div key={f} className="px-3 py-2 rounded-xl bg-[var(--lg-bg-card)] border border-[var(--lg-border-faint)] text-[10px] font-semibold text-[var(--lg-text-muted)]">{f}</div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="max-w-5xl mx-auto px-4 pb-20">
        <div className="text-center mb-10">
          <h2 className="text-2xl md:text-3xl font-bold text-[var(--lg-text-heading)] mb-2">Simple Pricing</h2>
          <p className="text-sm text-[var(--lg-text-muted)]">Start free. Upgrade when you're ready.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {pricingTiers.map(tier => (
            <div key={tier.name} className={`relative rounded-2xl border p-6 flex flex-col ${
              tier.highlight
                ? "border-[var(--lg-accent)] bg-[var(--lg-accent)]/5 shadow-lg shadow-blue-500/10"
                : "border-[var(--lg-border-faint)] bg-[var(--lg-tint)]"
            }`}>
              {tier.badge && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] font-bold uppercase bg-[var(--lg-accent)] text-white">
                  {tier.badge}
                </span>
              )}
              <div className="mb-4">
                <h3 className="text-lg font-bold text-[var(--lg-text-heading)]">{tier.name}</h3>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-3xl font-bold text-[var(--lg-text-primary)]">{tier.price}</span>
                  <span className="text-sm text-[var(--lg-text-muted)]">{tier.period}</span>
                </div>
                <p className="text-xs text-[var(--lg-text-muted)] mt-1">{tier.desc}</p>
              </div>
              <ul className="space-y-2 mb-6 flex-1">
                {tier.features.map(f => (
                  <li key={f} className="flex items-center gap-2 text-xs text-[var(--lg-text-secondary)]">
                    <Check size={12} className="text-emerald-500 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                to={tier.ctaTo}
                className={`block text-center py-2.5 rounded-xl text-xs font-bold transition-all ${
                  tier.highlight
                    ? "bg-[var(--lg-accent)] text-white shadow-lg shadow-blue-500/20 hover:scale-[1.02]"
                    : tier.cta === "Coming Soon"
                      ? "bg-[var(--lg-tint)] text-[var(--lg-text-muted)] border border-[var(--lg-border-faint)] cursor-default"
                      : "bg-[var(--lg-bg-card)] text-[var(--lg-text-primary)] border border-[var(--lg-border-faint)] hover:border-[var(--lg-accent)]/30"
                }`}
              >
                {tier.cta}
              </Link>
            </div>
          ))}
        </div>
        <p className="text-center text-[10px] text-[var(--lg-text-muted)] opacity-60 mt-4">
          Early users get founding member pricing when Pro launches.
        </p>
      </section>

      {/* ── Final CTA ── */}
      <section className="max-w-3xl mx-auto px-4 pb-20 text-center">
        <h2 className="text-2xl md:text-3xl font-bold text-[var(--lg-text-heading)] mb-4">Ready to Dominate Your League?</h2>
        <p className="text-sm text-[var(--lg-text-muted)] mb-8">Create your league in under 60 seconds. No credit card required.</p>
        <Link to="/signup" className="inline-block px-10 py-4 rounded-2xl bg-[var(--lg-accent)] text-white text-sm font-bold shadow-2xl shadow-blue-500/30 hover:scale-[1.02] active:scale-95 transition-all">
          Create Your League
        </Link>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-[var(--lg-border-faint)] py-8">
        <div className="max-w-5xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Logo size={20} />
            <span className="text-xs font-bold text-[var(--lg-text-muted)]">The Fantastic Leagues</span>
          </div>
          <nav className="flex items-center gap-4 text-[10px] font-medium text-[var(--lg-text-muted)]">
            <Link to="/changelog" className="hover:text-[var(--lg-text-primary)]">Changelog</Link>
            <Link to="/roadmap" className="hover:text-[var(--lg-text-primary)]">Roadmap</Link>
            <Link to="/status" className="hover:text-[var(--lg-text-primary)]">Status</Link>
            <Link to="/about" className="hover:text-[var(--lg-text-primary)]">About</Link>
            <Link to="/guide" className="hover:text-[var(--lg-text-primary)]">Guide</Link>
          </nav>
          <div className="text-[10px] text-[var(--lg-text-muted)] opacity-50">
            &copy; {new Date().getFullYear()} The Fantastic Leagues
          </div>
        </div>
      </footer>
    </div>
  );
}
