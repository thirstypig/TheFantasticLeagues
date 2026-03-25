import React, { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Trophy } from "lucide-react";
import { useLeague } from "../../../contexts/LeagueContext";
import { getMyMatchup, getH2HStandings, type MatchupEntry, type StandingEntry } from "../api";
import PageHeader from "../../../components/ui/PageHeader";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ThemedTable, ThemedThead, ThemedTr, ThemedTh, ThemedTd } from "../../../components/ui/ThemedTable";

export default function MatchupPage() {
  const { leagueId } = useLeague();
  const [week, setWeek] = useState(1);
  const [matchup, setMatchup] = useState<MatchupEntry | null>(null);
  const [myTeamId, setMyTeamId] = useState<number | null>(null);
  const [standings, setStandings] = useState<StandingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"matchup" | "standings">("matchup");

  useEffect(() => {
    if (!leagueId) return;
    setLoading(true);
    Promise.all([
      getMyMatchup(leagueId, week).catch(() => ({ matchup: null, myTeamId: 0 })),
      getH2HStandings(leagueId).catch(() => ({ standings: [] })),
    ]).then(([m, s]) => {
      setMatchup(m.matchup);
      setMyTeamId(m.myTeamId);
      setStandings(s.standings);
    }).finally(() => setLoading(false));
  }, [leagueId, week]);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-3 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 md:px-6 md:py-10">
      <PageHeader title="Head-to-Head" subtitle="Weekly matchups and standings" />

      {/* Tab selector */}
      <div className="flex gap-1 mb-6">
        {(["matchup", "standings"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${
              tab === t ? "bg-[var(--lg-accent)] text-white" : "bg-[var(--lg-bg-card)] text-[var(--lg-text-muted)] border border-[var(--lg-border-faint)]"
            }`}
          >
            {t === "matchup" ? "My Matchup" : "Standings"}
          </button>
        ))}
      </div>

      {tab === "matchup" && (
        <div>
          {/* Week Navigator */}
          <div className="flex items-center justify-center gap-4 mb-6">
            <button onClick={() => setWeek(w => Math.max(1, w - 1))} className="p-2 rounded-lg hover:bg-[var(--lg-tint)] text-[var(--lg-text-muted)]"><ChevronLeft size={16} /></button>
            <span className="text-sm font-semibold text-[var(--lg-text-primary)]">Week {week}</span>
            <button onClick={() => setWeek(w => w + 1)} className="p-2 rounded-lg hover:bg-[var(--lg-tint)] text-[var(--lg-text-muted)]"><ChevronRight size={16} /></button>
          </div>

          {!matchup ? (
            <EmptyState icon={Trophy} title="No matchup this week" description="Schedule may not be generated yet, or you're on a bye week." />
          ) : (
            <div className="rounded-2xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] overflow-hidden">
              {/* Scoreboard Header */}
              <div className="flex items-center justify-between p-5">
                <div className="text-center flex-1">
                  <div className="text-sm font-semibold text-[var(--lg-text-primary)]">{matchup.teamA.name}</div>
                  {matchup.result && (
                    <div className="text-2xl font-bold mt-1 tabular-nums text-[var(--lg-text-heading)]">
                      {matchup.result.teamA.totalPoints > 0 ? matchup.result.teamA.totalPoints : `${matchup.result.teamA.catWins}-${matchup.result.teamA.catLosses}-${matchup.result.teamA.catTies}`}
                    </div>
                  )}
                </div>
                <div className="text-xs font-bold uppercase text-[var(--lg-text-muted)] px-4">VS</div>
                <div className="text-center flex-1">
                  <div className="text-sm font-semibold text-[var(--lg-text-primary)]">{matchup.teamB.name}</div>
                  {matchup.result && (
                    <div className="text-2xl font-bold mt-1 tabular-nums text-[var(--lg-text-heading)]">
                      {matchup.result.teamB.totalPoints > 0 ? matchup.result.teamB.totalPoints : `${matchup.result.teamB.catWins}-${matchup.result.teamB.catLosses}-${matchup.result.teamB.catTies}`}
                    </div>
                  )}
                </div>
              </div>

              {/* Category Breakdown */}
              {matchup.result?.categories && matchup.result.categories.length > 0 && (
                <div className="border-t border-[var(--lg-border-faint)]">
                  <ThemedTable>
                    <ThemedThead>
                      <ThemedTr>
                        <ThemedTh align="right">{matchup.teamA.name}</ThemedTh>
                        <ThemedTh align="center">Category</ThemedTh>
                        <ThemedTh>{matchup.teamB.name}</ThemedTh>
                      </ThemedTr>
                    </ThemedThead>
                    <tbody className="divide-y divide-[var(--lg-divide)]">
                      {matchup.result.categories.map(cat => (
                        <ThemedTr key={cat.stat}>
                          <ThemedTd align="right" className={`tabular-nums font-semibold ${cat.winner === "A" ? "text-emerald-400" : cat.winner === "B" ? "text-red-400" : ""}`}>
                            {typeof cat.teamAVal === "number" ? (cat.stat === "AVG" || cat.stat === "ERA" || cat.stat === "WHIP" ? cat.teamAVal.toFixed(3) : cat.teamAVal) : "—"}
                          </ThemedTd>
                          <ThemedTd align="center" className="text-xs font-bold text-[var(--lg-text-muted)]">{cat.stat}</ThemedTd>
                          <ThemedTd className={`tabular-nums font-semibold ${cat.winner === "B" ? "text-emerald-400" : cat.winner === "A" ? "text-red-400" : ""}`}>
                            {typeof cat.teamBVal === "number" ? (cat.stat === "AVG" || cat.stat === "ERA" || cat.stat === "WHIP" ? cat.teamBVal.toFixed(3) : cat.teamBVal) : "—"}
                          </ThemedTd>
                        </ThemedTr>
                      ))}
                    </tbody>
                  </ThemedTable>
                </div>
              )}

              {!matchup.result && (
                <div className="p-4 text-center text-xs text-[var(--lg-text-muted)]">Results pending — week hasn't been scored yet.</div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "standings" && (
        <div>
          {standings.length === 0 ? (
            <EmptyState icon={Trophy} title="No standings yet" description="Standings appear after matchups are scored." />
          ) : (
            <div className="rounded-xl border border-[var(--lg-border-subtle)] overflow-hidden">
              <ThemedTable>
                <ThemedThead>
                  <ThemedTr>
                    <ThemedTh className="w-10">#</ThemedTh>
                    <ThemedTh>Team</ThemedTh>
                    <ThemedTh align="center">W</ThemedTh>
                    <ThemedTh align="center">L</ThemedTh>
                    <ThemedTh align="center">T</ThemedTh>
                    <ThemedTh align="center">PCT</ThemedTh>
                    <ThemedTh align="center">GB</ThemedTh>
                  </ThemedTr>
                </ThemedThead>
                <tbody className="divide-y divide-[var(--lg-divide)]">
                  {standings.map((s, i) => (
                    <ThemedTr key={s.teamId}>
                      <ThemedTd className="tabular-nums text-[var(--lg-text-muted)]">{s.rank}</ThemedTd>
                      <ThemedTd className="font-semibold text-[var(--lg-text-primary)]">
                        {s.teamName}
                        {i < 4 && <span className="ml-2 text-[9px] font-bold uppercase text-emerald-500 bg-emerald-500/10 px-1 py-0.5 rounded">Playoff</span>}
                      </ThemedTd>
                      <ThemedTd align="center" className="tabular-nums font-semibold">{s.wins}</ThemedTd>
                      <ThemedTd align="center" className="tabular-nums">{s.losses}</ThemedTd>
                      <ThemedTd align="center" className="tabular-nums text-[var(--lg-text-muted)]">{s.ties}</ThemedTd>
                      <ThemedTd align="center" className="tabular-nums font-semibold">{s.pct.toFixed(3)}</ThemedTd>
                      <ThemedTd align="center" className="tabular-nums text-[var(--lg-text-muted)]">{s.gb === 0 ? "—" : s.gb}</ThemedTd>
                    </ThemedTr>
                  ))}
                </tbody>
              </ThemedTable>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
