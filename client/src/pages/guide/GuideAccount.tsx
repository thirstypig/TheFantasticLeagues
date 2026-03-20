import React from 'react';
import { Link } from 'react-router-dom';
import { UserPlus, LayoutDashboard, Settings } from 'lucide-react';
import { GuideHeader, Section, Step, Tip, Screenshot } from './shared';

export default function GuideAccount() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-6 md:px-6 md:py-10">
      <GuideHeader title="Getting Started" subtitle="Create your account and join your league" />

      <div className="space-y-2.5">
        <Section title="Create Your Account" icon={UserPlus} defaultOpen>
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

        <Section title="Navigating the App" icon={LayoutDashboard} defaultOpen>
          <Screenshot src="/guide/04-home-dark.png" alt="Home page dashboard" caption="The Home page — live MLB scores, your team dashboard, and daily transactions" />
          <p>The sidebar on the left is your main navigation:</p>
          <div className="space-y-2 mt-2">
            {[
              { label: "Home", desc: "Live MLB scores, daily transactions, and your league dashboard" },
              { label: "Season", desc: "League standings across all scoring periods" },
              { label: "Players", desc: "Search and browse all players with stats, positions, and values" },
              { label: "Auction", desc: "The live auction draft room (only active during draft phase)" },
              { label: "Activity", desc: "Recent trades, waiver claims, and add/drop transactions" },
              { label: "Rules", desc: "Your league's specific rules — scoring, roster limits, budget" },
              { label: "Archive", desc: "Historical seasons, draft results, and past standings" },
            ].map(n => (
              <div key={n.label} className="flex gap-2">
                <span className="text-xs font-bold text-[var(--lg-accent)] w-16 shrink-0">{n.label}</span>
                <span className="text-xs text-[var(--lg-text-secondary)]">{n.desc}</span>
              </div>
            ))}
          </div>
          <Tip>Click the <strong>chevron button</strong> at the top of the sidebar to collapse it to icon-only mode.</Tip>
        </Section>

        <Section title="Your Profile & Payments" icon={Settings} defaultOpen>
          <p>Click your <strong>avatar</strong> in the sidebar to access your profile. Here you can:</p>
          <ul className="list-disc list-inside space-y-1 ml-1 mt-2">
            <li>Update your <strong>display name</strong></li>
            <li>Add <strong>Venmo, Zelle, or PayPal</strong> handles for payouts</li>
            <li>View your <strong>league memberships</strong> and roles</li>
          </ul>
          <Tip>Payment handles are visible to other league members so they can settle payouts easily.</Tip>
        </Section>
      </div>

      <div className="mt-8 flex justify-center gap-4 print:hidden">
        <Link to="/guide/auction" className="text-xs font-semibold text-[var(--lg-accent)] hover:opacity-80">Auction Guide →</Link>
        <Link to="/guide/faq" className="text-xs font-semibold text-[var(--lg-accent)] hover:opacity-80">FAQ →</Link>
      </div>

      <div className="hidden print:block mt-8 pt-4 border-t text-center text-xs text-gray-500">
        The Fantastic Leagues — Account Guide — {new Date().toLocaleDateString()}
      </div>
    </div>
  );
}
