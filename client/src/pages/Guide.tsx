import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/ui/PageHeader';
import { Button } from '../components/ui/button';
import { fetchJsonApi } from '../api/base';
import { useLeague } from '../contexts/LeagueContext';
import type { LeagueRule } from '../api/types';

interface RulesData {
  rules: LeagueRule[];
  grouped: Record<string, LeagueRule[]>;
}

function ruleValue(rules: LeagueRule[], key: string): string {
  return rules.find((r) => r.key === key)?.value ?? '';
}

export default function Guide() {
  const [rules, setRules] = useState<LeagueRule[]>([]);
  const [loading, setLoading] = useState(true);
  const { leagueId } = useLeague();

  useEffect(() => {
    async function load() {
      if (!leagueId) return;
      try {
        const data = await fetchJsonApi<RulesData>(`/api/leagues/${leagueId}/rules`);
        setRules(data.rules ?? []);
      } catch (e) {
        console.error('Failed to load rules for guide:', e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [leagueId]);

  const teamCount = parseInt(ruleValue(rules, 'team_count')) || 8;
  const draftMode = ruleValue(rules, 'draft_mode') || 'Auction';
  const batterCount = parseInt(ruleValue(rules, 'batter_count')) || 14;
  const pitcherCount = parseInt(ruleValue(rules, 'pitcher_count')) || 9;
  const rosterPositions = ruleValue(rules, 'roster_positions');
  const hittingStats = ruleValue(rules, 'hitting_stats') || 'R, HR, RBI, SB, AVG';
  const pitchingStats = ruleValue(rules, 'pitching_stats') || 'W, SV, ERA, WHIP, K';
  const budget = ruleValue(rules, 'auction_budget') || '300';
  const keeperLimit = ruleValue(rules, 'keeper_limit') || '4';
  const bonusGrandSlam = ruleValue(rules, 'bonus_grand_slam');
  const bonusShutout = ruleValue(rules, 'bonus_shutout');

  const hittingCats = hittingStats.split(',').map((s) => s.trim()).filter(Boolean);
  const pitchingCats = pitchingStats.split(',').map((s) => s.trim()).filter(Boolean);

  // Build scoring explanation
  const scoringExplanation = `${teamCount} teams: 1st place gets ${teamCount} points, 2nd gets ${teamCount - 1}, ... ${teamCount}th gets 1. Points are averaged for ties.`;

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-6 md:px-6 md:py-10">
        <PageHeader title="League Guide" subtitle="Loading..." />
        <div className="text-center text-[var(--lg-text-muted)] py-20 animate-pulse">Loading league rules...</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 md:px-6 md:py-10">
      <PageHeader
        title="League Guide"
        subtitle="The definitive handbook for this league's format, scoring, and operations."
        rightElement={
          <Link to="/rules">
            <Button>Manage League Rules</Button>
          </Link>
        }
      />

      <div className="mb-12 p-6 lg-card border-l-4 border-[var(--lg-accent)]">
        <p className="text-sm font-semibold text-[var(--lg-text-primary)] leading-relaxed opacity-80">
          <span className="text-[var(--lg-accent)] font-bold">Note:</span> This guide reflects the current league rules.
          Administrators can modify settings on the{' '}
          <Link to="/rules" className="text-[var(--lg-accent)] underline font-bold hover:brightness-110 transition-colors">
            Rules Page
          </Link>.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:gap-8">
        {/* Overview */}
        <section className="lg-card p-4 md:p-8">
          <h2 className="text-2xl font-semibold tracking-tight text-[var(--lg-text-heading)] mb-6 uppercase">League Overview</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { label: 'Format', value: `Head-to-Head (${hittingCats.length}x${pitchingCats.length})` },
              { label: 'Draft', value: `Live ${draftMode} Draft` },
              { label: 'Teams', value: `${teamCount} Teams` },
              { label: 'Budget', value: `$${budget}` },
              { label: 'Roster', value: `${batterCount} Hitters + ${pitcherCount} Pitchers` },
              { label: 'Keepers', value: `${keeperLimit} per team` },
            ].map((item, idx) => (
              <div key={idx} className="bg-[var(--lg-tint)] p-4 rounded-2xl border border-[var(--lg-border-faint)]">
                <div className="text-xs uppercase tracking-wide font-bold text-[var(--lg-text-muted)] mb-1 opacity-40">{item.label}</div>
                <div className="text-sm font-bold text-[var(--lg-text-primary)]">{item.value}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Hitting */}
        <section className="lg-card p-4 md:p-8">
          <h2 className="text-xl font-semibold text-[var(--lg-text-heading)] mb-6 flex items-center gap-4 uppercase tracking-tight">
            <span className="flex items-center justify-center w-8 h-8 bg-blue-500/20 text-blue-400 rounded-xl text-sm border border-blue-500/20 shadow-lg shadow-blue-500/10">
              H
            </span>
            Hitting Categories
          </h2>
          <div className="flex flex-wrap gap-2">
            {hittingCats.map((cat) => (
              <div key={cat} className="px-4 py-2 bg-[var(--lg-tint)] text-[var(--lg-text-primary)] text-xs font-bold rounded-xl border border-[var(--lg-border-subtle)] uppercase tracking-tight">
                {cat}
              </div>
            ))}
          </div>
        </section>

        {/* Pitching */}
        <section className="lg-card p-4 md:p-8">
          <h2 className="text-xl font-semibold text-[var(--lg-text-heading)] mb-6 flex items-center gap-4 uppercase tracking-tight">
            <span className="flex items-center justify-center w-8 h-8 bg-emerald-500/20 text-emerald-400 rounded-xl text-sm border border-emerald-500/20 shadow-lg shadow-emerald-500/10">
              P
            </span>
            Pitching Categories
          </h2>
          <div className="flex flex-wrap gap-2">
            {pitchingCats.map((cat) => (
              <div key={cat} className="px-4 py-2 bg-[var(--lg-tint)] text-[var(--lg-text-primary)] text-xs font-bold rounded-xl border border-[var(--lg-border-subtle)] uppercase tracking-tight">
                {cat}
              </div>
            ))}
          </div>
        </section>

        {/* Scoring */}
        <section className="lg-card p-4 md:p-8">
          <h2 className="text-xl font-semibold text-[var(--lg-text-heading)] mb-6 uppercase tracking-tight">Scoring System</h2>
          <p className="text-sm text-[var(--lg-text-secondary)] leading-relaxed mb-4">
            Each stat category is ranked across all teams. {scoringExplanation}
          </p>
          <p className="text-sm text-[var(--lg-text-secondary)] leading-relaxed">
            Total points across all {hittingCats.length + pitchingCats.length} categories determine the period winner.
          </p>
        </section>

        {/* Roster Positions */}
        {rosterPositions && (
          <section className="lg-card p-4 md:p-8">
            <h2 className="text-xl font-semibold text-[var(--lg-text-heading)] mb-6 uppercase tracking-tight">Roster Positions</h2>
            <div className="flex flex-wrap gap-2">
              {rosterPositions.split(',').map((pos) => pos.trim()).filter(Boolean).map((pos) => (
                <div key={pos} className="px-4 py-2 bg-[var(--lg-tint)] text-[var(--lg-text-primary)] text-xs font-bold rounded-xl border border-[var(--lg-border-subtle)] uppercase tracking-tight">
                  {pos}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Bonuses */}
        {(bonusGrandSlam || bonusShutout) && (
          <section className="lg-card p-4 md:p-8">
            <h2 className="text-xl font-semibold text-[var(--lg-text-heading)] mb-6 uppercase tracking-tight">Bonuses</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {bonusGrandSlam && (
                <div className="bg-[var(--lg-tint)] p-4 rounded-2xl border border-[var(--lg-border-faint)]">
                  <div className="text-xs uppercase tracking-wide font-bold text-[var(--lg-text-muted)] mb-1 opacity-40">Grand Slam</div>
                  <div className="text-sm font-bold text-[var(--lg-text-primary)]">{bonusGrandSlam} pts</div>
                </div>
              )}
              {bonusShutout && (
                <div className="bg-[var(--lg-tint)] p-4 rounded-2xl border border-[var(--lg-border-faint)]">
                  <div className="text-xs uppercase tracking-wide font-bold text-[var(--lg-text-muted)] mb-1 opacity-40">Shutout</div>
                  <div className="text-sm font-bold text-[var(--lg-text-primary)]">{bonusShutout} pts</div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Operational Pillars */}
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
              Every player has a price. Draft smart and get the most value out of your ${budget} budget.
            </p>
          </div>
          <div className="lg-card p-6 border-b-4 border-purple-500/30">
            <h3 className="font-bold text-[var(--lg-text-primary)] mb-3 uppercase tracking-tight">Real-time Analytics</h3>
            <p className="text-[11px] text-[var(--lg-text-secondary)] leading-relaxed opacity-60">
              Stats update daily. Use the dashboard to track player and team performance across the league.
            </p>
          </div>
        </section>

        <section className="text-center pt-8">
          <p className="text-[var(--lg-text-muted)] text-xs font-bold uppercase tracking-wide opacity-40">
            Official Rules Document &copy; 2026 The Fantastic Leagues
          </p>
        </section>
      </div>
    </div>
  );
}
