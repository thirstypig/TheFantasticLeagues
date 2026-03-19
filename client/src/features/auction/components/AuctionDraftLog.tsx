import React, { useEffect, useState } from 'react';
import { fetchJsonApi } from '../../../api/base';
import { mapPosition } from '../../../lib/sportConfig';
import { useLeague } from '../../../contexts/LeagueContext';

interface BidEntry {
  teamId: number;
  teamName: string;
  teamCode: string;
  amount: number;
  ts: string;
}

interface LotEntry {
  lotNumber: number;
  playerName: string;
  mlbId: number | null;
  position: string;
  mlbTeam: string | null;
  status: string;
  finalPrice: number | null;
  winnerTeamId: number | null;
  nominatingTeamId: number;
  startTs: string;
  bids: BidEntry[];
}

interface AuctionLogEvent {
  type: string;
  teamId?: number;
  teamName?: string;
  playerName?: string;
  amount?: number;
  timestamp: number;
  message: string;
}

interface Props {
  log: AuctionLogEvent[];
  teams: { id: number; name: string; code: string }[];
}

export default function AuctionDraftLog({ log, teams }: Props) {
  const { leagueId } = useLeague();
  const [lots, setLots] = useState<LotEntry[]>([]);
  const [expandedLot, setExpandedLot] = useState<number | null>(null);
  const [view, setView] = useState<'board' | 'feed'>('board');

  // Fetch bid history from DB
  useEffect(() => {
    if (!leagueId) return;
    let mounted = true;
    fetchJsonApi<{ lots: LotEntry[] }>(`/api/auction/bid-history?leagueId=${leagueId}`)
      .then(data => { if (mounted) setLots(data.lots); })
      .catch(() => {});
    return () => { mounted = false; };
  }, [leagueId, log.length]); // re-fetch when log grows (new WIN events)

  const { outfieldMode } = useLeague();

  const teamMap = new Map(teams.map(t => [t.id, t]));

  // Build bid tendency summary: which teams bid on which lots
  const completedLots = lots.filter(l => l.status === 'completed');

  return (
    <div className="h-full flex flex-col bg-[var(--lg-glass-bg)]">
      {/* View toggle */}
      <div className="px-2 py-1.5 border-b border-[var(--lg-table-border)] flex items-center gap-2 bg-[var(--lg-glass-bg-hover)]">
        <div className="flex bg-[var(--lg-tint)] rounded-md p-0.5 border border-[var(--lg-border-subtle)]">
          <button
            onClick={() => setView('board')}
            className={`px-2.5 py-1 text-[10px] font-semibold uppercase rounded transition-all ${view === 'board' ? 'bg-[var(--lg-accent)] text-white' : 'text-[var(--lg-text-muted)]'}`}
          >
            Draft Board
          </button>
          <button
            onClick={() => setView('feed')}
            className={`px-2.5 py-1 text-[10px] font-semibold uppercase rounded transition-all ${view === 'feed' ? 'bg-[var(--lg-accent)] text-white' : 'text-[var(--lg-text-muted)]'}`}
          >
            Live Feed
          </button>
        </div>
        {view === 'board' && (
          <span className="text-[10px] text-[var(--lg-text-muted)] ml-auto tabular-nums">
            {completedLots.length} player{completedLots.length !== 1 ? 's' : ''} drafted
          </span>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {view === 'board' ? (
          /* Draft Board — completed auctions in nomination order */
          <div>
            {completedLots.length === 0 && (
              <div className="p-4 text-center text-[var(--lg-text-muted)] text-sm">
                No players drafted yet.
              </div>
            )}
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-[var(--lg-glass-bg-hover)] border-b border-[var(--lg-table-border)]">
                <tr>
                  <th className="text-center px-1.5 py-1.5 text-[10px] font-semibold uppercase text-[var(--lg-text-muted)] w-8">#</th>
                  <th className="text-left px-2 py-1.5 text-[10px] font-semibold uppercase text-[var(--lg-text-muted)]">Player</th>
                  <th className="text-left px-2 py-1.5 text-[10px] font-semibold uppercase text-[var(--lg-text-muted)]">Team</th>
                  <th className="text-center px-2 py-1.5 text-[10px] font-semibold uppercase text-[var(--lg-text-muted)] w-12">$</th>
                  <th className="text-center px-1 py-1.5 text-[10px] font-semibold uppercase text-[var(--lg-text-muted)] w-10">Bids</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--lg-table-border)]">
                {completedLots.map((lot) => {
                  const winner = lot.winnerTeamId ? teamMap.get(lot.winnerTeamId) : null;
                  const isExpanded = expandedLot === lot.lotNumber;
                  const bidCount = lot.bids.length;
                  const uniqueBidders = new Set(lot.bids.map(b => b.teamId)).size;

                  return (
                    <React.Fragment key={lot.lotNumber}>
                      <tr
                        className={`cursor-pointer hover:bg-[var(--lg-tint)] ${isExpanded ? 'bg-[var(--lg-tint)]' : ''}`}
                        onClick={() => setExpandedLot(isExpanded ? null : lot.lotNumber)}
                      >
                        <td className="text-center text-xs tabular-nums text-[var(--lg-text-muted)] px-1.5">
                          {lot.lotNumber}
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="font-semibold text-sm text-[var(--lg-text-primary)] leading-tight">
                            {lot.playerName}
                          </div>
                          <div className="text-[10px] text-[var(--lg-text-muted)] font-medium uppercase">
                            <span className="text-[var(--lg-accent)]">{mapPosition(lot.position || '', outfieldMode)}</span>
                            <span className="opacity-30 mx-1">·</span>
                            <span>{lot.mlbTeam || 'FA'}</span>
                          </div>
                        </td>
                        <td className="px-2 text-sm text-[var(--lg-text-secondary)]">
                          {winner?.name || '—'}
                        </td>
                        <td className="text-center text-sm font-semibold text-[var(--lg-accent)] tabular-nums px-2">
                          ${lot.finalPrice}
                        </td>
                        <td className="text-center text-xs tabular-nums text-[var(--lg-text-muted)] px-1">
                          {bidCount}
                          {uniqueBidders > 1 && (
                            <span className="text-[var(--lg-text-muted)] opacity-50 ml-0.5">
                              ({uniqueBidders})
                            </span>
                          )}
                        </td>
                      </tr>

                      {/* Expanded bid history */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={5} className="bg-[var(--lg-bg-secondary)]/30 px-4 py-2">
                            <div className="text-[10px] font-semibold uppercase text-[var(--lg-text-muted)] mb-1.5 tracking-wide">
                              Bid History
                            </div>
                            <div className="space-y-0.5">
                              {lot.bids.map((bid, i) => {
                                const isWinning = i === lot.bids.length - 1;
                                return (
                                  <div
                                    key={i}
                                    className={`flex items-center gap-2 text-xs py-0.5 ${isWinning ? 'font-semibold text-[var(--lg-success)]' : 'text-[var(--lg-text-secondary)]'}`}
                                  >
                                    <span className="w-16 text-right tabular-nums font-semibold">${bid.amount}</span>
                                    <span className="flex-1">{bid.teamName}</span>
                                    <span className="text-[10px] text-[var(--lg-text-muted)] tabular-nums">
                                      {new Date(bid.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* Live Feed — real-time event stream (existing log) */
          <div className="divide-y divide-[var(--lg-table-border)]">
            {log.length === 0 && (
              <div className="p-4 text-center text-[var(--lg-text-muted)] text-sm">
                No auction activity yet.
              </div>
            )}
            {log.map((evt, i) => (
              <div key={i} className="p-3 flex flex-col gap-1 text-sm hover:bg-[var(--lg-bg-secondary)]/30">
                <div className="flex justify-between items-start">
                  <span className={`font-bold ${evt.type === 'WIN' ? 'text-[var(--lg-success)]' : evt.type === 'BID' ? 'text-[var(--lg-text-primary)]' : 'text-[var(--lg-accent)]'}`}>
                    {evt.type}
                  </span>
                  <span className="text-xs text-[var(--lg-text-muted)]">
                    {new Date(evt.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div className="text-[var(--lg-text-secondary)]">
                  {evt.message}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
