import React from 'react';
import { Link } from 'react-router-dom';
import { HelpCircle, Gavel, Users, Shield, DollarSign } from 'lucide-react';
import { GuideHeader, Section } from './shared';

export default function GuideFaq() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-6 md:px-6 md:py-10">
      <GuideHeader title="Frequently Asked Questions" subtitle="Common questions about TFL" />

      <div className="space-y-2.5">
        <Section title="Auction Draft" icon={Gavel} defaultOpen>
          <div className="space-y-4">
            {[
              { q: "What if I lose my internet during the auction?", a: "The app automatically reconnects via WebSocket. If that fails, it falls back to polling every second. Your proxy bids keep working even while you're disconnected — when you reconnect, you'll see the latest state instantly." },
              { q: "Can I nominate any player?", a: "Yes — you can nominate any available player, even ones your team can't use. All teams can bid on every nomination. Position limits are only enforced on bids, not nominations." },
              { q: "What if I don't nominate in time?", a: "Your turn is automatically skipped when the nomination timer expires (default 30 seconds). The next team in rotation gets to nominate. The countdown is visible on screen so you can see how much time you have." },
              { q: "How does proxy / max bidding work?", a: "It works like eBay. Set your maximum price, and the system bids $1 at a time on your behalf — only when needed. If two proxy bids compete, the higher one wins at the other team's max + $1. Your max bid is always private — no one else can see it." },
              { q: "Can I undo a bid?", a: "No — bids are final once placed. However, the commissioner can undo the last completed auction result if there was a mistake (like a misclick)." },
              { q: "What is the Val column?", a: "Val shows each player's projected auction value based on pre-season analysis. During active bidding, it also shows the surplus (value minus current bid). Green means the player is a bargain at the current price; red means they're being overbid." },
              { q: "What happens to my leftover budget?", a: "Budget remaining after the auction becomes your FAAB (Free Agent Acquisition Budget). You'll use this during the regular season to bid on free agents through waiver claims." },
              { q: "Can I pass on a player and come back?", a: "Yes — click 'Pass' to hide the bid buttons. You can click 'Rejoin Bidding' at any time before the timer expires to start bidding again." },
            ].map((item, i) => (
              <div key={i} className="border-b border-[var(--lg-border-subtle)] pb-3 last:border-0 last:pb-0">
                <div className="font-semibold text-[var(--lg-text-primary)] text-sm">{item.q}</div>
                <p className="mt-1 text-sm">{item.a}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Account & Profile" icon={Users} defaultOpen>
          <div className="space-y-4">
            {[
              { q: "How do I create an account?", a: "Go to the Sign Up page and enter your name, email, and password. You can also sign in with Google. After signing in, enter the invite code your commissioner sent you to join your league." },
              { q: "How do I change my payment info?", a: "Click your avatar in the sidebar → Profile. Update your Venmo, Zelle, or PayPal handles there. These are visible to other league members for settling payouts." },
              { q: "I'm returning from last season — do I need a new account?", a: "No — just log in with your existing email and password. Your commissioner will add you to the new season, and your account carries over." },
              { q: "I lost my invite code. What do I do?", a: "Ask your commissioner to resend it. Each league has a unique invite code that the commissioner can find in the Commissioner → Members section." },
            ].map((item, i) => (
              <div key={i} className="border-b border-[var(--lg-border-subtle)] pb-3 last:border-0 last:pb-0">
                <div className="font-semibold text-[var(--lg-text-primary)] text-sm">{item.q}</div>
                <p className="mt-1 text-sm">{item.a}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="During the Season" icon={Shield} defaultOpen>
          <div className="space-y-4">
            {[
              { q: "How do trades work?", a: "Go to Activity and propose a trade. You can offer players and/or budget. Both teams must accept, then the commissioner processes it. You can see all pending and completed trades in the Activity page." },
              { q: "How do waiver claims work?", a: "Use the Add/Drop tab in Activity. Submit a blind FAAB bid for a free agent — you must also select a player to drop. If multiple teams claim the same player, the highest bid wins. Waiver claims are processed by the commissioner." },
              { q: "Where do I see standings?", a: "Go to the Season page in the sidebar. It shows standings across all scoring periods with your team's rank in each category." },
              { q: "What are keepers?", a: "At the end of each season, you can select players to keep for next year at their current auction price + $5. The number of keepers allowed is set by your league rules (check the Rules page)." },
              { q: "Where are my league's rules?", a: "Go to Rules in the sidebar. That's where scoring categories, roster requirements, keeper limits, budget, and all league-specific settings are documented." },
            ].map((item, i) => (
              <div key={i} className="border-b border-[var(--lg-border-subtle)] pb-3 last:border-0 last:pb-0">
                <div className="font-semibold text-[var(--lg-text-primary)] text-sm">{item.q}</div>
                <p className="mt-1 text-sm">{item.a}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Payments & Payouts" icon={DollarSign}>
          <div className="space-y-4">
            {[
              { q: "How do payouts work?", a: "Payouts are based on final standings at the end of the season. The payout structure is defined in your league rules (check Rules → Payouts). Members pay and receive through Venmo, Zelle, or PayPal — handles are on each person's Profile." },
              { q: "Where do I set up my payment method?", a: "Click your avatar → Profile. Add your Venmo handle, Zelle phone/email, or PayPal username. Other members can see these when settling payouts." },
            ].map((item, i) => (
              <div key={i} className="border-b border-[var(--lg-border-subtle)] pb-3 last:border-0 last:pb-0">
                <div className="font-semibold text-[var(--lg-text-primary)] text-sm">{item.q}</div>
                <p className="mt-1 text-sm">{item.a}</p>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <div className="mt-8 flex justify-center gap-4 print:hidden">
        <Link to="/guide/account" className="text-xs font-semibold text-[var(--lg-accent)] hover:opacity-80">← Account Guide</Link>
        <Link to="/guide/auction" className="text-xs font-semibold text-[var(--lg-accent)] hover:opacity-80">← Auction Guide</Link>
      </div>

      <div className="hidden print:block mt-8 pt-4 border-t text-center text-xs text-gray-500">
        The Fantastic Leagues — FAQ — {new Date().toLocaleDateString()}
      </div>
    </div>
  );
}
