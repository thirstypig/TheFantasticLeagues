import React from 'react';
import { Link } from 'react-router-dom';
import { Gavel, Star, MessageCircle, Volume2, TrendingUp, BarChart3, Target, Search, Settings } from 'lucide-react';
import { GuideHeader, Section, Step, Tip, Screenshot } from './shared';

export default function GuideAuction() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-6 md:px-6 md:py-10">
      <GuideHeader title="Auction Draft Guide" subtitle="Everything you need to know for draft day" />

      <div className="space-y-2.5">
        <Section title="How the Auction Works" icon={Gavel} defaultOpen>
          <p>The auction is a <strong>live, real-time event</strong> where all team owners bid on players simultaneously. Each team starts with a budget and fills their roster one player at a time.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 my-3">
            <Screenshot src="/guide/05-auction-nominating-dark.png" alt="Auction in dark mode" caption="Auction draft room — dark mode" />
            <Screenshot src="/guide/06-auction-nominating-light.png" alt="Auction in light mode" caption="Auction draft room — light mode" />
          </div>

          <h4 className="font-semibold text-[var(--lg-text-heading)] mt-4 mb-2 text-sm">Key Concepts</h4>
          <ul className="list-disc list-inside space-y-1 ml-1">
            <li>Teams take turns <strong>nominating</strong> a player — then <strong>all teams can bid</strong></li>
            <li>Highest bidder when the timer expires <strong>wins the player</strong></li>
            <li><strong>Max Bid</strong> = your budget minus $1 per remaining spot (ensures you can always fill your roster)</li>
            <li>Budget remaining after the auction becomes your <strong>FAAB</strong> for in-season waiver claims</li>
          </ul>
        </Section>

        <Section title="Nominating a Player" icon={Gavel} defaultOpen>
          <div className="space-y-3">
            <Step num={1} title="Wait for Your Turn">
              Teams nominate in rotation. The <strong>Nomination Order</strong> panel shows who's up. When it's your turn, you'll hear a sound alert and see <span className="text-[var(--lg-accent)] font-semibold">"Your turn — select a player"</span>. A countdown timer (default 30s) shows how long before your turn is auto-skipped.
            </Step>
            <Step num={2} title="Find a Player in the Player Pool">
              Switch to the <strong>Player Pool</strong> tab on the right side. Use the filters:
              <ul className="list-disc list-inside mt-1 ml-2 space-y-0.5">
                <li><strong>H / P</strong> — switch between hitters and pitchers</li>
                <li><strong>All / Avail / ★</strong> — all players, available only, or your starred watchlist</li>
                <li><strong>NL / AL / All</strong> — filter by MLB league</li>
                <li><strong>Pos / Team</strong> — filter by position or MLB team</li>
                <li><strong>Search</strong> — type a player name</li>
              </ul>
            </Step>
            <Step num={3} title="Click Nom">
              Click the <strong>Nom</strong> button next to any available player. A small <strong>$ input</strong> appears — type your opening bid (default $1) and press <strong>Enter</strong> or click <strong>Go</strong>.
            </Step>
          </div>
          <Tip>Pre-load your <strong>Nomination Queue</strong> — click the expand arrow on any player, then "Add to Queue." When it's your turn, the first available player in your queue auto-nominates after 1.5 seconds.</Tip>
        </Section>

        <Section title="Bidding on a Player" icon={Target} defaultOpen>
          <div className="space-y-3">
            <Step num={1} title="Place a Bid">
              Once a player is nominated, use the <strong>+$1</strong> or <strong>+$5</strong> buttons to bid. Each new bid resets the timer, giving everyone a chance to respond.
            </Step>
            <Step num={2} title="Set a Proxy / Max Bid (Optional)">
              Click <strong>"Set Max Bid (auto-bid)"</strong> to enter your maximum price. The system bids $1 at a time on your behalf — just like eBay. If two proxy bids compete, the higher one wins at the lower's max + $1. <strong>Your max bid is always private.</strong>
            </Step>
            <Step num={3} title="Pass on a Player">
              Don't want to bid? Click <strong>"Pass (sit out this player)"</strong> to hide the bid buttons. You can rejoin at any time by clicking <strong>"Rejoin Bidding."</strong>
            </Step>
            <Step num={4} title="Winning">
              When the timer hits zero, the highest bidder wins. As the timer counts down you'll see:
              <ul className="list-disc list-inside mt-1 ml-2">
                <li>At 5 seconds: <span className="text-amber-400 font-bold">"Going once..."</span></li>
                <li>At 3 seconds: <span className="text-red-400 font-bold">"Going twice..."</span></li>
                <li>At 1 second: <span className="text-red-400 font-black">"SOLD!"</span></li>
              </ul>
            </Step>
          </div>
          <Tip>When you're the high bidder, you'll see <strong>"Keeper next year: $price+5"</strong> — helping you plan for next season.</Tip>
        </Section>

        <Section title="Auction Tools & Settings" icon={Settings} defaultOpen>
          <p>Toggle any of these on or off in the <strong>Settings</strong> tab. Each owner can customize their own experience.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
            {[
              { icon: Star, title: "Watchlist", desc: "Star players with the ★ icon to create a quick-filter favorites list. Toggle the ★ button in the filter bar to see only starred players." },
              { icon: MessageCircle, title: "Chat", desc: "Real-time chat with other owners during the draft. Messages appear in the Chat tab." },
              { icon: Volume2, title: "Sound Effects", desc: "Audio alerts when: a new player is nominated, you're outbid, it's your turn, or you win. Mute with the speaker icon in the header." },
              { icon: TrendingUp, title: "Value Column", desc: "The Val column shows each player's projected auction value. During active bidding, it also shows the surplus — green means bargain, red means overpay." },
              { icon: BarChart3, title: "Spending Pace", desc: "The Teams tab shows budget progress bars, average cost per player, and hot/cold indicators (🔥 spending above league average, ❄️ below)." },
              { icon: Target, title: "Proxy Bidding", desc: "Set a max bid and the system auto-bids $1 at a time up to your max. Like eBay — your max is always private." },
            ].map(f => (
              <div key={f.title} className="flex gap-2 p-3 rounded-lg bg-[var(--lg-tint)] border border-[var(--lg-border-subtle)]">
                <f.icon size={16} className="text-[var(--lg-accent)] shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-semibold text-[var(--lg-text-primary)] mb-0.5">{f.title}</div>
                  <div className="text-[11px] text-[var(--lg-text-muted)] leading-relaxed">{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Finding Players" icon={Search}>
          <p>The <strong>Player Pool</strong> tab in the auction (and the <strong>Players</strong> page) let you browse all available players.</p>
          <ul className="list-disc list-inside space-y-1.5 ml-1 mt-2">
            <li><strong>Column headers</strong> — click to sort by any stat (R, HR, RBI, SB, AVG for hitters; W, SV, K, ERA, WHIP for pitchers). Hover over headers for descriptions.</li>
            <li><strong>Val column</strong> — projected auction value. Sort by Val to find the best available players.</li>
            <li><strong>Expand a player</strong> — click any row to see full stats, fielding positions, and recent transactions.</li>
            <li><strong>Add to Queue</strong> — in the expanded view, click "Add to Queue" to pre-load your nomination list.</li>
          </ul>
          <Tip>Sort by <strong>Val</strong> (descending) to see the most valuable available players at a glance.</Tip>
        </Section>
      </div>

      <div className="mt-8 flex justify-center gap-4 print:hidden">
        <Link to="/guide/account" className="text-xs font-semibold text-[var(--lg-accent)] hover:opacity-80">← Account Guide</Link>
        <Link to="/guide/faq" className="text-xs font-semibold text-[var(--lg-accent)] hover:opacity-80">FAQ →</Link>
      </div>

      <div className="hidden print:block mt-8 pt-4 border-t text-center text-xs text-gray-500">
        The Fantastic Leagues — Auction Draft Guide — {new Date().toLocaleDateString()}
      </div>
    </div>
  );
}
