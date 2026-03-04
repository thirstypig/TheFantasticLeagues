import { Link } from 'react-router-dom';
import PageHeader from '../components/ui/PageHeader';
import { Button } from '../components/ui/button';

export default function Guide() {
  return (
    <div className="max-w-4xl mx-auto pb-20">
      <PageHeader 
        title="League Guide" 
        subtitle="The definitive handbook for this league's format, scoring, and operations."
        rightElement={
          <Link to="/rules">
            <Button>Manage League Rules</Button>
          </Link>
        }
      />

      {/* Top Banner Context */}
      <div className="mb-12 p-6 lg-card border-l-4 border-[var(--lg-accent)]">
        <p className="text-sm font-semibold text-[var(--lg-text-primary)] leading-relaxed opacity-80">
          <span className="text-[var(--lg-accent)] font-bold">Note:</span> These are the specific rules for this league. 
          The <Link to="/rules" className="text-[var(--lg-accent)] underline font-bold hover:brightness-110 transition-colors">Rules Page</Link> is where administrators can modify these settings, which will automatically update this guide.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {/* Section 1: Overview */}
        <section className="lg-card p-8">
          <h2 className="text-2xl font-bold tracking-tight text-[var(--lg-text-heading)] mb-6 uppercase">League Overview</h2>
          <p className="text-[var(--lg-text-secondary)] leading-relaxed mb-8 opacity-60">
            A head-to-head 5x5 rotisserie league with a live auction draft format.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { label: 'Format', value: 'Head-to-Head (5x5)' },
              { label: 'Draft', value: 'Live Auction Draft' },
              { label: 'Season', value: 'Full MLB Season' },
              { label: 'Teams', value: '8 Teams' },
            ].map((item, idx) => (
              <div key={idx} className="bg-[var(--lg-tint)] p-4 rounded-2xl border border-[var(--lg-border-faint)]">
                <div className="text-xs uppercase tracking-wide font-bold text-[var(--lg-text-muted)] mb-1 opacity-40">{item.label}</div>
                <div className="text-sm font-bold text-[var(--lg-text-primary)]">{item.value}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Section 2: Hitting Scoring */}
        <section className="lg-card p-8">
          <h2 className="text-xl font-bold text-[var(--lg-text-heading)] mb-6 flex items-center gap-4 uppercase tracking-tight">
            <span className="flex items-center justify-center w-8 h-8 bg-blue-500/20 text-blue-400 rounded-xl text-sm border border-blue-500/20 shadow-lg shadow-blue-500/10">⚾</span>
            Hitting Categories
          </h2>
          <div className="flex flex-wrap gap-2">
             {['Runs (R)', 'Home Runs (HR)', 'RBIs', 'Stolen Bases (SB)', 'Batting Avg (AVG)'].map(cat => (
                 <div key={cat} className="px-4 py-2 bg-[var(--lg-tint)] text-[var(--lg-text-primary)] text-xs font-bold rounded-xl border border-[var(--lg-border-subtle)] uppercase tracking-tight">
                     {cat}
                 </div>
             ))}
          </div>
        </section>

        {/* Section 3: Pitching Scoring */}
        <section className="lg-card p-8">
          <h2 className="text-xl font-bold text-[var(--lg-text-heading)] mb-6 flex items-center gap-4 uppercase tracking-tight">
            <span className="flex items-center justify-center w-8 h-8 bg-emerald-500/20 text-emerald-400 rounded-xl text-sm border border-emerald-500/20 shadow-lg shadow-emerald-500/10">🎯</span>
            Pitching Categories
          </h2>
           <div className="flex flex-wrap gap-2">
             {['Wins (W)', 'Strikeouts (K)', 'ERA', 'WHIP', 'Saves (S)'].map(cat => (
                 <div key={cat} className="px-4 py-2 bg-[var(--lg-tint)] text-[var(--lg-text-primary)] text-xs font-bold rounded-xl border border-[var(--lg-border-subtle)] uppercase tracking-tight">
                     {cat}
                 </div>
             ))}
          </div>
        </section>

        {/* Section 4: Operational Pillars */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
             <div className="lg-card p-6 border-b-4 border-blue-500/30">
                 <h3 className="font-bold text-[var(--lg-text-primary)] mb-3 uppercase tracking-tight">Period Waivers</h3>
                 <p className="text-[11px] text-[var(--lg-text-secondary)] leading-relaxed opacity-60">
                     Roster changes happen through waiver cycles each period, encouraging long-term strategy over daily moves.
                 </p>
             </div>

             <div className="lg-card p-6 border-b-4 border-amber-500/30">
                 <h3 className="font-bold text-[var(--lg-text-primary)] mb-3 uppercase tracking-tight">Auction Market</h3>
                 <p className="text-[11px] text-[var(--lg-text-secondary)] leading-relaxed opacity-60">
                     Every player has a price. Draft smart and get the most value out of your budget.
                 </p>
             </div>

              <div className="lg-card p-6 border-b-4 border-purple-500/30">
                 <h3 className="font-bold text-[var(--lg-text-primary)] mb-3 uppercase tracking-tight">Real-time Analytics</h3>
                 <p className="text-[11px] text-[var(--lg-text-secondary)] leading-relaxed opacity-60">
                     Stats update daily. Use the dashboard to track player and team performance across the league.
                 </p>
             </div>
        </section>

         {/* Footer */}
         <section className="text-center pt-8">
             <p className="text-[var(--lg-text-muted)] text-xs font-bold uppercase tracking-wide opacity-40">
                 Official Rules Document &copy; 2026 FBST
             </p>
         </section>
      </div>
    </div>
  );
}
