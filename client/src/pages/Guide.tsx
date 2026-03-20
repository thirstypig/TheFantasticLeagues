import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchJsonApi } from '../api/base';
import { useLeague } from '../contexts/LeagueContext';
import type { LeagueRule } from '../api/types';
import { ChevronDown, Printer, Gavel, Star, MessageCircle, Volume2, TrendingUp, BarChart3, Target, Clock, Shield, UserPlus, HelpCircle } from 'lucide-react';

// ─── Helpers ────────────────────────────────────────────────────────
function ruleValue(rules: LeagueRule[], key: string): string {
  return rules.find((r) => r.key === key)?.value ?? '';
}

function Section({ title, icon: Icon, defaultOpen, children }: { title: string; icon: React.ElementType; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className="border border-[var(--lg-border-subtle)] rounded-xl overflow-hidden print:border-none">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-5 py-3.5 bg-[var(--lg-tint)] hover:bg-[var(--lg-tint-hover)] transition-colors text-left print:bg-transparent print:px-0 print:py-2"
      >
        <Icon size={18} className="text-[var(--lg-accent)] shrink-0 print:hidden" />
        <span className="font-semibold text-[var(--lg-text-heading)] flex-1 text-sm">{title}</span>
        <ChevronDown size={14} className={`text-[var(--lg-text-muted)] transition-transform print:hidden ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-5 py-4 space-y-3 text-sm text-[var(--lg-text-secondary)] leading-relaxed animate-in fade-in slide-in-from-top-1 duration-200 print:px-0">
          {children}
        </div>
      )}
    </div>
  );
}

function Step({ num, title, children }: { num: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="shrink-0 w-6 h-6 rounded-full bg-[var(--lg-accent)] text-white flex items-center justify-center text-[10px] font-bold print:bg-gray-800">{num}</div>
      <div className="flex-1">
        <div className="font-semibold text-[var(--lg-text-primary)] text-sm mb-0.5">{title}</div>
        <div className="text-[var(--lg-text-secondary)] text-sm leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 px-3 py-2 rounded-lg bg-[var(--lg-accent)]/5 border border-[var(--lg-accent)]/20 text-sm print:bg-gray-50 print:border-gray-200">
      <span className="shrink-0">Tip:</span>
      <span>{children}</span>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────
export default function Guide() {
  const [rules, setRules] = useState<LeagueRule[]>([]);
  const [loading, setLoading] = useState(true);
  const { leagueId } = useLeague();

  useEffect(() => {
    async function load() {
      if (!leagueId) return;
      try {
        const data = await fetchJsonApi<{ rules: LeagueRule[] }>(`/api/leagues/${leagueId}/rules`);
        setRules(data.rules ?? []);
      } catch {
        // Silently fail — guide still works with defaults
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [leagueId]);

  const teamCount = parseInt(ruleValue(rules, 'team_count')) || 8;
  const batterCount = parseInt(ruleValue(rules, 'batter_count')) || 14;
  const pitcherCount = parseInt(ruleValue(rules, 'pitcher_count')) || 9;
  const budget = ruleValue(rules, 'auction_budget') || '400';
  const rosterSize = batterCount + pitcherCount;
  const hittingStats = ruleValue(rules, 'hitting_stats') || 'R, HR, RBI, SB, AVG';
  const pitchingStats = ruleValue(rules, 'pitching_stats') || 'W, SV, ERA, WHIP, K';
  const hittingCats = hittingStats.split(',').map(s => s.trim()).filter(Boolean);
  const pitchingCats = pitchingStats.split(',').map(s => s.trim()).filter(Boolean);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6 md:px-6 md:py-10">
        <div className="h-8 w-48 rounded-2xl bg-[var(--lg-tint)] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 md:px-6 md:py-10">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-[var(--lg-text-heading)]">League Guide</h1>
          <p className="text-sm text-[var(--lg-text-muted)] mt-1">Everything you need to know</p>
        </div>
        <button
          onClick={() => window.print()}
          className="print:hidden flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] text-[var(--lg-text-secondary)] hover:bg-[var(--lg-tint-hover)] transition-colors"
          title="Print or save as PDF (Ctrl+P / Cmd+P)"
        >
          <Printer size={14} />
          Print / PDF
        </button>
      </div>

      {/* Quick stats bar */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-6">
        {[
          { label: 'Teams', value: teamCount },
          { label: 'Budget', value: `$${budget}` },
          { label: 'Roster', value: rosterSize },
          { label: 'Hitters', value: batterCount },
          { label: 'Pitchers', value: pitcherCount },
          { label: 'Categories', value: hittingCats.length + pitchingCats.length },
        ].map(s => (
          <div key={s.label} className="text-center p-2 rounded-lg bg-[var(--lg-tint)] border border-[var(--lg-border-subtle)]">
            <div className="text-lg font-bold text-[var(--lg-text-heading)]">{s.value}</div>
            <div className="text-[9px] font-semibold uppercase text-[var(--lg-text-muted)]">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="space-y-2.5">
        {/* ─── GETTING STARTED ───────────────────────────────── */}
        <Section title="Getting Started — Create Your Account" icon={UserPlus} defaultOpen>
          <div className="space-y-4">
            <Step num={1} title="Get Your Invite Code">
              Your commissioner will send you a <strong>6-character invite code</strong> (e.g., <code className="px-1.5 py-0.5 rounded bg-[var(--lg-tint)] text-[var(--lg-accent)] font-mono text-xs">ABC123</code>). This links you to your league.
            </Step>
            <Step num={2} title="Create an Account">
              Go to the <strong>Sign Up</strong> page. Enter your email and password, or sign in with <strong>Google</strong> or <strong>Yahoo</strong>.
            </Step>
            <Step num={3} title="Enter Your Invite Code">
              After signing up, enter your invite code to join your league and get assigned to your team.
            </Step>
            <Step num={4} title="Set Up Your Profile">
              Click your avatar in the sidebar to add your display name and payment handles (Venmo, Zelle, PayPal).
            </Step>
          </div>
          <Tip>Returning owners: just log in — your commissioner will add you to the new season.</Tip>
        </Section>

        {/* ─── AUCTION DRAFT ────────────────────────────────── */}
        <Section title="Auction Draft — How It Works" icon={Gavel} defaultOpen>
          <p>The auction draft is a <strong>live, real-time event</strong> where all {teamCount} teams bid on players simultaneously.</p>

          <h4 className="font-semibold text-[var(--lg-text-heading)] mt-4 mb-2 text-sm">The Basics</h4>
          <ul className="list-disc list-inside space-y-1 ml-1 text-sm">
            <li>Each team starts with <strong>${budget}</strong> and fills <strong>{rosterSize} spots</strong> ({batterCount} hitters + {pitcherCount} pitchers)</li>
            <li>Teams take turns <strong>nominating</strong> a player — then <strong>all teams can bid</strong></li>
            <li>Highest bidder when the timer expires <strong>wins the player</strong></li>
            <li><strong>Max Bid</strong> = budget - $1 per remaining spot (ensures you can always fill your roster)</li>
          </ul>

          <h4 className="font-semibold text-[var(--lg-text-heading)] mt-4 mb-2 text-sm">Nominating</h4>
          <div className="space-y-3">
            <Step num={1} title="Wait for Your Turn">
              The rotation shows at the bottom. You'll see <span className="text-[var(--lg-accent)] font-semibold">"Your turn"</span> and hear a sound alert.
            </Step>
            <Step num={2} title="Find a Player">
              Use the <strong>Player Pool</strong> tab — filter by H/P, position, team, or search by name.
            </Step>
            <Step num={3} title="Set Your Opening Bid">
              Click <strong>Nom</strong>, enter your opening bid (default $1), press <strong>Enter</strong> or click <strong>Go</strong>.
            </Step>
          </div>
          <Tip>Pre-load your <strong>Nomination Queue</strong> — add players from the Player Pool. When it's your turn, the first available player auto-nominates.</Tip>

          <h4 className="font-semibold text-[var(--lg-text-heading)] mt-4 mb-2 text-sm">Bidding</h4>
          <div className="space-y-3">
            <Step num={1} title="Place a Bid">
              Use <strong>+$1</strong> or <strong>+$5</strong> buttons. The timer resets with each bid.
            </Step>
            <Step num={2} title="Set a Proxy Bid (Optional)">
              Click <strong>"Set Max Bid"</strong> — the system auto-bids $1 at a time up to your max, like eBay. Your max is private.
            </Step>
            <Step num={3} title="Pass">
              Click <strong>"Pass"</strong> to sit out. You can rejoin anytime.
            </Step>
          </div>

          <h4 className="font-semibold text-[var(--lg-text-heading)] mt-4 mb-2 text-sm">Auction Tools</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { icon: Star, title: "Watchlist", desc: "Star players to create a quick-filter favorites list" },
              { icon: MessageCircle, title: "Chat", desc: "Real-time chat with other owners" },
              { icon: Volume2, title: "Sounds", desc: "Audio alerts for nominations, outbids, and wins. Mute in header." },
              { icon: TrendingUp, title: "Value", desc: "Val column shows projected value and surplus during bidding" },
              { icon: BarChart3, title: "Pace", desc: "Teams tab shows budget bars and avg cost per player" },
              { icon: Target, title: "Proxy", desc: "Auto-bid up to your max — system bids $1 at a time for you" },
            ].map(f => (
              <div key={f.title} className="flex gap-2 p-2.5 rounded-lg bg-[var(--lg-tint)] border border-[var(--lg-border-subtle)]">
                <f.icon size={14} className="text-[var(--lg-accent)] shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-semibold text-[var(--lg-text-primary)]">{f.title}</div>
                  <div className="text-[11px] text-[var(--lg-text-muted)] leading-snug">{f.desc}</div>
                </div>
              </div>
            ))}
          </div>

          <Tip>Budget remaining after the auction becomes your <strong>FAAB</strong> (Free Agent Acquisition Budget) for in-season waiver claims.</Tip>
        </Section>

        {/* ─── SCORING ──────────────────────────────────────── */}
        <Section title="Scoring & Categories" icon={BarChart3}>
          <div className="flex flex-wrap gap-4 mb-3">
            <div>
              <div className="text-[10px] font-bold uppercase text-[var(--lg-text-muted)] mb-1">Hitting</div>
              <div className="flex flex-wrap gap-1.5">
                {hittingCats.map(c => (
                  <span key={c} className="px-2.5 py-1 bg-blue-500/10 text-blue-400 text-xs font-bold rounded-lg border border-blue-500/20">{c}</span>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase text-[var(--lg-text-muted)] mb-1">Pitching</div>
              <div className="flex flex-wrap gap-1.5">
                {pitchingCats.map(c => (
                  <span key={c} className="px-2.5 py-1 bg-emerald-500/10 text-emerald-400 text-xs font-bold rounded-lg border border-emerald-500/20">{c}</span>
                ))}
              </div>
            </div>
          </div>
          <p>Each category is ranked across all {teamCount} teams. 1st place gets {teamCount} pts, 2nd gets {teamCount - 1}, etc. Points are averaged for ties. Total points across all {hittingCats.length + pitchingCats.length} categories determine the period winner.</p>
        </Section>

        {/* ─── KEEPERS ──────────────────────────────────────── */}
        <Section title="Keeper Selection" icon={Shield}>
          <ul className="list-disc list-inside space-y-1 ml-1">
            <li>Each team keeps up to <strong>4 players</strong> from last season</li>
            <li>Keeper cost = <strong>last year's price + $5</strong></li>
            <li>Your auction budget is reduced by total keeper costs</li>
            <li>Once keepers are <strong>locked</strong>, non-keepers are released for the auction</li>
          </ul>
        </Section>

        {/* ─── DURING THE SEASON ─────────────────────────────── */}
        <Section title="During the Season" icon={Clock}>
          <h4 className="font-semibold text-[var(--lg-text-heading)] mb-1 text-sm">Trades</h4>
          <p>Propose trades via the <strong>Activity</strong> page. Trades can include players and/or budget. Both teams must accept.</p>

          <h4 className="font-semibold text-[var(--lg-text-heading)] mt-3 mb-1 text-sm">Waiver Claims (Add/Drop)</h4>
          <p>Use FAAB to claim free agents with blind bids. Highest bid wins. You must drop a player when adding one.</p>

          <h4 className="font-semibold text-[var(--lg-text-heading)] mt-3 mb-1 text-sm">Standings</h4>
          <p>Live standings on the <strong>Season</strong> page, computed from real MLB stats across scoring periods.</p>
        </Section>

        {/* ─── FAQ ───────────────────────────────────────────── */}
        <Section title="FAQ" icon={HelpCircle}>
          <div className="space-y-3">
            {[
              { q: "What if I lose my connection during the auction?", a: "The system auto-reconnects. Proxy bids keep working even if you're disconnected." },
              { q: "Can I nominate any player?", a: "Yes — even if your team can't use them. Position limits are only enforced on bids, not nominations." },
              { q: "What if I don't nominate in time?", a: "Your turn is auto-skipped after the nomination timer (default 30s) and the next team goes." },
              { q: "How does proxy bidding work?", a: "Like eBay — set a max, the system bids $1 at a time. Competing proxies: higher one wins at the lower's amount + $1. Your max is private." },
              { q: "Can I undo a bid?", a: "No — bids are final. The commissioner can undo the last completed lot if there was an error." },
            ].map((item, i) => (
              <div key={i}>
                <div className="font-semibold text-[var(--lg-text-primary)] text-sm">{item.q}</div>
                <p className="mt-0.5 text-sm">{item.a}</p>
              </div>
            ))}
          </div>
        </Section>
      </div>

      {/* Footer */}
      <div className="mt-8 text-center">
        <p className="text-[var(--lg-text-muted)] text-[10px] font-semibold uppercase tracking-wide opacity-40">
          The Fantastic Leagues &mdash; {new Date().getFullYear()}
        </p>
        <p className="text-[var(--lg-text-muted)] text-[10px] mt-1 opacity-30 print:opacity-100">
          <Link to="/rules" className="hover:text-[var(--lg-accent)] print:hidden">View full league rules</Link>
        </p>
      </div>

      {/* Print-only footer */}
      <div className="hidden print:block mt-8 pt-4 border-t text-center text-xs text-gray-500">
        The Fantastic Leagues — League Guide — Printed {new Date().toLocaleDateString()}
      </div>
    </div>
  );
}
