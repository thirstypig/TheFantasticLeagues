import React, { useEffect, useState } from 'react';
import { Trophy, Medal, Crown, TrendingUp } from 'lucide-react';
import { getTrophyCase, type TrophyCaseData } from '../api';
import { OGBA_TEAM_NAMES } from '../../../lib/ogbaTeams';
import { ThemedTable, ThemedThead, ThemedTh, ThemedTr, ThemedTd } from '../../../components/ui/ThemedTable';

interface TrophyCaseTabProps {
  leagueId: number;
}

export default function TrophyCaseTab({ leagueId }: TrophyCaseTabProps) {
  const [data, setData] = useState<TrophyCaseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const result = await getTrophyCase(leagueId);
        if (!cancelled) setData(result);
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load trophy case');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [leagueId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--lg-accent)]" />
      </div>
    );
  }

  if (error) {
    return <div className="text-center py-12 text-[var(--lg-text-muted)]">{error}</div>;
  }

  if (!data) return null;

  const resolve = (code: string, fallback: string) => OGBA_TEAM_NAMES[code] || fallback;
  // Credited to the owner; the team name is a detail. No owner on record → the team name leads.
  const who = (owner: string | null, code: string, teamName: string) => ({
    primary: owner ?? resolve(code, teamName),
    secondary: owner ? teamName : null,
  });

  const categoryLabels: Record<string, string> = {
    R: 'Runs', HR: 'Home Runs', RBI: 'RBI', SB: 'Stolen Bases', AVG: 'Batting Avg',
    W: 'Wins', SV: 'Saves', K: 'Strikeouts', ERA: 'ERA', WHIP: 'WHIP',
  };

  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Championship Banners */}
      <section>
        <div className="flex items-center gap-3 mb-6">
          <Trophy className="w-6 h-6 text-yellow-500" />
          <h2 className="text-xl font-semibold text-[var(--lg-text)]">Championships</h2>
        </div>
        {data.championships.length === 0 ? (
          <p className="text-[var(--lg-text-muted)]">No championship data available yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {data.championships.map((c) => (
              <div
                key={c.year}
                className="rounded-2xl border border-yellow-500/30 bg-gradient-to-br from-yellow-500/10 to-yellow-600/5 p-5 text-center"
              >
                <div className="text-3xl font-bold text-yellow-500 mb-1">{c.year}</div>
                <div className="text-base font-medium text-[var(--lg-text)]">
                  {who(c.owner, c.teamCode, c.teamName).primary}
                </div>
                <div className="text-sm text-[var(--lg-text-muted)] mt-1">{c.owner ? c.teamName : c.teamCode}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* All-Time Leaderboard */}
      <section>
        <div className="flex items-center gap-3 mb-6">
          <Crown className="w-6 h-6 text-[var(--lg-accent)]" />
          <h2 className="text-xl font-semibold text-[var(--lg-text)]">All-Time Leaderboard</h2>
        </div>
        <div className="rounded-2xl liquid-glass border border-[var(--lg-border-subtle)] overflow-hidden">
          <ThemedTable density="default" zebra>
            <ThemedThead>
              <ThemedTr>
                <ThemedTh className="w-12">#</ThemedTh>
                <ThemedTh>Owner</ThemedTh>
                <ThemedTh className="text-right">Avg finish</ThemedTh>
                <ThemedTh className="text-right">Titles</ThemedTh>
                <ThemedTh className="text-right">Seasons</ThemedTh>
              </ThemedTr>
            </ThemedThead>
            <tbody>
              {data.allTimeStandings.map((row, idx) => (
                <ThemedTr key={row.key}>
                  <ThemedTd className="font-medium text-[var(--lg-text-muted)]">{idx + 1}</ThemedTd>
                  <ThemedTd>
                    <span className="block text-sm font-semibold text-[var(--lg-text)]">{who(row.owner, row.teamCode, row.teamName).primary}</span>
                    {row.owner && <span className="block text-xs text-[var(--lg-text-muted)]">{row.teamNames.join(" · ")}</span>}
                  </ThemedTd>
                  <ThemedTd className="text-right font-semibold text-[var(--lg-text)]">{row.avgRank.toFixed(2)}</ThemedTd>
                  <ThemedTd className="text-right text-[var(--lg-text-muted)]">{row.championships}</ThemedTd>
                  <ThemedTd className="text-right text-[var(--lg-text-muted)]">{row.seasons}</ThemedTd>
                </ThemedTr>
              ))}
            </tbody>
          </ThemedTable>
        </div>
      </section>

      {/* Records */}
      <section>
        <div className="flex items-center gap-3 mb-6">
          <Medal className="w-6 h-6 text-orange-500" />
          <h2 className="text-xl font-semibold text-[var(--lg-text)]">Records</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.records.bestSeason && (
            <RecordCard
              label="Best Season"
              team={data.records.bestSeason.owner ? `${data.records.bestSeason.owner} · ${data.records.bestSeason.teamName}` : resolve(data.records.bestSeason.teamCode, data.records.bestSeason.teamName)}
              year={data.records.bestSeason.year}
              value={`${data.records.bestSeason.totalScore} pts`}
              accent="text-green-500"
            />
          )}
          {data.records.worstSeason && (
            <RecordCard
              label="Worst Season"
              team={data.records.worstSeason.owner ? `${data.records.worstSeason.owner} · ${data.records.worstSeason.teamName}` : resolve(data.records.worstSeason.teamCode, data.records.worstSeason.teamName)}
              year={data.records.worstSeason.year}
              value={`${data.records.worstSeason.totalScore} pts`}
              accent="text-red-400"
            />
          )}
          {data.records.mostChampionships && (
            <RecordCard
              label="Most Championships"
              team={data.records.mostChampionships.owners.join(" & ")}
              value={`${data.records.mostChampionships.count} titles`}
              accent="text-yellow-500"
            />
          )}
          {Object.entries(data.records.bestCategoryBySeason).map(([cat, rec]) => (
            <RecordCard
              key={cat}
              label={`Best ${categoryLabels[cat] || cat}`}
              team={resolve(rec.teamCode, rec.teamName)}
              year={rec.year}
              value={`${rec.value} pts`}
              accent="text-[var(--lg-accent)]"
            />
          ))}
        </div>
      </section>

      {/* Dynasty Scores */}
      <section>
        <div className="flex items-center gap-3 mb-6">
          <TrendingUp className="w-6 h-6 text-purple-500" />
          <h2 className="text-xl font-semibold text-[var(--lg-text)]">Dynasty Scores</h2>
        </div>
        <div className="rounded-2xl liquid-glass border border-[var(--lg-border-subtle)] overflow-hidden">
          <ThemedTable density="default" zebra>
            <ThemedThead>
              <ThemedTr>
                <ThemedTh className="w-12">#</ThemedTh>
                <ThemedTh>Owner</ThemedTh>
                <ThemedTh className="text-right">Score</ThemedTh>
                <ThemedTh className="text-right">Titles</ThemedTh>
                <ThemedTh className="text-right">Seasons</ThemedTh>
                <ThemedTh className="text-right">Avg Rank</ThemedTh>
              </ThemedTr>
            </ThemedThead>
            <tbody>
              {data.dynastyScores.map((row, idx) => (
                <ThemedTr key={row.key}>
                  <ThemedTd className="font-medium text-[var(--lg-text-muted)]">{idx + 1}</ThemedTd>
                  <ThemedTd>
                    <span className="block text-sm font-semibold text-[var(--lg-text)]">{who(row.owner, row.teamCode, row.teamName).primary}</span>
                    {row.owner && <span className="block text-xs text-[var(--lg-text-muted)]">{row.teamNames.join(" · ")}</span>}
                  </ThemedTd>
                  <ThemedTd className="text-right font-semibold text-purple-500">{row.score}</ThemedTd>
                  <ThemedTd className="text-right text-yellow-500 font-medium">{row.championships || '-'}</ThemedTd>
                  <ThemedTd className="text-right text-[var(--lg-text-muted)]">{row.seasons}</ThemedTd>
                  <ThemedTd className="text-right text-[var(--lg-text-muted)]">{row.avgRank}</ThemedTd>
                </ThemedTr>
              ))}
            </tbody>
          </ThemedTable>
        </div>
      </section>
    </div>
  );
}

function RecordCard({ label, team, year, value, accent }: {
  label: string;
  team: string;
  year?: number;
  value: string;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] p-4">
      <div className="text-xs font-medium text-[var(--lg-text-muted)] uppercase tracking-wide mb-2">{label}</div>
      <div className="text-base font-medium text-[var(--lg-text)]">{team}</div>
      <div className="flex items-baseline gap-2 mt-1">
        <span className={`text-lg font-semibold ${accent}`}>{value}</span>
        {year && <span className="text-xs text-[var(--lg-text-muted)]">({year})</span>}
      </div>
    </div>
  );
}
