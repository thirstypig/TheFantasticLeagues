import React, { useMemo, useState } from 'react';
import { Trophy } from 'lucide-react';
import type { ClientAuctionState, AuctionLogEvent } from '../hooks/useAuctionState';
import { ThemedTable, ThemedThead, ThemedTh, ThemedTr, ThemedTd } from "../../../components/ui/ThemedTable";

interface AuctionCompleteProps {
  auctionState: ClientAuctionState;
  myTeamId?: number;
}

interface TeamResult {
  id: number;
  name: string;
  code: string;
  budget: number;
  totalSpent: number;
  roster: { playerId: string; playerName: string; price: number; positions: string; isPitcher: boolean }[];
}

export default function AuctionComplete({ auctionState, myTeamId }: AuctionCompleteProps) {
  const [expandedTeamId, setExpandedTeamId] = useState<number | null>(null);

  const { teamResults, totalLots, totalSpent } = useMemo(() => {
    const wins = (auctionState.log || []).filter((e: AuctionLogEvent) => e.type === 'WIN');
    const totalLots = wins.length;
    const totalSpent = wins.reduce((sum, e) => sum + (e.amount || 0), 0);

    // Build team results from auction state teams + log
    const teamMap = new Map<number, TeamResult>();
    for (const team of auctionState.teams || []) {
      teamMap.set(team.id, {
        id: team.id,
        name: team.name,
        code: team.code,
        budget: team.budget,
        totalSpent: 0,
        roster: [],
      });
    }

    for (const win of wins) {
      if (!win.teamId) continue;
      const team = teamMap.get(win.teamId);
      if (!team) continue;
      team.totalSpent += win.amount || 0;
      team.roster.push({
        playerId: win.playerId || '',
        playerName: win.playerName || 'Unknown',
        price: win.amount || 0,
        positions: '',
        isPitcher: false,
      });
    }

    // Also enrich from team roster data if available
    for (const team of auctionState.teams || []) {
      const result = teamMap.get(team.id);
      if (!result) continue;
      // If log-based roster is empty but team has roster data, use that
      if (result.roster.length === 0 && team.roster && team.roster.length > 0) {
        result.totalSpent = team.roster.reduce((sum: number, r: any) => sum + (r.price || 0), 0);
        result.roster = team.roster.map((r: any) => ({
          playerId: String(r.playerId),
          playerName: `Player #${r.playerId}`,
          price: r.price || 0,
          positions: r.assignedPosition || '',
          isPitcher: false,
        }));
      }
    }

    const teamResults = Array.from(teamMap.values()).sort((a, b) => b.totalSpent - a.totalSpent);
    return { teamResults, totalLots, totalSpent };
  }, [auctionState]);

  return (
    <div className="px-4 py-6 md:px-6 md:py-10 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-3">
          <Trophy className="w-8 h-8 text-[var(--lg-accent)]" />
          <h1 className="text-2xl md:text-3xl font-semibold text-[var(--lg-text-heading)]">
            Auction Complete
          </h1>
        </div>
        <p className="text-sm text-[var(--lg-text-secondary)]">
          The auction draft has concluded. All rosters are filled.
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] p-4 text-center">
          <div className="text-[10px] font-semibold uppercase text-[var(--lg-text-muted)] mb-1">Total Lots</div>
          <div className="text-2xl font-bold text-[var(--lg-text-heading)] tabular-nums">{totalLots}</div>
        </div>
        <div className="rounded-xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] p-4 text-center">
          <div className="text-[10px] font-semibold uppercase text-[var(--lg-text-muted)] mb-1">Total Spent</div>
          <div className="text-2xl font-bold text-[var(--lg-accent)] tabular-nums">${totalSpent}</div>
        </div>
        <div className="rounded-xl border border-[var(--lg-border-subtle)] bg-[var(--lg-tint)] p-4 text-center col-span-2 md:col-span-1">
          <div className="text-[10px] font-semibold uppercase text-[var(--lg-text-muted)] mb-1">Teams</div>
          <div className="text-2xl font-bold text-[var(--lg-text-heading)] tabular-nums">{teamResults.length}</div>
        </div>
      </div>

      {/* Team Results */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--lg-text-muted)]">Draft Results by Team</h2>
        <div className="rounded-xl border border-[var(--lg-border-subtle)] overflow-hidden divide-y divide-[var(--lg-divide)]">
          {teamResults.map((team) => {
            const isExpanded = expandedTeamId === team.id;
            const isMe = team.id === myTeamId;

            return (
              <div key={team.id} className={isMe ? 'bg-[var(--lg-tint)]' : ''}>
                <div
                  className="px-4 md:px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-[var(--lg-tint)] transition-all"
                  onClick={() => setExpandedTeamId(isExpanded ? null : team.id)}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col">
                      <span className={`font-semibold ${isMe ? 'text-[var(--lg-accent)]' : 'text-[var(--lg-text-primary)]'}`}>
                        {team.name}
                        {isMe && <span className="ml-2 text-xs font-medium text-[var(--lg-accent)]">(You)</span>}
                      </span>
                      <span className="text-xs font-medium text-[var(--lg-text-muted)]">
                        {team.roster.length} players acquired
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 text-right">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-semibold uppercase text-[var(--lg-text-muted)]">Spent</span>
                      <span className="font-semibold text-[var(--lg-accent)] tabular-nums">${team.totalSpent}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-semibold uppercase text-[var(--lg-text-muted)]">Remaining</span>
                      <span className="font-semibold text-[var(--lg-text-primary)] tabular-nums">${team.budget}</span>
                    </div>
                    <div className={`text-[var(--lg-text-muted)] transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                    </div>
                  </div>
                </div>

                {isExpanded && team.roster.length > 0 && (
                  <div className="border-t border-[var(--lg-border-faint)] animate-in fade-in slide-in-from-top-2 duration-300">
                    <ThemedTable>
                      <ThemedThead>
                        <ThemedTr>
                          <ThemedTh className="w-10">#</ThemedTh>
                          <ThemedTh>Player</ThemedTh>
                          <ThemedTh align="right" className="pr-6">Price</ThemedTh>
                        </ThemedTr>
                      </ThemedThead>
                      <tbody className="divide-y divide-[var(--lg-divide)]">
                        {team.roster
                          .sort((a, b) => b.price - a.price)
                          .map((player, idx) => (
                            <ThemedTr key={player.playerId}>
                              <ThemedTd className="py-2 text-[var(--lg-text-muted)] text-xs">{idx + 1}</ThemedTd>
                              <ThemedTd className="py-2">
                                <span className="font-semibold text-[var(--lg-text-primary)]">{player.playerName}</span>
                              </ThemedTd>
                              <ThemedTd align="right" className="py-2 pr-6">
                                <span className="font-semibold text-[var(--lg-accent)] tabular-nums">${player.price}</span>
                              </ThemedTd>
                            </ThemedTr>
                          ))}
                      </tbody>
                    </ThemedTable>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
