import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Printer, Gavel, Star, MessageCircle, Volume2, TrendingUp, BarChart3, Target, UserPlus, HelpCircle, LayoutDashboard, Settings, Search } from 'lucide-react';

// ─── Screenshot helper ──────────────────────────────────────────────
function Screenshot({ src, alt, caption }: { src: string; alt: string; caption?: string }) {
  return (
    <figure className="my-3 rounded-lg overflow-hidden border border-[var(--lg-border-subtle)] shadow-sm">
      <img src={src} alt={alt} className="w-full" loading="lazy" />
      {caption && <figcaption className="text-[10px] text-[var(--lg-text-muted)] text-center py-1.5 bg-[var(--lg-tint)] border-t border-[var(--lg-border-subtle)]">{caption}</figcaption>}
    </figure>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────

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
      <span className="shrink-0 font-semibold text-[var(--lg-accent)]">Tip:</span>
      <span>{children}</span>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────
export default function Guide() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-6 md:px-6 md:py-10">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-[var(--lg-text-heading)]">How to Use TFL</h1>
          <p className="text-sm text-[var(--lg-text-muted)] mt-1">A guide to navigating the app and its features</p>
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

      <div className="space-y-2.5">
        {/* ─── GETTING STARTED ───────────────────────────────── */}
        <Section title="Getting Started" icon={UserPlus} defaultOpen>
          <div className="space-y-4">
            <Step num={1} title="Get Your Invite Code">
              Your commissioner will send you a <strong>6-character invite code</strong>. This links your account to your league and team.
            </Step>
            <Step num={2} title="Create an Account">
              Go to the <strong>Sign Up</strong> page. Enter your email and password, or sign in with <strong>Google</strong> or <strong>Yahoo</strong>.
            </Step>
            <Screenshot src="/guide/02-signup-dark.png" alt="Create Account page" caption="The signup page — enter your name, email, and password, or continue with Google" />
            <Step num={3} title="Enter Your Invite Code">
              After signing in, you'll see an invite code prompt on the Home page. Enter your code to join your league.
            </Step>
            <Step num={4} title="Set Up Your Profile">
              Click your <strong>avatar</strong> in the sidebar to go to your Profile. Add your display name and payment handles (Venmo, Zelle, PayPal) so your league can settle payouts.
            </Step>
          </div>
          <Tip>Returning from last season? Just log in — your commissioner will add you to the new season automatically.</Tip>
        </Section>

        {/* ─── NAVIGATING THE APP ──────────────────────────── */}
        <Section title="Navigating the App" icon={LayoutDashboard}>
          <Screenshot src="/guide/04-home-dark.png" alt="Home page dashboard" caption="The Home page — live MLB scores, your team dashboard, and daily transactions" />
          <p>The sidebar on the left is your main navigation. Here's what each section contains:</p>
          <div className="space-y-2 mt-2">
            {[
              { label: "Home", desc: "Live MLB scores, daily transactions, and your league dashboard" },
              { label: "Season", desc: "League standings across all scoring periods" },
              { label: "Players", desc: "Search and browse all players with stats, positions, and values" },
              { label: "Auction", desc: "The live auction draft room (only active during draft phase)" },
              { label: "Activity", desc: "Recent trades, waiver claims, and add/drop transactions" },
              { label: "Rules", desc: "Your league's specific rules — scoring categories, roster limits, budget, etc." },
              { label: "Archive", desc: "Historical seasons, draft results, and past standings" },
            ].map(n => (
              <div key={n.label} className="flex gap-2">
                <span className="text-xs font-bold text-[var(--lg-accent)] w-16 shrink-0">{n.label}</span>
                <span className="text-xs text-[var(--lg-text-secondary)]">{n.desc}</span>
              </div>
            ))}
          </div>
          <Tip>Click the <strong>chevron button</strong> at the top of the sidebar to collapse it to icon-only mode. Click again to expand.</Tip>
        </Section>

        {/* ─── THE AUCTION DRAFT ────────────────────────────── */}
        <Section title="The Auction Draft" icon={Gavel} defaultOpen>
          <p>The auction is a <strong>live, real-time event</strong> where all team owners bid on players simultaneously.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 my-3">
            <Screenshot src="/guide/05-auction-nominating-dark.png" alt="Auction in dark mode" caption="Auction draft room — dark mode" />
            <Screenshot src="/guide/06-auction-nominating-light.png" alt="Auction in light mode" caption="Auction draft room — light mode" />
          </div>

          <h4 className="font-semibold text-[var(--lg-text-heading)] mt-4 mb-2 text-sm">How Nominating Works</h4>
          <div className="space-y-3">
            <Step num={1} title="Wait for Your Turn">
              Teams nominate in rotation. You'll see the order at the bottom of the auction panel. When it's your turn, you'll hear a sound and see <span className="text-[var(--lg-accent)] font-semibold">"Your turn"</span>. A countdown timer shows how long you have before your turn is skipped.
            </Step>
            <Step num={2} title="Find a Player">
              Switch to the <strong>Player Pool</strong> tab. Filter by hitters/pitchers, position, team, or search by name.
            </Step>
            <Step num={3} title="Nominate">
              Click <strong>Nom</strong> next to a player. Enter your opening bid (or leave at $1) and press <strong>Enter</strong>.
            </Step>
          </div>
          <Tip>Pre-load your <strong>Nomination Queue</strong> — click the expand arrow on a player, then "Add to Queue." When it's your turn, the first available player auto-nominates.</Tip>

          <h4 className="font-semibold text-[var(--lg-text-heading)] mt-4 mb-2 text-sm">How Bidding Works</h4>
          <div className="space-y-3">
            <Step num={1} title="Place a Bid">
              Use the <strong>+$1</strong> or <strong>+$5</strong> buttons. Each bid resets the timer.
            </Step>
            <Step num={2} title="Set a Proxy Bid (Optional)">
              Click <strong>"Set Max Bid"</strong> to enter your maximum. The system auto-bids $1 at a time up to your max — like eBay. Your max is private.
            </Step>
            <Step num={3} title="Winning">
              When the timer hits zero, the highest bidder wins. You'll see <strong>"Going once... Going twice... SOLD!"</strong> as the timer counts down. The player is added to their roster and the price deducted from their budget.
            </Step>
          </div>
          <Tip>Don't want to bid? Click <strong>"Pass"</strong> to hide bid buttons. You can rejoin anytime.</Tip>

          <h4 className="font-semibold text-[var(--lg-text-heading)] mt-4 mb-2 text-sm">Auction Tools</h4>
          <p className="mb-2">Toggle these on or off in the <strong>Settings</strong> tab:</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { icon: Star, title: "Watchlist", desc: "Star players to create a favorites filter" },
              { icon: MessageCircle, title: "Chat", desc: "Message other owners during the draft" },
              { icon: Volume2, title: "Sounds", desc: "Audio alerts for nominations, outbids, and wins" },
              { icon: TrendingUp, title: "Value Column", desc: "Shows projected value. Green = bargain, Red = overpay" },
              { icon: BarChart3, title: "Spending Pace", desc: "Budget progress bars and avg cost per player" },
              { icon: Target, title: "Proxy Bidding", desc: "Auto-bid up to your max price" },
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
        </Section>

        {/* ─── PLAYER POOL ──────────────────────────────────── */}
        <Section title="Finding Players" icon={Search}>
          <p>The <strong>Players</strong> page and the auction <strong>Player Pool</strong> tab both let you browse all available players.</p>
          <ul className="list-disc list-inside space-y-1 ml-1 mt-2">
            <li><strong>H / P toggle</strong> — switch between hitters and pitchers</li>
            <li><strong>All / Avail / ★</strong> — show all players, only available, or your starred watchlist</li>
            <li><strong>NL / AL / All</strong> — filter by league</li>
            <li><strong>Pos dropdown</strong> — filter by position (C, 1B, SS, OF, etc.)</li>
            <li><strong>Team dropdown</strong> — filter by MLB team</li>
            <li><strong>Search bar</strong> — type a player name</li>
            <li><strong>Column headers</strong> — click to sort by any stat. Hover for descriptions.</li>
          </ul>
          <Tip>Click any player row to expand and see full stats, fielding data, and recent transactions.</Tip>
        </Section>

        {/* ─── MANAGING YOUR TEAM ───────────────────────────── */}
        <Section title="Managing Your Team" icon={Settings}>
          <h4 className="font-semibold text-[var(--lg-text-heading)] mb-2 text-sm">Your Profile</h4>
          <p>Click your <strong>avatar</strong> in the sidebar to access your profile. Here you can update your name and payment handles (Venmo, Zelle, PayPal). These are visible to other league members for settling payouts.</p>

          <h4 className="font-semibold text-[var(--lg-text-heading)] mt-3 mb-2 text-sm">Making Trades</h4>
          <p>Go to <strong>Activity</strong> to propose trades. Select players and/or budget to offer, choose what you want in return, and submit. Both sides must accept before the commissioner processes it.</p>

          <h4 className="font-semibold text-[var(--lg-text-heading)] mt-3 mb-2 text-sm">Waiver Claims</h4>
          <p>Use the <strong>Add/Drop</strong> tab in Activity to claim free agents. Submit a blind bid using your FAAB (remaining auction budget). If multiple teams claim the same player, highest bid wins.</p>
        </Section>

        {/* ─── FAQ ───────────────────────────────────────────── */}
        <Section title="FAQ" icon={HelpCircle}>
          <div className="space-y-3">
            {[
              { q: "What if I lose my internet during the auction?", a: "The app automatically reconnects. Your proxy bids keep working even if you're disconnected. When you reconnect, you'll see the latest state." },
              { q: "Can I nominate any player?", a: "Yes — you can nominate anyone, even players your team can't use. All teams can bid on every nomination." },
              { q: "What if I don't nominate in time?", a: "Your turn is automatically skipped when the nomination timer expires, and the next team goes." },
              { q: "How does proxy bidding work?", a: "Set a maximum price. The system bids $1 at a time on your behalf, only as needed. If two proxy bids compete, the higher one wins at the other's max + $1. Your max is always private." },
              { q: "Can I undo a bid?", a: "No — bids are final. The commissioner can undo the last completed auction result if there was an error." },
              { q: "Where do I see my league's rules?", a: "Go to the Rules page in the sidebar. That's where scoring categories, roster requirements, keeper rules, and all league-specific settings live." },
              { q: "How do I change my payment info?", a: "Click your avatar in the sidebar → Profile. Update your Venmo, Zelle, or PayPal handle there." },
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
        <p className="text-[var(--lg-text-muted)] text-[10px] mt-1 opacity-30 print:hidden">
          <Link to="/about" className="hover:text-[var(--lg-accent)]">About TFL</Link>
          {' · '}
          <Link to="/rules" className="hover:text-[var(--lg-accent)]">League Rules</Link>
        </p>
      </div>

      {/* Print footer */}
      <div className="hidden print:block mt-8 pt-4 border-t text-center text-xs text-gray-500">
        The Fantastic Leagues — User Guide — {new Date().toLocaleDateString()}
      </div>
    </div>
  );
}
